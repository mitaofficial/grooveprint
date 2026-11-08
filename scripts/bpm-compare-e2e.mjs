/**
 * Real Playwright browser probe for the zero-track one-click V1/V2 incident.
 * Fixture mode mocks *providers*, never the app's event handler, DSP worker,
 * decoding, state persistence, or UI. Live mode uses actual licensed APIs.
 * Evidence contains public demo metadata only, never copyrighted audio.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile,readFile,mkdtemp} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,firefox,webkit} from 'playwright';
import {synthesize} from './tempo-synthetic.mjs';

const name=process.env.GROOVEPRINT_BROWSER||'chromium';
const engine={chromium,firefox,webkit}[name];
if(!engine)throw Error('Unsupported Playwright browser '+name);
const live=process.argv.includes('--live');
const runs=live?1:Number(process.env.GROOVEPRINT_REPEATS||10);
const mode=live?'live':'fixture';
const checkedOutHead=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:3000}).trim();
const out=resolve('.private/evidence/one-click-'+name+'-'+mode);
await mkdir(out,{recursive:true});
const rows=[],traffic=[],errors=[],serverLog=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const port=await new Promise((yes,no)=>{const s=createServer();s.once('error',no);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>yes(n))})});
const base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,NODE_ENV:'development',PORT:String(port),PUBLIC_ORIGIN:base,DISCOGS_CONSUMER_KEY:'',DISCOGS_CONSUMER_SECRET:''},stdio:['ignore','pipe','pipe']});
server.stdout.on('data',chunk=>serverLog.push(String(chunk).slice(0,2000)));
server.stderr.on('data',chunk=>serverLog.push('stderr:'+String(chunk).slice(0,2000)));
const closed=new Promise(r=>server.once('exit',r));
let browser=null,fixtureMp3=null;
const tracks=Array.from({length:14},(_,i)=>({position:String(i+1),title:i===0?'Signal (Original Mix)':'No Audio '+String(i+1).padStart(2,'0'),duration:'0:12',type_:'track'}));
const demo={releaseId:'3759149',artist:'Josh Woodward',title:'Crawford Street',label:'Snooter Records',format:'File'};
try{
 let healthy=false;
 for(let i=0;i<100;i++){if(server.exitCode!==null)break;try{if((await fetch(base+'/health')).ok){healthy=true;break}}catch{}await delay(100)}
 assert.ok(healthy,'Real application server did not become healthy');
 if(!live){
  const temp=await mkdtemp(join(tmpdir(),'gp-bpm-'));
  const wav=join(temp,'pulse.wav'),mp3=join(temp,'pulse.mp3');
  const signal=synthesize('browser-one-click',100,'four',{quick:true});
  const samples=signal.getChannelData(0),wavBytes=Buffer.alloc(44+samples.length*2);
  wavBytes.write('RIFF',0);wavBytes.writeUInt32LE(wavBytes.length-8,4);wavBytes.write('WAVEfmt ',8);
  wavBytes.writeUInt32LE(16,16);wavBytes.writeUInt16LE(1,20);wavBytes.writeUInt16LE(1,22);
  wavBytes.writeUInt32LE(signal.sampleRate,24);wavBytes.writeUInt32LE(signal.sampleRate*2,28);
  wavBytes.writeUInt16LE(2,32);wavBytes.writeUInt16LE(16,34);wavBytes.write('data',36);
  wavBytes.writeUInt32LE(samples.length*2,40);
  for(let i=0;i<samples.length;i++)wavBytes.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(samples[i]*16000))),44+i*2);
  await writeFile(wav,wavBytes);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',wav,'-codec:a','libmp3lame','-q:a','5',mp3],{timeout:30000});
  fixtureMp3=await readFile(mp3);
  assert.ok(fixtureMp3.length>1000);
 }
 browser=await engine.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});
 const events=async page=>{
  page.on('pageerror',e=>errors.push({page:'browser',message:e.message}));
  page.on('response',response=>{
   const url=new URL(response.url());
   if(url.pathname.startsWith('/api/')||url.hostname==='archive.org'||url.hostname.endsWith('.archive.org'))
    traffic.push({time:new Date().toISOString(),kind:'response',hostname:url.hostname,path:url.pathname,status:response.status()});
  });
  page.on('requestfailed',request=>{
   const url=new URL(request.url());
   if(url.pathname.startsWith('/api/')||url.hostname==='archive.org'||url.hostname.endsWith('.archive.org'))
    traffic.push({time:new Date().toISOString(),kind:'requestfailed',hostname:url.hostname,path:url.pathname,
     reason:String(request.failure()?.errorText||'network failure').slice(0,160)});
  });
  if(!live){
   await page.route('**/api/audio/status',route=>route.fulfill({json:{enabled:true,reviewOnly:true,csrf:'fixture-csrf',approvedReleaseIds:null,researchExampleReleaseId:'3759149',
    researchExampleArtist:demo.artist,researchExampleTitle:demo.title,devSha:checkedOutHead,minRequestIntervalMs:0}}));
   await page.route('**/api/audio/example',route=>route.fulfill({json:{...demo,fetchedAt:new Date().toISOString(),tracklist:tracks}}));
   await page.route('**/api/audio/resolve',route=>{
    const input=route.request().postDataJSON();
    const matched=input.position==='1';
    return route.fulfill({json:matched?{status:'matched',asset:{name:'pulse.mp3',size:fixtureMp3.length,url:'https://archive.org/download/Crawford_Street-17897/pulse.mp3'},
     evidence:{provider:'Original synthetic browser fixture',recordingId:'test-pulse-100',sourcePage:'https://archive.org/details/Crawford_Street-17897',requiresReview:true}}
     :{status:'unavailable',reason:'no-open-license-source'}});
   });
   await page.route('https://archive.org/download/Crawford_Street-17897/pulse.mp3',route=>route.fulfill({
    body:fixtureMp3,contentType:'audio/mpeg',headers:{'Access-Control-Allow-Origin':'*'}
   }));
  }
 };
 const frame=page=>page.evaluate(()=>({
  active:state.active,count:state.releases.length,
  tracks:state.releases[0]?.tracks?.length||0,
  job:{...window.GrooveprintAutomaticBPM.job},
  trace:window.GrooveprintAutomaticBPM.trace(),
  decisionCounts:(state.releases[0]?.tracks||[]).reduce((counts,t)=>{
   const category=t.bpmDecision?.status||'no-v3-decision';
   counts[category]=(counts[category]||0)+1;
   return counts;
  },{}),
  candidate:state.releases[0]?.tracks?.[0]&&{
   bpm:state.releases[0].tracks[0].bpm,
   status:state.releases[0].tracks[0].bpmStatus,
   algorithms:(state.releases[0].tracks[0].bpmComparisons||[]).map(x=>x.algorithm),
   decision:state.releases[0].tracks[0].bpmDecision?{
    status:state.releases[0].tracks[0].bpmDecision.status,
    suggestedBpm:state.releases[0].tracks[0].bpmDecision.suggestedBpm,
    reason:state.releases[0].tracks[0].bpmDecision.reason,
    evidence:state.releases[0].tracks[0].bpmDecision.evidence
   }:null},
  resources:{contexts:window.GrooveprintAudioLibrary.job.contexts,workers:window.GrooveprintAudioLibrary.job.workers}
 }));
 const createPage=async legacy=>{
  const context=await browser.newContext({viewport:{width:1365,height:850}});
  const page=await context.newPage();
  await events(page);
  if(legacy)await page.addInitScript(publicDemo=>{
   try{if(location.protocol.startsWith('http')){
    const record={...publicDemo,id:'legacy-control',tracks:[],tracklistFetchedAt:''};
    localStorage.setItem('grooveprint-project',JSON.stringify({releases:[record],active:record.id,selected:[record.id],folderFilter:'All'}));
    localStorage.setItem('grooveprint-auto-bpm-enabled','on');
   }}catch{}
  },demo);
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>restoreReady&&window.GrooveprintAutomaticBPM&&document.querySelector('[data-gp-auto-compare]'),null,{timeout:25000});
  const displayedHead=await page.locator('[data-gp-build]').textContent();
  assert.ok(displayedHead?.includes(checkedOutHead.slice(0,12)),'browser and running server must display the tested Git checkout');
  if(legacy)await page.waitForFunction(()=>state.releases.length===1&&state.releases[0].tracks.length===0,null,{timeout:15000});
  return {context,page};
 };
 const runOne=async(variant,n)=>{
  const {context,page}=await createPage(variant==='legacy');
  const began=Date.now();
  try{
   if(variant==='fresh'){
    await page.locator('[data-gp-auto-example]').click();
    await page.waitForFunction(()=>state.releases.some(x=>x.releaseId==='3759149'&&x.tracks.length>0),null,{timeout:30000});
    await page.waitForFunction(()=>!window.GrooveprintAutomaticBPM.job.running&&window.GrooveprintAutomaticBPM.job.done>0,null,{timeout:live?270000:30000});
   }
   const before=await frame(page);
   if(variant==='legacy'){assert.equal(before.tracks,0);assert.equal(before.job.total,0);}
   if(n===0)await page.screenshot({path:join(out,variant+'-before.png'),fullPage:true});
   const button=page.locator('[data-gp-auto-compare]');
   await button.click();
   await page.waitForFunction(()=>window.GrooveprintAutomaticBPM.trace().some(x=>x.phase==='preparing'||x.phase==='error'),null,{timeout:4000});
   const immediately=await frame(page);
   if(n===0)await page.screenshot({path:join(out,variant+'-after-click.png'),fullPage:true});
   await page.waitForFunction(()=>{const j=window.GrooveprintAutomaticBPM.job;
    return j.phase==='error'||j.phase==='cancelled'||
     (j.done===j.total&&j.total>0&&!j.running&&['complete','complete-with-errors'].includes(j.phase));
   },null,{timeout:live?300000:65000});
   let done=await frame(page),firstPassFailure=null;
   // External Archive downloads can transiently fail with CORS/network errors.
   // Exercise the *visible* recovery button exactly once; preserve first failure.
   // Do not turn repeated provider errors into a false green live test.
   if(live&&done.job.phase==='complete-with-errors'&&done.job.errors>0){
    firstPassFailure=done;
    if(n===0)await page.screenshot({path:join(out,variant+'-live-first-error.png'),fullPage:true});
    await page.locator('[data-gp-auto-retry]').click();
    await page.waitForFunction(()=>{
     const j=window.GrooveprintAutomaticBPM.job;
     return !j.running&&j.total>0&&j.done===j.total&&
      ['complete','complete-with-errors','error','cancelled'].includes(j.phase);
    },null,{timeout:300000});
    done=await frame(page);
   }
   if(n===0)await page.screenshot({path:join(out,variant+'-after.png'),fullPage:true});
   assert.equal(done.count,1,'comparison cannot duplicate demo record');
   if(done.job.phase!=='error'&&done.job.phase!=='cancelled'){
    assert.equal(done.tracks,live?done.tracks:14,'real tracklist must be present');
    assert.ok(done.tracks>0);
    assert.ok(done.job.total>0&&done.job.done===done.job.total);
    if(!live){
     assert.equal(done.candidate.bpm,null,'no silent BPM auto-acceptance');
     assert.equal(done.candidate.status,'review');
     assert.deepEqual(done.candidate.algorithms,
      ['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental']);
     assert.equal(done.resources.contexts,0);
     assert.equal(done.resources.workers,0);
    }
   }else if(!live)throw Error('Provider fixture failed: '+done.job.message);
   let decisionUi=null;
   if(done.job.review>0){
    await page.locator('[data-gp-auto-review]').click();
    const card=page.locator('.gp-tempo-decision').first();
    await card.waitFor({timeout:10000});
    decisionUi={
     status:await card.getAttribute('data-tempo-decision-status'),
     suggestedButtons:await card.locator('[data-bpm-choose]').count(),
     legacyChoiceRows:await page.locator('.gp-bpm-lookup-choice').count()
    };
    assert.equal(decisionUi.legacyChoiceRows,0,'V3 must not expose 8 raw candidate actions');
    assert.ok(decisionUi.suggestedButtons<=1,'a single BPM may be offered only for supported evidence');
    assert.equal(decisionUi.suggestedButtons,decisionUi.status==='supported'?1:0,
      'ambiguous or undetermined tempo must not offer a numeric choice');
    if(n===0)await page.screenshot({path:join(out,variant+'-tempo-decision.png'),fullPage:true});
   }
   const result={variant,n,mode,browser:name,elapsedMs:Date.now()-began,before,immediately,firstPassFailure,done,decisionUi};
   rows.push(result);
   // A live-provider error must never be counted as a passing real integration.
   // The report and screenshots are written even if the upstream service blocks us.
   if(live){
    assert.ok(done.tracks>0,'LIVE BLOCKED: public Discogs did not yield an authentic tracklist; '+done.job.message);
    assert.ok(done.job.total>0&&done.job.done===done.job.total,'LIVE BLOCKED: audio analysis did not finish; '+done.job.message);
    assert.ok(done.job.review>0,'LIVE BLOCKED: no authorized recording reached the two real DSP engines; '+done.job.message);
    assert.ok(!['error','cancelled','complete-with-errors'].includes(done.job.phase),'LIVE BLOCKED: provider or decoding error; '+done.job.message);
    assert.equal(done.candidate?.bpm,null,'live comparison cannot assign a BPM without user verification');
    assert.equal(done.candidate?.status,'review','live top recording must be review-only');
    assert.deepEqual(done.candidate?.algorithms,
     ['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental'],
     'live comparison must evaluate both algorithms on an actual authorized recording');
    assert.equal(done.resources.contexts,0,'live AudioContext must be released');
    assert.equal(done.resources.workers,0,'live DSP worker must be released');
   }
   return result;
  }finally{await context.close();}
 };
 if(live){await runOne('legacy',0);}
 else{
  for(let n=0;n<runs;n++)await runOne('legacy',n);
  for(let n=0;n<runs;n++)await runOne('fresh',n);
  // Failure injection: malformed metadata cannot silently show 0/0 success.
  const {context,page}=await createPage(true);
  try{
   await page.unroute('**/api/audio/example');
   await page.route('**/api/audio/example',route=>route.fulfill({status:503,json:{error:'temporary outage'}}));
   await page.locator('[data-gp-auto-compare]').click();
   await page.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.phase==='error',null,{timeout:8000});
   const state=await frame(page);
   assert.equal(state.tracks,0);
   assert.match(state.job.message,/Confronto non avviato|Errore/i);
   await page.screenshot({path:join(out,'provider-error.png'),fullPage:true});
   rows.push({variant:'503-error-injection',state});
   // A genuine second click on the visible Retry control must recover without
   // restarting the page, without duplicating the release, or overwriting BPM.
   await page.unroute('**/api/audio/example');
   await page.route('**/api/audio/example',route=>route.fulfill({json:{
    ...demo,fetchedAt:new Date().toISOString(),tracklist:tracks
   }}));
   await page.locator('[data-gp-auto-retry]').click();
   await page.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.done===14&&
    !window.GrooveprintAutomaticBPM.job.running&&state.releases[0].tracks.length===14,
    null,{timeout:65000});
   const recovered=await frame(page);
   assert.equal(recovered.count,1);
   assert.equal(recovered.job.errors,0);
   assert.equal(recovered.candidate.bpm,null);
   assert.deepEqual(recovered.candidate.algorithms,
    ['grooveprint-onset-acf-v1','grooveprint-onset-acf-v2-experimental']);
   await page.screenshot({path:join(out,'provider-retry-success.png'),fullPage:true});
   rows.push({variant:'503-retry-recovered',state:recovered});
  }finally{await context.close();}
 }
}finally{
 await writeFile(join(out,'report.json'),JSON.stringify({
  generatedAt:new Date().toISOString(),head:checkedOutHead,githubEventSha:process.env.GITHUB_SHA||null,browser:name,mode,runs,
  providerSource:live?'LIVE HTTP providers':'MOCKED provider metadata and licensed-source matching; real browser native decoder and V1/V2',
  rows,traffic,errors,serverLog
 },null,2));
 await browser?.close();
 server.kill('SIGTERM');
 await Promise.race([closed,delay(1500)]);
}
if(errors.length)throw Error('Browser page errors: '+errors.map(e=>e.message).join(', '));
console.log('BPM_ONE_CLICK_RESULTS',JSON.stringify(rows.filter(x=>x.done).map(x=>({
 variant:x.variant,mode,tracks:x.done.tracks,phase:x.done.job.phase,total:x.done.job.total,
 processed:x.done.job.done,review:x.done.job.review,unavailable:x.done.job.unavailable,
 errors:x.done.job.errors,firstTrackStatus:x.done.candidate?.status,
 firstTrackBpm:x.done.candidate?.bpm,
 firstTrackAlgorithms:x.done.candidate?.algorithms,decisionCounts:x.done.decisionCounts,tempoDecision:x.done.candidate?.decision,decisionUi:x.decisionUi,resources:x.done.resources
}))));
console.log('BPM_ONE_CLICK_E2E',JSON.stringify({browser:name,mode,passed:rows.length,report:join(out,'report.json')}));
