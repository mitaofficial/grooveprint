#!/usr/bin/env node
/** Real catalog, real authorized audio, native decode and actual musical engine.
 * No route mocks or audio chooser. Public out-of-target control only.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,firefox,webkit} from 'playwright';
const name=process.env.GROOVEPRINT_BROWSER||'chromium',type={chromium,firefox,webkit}[name];if(!type)throw Error('Invalid browser');
const port=await new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>r(n))})});
const base='http://127.0.0.1:'+port,out='.private/evidence/musical-auto-'+name+'-live';await mkdir(out,{recursive:true});
const server=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:base,NODE_ENV:'development'},stdio:'ignore'});
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break}catch{}if(server.exitCode!==null)throw Error('Development server exited');await new Promise(r=>setTimeout(r,100))}
 browser=await type.launch({headless:true,args:name==='chromium'?['--no-sandbox']:[]});const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[],requests=[],networkFailures=[];let choosers=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('filechooser',()=>choosers++);
 page.on('request',r=>{const u=new URL(r.url());requests.push({host:u.hostname,path:u.pathname,method:r.method()})});
 page.on('requestfailed',r=>{const u=new URL(r.url());networkFailures.push({host:u.hostname,path:u.pathname,error:r.failure()?.errorText})});
 await page.goto(base);await page.locator('.gp-auto-audio').waitFor();
 assert.equal(await page.locator('[data-gp-engine]').inputValue(),'internal');
 await page.locator('[data-gp-auto-example]').click();
 await page.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.total===14&&window.GrooveprintAutomaticBPM.job.done===14&&!window.GrooveprintAutomaticBPM.job.running,{},{timeout:480000});
 const attempts=[];
 const first=await page.evaluate(()=>({...window.GrooveprintAutomaticBPM.job}));attempts.push(first);
 if(first.errors>0){
  await page.locator('[data-gp-auto-retry]').click();
  await page.waitForFunction(()=>window.GrooveprintAutomaticBPM.job.done===14&&!window.GrooveprintAutomaticBPM.job.running,{},{timeout:480000});
  attempts.push(await page.evaluate(()=>({...window.GrooveprintAutomaticBPM.job})));
 }
 const result=await page.evaluate(()=>({sha:document.querySelector('[data-gp-build]')?.textContent,
  job:{...window.GrooveprintAutomaticBPM.job},resources:{contexts:window.GrooveprintAudioLibrary.job.contexts,workers:window.GrooveprintAudioLibrary.job.workers},
  tracks:state.releases.flatMap(r=>r.tracks.map(t=>({title:t.title,bpm:t.bpm,status:t.bpmStatus,algorithm:t.bpmAlgorithm,
   decision:t.bpmDecision?.status,reason:t.bpmReason,seconds:t.bpmAnalysisSeconds,windows:t.bpmAnalysisWindows,
   hasAudioEvidence:Boolean(t.bpmAudioEvidence),sourcePhase:window.GrooveprintAutomaticBPM.inspect(t)?.phase}))) }));
 await writeFile(out+'/attempt.json',JSON.stringify({kind:'REAL_AUTOMATIC_MUSICAL_ATTEMPT',browser:name,attempts,networkFailures,errors,...result},null,2)+'\n');
 assert.equal(result.job.errors,0,JSON.stringify(result.job));assert.ok(result.tracks.some(t=>t.hasAudioEvidence),'LIVE BLOCKED: no permitted audio decoded');
 for(const t of result.tracks.filter(t=>t.hasAudioEvidence))assert.equal(t.algorithm,'grooveprint-musical-beats-small0-v1');
 assert.ok(result.tracks.some(t=>t.status==='estimated'&&Number.isFinite(t.bpm)),'LIVE INCOMPLETE: no usable experimental estimate reached the normal import flow');
 for(const t of result.tracks.filter(t=>t.bpm!==null&&t.bpm!==undefined)){assert.equal(t.status,'estimated');assert.equal(t.decision,'supported')}
 assert.deepEqual(result.resources,{contexts:0,workers:0});assert.equal(choosers,0);assert.equal(errors.length,0,JSON.stringify(errors));
 assert.ok(!requests.some(r=>/getsong|getsongbpm|getbpm/i.test(r.host)),'removed provider must never be queried');
 await page.locator('[data-gp-auto-review]').click();await page.screenshot({path:out+'/result.png',fullPage:true});
 await writeFile(out+'/proof.json',JSON.stringify({kind:'REAL_AUTOMATIC_MUSICAL_PIPELINE_NOT_ACCURACY',browser:name,version:browser.version(),audioChoosers:choosers,errors,requests,...result},null,2)+'\n');
 console.log('MUSICAL_AUTO_LIVE',JSON.stringify({sha:result.sha,browser:name,processed:result.job.done,estimated:result.job.estimated,review:result.job.review,unavailable:result.job.unavailable,errors:result.job.errors,resources:result.resources,audioChoosers:choosers}));
}finally{await browser?.close();server.kill('SIGTERM')}
