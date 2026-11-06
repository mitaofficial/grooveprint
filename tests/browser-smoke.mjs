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
 console.log('BROWSER PASS: Discogs import → tracklist → BPM and 15-minute expiry → automatic re-sync → 1 track recovered');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');await delay(140);await rm(temp,{recursive:true,force:true});
}
