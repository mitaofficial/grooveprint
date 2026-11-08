import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,firefox,webkit} from 'playwright';
const browserName=process.env.GROOVEPRINT_BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[browserName];
if(!browserType)throw Error('Unsupported browser '+browserName);

const port=await new Promise((resolve,reject)=>{
 const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const n=server.address().port;server.close(()=>resolve(n))});
});
const temp=await mkdtemp(join(tmpdir(),'grooveprint-browser-'));
const server=spawn(process.execPath,['server/app.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:'http://127.0.0.1:'+port,NODE_ENV:'test',SQLITE_PATH:join(temp,'db.sqlite'),SESSION_ENCRYPTION_KEY:'b'.repeat(64),DISCOGS_CONSUMER_KEY:'test',DISCOGS_CONSUMER_SECRET:'test'},stdio:['ignore','pipe','pipe']});
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
 browser=await browserType.launch({executablePath:browserName==='chromium'?process.env.GROOVEPRINT_CHROMIUM_PATH||undefined:undefined,headless:true,args:browserName==='chromium'?['--no-sandbox']:[]});
 const page=await browser.newPage(process.env.GROOVEPRINT_MOBILE==='1'?{viewport:{width:390,height:844},hasTouch:true}:{});
 console.log('BROWSER ENVIRONMENT',JSON.stringify({browser:browserName,version:browser.version(),node:process.version,mobileViewport:process.env.GROOVEPRINT_MOBILE==='1'}));
 let discogsCalls=0,tracklistCalls=0,localAnalysisActive=false;
 const bpmApiCalls=[],retiredRequests=[];
 const audioNetwork=[];
 page.on('request',request=>{const url=new URL(request.url());if(/(^|\.)(getsongbpm\.com|getsong\.co)$/i.test(url.hostname))retiredRequests.push(url.hostname);if(localAnalysisActive)audioNetwork.push({method:request.method(),url:request.url(),bytes:request.postDataBuffer()?.length||0})});
 page.on('pageerror',error=>{throw error});
 const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
 await page.route('**/api/discogs/status',route=>route.fulfill(json({configured:true,connected:true,username:'TEST_ACCOUNT',csrf:'test-csrf',policy:{displayMaxAgeMs:900000}})));
 await page.route('**/api/discogs/folders',route=>route.fulfill(json({folders:[{id:0,name:'All collection',count:1}]})));
 await page.route('**/api/discogs/sync',route=>{
  discogsCalls++;return route.fulfill(json({releases:[{discogsInstanceId:'101',discogsFolderId:0,releaseId:'123456',artist:'The Advent',title:'Fictional Groove Test',label:'Test Label',catalog:'TEST-001',year:'2002',format:'Vinyl'}],pagination:{page:1,pages:1,items:1}}))
 });
 await page.route('**/api/discogs/releases/123456',route=>{
  tracklistCalls++;return route.fulfill(json({tracklist:[{position:'A1',title:'Original Groove (Original Mix)',type_:'track',duration:'06:00',artists:[{name:'The Advent',id:111}]}],videos:[]}))
 });
 await page.route('**/api/bpm/**',route=>{bpmApiCalls.push(new URL(route.request().url()).pathname);return route.fulfill({status:410,contentType:'application/json',body:JSON.stringify({code:'UNEXPECTED_CATALOG_CALL'})})});
 await page.route(/^https?:\/\/([^/]*\.)?(getsongbpm\.com|getsong\.co)(?:\/|$)/i,route=>route.abort());
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('[data-act="gp-sync"]').first().waitFor({timeout:20000});
 await page.locator('[data-act="gp-sync"]').first().click();
 await page.waitForFunction(()=>{
  const release=state.releases.find(r=>r.releaseId==='123456');
  return Boolean(release&&release.tracks[0]&&release.tracks[0].bpm===null&&!window.GrooveprintCollectionEnrichment.job.running&&!discogsSync.running);
 },{timeout:30000});
 assert.equal(discogsCalls,1);
 assert.equal(tracklistCalls,1);
 assert.equal(bpmApiCalls.length,0,'Metadata import never calls a BPM catalog');
 assert.equal(await page.locator('[data-bpm-quick]').count(),0);
 const bpms=await page.evaluate(()=>state.releases.find(r=>r.releaseId==='123456').tracks.map(t=>({position:t.position,artist:t.artist,bpm:t.bpm,status:t.bpmStatus})));
 assert.equal(bpms[0].position,'A1');
 assert.equal(bpms[0].artist,'The Advent');
 assert.equal(bpms[0].bpm,null);
 assert.equal(bpms[0].status||'','');
 assert.ok(!/getsongbpm|api key|chiave api/i.test(await page.locator('body').innerText()),'Fresh collection has no retired branding or activation prompts');
 assert.match(await page.locator('.gp-local-audio').innerText(),/GROOVEPRINT BPM Engine/);
 // Stop a real owned metadata request; late fulfillment must not attach tracks or restart.
 let releaseGate,seenResolve,finishedResolve;
 const gate=new Promise(resolve=>releaseGate=resolve),seen=new Promise(resolve=>seenResolve=resolve),finished=new Promise(resolve=>finishedResolve=resolve);
 const delayedTracklist=async route=>{seenResolve();await gate;try{await route.fulfill(json({tracklist:[{position:'A1',title:'Late response must be discarded',type_:'track'}],videos:[]}))}catch{}finally{finishedResolve()}};
 await page.route('**/api/discogs/releases/123456',delayedTracklist);
 await page.evaluate(()=>{const r=state.releases.find(r=>r.releaseId==='123456');window.gpSavedFixtureTracks=r.tracks;r.tracks=[];void window.GrooveprintCollectionEnrichment.run()});
 await seen;
 await page.evaluate(()=>window.GrooveprintCollectionEnrichment.run());
 await page.locator('[data-gp-enrich-stop]').click();
 await page.waitForFunction(()=>!window.GrooveprintCollectionEnrichment.job.running&&!discogsSync.running);
 releaseGate();await finished;
 const stoppedMetadata=await page.evaluate(async()=>{await new Promise(requestAnimationFrame);const r=state.releases.find(r=>r.releaseId==='123456');return {phase:window.GrooveprintCollectionEnrichment.job.phase,restart:window.GrooveprintCollectionEnrichment.job.restartRequested,lateTracks:r.tracks.length}});
 assert.deepEqual(stoppedMetadata,{phase:'interrupted',restart:false,lateTracks:0});
 await page.unroute('**/api/discogs/releases/123456',delayedTracklist);
 await page.evaluate(()=>{state.releases.find(r=>r.releaseId==='123456').tracks=window.gpSavedFixtureTracks;delete window.gpSavedFixtureTracks;renderApp()});
 console.log('BROWSER METADATA CANCELLATION',JSON.stringify(stoppedMetadata));
 // Regression: when source membership expires, never show a successful
 // "63 tracklists" banner while the active collection contains zero tracks.
 // Revalidate Discogs and recover tracklist metadata; BPM stays missing without audio.
 await page.waitForFunction(()=>!window.GrooveprintCollectionEnrichment.job.running&&!discogsSync.running);
 await page.evaluate(()=>{
  const release=state.releases.find(r=>r.releaseId==='123456');
  release.discogsFetchedAt=new Date(Date.now()-16*60*1000).toISOString();
  renderApp();
 });
 await page.waitForFunction(()=>gpExpiredCount>0&&state.releases.some(r=>r.releaseId==='123456'&&r.tracks.some(t=>t.bpm===null))&&
   !discogsConnect.running&&!window.GrooveprintCollectionEnrichment.job.running,{timeout:45000});
 assert.equal(discogsCalls,2,'expired membership should trigger re-sync');
 assert.equal(tracklistCalls,2,'expired tracklist must be reloaded');
 assert.equal(bpmApiCalls.length,0,'New tracklist must not trigger any catalog lookup');
 const final=await page.evaluate(()=>({releaseCount:state.releases.length,trackCount:state.releases.flatMap(r=>r.tracks).length,
  liveNotice:syncNotice(),refreshNeeded:gpSourceRevalidationNeeded}));
 assert.equal(final.releaseCount,1);
 assert.equal(final.trackCount,1);
 assert.equal(final.refreshNeeded,false);
 assert.match(final.liveNotice,/1 tracce disponibili/);
 // A stored recording MBID is metadata, not an automatic archive fallback.
 await page.evaluate(async()=>{
  const t=state.releases.find(r=>r.releaseId==='123456').tracks[0];
  t.recordingMbid='6df2d3b5-25e1-4d4c-a196-0404990a93ec';
  await window.GrooveprintCollectionEnrichment.run({fetchTracklists:false});
  if(t.bpm!==null)throw Error('Metadata alone invented a tempo');
 });
 assert.equal(bpmApiCalls.length,0,'No automatic BPM source, including the archive');

 assert.ok(await page.locator('[data-gp-library-pick]').count()>0,'Bulk audio folder control should appear');
 // Test real Chromium Web Audio decoding from a synthetic 138 BPM WAV.
 // This waveform is generated within the test and is not third-party audio.
 localAnalysisActive=true;
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
  window.gpTestAudioBytes=bytes;
  const record=state.releases.find(r=>r.releaseId==='123456'),track=record.tracks[0];
  track.bpm=null;track.bpmStatus='';
  const file=new File([bytes],'The Advent - Original Groove (Original Mix).wav',{type:'audio/wav'});
  await window.GrooveprintAudioLibrary.analyzeFiles([file]);
  return {job:{...window.GrooveprintAudioLibrary.job},bpm:track.bpm,status:track.bpmStatus,
    candidates:track.bpmCandidates||[]};
 });
 localAnalysisActive=false;
 assert.ok(audioNetwork.every(r=>r.method==='GET'&&r.bytes===0&&r.url.startsWith(base+'/assets/')),'Local analysis may only load same-origin script assets');
 assert.equal(localResult.job.matched,1,'Audio should match the exact Discogs track');
 assert.equal(localResult.job.errors,0,'Browser should decode and analyze the local WAV');
 assert.ok(['estimated','review'].includes(localResult.status),JSON.stringify(localResult));
 assert.ok(localResult.candidates.some(x=>Math.abs(x.bpm-138)<=3),JSON.stringify(localResult));
 assert.equal(bpmApiCalls.length,0,'Local engine must not call a remote BPM provider');
 // Real local candidates are selectable and only an explicit confirmation marks verified.
 await page.locator('.rel-item').first().click();
 const choice=await page.evaluate(()=>{const t=state.releases.find(r=>r.releaseId==='123456').tracks[0];return {bpm:t.bpmCandidates[0].bpm}});
 assert.ok(await page.locator('[data-bpm-choose]').count()>0,'Internal engine candidates remain usable');
 page.once('dialog',dialog=>dialog.accept());await page.locator('[data-bpm-choose]').first().click();
 let chosen=await page.evaluate(()=>{const t=state.releases.find(r=>r.releaseId==='123456').tracks[0];return {bpm:t.bpm,status:t.bpmStatus,source:t.source}});
 assert.equal(chosen.bpm,choice.bpm);assert.equal(chosen.status,'estimated');assert.equal(chosen.source,'local-dsp');
 page.once('dialog',dialog=>dialog.accept(String(choice.bpm)));await page.locator('[data-bpm-confirm]').first().click();
 chosen=await page.evaluate(()=>{const t=state.releases.find(r=>r.releaseId==='123456').tracks[0];return {bpm:t.bpm,status:t.bpmStatus,source:t.source}});
 assert.equal(chosen.status,'verified');assert.equal(chosen.source,'user-verified');
 // Exercise real browser decoding and worker ownership over repeated synthetic content.
 const lifecycle=await page.evaluate(async()=>{
  const original=state.releases,active=state.active,selected=state.selected;
  const NativeContext=window.AudioContext||window.webkitAudioContext,NativeWorker=window.Worker;
  let contexts=0,workers=0,maxContexts=0,maxWorkers=0,terminated=0,posts=0;
  const resources=[];
  window.AudioContext=class extends NativeContext{
   constructor(...args){super(...args);contexts++;maxContexts=Math.max(maxContexts,contexts)}
   async close(){try{return await super.close()}finally{contexts--}}
  };
  window.Worker=class extends NativeWorker{
   constructor(...args){super(...args);workers++;maxWorkers=Math.max(maxWorkers,workers)}
   postMessage(...args){posts++;super.postMessage(...args);if(window.gpStopDuringWorker)window.GrooveprintAudioLibrary.stop()}
   terminate(){if(!this.gpTerminated){this.gpTerminated=true;workers--;terminated++}return super.terminate()}
  };
  const record={id:'audio_fixture',artist:'Synthetic DJ',tracks:Array.from({length:10},(_,i)=>({title:'Audio '+i,position:'A'+i,bpm:null}))};
  try{
   state.releases=[record];state.active=record.id;state.selected=[record.id];state.step=1;renderApp();
   const search=document.getElementById('searchInput');search.focus();search.value='';
   const files=record.tracks.map(t=>new File([window.gpTestAudioBytes],'Synthetic DJ - '+t.title+'.wav',{type:'audio/wav'}));
   for(let cycle=0;cycle<3;cycle++){
    for(const t of record.tracks){t.bpm=null;t.bpmStatus='';t.source='';t.bpmUserEdited=false}
    await window.GrooveprintAudioLibrary.analyzeFiles(files);
    const job=window.GrooveprintAudioLibrary.job;
    if(job.errors||job.completed!==10||contexts||workers)throw Error('Unreleased browser audio resources');
    if(document.activeElement!==search)throw Error('Progress replaced active search input');
    resources.push({cycle,completed:job.completed,contexts,workers,maxDecodedPcmBytes:job.maxDecodedBytesObserved,jsHeapBytes:performance.memory?.usedJSHeapSize||null});
   }
   for(const t of record.tracks){t.bpm=null;t.bpmStatus='';t.source='';t.bpmUserEdited=false}
   window.gpStopDuringWorker=true;await window.GrooveprintAudioLibrary.analyzeFiles(files);window.gpStopDuringWorker=false;
   const stopped={...window.GrooveprintAudioLibrary.job};
   if(stopped.phase!=='cancelled'||stopped.completed!==0||record.tracks.some(t=>t.bpm!==null))throw Error('Worker stop applied a late result');
   return {resources,maxContexts,maxWorkers,contexts,workers,terminated,posts,stop:{phase:stopped.phase,cancelled:stopped.cancelled},content:'One original 22-second WAV reused; 30 decodes, not 30 musical recordings'};
  }finally{window.gpStopDuringWorker=false;window.AudioContext=NativeContext;window.Worker=NativeWorker;state.releases=original;state.active=active;state.selected=selected;renderApp()}
 });
 assert.equal(lifecycle.maxContexts,1);assert.equal(lifecycle.maxWorkers,1);assert.equal(lifecycle.contexts,0);assert.equal(lifecycle.workers,0);assert.equal(lifecycle.stop.cancelled,10);
 console.log('BROWSER AUDIO LIFECYCLE',JSON.stringify(lifecycle));
 // Codec capability is measured, not inferred from a filename extension.
 const generatedWav=Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(window.gpTestAudioBytes))));
 const wavPath=join(temp,'synthetic.wav');await writeFile(wavPath,generatedWav);
 const codecResults=[];
 for(const [extension,encoder] of [['mp3','libmp3lame'],['flac','flac'],['aiff','pcm_s16be'],['m4a','aac'],['ogg','libvorbis'],['opus','libopus']]){
  const target=join(temp,'synthetic.'+extension);
  execFileSync('ffmpeg',['-nostdin','-v','error','-y','-i',wavPath,'-t','12','-c:a',encoder,target],{timeout:20000});
  const bytes=await readFile(target);
  const result=await page.evaluate(async bytes=>{const ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:12000});try{const decoded=await ctx.decodeAudioData(new Uint8Array(bytes).buffer);return {decoded:true,seconds:Number(decoded.duration.toFixed(2)),pcmBytes:decoded.length*decoded.numberOfChannels*4}}catch(error){return {decoded:false,error:error.name}}finally{await ctx.close()}},Array.from(bytes));
  codecResults.push({extension,...result});
 }
 console.log('BROWSER CODEC CAPABILITIES',JSON.stringify(codecResults));
 // Local user-created correction must survive expiry without storing private
 // Discogs collection data or silently replacing it with provider BPM.
 // Force a short busy window at the instant of the second expiry; the old
 // scheduler discarded revalidation here and left the collection empty.
 await page.waitForFunction(()=>!window.GrooveprintCollectionEnrichment.job.running&&!discogsSync.running&&!discogsConnect.running,null,{timeout:12000});
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
   !discogsConnect.running&&!discogsSync.running&&!window.GrooveprintCollectionEnrichment.job.running;
 },null,{timeout:11000})}catch(error){
  console.log('EVIDENCE DEBUG',JSON.stringify(await page.evaluate(()=>{
    const r=state.releases.find(x=>x.releaseId==='123456');
    return {gpExpiredCount,collection:state.releases.length,release:r&&{
      id:r.id,releaseId:r.releaseId,artist:r.artist,sourceAt:r.discogsFetchedAt,
      tracks:r.tracks.map(t=>({title:t.title,artist:t.artist,bpm:t.bpm,status:t.bpmStatus,source:t.source,mbid:t.recordingMbid}))
    },evidence:Array.from(gpEvidenceStore().entries()).slice(-4),sync:{running:discogsConnect.running,trackRunning:discogsSync.running},
    auto:window.GrooveprintCollectionEnrichment.job.phase,refreshNeeded:gpSourceRevalidationNeeded,
     retryTimer:gpSourceRefreshTimer!==null,retryFailures:gpSourceRefreshFailures};
  })));throw error;
 }
 assert.equal(discogsCalls,3,'expired collection membership must refresh');
 assert.equal(tracklistCalls,3,'tracklist must be fetched after expiration');
 assert.equal(bpmApiCalls.length,0,'Manual correction wins without any automatic catalog requests');
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
    const renderSamplesMs=[],nextFrameSamplesMs=[],parseSamplesMs=[];
    const csv='Artist,Title,Release ID\n'+records.slice(0,size).map((r,i)=>r.artist+','+r.title+','+(400000+i)).join('\n');
    for(let repeat=0;repeat<5;repeat++){
     let start=performance.now();const parsed=parseDelimited(csv,',');const mapped=convertRows(parsed,getMapped(parsed.rows[0]));
     if(mapped.mapped.length!==size)throw Error('CSV lost records');parseSamplesMs.push(Number((performance.now()-start).toFixed(2)));
     start=performance.now();renderApp();renderSamplesMs.push(Number((performance.now()-start).toFixed(2)));
     await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));nextFrameSamplesMs.push(Number((performance.now()-start).toFixed(2)));
    }
    measures.push({size,renderSamplesMs,nextFrameSamplesMs,parseSamplesMs,rows:document.querySelectorAll('.rel-item').length});
   }
   state.releases=records;state.selected=[];state.active=records[0].id;reviewPage=0;renderApp();
   document.querySelector('[data-act="review-next"]').click();
   if(!document.querySelector('[data-open-rel="perf_2999"]'))throw Error('Second page unreachable');
   document.querySelector('[data-open-rel="perf_2999"]').click();
   const last=state.releases.find(r=>r.id==='perf_2999');last.title='Beyond DOM limit';
   state.selected=[last.id];
   const exported=new TextDecoder('latin1').decode(await buildPdf().arrayBuffer());
   if(!exported.includes(pdfEscHex('Beyond DOM limit')))throw Error('Selected record beyond DOM limit missing from PDF');
   last.title='Synthetic Release 2999';reviewPage=0;state.selected=[];renderApp();
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
   Object.assign(state,original);reviewPage=0;renderApp();
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

 // PDF geometry regression: inspect actual vector PDF bytes, not CSS preview.
 const pdfGeometry=await page.evaluate(async()=>{
  const oldSheet=state.sheet,oldExtras=state.design.extras;
  try{
   state.sheet={pageW:210,pageH:297,labelW:105,labelH:74.25,
    cols:2,rows:4,left:0,top:0,gapX:0,gapY:0};
   state.design.extras=[];
   const errors=validateSheet();
   if(errors.length)throw Error('Valid 105 × 74.25 mm geometry rejected: '+errors.join(', '));
   const pdf=buildPdf({calibration:true});
   const raw=new TextDecoder('latin1').decode(await pdf.arrayBuffer());
   const media=raw.match(/\/MediaBox \[0 0 ([0-9.]+) ([0-9.]+)\]/);
   const boxes=[...raw.matchAll(/([0-9.]+) ([0-9.]+) ([0-9.]+) ([0-9.]+) re S Q/g)]
    .map(m=>m.slice(1).map(Number));
   return {mime:pdf.type,bytes:pdf.size,
    media:media?[Number(media[1]),Number(media[2])]:null,boxes};
  }finally{state.sheet=oldSheet;state.design.extras=oldExtras}
 });
 assert.equal(pdfGeometry.mime,'application/pdf');
 assert.ok(pdfGeometry.bytes>1000,'PDF should contain vectors and font resources');
 assert.ok(pdfGeometry.media,'PDF MediaBox must exist');
 assert.ok(Math.abs(pdfGeometry.media[0]-210*72/25.4)<0.02);
 assert.ok(Math.abs(pdfGeometry.media[1]-297*72/25.4)<0.02);
 assert.equal(pdfGeometry.boxes.length,8,'A4 2 × 4 must contain eight label boundaries');
 for(const [x,y,w,h] of pdfGeometry.boxes){
  assert.ok(Math.abs(w-105*72/25.4)<0.02,'Incorrect 105 mm label width');
  assert.ok(Math.abs(h-74.25*72/25.4)<0.02,'Incorrect 74.25 mm label height');
  assert.ok(x>=0&&y>=0&&x+w<=pdfGeometry.media[0]+0.02&&y+h<=pdfGeometry.media[1]+0.02,
   'A label must not exceed the A4 MediaBox');
 }
 console.log('BROWSER PDF GEOMETRY',JSON.stringify({pages:1,labels:pdfGeometry.boxes.length,
  mediaPt:pdfGeometry.media,labelMm:[105,74.25],pdfBytes:pdfGeometry.bytes}));

 const pdfAsync=await page.evaluate(async()=>{
  const old={releases:state.releases,selected:state.selected,active:state.active,sheet:state.sheet,design:state.design,calibration:state.calibration,printGuides:state.printGuides};
  const r=state.releases[0],result=[];
  try{
   state.releases=Array.from({length:9},(_,i)=>({...r,id:'pdf_'+i,discogsInstanceId:'',discogsFetchedAt:'',title:'Print '+i,tracks:[{position:'A1',title:'Água',bpm:138,bpmStatus:'manual'},{position:'B1',title:'Dub',bpm:null,bpmStatus:'unavailable'}]}));
   state.selected=state.releases.map(r=>r.id);state.printGuides=true;
   for(const format of [2,4,6,8,10,12,'letter']){
    const n=format==='letter'?8:format;
    state.sheet=format==='letter'?{...defaultTemplate(),pageW:215.9,pageH:279.4,labelW:107.95,labelH:69.85}:templatePreset(n);
    const expected=new Uint8Array(await buildPdf().arrayBuffer());
    const actual=new Uint8Array(await (await buildPdfAsync()).arrayBuffer());
    if(expected.length!==actual.length||!expected.every((v,i)=>v===actual[i]))throw Error('Async PDF changed vector bytes');
    const raw=new TextDecoder('latin1').decode(actual),pages=Number(raw.match(/\/Type \/Pages \/Count (\d+)/)?.[1]);
    const boxes=[...raw.matchAll(/([0-9.]+) ([0-9.]+) ([0-9.]+) ([0-9.]+) re S Q/g)].map(m=>m.slice(1).map(Number));
    if(pages!==Math.ceil(9/n)||boxes.length!==pages*n)throw Error('Wrong PDF pagination or boundaries');
    const sh=state.sheet;
    for(const [x,y,w,h] of boxes)if(Math.abs(w-sh.labelW*72/25.4)>.02||Math.abs(h-sh.labelH*72/25.4)>.02||x<0||y<0||x+w>sh.pageW*72/25.4+.02||y+h>sh.pageH*72/25.4+.02)throw Error('PDF cell outside sheet');
    if(!raw.includes(pdfEscHex('Água')))throw Error('Accented text lost');
    result.push({format,labelsPerPage:n,pages,bytes:actual.length,byteIdentical:true});
   }
   state.sheet=defaultTemplate();state.selected=Array.from({length:400},(_,i)=>'long_'+i);state.releases=state.selected.map((id,i)=>({...state.releases[i%9],id,title:'Snapshot '+i}));
   const frozen=pdfSnapshot(),expected=new Uint8Array(await buildPdf({input:frozen}).arrayBuffer());let progress=0;
   const bytes=new Uint8Array(await (await buildPdfAsync({input:frozen,onProgress(){progress++;state.design={...state.design,font:'serif',rotation:0};state.releases[0].title='Changed during export'}})).arrayBuffer());
   if(!progress||expected.length!==bytes.length||!expected.every((v,i)=>v===bytes[i]))throw Error('PDF did not yield or snapshot was changed');
   const controller=new AbortController();let cancelled=false;
   try{await buildPdfAsync({input:frozen,signal:controller.signal,onProgress(){controller.abort()}})}catch(error){cancelled=error.name==='AbortError'}
   if(!cancelled)throw Error('PDF cancellation did not settle');
   return {templates:result,progressCallbacks:progress,snapshotPreserved:true,cancelled};
  }finally{Object.assign(state,old);renderApp()}
 });
 console.log('BROWSER ASYNC PDF',JSON.stringify(pdfAsync));
 const beforeCsv=await page.evaluate(()=>state.releases.map(r=>r.id));
 for(const [name,contents,message] of [['malformed.csv','Artist,Title\nDJ,"Unclosed title','CSV non valido'],['empty.csv','Artist,Title\n','CSV vuoto']]){
  await page.locator('#fileChooser').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(contents)});
  await page.waitForFunction(message=>document.getElementById('toast').textContent.includes(message),message);
  assert.deepEqual(await page.evaluate(()=>state.releases.map(r=>r.id)),beforeCsv,'Invalid CSV must preserve the current project');
  assert.equal(await page.evaluate(()=>pendingCSV),null);
 }
 await page.locator('#fileChooser').setInputFiles({name:'copies.csv',mimeType:'text/csv',buffer:Buffer.from('Artist,Title,Release ID,Format,Tracklist\nExample DJ,Test EP,99999,Vinyl,A1 Groove\nExample DJ,Test EP,99999,Vinyl,A1 Groove')});
 await page.waitForFunction(()=>pendingCSV?.filename==='copies.csv');
 await page.locator('#autoEnrich').uncheck();await page.locator('[data-act="apply-csv"]').click();
 try{await page.waitForFunction(()=>state.releases.length===2&&!window.GrooveprintCollectionEnrichment.job.running)}catch(error){console.log('CSV FIXTURE DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({count:state.releases.length,job:window.GrooveprintCollectionEnrichment.job.phase,running:window.GrooveprintCollectionEnrichment.job.running,sync:discogsSync.running,pending:pendingCSV&&{mapping:pendingCSV.mapping,rows:pendingCSV.parsed.rows},toast:document.getElementById('toast').textContent}))));throw error}
 const imported=await page.evaluate(()=>({count:state.releases.length,uniqueIds:new Set(state.releases.map(r=>r.id)).size,tracks:state.releases.map(r=>r.tracks.length),flagged:state.releases.filter(r=>r.duplicate).length}));
 assert.deepEqual(imported,{count:2,uniqueIds:2,tracks:[1,1],flagged:1});
 console.log('BROWSER CSV',JSON.stringify({malformedPreserved:true,emptyPreserved:true,legitimateCopies:imported}));
 // A separate, unmocked guest context exercises the actual file/download UI.
 const guest=await browser.newPage(process.env.GROOVEPRINT_MOBILE==='1'?{viewport:{width:390,height:844},hasTouch:true}:{});
 const guestBpmCalls=[];guest.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/api/bpm/')||/(^|\.)(getsongbpm\.com|getsong\.co)$/i.test(u.hostname))guestBpmCalls.push(r.url())});
 try{
  await guest.goto(base,{waitUntil:'domcontentloaded'});await guest.waitForFunction(()=>restoreReady&&!discogsConnect.loading);
  assert.equal(await guest.evaluate(()=>discogsConnect.connected),false,'guest journey uses the real, unauthenticated status route');
  assert.equal(await guest.getByRole('button',{name:'SAVE PROJECT',exact:true}).count(),1,'backup must be reachable on this viewport');
  await guest.getByRole('button',{name:'GUIDE / FAQ',exact:true}).click();assert.ok(await guest.locator('.faq').isVisible());
  await guest.getByRole('button',{name:'CLOSE ✕',exact:true}).click();
  const csvDownloadPromise=guest.waitForEvent('download');await guest.getByRole('button',{name:'DOWNLOAD EXAMPLE CSV',exact:true}).click();
  const exampleBytes=await readFile(await(await csvDownloadPromise).path());assert.equal(exampleBytes.toString(),await readFile('examples/grooveprint-demo.csv','utf8'));
  await guest.locator('#fileChooser').setInputFiles({name:'example.csv',mimeType:'text/csv',buffer:exampleBytes});
  await guest.waitForFunction(()=>pendingCSV?.filename==='example.csv');await guest.locator('#autoEnrich').uncheck();
  await guest.locator('[data-act="apply-csv"]').click();await guest.waitForFunction(()=>state.releases.length===5&&!window.GrooveprintCollectionEnrichment.job.running);
  const sample=await guest.evaluate(()=>({count:state.releases.length,tracks:state.releases.reduce((n,r)=>n+r.tracks.length,0),duplicates:state.releases.filter(r=>r.duplicate).length,blankBpms:state.releases.every(r=>r.tracks.every(t=>t.bpm===null)),blankReleaseIds:state.releases.every(r=>!r.releaseId)}));
  assert.deepEqual(sample,{count:5,tracks:12,duplicates:1,blankBpms:true,blankReleaseIds:true});
  assert.ok(!/BPM vengono cercati automaticamente|provider autorizzato/.test(await guest.locator('#rightSide').innerText()));
  await guest.getByRole('button',{name:'Modifica Analog District / Floor Studies EP',exact:true}).press('Enter');
  await guest.locator('[data-rel-field="title"]').fill('Floor Studies - prova');await guest.locator('[data-rel-field="title"]').press('Tab');
  await guest.getByRole('spinbutton',{name:'BPM',exact:true}).first().fill('141');await guest.getByRole('spinbutton',{name:'BPM',exact:true}).first().press('Tab');
  await guest.waitForFunction(()=>rel()?.title==='Floor Studies - prova'&&rel().tracks[0].bpm===141&&rel().tracks[0].bpmStatus==='manual');
  await guest.locator('[data-act="go-design"]').click();await guest.locator('[data-design="preset"]').selectOption({label:'MINIMAL'});
  await guest.locator('[data-act="step-3"]').click();await guest.locator('#sheetPreset').selectOption('4');
  const pdfDownloadPromise=guest.waitForEvent('download');await guest.locator('[data-act="pdf"]').click();
  const pdfBytes=await readFile(await(await pdfDownloadPromise).path()),pdfRaw=pdfBytes.toString('latin1');
  assert.ok(pdfRaw.startsWith('%PDF-'));assert.match(pdfRaw,/\/Type \/Pages \/Count 2/);
  const backupPromise=guest.waitForEvent('download');await guest.getByRole('button',{name:'SAVE PROJECT',exact:true}).click();
  const backupBytes=await readFile(await(await backupPromise).path()),backup=JSON.parse(backupBytes.toString());
  assert.equal(backup.releases.length,5);assert.equal(backup.releases.find(r=>r.artist==='Analog District').tracks[0].bpm,141);
  // Import adversarial identifiers through the same JSON path, then activate by keyboard.
  const trap='copy" onclick="document.body.dataset.injected=1" data-forged="yes';
  const unsafe={app:'GROOVEPRINT',releases:[{id:'safe',artist:'Safe DJ',title:'First',tracks:[]},{id:trap,artist:'Synthetic DJ',title:'Literal ID',tracks:[]}],selected:['safe',trap],active:'safe'};
  await guest.locator('#fileChooser').setInputFiles({name:'identifier-safety.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(unsafe))});
  await guest.waitForFunction(()=>state.releases.length===2&&state.releases[1].title==='Literal ID');
  const row=guest.locator('.rel-item').last();assert.equal(await row.getAttribute('onclick'),null);assert.equal(await row.getAttribute('data-forged'),null);
  assert.equal(await row.getAttribute('data-open-rel'),trap,'the identifier must survive as literal data');
  await guest.getByRole('button',{name:'Modifica Synthetic DJ / Literal ID',exact:true}).press('Enter');
  assert.equal(await guest.evaluate(()=>state.active),trap);assert.equal(await guest.locator('body').getAttribute('data-injected'),null);
  await guest.locator('#fileChooser').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:backupBytes});
  await guest.waitForFunction(()=>state.releases.length===5&&state.releases.some(r=>r.title==='Floor Studies - prova'&&r.tracks[0].bpm===141));
  await guest.waitForTimeout(600);await guest.reload();
  await guest.waitForFunction(()=>restoreReady&&state.releases.length===5&&state.releases.some(r=>r.title==='Floor Studies - prova'&&r.tracks[0].bpm===141));
  assert.deepEqual(guestBpmCalls,[]);
  console.log('BROWSER GUEST JOURNEY',JSON.stringify({...sample,keyboardOpen:true,identifierAttributesSafe:true,guideAndBackupReachable:true,manualBpm:141,pdfPages:2,pdfBytes:pdfBytes.length,jsonRoundtrip:true,reloadRestored:true,bpmApiRequests:0}));
 }finally{await guest.close()}
 // Source APIs are explicitly mocked here; the MP3 decode and V1 worker are real.
 // The separate proof:auto-bpm runner records the live licensed-source evidence.
 const autoPort=await new Promise((yes,no)=>{const s=createServer();s.once('error',no);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>yes(p))})});
 const autoBase='http://127.0.0.1:'+autoPort;
 const autoServer=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,NODE_ENV:'development',PORT:String(autoPort),PUBLIC_ORIGIN:autoBase,DISCOGS_CONSUMER_KEY:'',DISCOGS_CONSUMER_SECRET:''},stdio:'ignore'});const autoClosed=new Promise(r=>autoServer.once('close',r));
 const automatic=await browser.newPage(process.env.GROOVEPRINT_MOBILE==='1'?{viewport:{width:390,height:844},hasTouch:true}:{});
 const resolvedTracks=[],audioDownloads=[];const autoErrors=[];automatic.on('pageerror',e=>autoErrors.push(e.message));
 const sourceMp3=await readFile(join(temp,'synthetic.mp3'));
 await automatic.route('https://api.discogs.com/releases/3759149',r=>r.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{id:3759149,tracklist:[
  {position:'1',title:'Signal (Original Mix)',duration:'0:12',type_:'track'},
  {position:'2',title:'Signal (Remix)',duration:'0:12',type_:'track'},
  {position:'3',title:'No Audio',duration:'0:12',type_:'track'}]}}));
 await automatic.route('**/api/audio/resolve',r=>{const t=r.request().postDataJSON();resolvedTracks.push(t.title);return r.fulfill({json:t.title==='Signal (Original Mix)'?{status:'matched',asset:{name:'synthetic.mp3',size:sourceMp3.length,url:'https://archive.org/download/Crawford_Street-17897/synthetic.mp3'},evidence:{provider:'Synthetic source fixture',recordingId:'generated-12-second-control',sourcePage:'https://archive.org/details/Crawford_Street-17897',scope:'API mocked; generated MP3 integration only',requiresReview:true}}:{status:t.title==='Signal (Remix)'?'review':'unavailable',reason:'source-fixture-abstention'}})});
 await automatic.route('https://archive.org/download/Crawford_Street-17897/synthetic.mp3',r=>{audioDownloads.push(1);return r.fulfill({body:sourceMp3,contentType:'audio/mpeg',headers:{'Access-Control-Allow-Origin':'*'}})});
 try{
  let autoReady=false;for(let n=0;n<80;n++){if(autoServer.exitCode!==null)throw Error('Automatic BPM development server exited');try{if((await fetch(autoBase+'/health')).ok){autoReady=true;break}}catch{}await delay(75)}assert.ok(autoReady);
  await automatic.goto(autoBase);await automatic.locator('.gp-auto-audio').waitFor();
  await automatic.locator('#fileChooser').setInputFiles({name:'synthetic-source-import.csv',mimeType:'text/csv',buffer:Buffer.from('Artist,Title,Release ID\nSynthetic DJ,Test Album,3759149\nSynthetic DJ,Test Album,3759149\n')});
  await automatic.locator('[data-act="apply-csv"]').click();
  await automatic.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.total===6&&window.GrooveprintAutomaticBPM.job.done===6&&!window.GrooveprintAutomaticBPM.job.running);
  const checked=await automatic.evaluate(()=>({tracks:state.releases.flatMap(r=>r.tracks.map(t=>({title:t.title,bpm:t.bpm,status:t.bpmStatus,origin:t.trackSource,algorithm:t.bpmAlgorithm,provenance:t.bpmAudioEvidence?.provider}))),job:{...window.GrooveprintAutomaticBPM.job},resources:{contexts:window.GrooveprintAudioLibrary.job.contexts,workers:window.GrooveprintAudioLibrary.job.workers},persisted:snapshot().releases.map(r=>r.tracks.length)}));
  assert.equal(resolvedTracks.length,3,'duplicate copies reuse positive and negative resolution');assert.equal(audioDownloads.length,1,'one decode per identical recording');
  assert.equal(checked.tracks.length,6);for(const t of checked.tracks){assert.equal(t.bpm,null);assert.equal(t.origin,'discogs');if(t.title==='Signal (Original Mix)'){assert.equal(t.status,'review');assert.equal(t.algorithm,'grooveprint-onset-acf-v1');assert.equal(t.provenance,'Synthetic source fixture')}}
  assert.deepEqual(checked.resources,{contexts:0,workers:0});assert.deepEqual(checked.persisted,[0,0],'analyzing audio must not bypass Discogs metadata retention');
  await automatic.locator('[data-gp-auto-review]').click();assert.ok(await automatic.locator('.gp-bpm-lookup-choice').count()>0);assert.equal(await automatic.locator('.gp-bpm-lookup-results').first().evaluate(el=>el.open),true,'explicit review must expand the selected automatic estimate');assert.match(await automatic.locator('.gp-bpm-lookup-results').first().innerText(),/correlazione, non probabilità/);
  // Explicitly compare both engines using the already authorized source, no user audio upload.
  await automatic.locator('[data-gp-auto-compare]').click();
  await automatic.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.done===3&&
   !window.GrooveprintAutomaticBPM.job.running&&state.releases[0].tracks[0].bpmComparisons?.length===2);
  const comparedAuto=await automatic.evaluate(()=>{
   const t=state.releases[0].tracks[0];
   return {bpm:t.bpm,status:t.bpmStatus,algorithms:t.bpmComparisons.map(x=>x.algorithm),
    candidates:t.bpmComparisonCandidates.length,protected:window.GrooveprintAutomaticBPM.job.protected,
    resources:{contexts:window.GrooveprintAudioLibrary.job.contexts,workers:window.GrooveprintAudioLibrary.job.workers}};
  });
  assert.equal(comparedAuto.bpm,null);
  assert.equal(comparedAuto.status,'review','comparison never auto-assigns a number');
  assert.deepEqual(comparedAuto.algorithms,['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental']);
  assert.ok(comparedAuto.candidates>=2);
  assert.deepEqual(comparedAuto.resources,{contexts:0,workers:0});
  assert.equal(resolvedTracks.length,6,'explicit comparison searches sources only on request');
  assert.equal(audioDownloads.length,2,'same recording decoded once more for both DSP engines together');
  await automatic.locator('[data-act="step-3"]').click();const autoPdfPromise=automatic.waitForEvent('download');await automatic.locator('[data-act="pdf"]').click();const autoPdf=await readFile(await(await autoPdfPromise).path());assert.ok(autoPdf.toString('latin1').startsWith('%PDF-'));

  await automatic.locator('[data-act="step-1"]').click();
  await automatic.locator('[data-gp-auto-example]').waitFor();
  // Regression for the user-visible zero-track open-release example: never add an
  // empty demo, never persist stripped Discogs tracks as an empty local release.
  let exampleTracklist=[];
  await automatic.route('**/api/audio/example',route=>route.fulfill({json:{
   releaseId:'3759149',artist:'Josh Woodward',title:'Crawford Street',label:'Snooter Records',
   format:'File',fetchedAt:new Date().toISOString(),tracklist:exampleTracklist
  }}));
  const originalCount=await automatic.evaluate(()=>state.releases.length);
  await automatic.locator('[data-gp-auto-example]').click();
  await automatic.waitForFunction(()=>document.querySelector('#toast')?.textContent?.includes('tracklist utilizzabile'));
  assert.equal(await automatic.evaluate(()=>state.releases.length),originalCount,'an empty public example must not insert a ghost release');
  exampleTracklist=[
   {position:'1',title:'Signal (Original Mix)',duration:'0:12',type_:'track'},
   {position:'2',title:'No Audio',duration:'0:12',type_:'track'}
  ];
  await automatic.locator('[data-gp-auto-example]').click();
  await automatic.waitForFunction(()=>state.releases.some(r=>r.gpResearchExample===true&&r.tracks.length===2));
  try{await automatic.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.done===5&&!window.GrooveprintAutomaticBPM.job.running,null,{timeout:15000})}
  catch(error){console.log('AUTOMATIC DEMO AFTER COMPARE DIAGNOSTIC',JSON.stringify(await automatic.evaluate(()=>({
    job:window.GrooveprintAutomaticBPM.job,
    trace:window.GrooveprintAutomaticBPM.trace(),
    releases:state.releases.map(r=>({id:r.id,releaseId:r.releaseId,tracks:r.tracks.length,example:r.gpResearchExample})),
    library:window.GrooveprintAudioLibrary.job,
    toast:document.querySelector('#toast')?.textContent
  }))));throw error}
  const exampleCheck=await automatic.evaluate(()=>{
   const demo=state.releases.find(r=>r.gpResearchExample===true);
   return {liveTracks:demo.tracks.length,tracklistFresh:gpIsFresh(demo.tracklistFetchedAt),
    retainedWithoutExample:snapshot().releases.every(r=>!r.gpResearchExample),backupCount:snapshot().releases.length,
    totalReleases:state.releases.length};
  });
  assert.deepEqual(exampleCheck,{liveTracks:2,tracklistFresh:true,retainedWithoutExample:true,backupCount:originalCount,totalReleases:originalCount+1});
  await automatic.locator('[data-gp-auto-example]').click();
  assert.equal(await automatic.evaluate(()=>state.releases.length),originalCount+1,'repeat example click must not create duplicate demos');
  // Recover a legacy local shell produced before research examples were transient.
  // It has the exact public control identity, no user notes and no tracklist.
  await automatic.evaluate(()=>{const d=state.releases.find(x=>x.gpResearchExample);
   d.gpResearchExample=false;d.tracks=[];d.tracklistFetchedAt='';});
  await automatic.locator('[data-gp-auto-example]').click();
  await automatic.waitForFunction(()=>{const d=state.releases.find(x=>x.releaseId==='3759149'&&x.artist==='Josh Woodward');return d?.gpResearchExample===true&&d.tracks.length===2});
  const legacyRecovered=await automatic.evaluate(()=>{const d=state.releases.find(x=>x.releaseId==='3759149'&&x.artist==='Josh Woodward');return {
   count:state.releases.filter(x=>x.releaseId==='3759149'&&x.artist==='Josh Woodward').length,
   tracks:d.tracks.length,transient:d.gpResearchExample===true,backupCount:snapshot().releases.length
  }});
  assert.deepEqual(legacyRecovered,{count:1,tracks:2,transient:true,backupCount:originalCount},'replaying a legacy zero-track example should rehydrate rather than duplicate it');
  // The reported user failure: click V1/V2 while a legacy public demo has 0 tracks.
  // The action must fetch metadata first and then run both DSP engines by itself.
  await automatic.evaluate(()=>{
   window.GrooveprintAutomaticBPM.stop({reset:true,pause:false});
   const demo=state.releases.find(x=>x.gpResearchExample===true);
   state.releases=[demo];demo.gpResearchExample=false;demo.tracks=[];demo.tracklistFetchedAt='';
   state.active=demo.id;state.selected=[demo.id];renderApp();
  });
  await automatic.locator('[data-gp-auto-compare]').click();
  await automatic.waitForFunction(()=>state.releases.length===1&&state.releases[0].tracks.length===2&&
   window.GrooveprintAutomaticBPM.job.total===2&&window.GrooveprintAutomaticBPM.job.done===2&&!window.GrooveprintAutomaticBPM.job.running);
  const noLongerSilent=await automatic.evaluate(()=>({
   tracks:state.releases[0].tracks.length,
   temporary:state.releases[0].gpResearchExample===true,
   results:state.releases[0].tracks[0].bpmComparisons.map(x=>x.algorithm),
   candidateOnly:state.releases[0].tracks[0].bpm===null&&state.releases[0].tracks[0].bpmStatus==='review',
   duplicateCount:state.releases.filter(x=>x.releaseId==='3759149').length
  }));
  assert.deepEqual(noLongerSilent,{tracks:2,temporary:true,
   results:['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental'],
   candidateOnly:true,duplicateCount:1},'one-click comparison must recover a lost tracklist');

  assert.deepEqual(autoErrors,[]);console.log('BROWSER AUTOMATIC BPM',JSON.stringify({source:'mocked API + generated real MP3, not live catalog',import:'CSV -> mocked live-shaped Discogs tracklist -> automatic source resolution',tracks:6,resolverRequests:resolvedTracks.length,audioDownloads:audioDownloads.length,forcedReview:true,metadataRetention:true,resources:checked.resources,pdfBytes:autoPdf.length}));
 }finally{await automatic.close();autoServer.kill('SIGTERM');await autoClosed}
 // The deliverable must work as a downloaded file, with real classic Blob workers.
 const portablePath=join(temp,'GROOVEPRINT-BPM.html');
 execFileSync(process.execPath,['scripts/build-local-preview.mjs','--out',portablePath]);
 const offline=await browser.newPage(process.env.GROOVEPRINT_MOBILE==='1'?{viewport:{width:390,height:844},hasTouch:true}:{});
 const offlineHttp=[],offlineErrors=[];
 offline.on('request',r=>{if(/^https?:/.test(r.url()))offlineHttp.push(r.url())});offline.on('pageerror',e=>offlineErrors.push(e.message));
 try{
  await offline.goto(pathToFileURL(portablePath).href);await offline.waitForFunction(()=>restoreReady&&window.GrooveprintAudioLibrary);
  assert.equal(await offline.locator('[data-gp-engine]').inputValue(),'v1','local experiment is opt-in');
  const project={app:'GROOVEPRINT',releases:[{id:'portable',artist:'Synthetic DJ',title:'Local tempo test',tracks:[{position:'A1',title:'Target recording',bpm:145,bpmStatus:'manual',source:'manual'}]}],selected:['portable'],active:'portable'};
  await offline.locator('#fileChooser').setInputFiles({name:'local-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await offline.waitForFunction(()=>state.releases[0]?.id==='portable');
  await offline.locator('[data-gp-engine]').selectOption('compare');
  await offline.locator('[data-audio-file="0"]').click();
  const generated=Buffer.from(await page.evaluate(()=>Array.from(new Uint8Array(window.gpTestAudioBytes))));
  await offline.locator('#previewAudioFile').setInputFiles({name:'Explicit selection, not a filename match.wav',mimeType:'audio/wav',buffer:generated});
  await offline.waitForFunction(()=>!document.querySelector('[data-gp-track-analyze="0"]').disabled);
  offline.once('dialog',d=>d.accept());await offline.locator('[data-gp-track-analyze="0"]').click();
  await offline.waitForFunction(()=>!window.GrooveprintAudioLibrary.job.running&&state.releases[0].tracks[0].bpmComparisonCandidates?.length);
  const compared=await offline.evaluate(()=>{const t=state.releases[0].tracks[0];return {bpm:t.bpm,status:t.bpmStatus,source:t.source,algorithms:t.bpmComparisons.map(x=>x.algorithm),resources:{contexts:window.GrooveprintAudioLibrary.job.contexts,workers:window.GrooveprintAudioLibrary.job.workers}}});
  assert.equal(compared.bpm,145);assert.equal(compared.status,'manual');assert.equal(compared.source,'manual');
  assert.deepEqual(compared.algorithms,['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental']);assert.deepEqual(compared.resources,{contexts:0,workers:0});
  const candidate=offline.locator('.gp-bpm-lookup-choice').filter({hasText:'grooveprint-onset-acf-v2-experimental'}).first();
  offline.once('dialog',d=>d.accept());await candidate.locator('button').click();
  await offline.waitForFunction(()=>state.releases[0].tracks[0].bpmStatus==='estimated');
  assert.equal(await offline.evaluate(()=>state.releases[0].tracks[0].bpmAlgorithm),'grooveprint-onset-acf-v2-experimental');
  offline.once('dialog',d=>d.accept('138'));await offline.locator('[data-bpm-confirm]').first().click();
  const savedPromise=offline.waitForEvent('download');await offline.getByRole('button',{name:'SAVE PROJECT',exact:true}).click();
  const saved=JSON.parse(await readFile(await(await savedPromise).path(),'utf8'));
  assert.ok(saved.releases[0].tracks[0].bpmAnalysisSeconds>20);assert.equal(saved.releases[0].tracks[0].bpmAlgorithm,'grooveprint-onset-acf-v2-experimental');assert.equal(saved.releases[0].tracks[0].bpmStatus,'verified');
  await offline.locator('#fileChooser').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await offline.waitForFunction(()=>state.releases[0].tracks[0].bpmAlgorithm==='grooveprint-onset-acf-v2-experimental'&&state.releases[0].tracks[0].bpm===138);
  await offline.locator('[data-act="step-3"]').click();
  const exportPromise=offline.waitForEvent('download');await offline.locator('[data-act="pdf"]').click();
  const pdf=await readFile(await(await exportPromise).path());assert.ok(pdf.toString('latin1').startsWith('%PDF-'));
  assert.deepEqual(offlineHttp,[],'the local-file BPM journey must make no HTTP requests');assert.deepEqual(offlineErrors,[]);
  console.log('BROWSER PORTABLE BPM',JSON.stringify({fileUrl:true,defaultEngine:'v1',explicitComparison:true,manual145Preserved:true,algorithms:compared.algorithms,selectedEnginePersisted:true,explicitConfirmation:true,pdfBytes:pdf.length,httpRequests:0,resources:compared.resources,content:'one generated click waveform; integration proof, not musical validation'}));
 }finally{await offline.close()}
 // Import historic external evidence without dropping, relabelling or re-querying it.
 const legacyProject={version:2,app:'GROOVEPRINT',releases:[{id:'legacy',releaseId:'998877',artist:'Legacy DJ',title:'Saved EP',tracks:[
  {position:'A1',title:'Stored catalog',bpm:138,bpmStatus:'catalog',source:'GetSongBPM',bpmReferenceUrl:'https://getsongbpm.com/song/saved/X'},
  {position:'A2',title:'Manual',bpm:145,bpmStatus:'manual',source:'manual'},
  {position:'B1',title:'Verified',bpm:140,bpmStatus:'verified',source:'user-verified'},
  {position:'B2',title:'Cleared',bpm:null,bpmStatus:'manual',source:'manual',bpmUserEdited:true}
 ]}],selected:['legacy'],active:'legacy'};
 await page.locator('#fileChooser').setInputFiles({name:'legacy.grooveprint.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacyProject))});
 await page.waitForFunction(()=>state.releases[0]?.id==='legacy');
 const legacySaved=await page.evaluate(()=>state.releases[0].tracks.map(t=>({bpm:t.bpm,status:t.bpmStatus,source:t.source,reference:t.bpmReferenceUrl})));
 assert.equal(legacySaved[0].bpm,138);assert.equal(legacySaved[0].status,'catalog');assert.equal(legacySaved[0].source,'GetSongBPM');assert.equal(legacySaved[0].reference,'https://getsongbpm.com/song/saved/X');
 assert.equal(legacySaved[1].bpm,145);assert.equal(legacySaved[1].status,'manual');assert.equal(legacySaved[2].status,'verified');assert.equal(legacySaved[3].bpm,null);assert.equal(legacySaved[3].status,'manual');
 assert.match(await page.locator('.gp-bpm-history').first().innerText(),/Provenienza storica/);
 assert.equal(await page.locator('[data-bpm-search],[data-bpm-bulk],.gsb-public-credit').count(),0);
 assert.equal(bpmApiCalls.length,0,'Full metadata/audio/legacy flow makes zero BPM API requests');assert.deepEqual(retiredRequests,[]);
 console.log('BROWSER PROVIDER REMOVAL',JSON.stringify({bpmApiRequests:0,retiredHostRequests:0,legacyEvidencePreserved:true,localCandidateSelection:true,explicitConfirmation:true}));
 console.log('BROWSER PASS: Discogs import → expiry re-sync → WAV local folder BPM estimate with no audio upload');

}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');await delay(140);await rm(temp,{recursive:true,force:true});
}
