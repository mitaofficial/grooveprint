import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const port=await new Promise((resolve,reject)=>{
 const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n))});
});
const temp=await mkdtemp(join(tmpdir(),'grooveprint-browser-'));
const server=spawn(process.execPath,['server/app.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:'http://127.0.0.1:'+port,NODE_ENV:'test',SQLITE_PATH:join(temp,'db.sqlite'),SESSION_ENCRYPTION_KEY:'b'.repeat(64),DISCOGS_CONSUMER_KEY:'test',DISCOGS_CONSUMER_SECRET:'test',GETSONGBPM_API_KEY:''},stdio:['ignore','pipe','pipe']});
let serverErrors='';server.stderr.on('data',buf=>serverErrors+=String(buf));
const base='http://127.0.0.1:'+port;
async function ready(){
 for(let i=0;i<90;i++){
  if(server.exitCode!==null)throw Error('Node server exited: '+serverErrors);
  try{const r=await fetch(base+'/health');if(r.ok)return}catch{}
  await delay(100);
 }
 throw Error('Node server never became ready: '+serverErrors);
}
let browser;
try{
 await ready();
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 let discogsCalls=0,bpmCalls=0,tracklistCalls=0;
 page.on('pageerror',error=>{throw error});
 const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/api/discogs/status',route=>route.fulfill(json({configured:true,connected:true,username:'TEST_ACCOUNT',csrf:'test-csrf',policy:{displayMaxAgeMs:900000},bpmProviderConfigured:true})));
 await page.route('**/api/discogs/folders',route=>route.fulfill(json({folders:[{id:0,name:'All collection',count:1}]})));
 await page.route('**/api/discogs/sync',route=>{
  discogsCalls++;return route.fulfill(json({releases:[{discogsInstanceId:'101',discogsFolderId:0,releaseId:'123456',artist:'The Advent',title:'Fictional Groove Test',label:'Test Label',catalog:'TEST-001',year:'2002',format:'Vinyl'}],pagination:{page:1,pages:1,items:1}}))
 });
 await page.route('**/api/discogs/releases/123456',route=>{
  tracklistCalls++;return route.fulfill(json({tracklist:[{position:'A1',title:'Original Groove (Original Mix)',type_:'track',duration:'06:00',artists:[{name:'The Advent',id:111}]}],videos:[]}))
 });
 await page.route('**/api/bpm/status',route=>route.fulfill(json({configured:true,provider:'GetSongBPM'})));
 await page.route('**/api/bpm/batch',async route=>{
  bpmCalls++;const data=route.request().postDataJSON();
  assert.equal(data.tracks.length,1);
  assert.equal(data.tracks[0].artist,'The Advent');
  assert.equal(data.tracks[0].title,'Original Groove (Original Mix)');
  return route.fulfill(json({configured:true,results:[{id:data.tracks[0].id,status:'catalog',bpm:138,referenceUrl:'https://getsongbpm.com/song/fictional/X',verified:false}]}));
 });
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('[data-act="gp-sync"]').first().waitFor({timeout:20000});
 await page.locator('[data-act="gp-sync"]').first().click();
 await page.waitForFunction(()=>{
  const release=state.releases.find(r=>r.releaseId==='123456');
  return Boolean(release&&release.tracks[0]&&release.tracks[0].bpm===138&&release.tracks[0].bpmStatus==='catalog');
 },{timeout:30000});
 assert.equal(discogsCalls,1);
 assert.equal(tracklistCalls,1);
 assert.equal(bpmCalls,1);
 assert.equal(await page.locator('[data-bpm-quick]').count(),0);
 const bpms=await page.evaluate(()=>state.releases.find(r=>r.releaseId==='123456').tracks.map(t=>({position:t.position,artist:t.artist,bpm:t.bpm,status:t.bpmStatus})));
 assert.equal(bpms[0].position,'A1');
 assert.equal(bpms[0].artist,'The Advent');
 assert.equal(bpms[0].bpm,138);
 assert.equal(bpms[0].status,'catalog');
 // Regression: when source membership expires, never show a successful
 // "63 tracklists" banner while the active collection contains zero tracks.
 // Revalidate Discogs and recover the tracklist and catalog BPM automatically.
 await page.waitForFunction(()=>!window.GrooveprintAutoBPM.job.running&&!discogsSync.running);
 await page.evaluate(()=>{
  const release=state.releases.find(r=>r.releaseId==='123456');
  release.discogsFetchedAt=new Date(Date.now()-16*60*1000).toISOString();
  renderApp();
 });
 await page.waitForFunction(()=>gpExpiredCount>0&&state.releases.some(r=>r.releaseId==='123456'&&r.tracks.some(t=>t.bpm===138))&&
   !discogsConnect.running&&!window.GrooveprintAutoBPM.job.running,{timeout:45000});
 assert.equal(discogsCalls,2,'expired membership should trigger re-sync');
 assert.equal(tracklistCalls,2,'expired tracklist must be reloaded');
 assert.equal(bpmCalls,2,'new tracklist should trigger catalog lookup');
 const final=await page.evaluate(()=>({releaseCount:state.releases.length,trackCount:state.releases.flatMap(r=>r.tracks).length,
  liveNotice:syncNotice(),refreshNeeded:gpSourceRevalidationNeeded}));
 assert.equal(final.releaseCount,1);
 assert.equal(final.trackCount,1);
 assert.equal(final.refreshNeeded,false);
 assert.match(final.liveNotice,/1 tracce disponibili/);
 // A catalog-first, no-key path: user-provided exact recording MBID
 // should find a CC0 BPM even when GetSongBPM is unavailable.
 let acousticCalls=0;
 await page.route('**/api/bpm/open/batch',route=>{
  acousticCalls++;
  const data=route.request().postDataJSON();
  assert.equal(data.tracks[0].recordingMbid,'6df2d3b5-25e1-4d4c-a196-0404990a93ec');
  return route.fulfill(json({provider:'AcousticBrainz',sourceLicense:'CC0',results:[{
   id:data.tracks[0].id,status:'catalog',bpm:117.29,source:'AcousticBrainz',
   referenceUrl:'https://acousticbrainz.org/api/v1/6df2d3b5-25e1-4d4c-a196-0404990a93ec/low-level'
  }]}));
 });
 await page.evaluate(()=>{
  const t=state.releases.find(r=>r.releaseId==='123456').tracks[0];
  t.bpm=null;t.bpmStatus='';t.recordingMbid='6df2d3b5-25e1-4d4c-a196-0404990a93ec';
  void window.GrooveprintAutoBPM.run({fetchTracklists:false});
 });
 await page.waitForFunction(()=>{
  const t=state.releases.find(r=>r.releaseId==='123456')?.tracks[0];
  return t?.bpm===117.29&&t.bpmStatus==='catalog'&&t.source==='AcousticBrainz';
 },{timeout:25000});
 assert.equal(acousticCalls,1);
 assert.equal(bpmCalls,2,'AcousticBrainz result should avoid unnecessary GetSongBPM requests');

 assert.ok(await page.locator('[data-gp-library-pick]').count()>0,'Bulk audio folder control should appear');
 // Test real Chromium Web Audio decoding from a synthetic 138 BPM WAV.
 // This waveform is generated within the test and is not third-party audio.
 const localResult=await page.evaluate(async()=>{
  const sampleRate=12000,seconds=22,frames=sampleRate*seconds,tempo=138;
  const bytes=new ArrayBuffer(44+frames*2),view=new DataView(bytes);
  const put=(at,str)=>{for(let n=0;n<str.length;n++)view.setUint8(at+n,str.charCodeAt(n))};
  put(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);put(8,'WAVE');put(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);
  view.setUint16(32,2,true);view.setUint16(34,16,true);put(36,'data');
  view.setUint32(40,frames*2,true);
  const period=sampleRate*60/tempo;
  for(let i=0;i<frames;i++){
   const near=Math.abs(i-Math.round(i/period)*period);
   const v=Math.max(-1,Math.min(1,Math.exp(-near/(sampleRate*0.003))*0.9));
   view.setInt16(44+i*2,Math.round(v*32767),true);
  }
  const record=state.releases.find(r=>r.releaseId==='123456'),track=record.tracks[0];
  track.bpm=null;track.bpmStatus='';
  const file=new File([bytes],'The Advent - Original Groove (Original Mix).wav',{type:'audio/wav'});
  await window.GrooveprintAudioLibrary.analyzeFiles([file]);
  return {job:{...window.GrooveprintAudioLibrary.job},bpm:track.bpm,status:track.bpmStatus,
    candidates:track.bpmCandidates||[]};
 });
 assert.equal(localResult.job.matched,1,'Audio should match the exact Discogs track');
 assert.equal(localResult.job.errors,0,'Browser should decode and analyze the local WAV');
 assert.ok(['estimated','review'].includes(localResult.status),JSON.stringify(localResult));
 assert.ok(localResult.candidates.some(x=>Math.abs(x.bpm-138)<=3),JSON.stringify(localResult));
 assert.equal(bpmCalls,2,'Local audio analysis must not call the remote BPM provider');
 // Local user-created correction must survive expiry without storing private
 // Discogs collection data or silently replacing it with provider BPM.
 // Force a short busy window at the instant of the second expiry; the old
 // scheduler discarded revalidation here and left the collection empty.
 await page.waitForFunction(()=>!window.GrooveprintAutoBPM.job.running&&!discogsSync.running&&!discogsConnect.running,null,{timeout:12000});
 const secondExpiry=await page.evaluate(()=>{
  const r=state.releases.find(x=>x.releaseId==='123456'),t=r.tracks[0];
  t.bpm=145;t.bpmStatus='manual';t.source='manual';
  gpPersistUserEvidence();
  r.discogsFetchedAt=new Date(Date.now()-16*60*1000).toISOString();
  // This is a second 15-minute expiry, not another expiry 1 second later.
  // Advance the throttle's test clock rather than weakening production limits.
  gpSourceRefreshLastAttempt=Date.now()-61_000;
  discogsConnect.running=true; // simulate another operation occupying the connection
  try{
   renderApp();
   return {removed:state.releases.length===0,needed:gpSourceRevalidationNeeded,
    deferred:gpSourceRefreshTimer!==null};
  }finally{discogsConnect.running=false}
 });
 assert.deepEqual(secondExpiry,{removed:true,needed:true,deferred:true},
  'Expiry during a busy task must queue revalidation instead of dropping it');
 assert.equal(discogsCalls,2,'deferred sync must not start while connector is busy');
 try{await page.waitForFunction(()=>{
  const r=state.releases.find(x=>x.releaseId==='123456');
  return gpExpiredCount>=2&&r?.tracks[0]?.bpm===145&&r?.tracks[0]?.bpmStatus==='manual'&&
   !discogsConnect.running&&!discogsSync.running&&!window.GrooveprintAutoBPM.job.running;
 },null,{timeout:11000})}catch(error){
  console.log('EVIDENCE DEBUG',JSON.stringify(await page.evaluate(()=>{
    const r=state.releases.find(x=>x.releaseId==='123456');
    return {gpExpiredCount,collection:state.releases.length,release:r&&{
      id:r.id,releaseId:r.releaseId,artist:r.artist,sourceAt:r.discogsFetchedAt,
      tracks:r.tracks.map(t=>({title:t.title,artist:t.artist,bpm:t.bpm,status:t.bpmStatus,source:t.source,mbid:t.recordingMbid}))
    },evidence:Array.from(gpEvidenceStore().entries()).slice(-4),sync:{running:discogsConnect.running,trackRunning:discogsSync.running},
    auto:window.GrooveprintAutoBPM.job.phase,refreshNeeded:gpSourceRevalidationNeeded,
     retryTimer:gpSourceRefreshTimer!==null,retryFailures:gpSourceRefreshFailures};
  })));throw error;
 }
 assert.equal(discogsCalls,3,'expired collection membership must refresh');
 assert.equal(tracklistCalls,3,'tracklist must be fetched after expiration');
 assert.equal(acousticCalls,1,'manual correction wins over CC0 archive');
 assert.equal(bpmCalls,2,'manual correction wins over GetSongBPM');
 // Evidence is keyed by exact track identity: the correction must not leak
 // into another edit/version of the same release.
 const evidenceGuard=await page.evaluate(()=>{
  const r=state.releases.find(x=>x.releaseId==='123456');
  const alt={...r,tracks:[{...r.tracks[0],title:'Another Edit',bpm:null,bpmStatus:'',source:'discogs'}]};
  gpRestoreUserEvidence(alt);
  return {alternativeBpm:alt.tracks[0].bpm,originalBpm:r.tracks[0].bpm};
 });
 assert.deepEqual(evidenceGuard,{alternativeBpm:null,originalBpm:145});
 // A pending 60-second cooldown must be queued exactly once, and cancelled
 // promptly on successful validation/disconnect rather than leaking timers.
 const timerGuard=await page.evaluate(()=>{
  gpSourceRevalidationNeeded=true;
  gpSourceRefreshLastAttempt=Date.now();
  gpScheduleSourceRevalidation();
  const timer=gpSourceRefreshTimer;
  gpScheduleSourceRevalidation();
  const singleTimer=timer!==null&&timer===gpSourceRefreshTimer;
  gpSourceRevalidationNeeded=false;
  gpScheduleSourceRevalidation();
  const cancelled=gpSourceRefreshTimer===null;
  gpSourceRevalidationNeeded=true;
  gpSourceRefreshFailures=GP_SOURCE_REFRESH_MAX_FAILURES;
  gpScheduleSourceRevalidation();
  const stoppedAfterLimit=gpSourceRefreshTimer===null;
  gpSourceRevalidationNeeded=false;
  gpSourceRefreshFailures=0;
  return {singleTimer,cancelled,stoppedAfterLimit};
 });
 assert.deepEqual(timerGuard,{singleTimer:true,cancelled:true,stoppedAfterLimit:true});
 assert.equal(discogsCalls,3,'cooldown and retry guard must not issue extra requests');

 // Collection rendering benchmark and search regression use synthetic, anonymous records.
 const perf=await page.evaluate(async()=>{
  const original={releases:state.releases,selected:state.selected,active:state.active,
   step:state.step,search:state.search,formatFilter:state.formatFilter,
   statusFilter:state.statusFilter,folderFilter:state.folderFilter};
  const seed=original.releases[0];if(!seed)throw Error('Missing mock record');
  const records=Array.from({length:3000},(_,i)=>({
   ...seed,id:'perf_'+i,releaseId:String(400000+i),discogsInstanceId:'',
   discogsFetchedAt:'',discogsSource:null,artist:'Fixture Artist '+i,
   title:'Synthetic Release '+i,catalog:'GP-FIX-'+i,
   tracks:(seed.tracks||[]).map(t=>({...t}))
  }));
  let result;
  try{
   state.step=1;state.search='';state.formatFilter='All';state.statusFilter='All';
   state.folderFilter='All';state.selected=records.map(x=>x.id);
   const measures=[];
   for(const size of [50,250,500,1000,3000]){
    state.releases=records.slice(0,size);state.active=state.releases[0].id;
    const start=performance.now();renderApp();
    measures.push({size,renderMs:Number((performance.now()-start).toFixed(2)),
     rows:document.querySelectorAll('.rel-item').length});
   }
   state.releases=records;state.selected=[];state.active=records[0].id;renderApp();
   const fn=window.renderApp;
   if(typeof fn!=='function')throw Error('renderApp instrumentation unavailable');
   let renderCalls=0;
   window.renderApp=function(...args){renderCalls++;return fn(...args)};
   try{
    for(const query of ['S','Sy','Syn','Synt','Synthetic','Synthetic Release 2999']){
     const input=document.getElementById('searchInput');
     if(!input)throw Error('Search input missing');
     input.focus();input.value=query;input.setSelectionRange(query.length,query.length);
     input.dispatchEvent(new Event('input',{bubbles:true}));
    }
    await new Promise(resolve=>setTimeout(resolve,280));
    result={measures,renderCalls,query:state.search,
     value:document.getElementById('searchInput')?.value,
     focused:document.activeElement?.id==='searchInput',
     rows:document.querySelectorAll('.rel-item').length,
     resultTitle:document.querySelector('.rel-item h4')?.textContent||''};
   }finally{window.renderApp=fn}
  }finally{
   Object.assign(state,original);renderApp();
  }
  return result;
 });
 assert.deepEqual(perf.measures.map(x=>x.rows),[50,250,500,1000,1500]);
 assert.ok(perf.renderCalls<=2,'Rapid typing must not cause per-character full page renders');
 assert.equal(perf.query,'Synthetic Release 2999');
 assert.equal(perf.value,'Synthetic Release 2999');
 assert.equal(perf.rows,1);
 assert.match(perf.resultTitle,/Synthetic Release 2999/);
 assert.ok(perf.focused,'Caret focus must survive delayed search updates');
 console.log('BROWSER COLLECTION PERFORMANCE',JSON.stringify(perf));

 console.log('BROWSER PASS: Discogs import → expiry re-sync → WAV local folder BPM estimate with no audio upload');

}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');await delay(140);await rm(temp,{recursive:true,force:true});
}
