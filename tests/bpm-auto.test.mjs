import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function until(check){for(let i=0;i<2000&&!check();i++)await new Promise(r=>setTimeout(r,2));assert.ok(check(),'condition timed out')}
const track=(title='Tool')=>({position:'1',title,duration:'0:22',bpm:null,source:'discogs',trackSource:'discogs'});
function setup({resolve,decode,tracks=[track()],copies=1,preference='on'}={}){
 const state={releases:Array.from({length:copies},(_,i)=>({id:'r'+i,releaseId:'3759149',artist:'DJ',title:'Album',tracklistFetchedAt:new Date().toISOString(),tracks:structuredClone(tracks)}))};
 const preferences=new Map([['grooveprint-auto-bpm-enabled',preference]]);
 const resources={contexts:0,maxContexts:0,workers:0,decodes:0,sourceCalls:0,downloads:0},events={};
 class Context{constructor(){resources.contexts++;resources.maxContexts=Math.max(resources.contexts,resources.maxContexts)}async decodeAudioData(){resources.decodes++;if(decode)await decode();return {sampleRate:12000,length:264000,numberOfChannels:1,getChannelData:()=>new Float32Array(264000)}}async close(){resources.contexts--}}
 class Worker{constructor(){resources.workers++}postMessage(d){queueMicrotask(()=>this.onmessage?.({data:{id:d.id,result:{status:'estimated',bpm:140,bpmCandidates:[{bpm:140,relative:1}],algorithm:'grooveprint-onset-acf-v1',analysisSeconds:22,requiresReview:false}}}))}terminate(){resources.workers--}}
 const evidence={provider:'Test fixture',sourcePage:'https://archive.org/details/Crawford_Street-17897',recordingId:'synthetic-test',requiresReview:true};
 const result={status:'matched',asset:{name:'test.mp3',size:3,url:'https://archive.org/download/Crawford_Street-17897/test.mp3'},evidence};
 const c={localStorage:{getItem:k=>preferences.get(k),setItem:(k,v)=>preferences.set(k,v)},window:{AudioContext:Context,Worker},document:{addEventListener:(n,f)=>(events[n]??=[]).push(f),querySelector:()=>null},state,location:{protocol:'http:'},restoreReady:true,discogsConnect:{loading:false,connected:false},discogsSync:{running:false},gpIsFresh:v=>Date.now()-Date.parse(v)<900000,storeLater(){},renderApp(){},toast(){},esc:String,AbortController,DOMException,URL,setTimeout,clearTimeout,queueMicrotask,
  abortablePause:(ms,s)=>new Promise((yes,no)=>{const t=setTimeout(yes,ms);s.addEventListener('abort',()=>{clearTimeout(t);no(new DOMException('Aborted','AbortError'))},{once:true})}),
  gpRequest:async(path,o)=>{if(path.endsWith('/status'))return {enabled:true,approvedReleaseIds:['3759149'],csrf:'fixture'};resources.sourceCalls++;return resolve?resolve(JSON.parse(o.body),o.signal):structuredClone(result)},
  fetch:async()=>{resources.downloads++;return new Response(new Uint8Array(3),{headers:{'Content-Type':'audio/mpeg'}})} };
 for(const file of ['bpm-evidence.js','bpm-library.js','bpm-auto.js'])vm.runInNewContext(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),c);
 return {state,c,resources,api:c.window.GrooveprintAutomaticBPM,evidence:c.window.GrooveprintBPMEvidence,result,events,preferences};
}
test('automatic scheduling uses shared real queue, deduplicates copies, forces review and preserves protected BPM/clears',async()=>{
 const f=setup({copies:2,tracks:[track(),{...track('Manual'),bpm:145,bpmStatus:'manual'},{...track('Clear'),bpm:null,bpmStatus:'manual'}]});
 await until(()=>f.api.job.done===2&&!f.api.job.running);f.api.schedule();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.resources.sourceCalls,1);assert.equal(f.resources.downloads,1);assert.equal(f.resources.decodes,1);assert.equal(f.resources.maxContexts,1);assert.equal(f.resources.contexts,0);assert.equal(f.resources.workers,0);
 for(const r of f.state.releases){assert.equal(r.tracks[0].bpm,null);assert.equal(r.tracks[0].bpmStatus,'review');assert.equal(r.tracks[0].trackSource,'discogs');assert.equal(r.tracks[1].bpm,145);assert.equal(r.tracks[2].bpmStatus,'manual')}
 assert.equal(f.api.job.protected,4);assert.equal(f.api.job.review,2);
});
test('Stop during source lookup and manual clear discard late results without opening a decoder',async()=>{
 for(const change of ['stop','clear','replace']){
  const gate=deferred(),f=setup({resolve:()=>gate.promise});await until(()=>f.resources.sourceCalls===1);
  const t=f.state.releases[0].tracks[0];if(change==='stop')f.api.stop();else if(change==='clear'){t.bpmStatus='manual';f.evidence.userEdit(t)}else{f.api.stop({reset:true,pause:false});f.state.releases=[]}
  gate.resolve(f.result);await until(()=>!f.api.job.running);assert.equal(f.resources.decodes,0);assert.equal(t.bpm,null);if(change==='replace')assert.equal(f.api.job.done,0);
 }
});
test('metadata expiry during native decode rejects late output and retains one resource owner',async()=>{
 const gate=deferred(),f=setup({decode:()=>gate.promise});await until(()=>f.resources.decodes===1);f.state.releases[0].tracklistFetchedAt='2000-01-01T00:00:00.000Z';f.api.schedule();gate.resolve();await until(()=>!f.api.job.running);assert.equal(f.state.releases[0].tracks[0].bpmStatus,undefined);assert.equal(f.resources.contexts,0);assert.equal(f.resources.workers,0);
});
test('unavailable sources and failed requests are counted once; only explicit retry retries errors',async()=>{
 let calls=0;const f=setup({tracks:[track('Absent'),track('Failure')],resolve:async x=>{calls++;if(x.title==='Failure')throw Error('503');return {status:'unavailable',reason:'no-source'}}});
 await until(()=>f.api.job.done===2&&!f.api.job.running);assert.equal(f.api.job.unavailable,1);assert.equal(f.api.job.errors,1);f.api.schedule();assert.equal(calls,2);f.api.retry();await until(()=>calls===3&&!f.api.job.running);assert.equal(f.resources.decodes,0);
});
test('shared audio Stop cancels the automatic queue and does not restart the next recording',async()=>{
 const gate=deferred(),f=setup({tracks:[track('First'),track('Second')],decode:()=>gate.promise});
 await until(()=>f.resources.decodes===1);f.c.window.GrooveprintAudioLibrary.stop();assert.equal(f.resources.contexts,1,'native decode must drain before release');
 gate.resolve();await until(()=>!f.api.job.running);await new Promise(r=>setTimeout(r,20));
 assert.equal(f.resources.sourceCalls,1);assert.equal(f.resources.decodes,1);assert.equal(f.resources.contexts,0);assert.equal(f.api.job.cancelled,2);assert.equal(f.state.releases[0].tracks[0].bpm,null);
});
test('a concurrent manual analysis retains the single decoder and invalidates the earlier automatic ticket',async()=>{
 const lookup=deferred(),decoded=deferred(),f=setup({resolve:()=>lookup.promise,decode:()=>decoded.promise});
 await until(()=>f.resources.sourceCalls===1);
 const run=f.c.window.GrooveprintAudioLibrary.analyzeFiles([{name:'DJ - Tool.wav',size:3,arrayBuffer:async()=>new ArrayBuffer(3)}]);
 await until(()=>f.resources.decodes===1);lookup.resolve(f.result);decoded.resolve();await run;await until(()=>!f.api.job.running);
 assert.equal(f.resources.maxContexts,1);assert.equal(f.resources.decodes,1);assert.equal(f.state.releases[0].tracks[0].bpm,140);assert.equal(f.state.releases[0].tracks[0].bpmStatus,'estimated');assert.equal(f.api.job.stale,1);
});
test('source outage pauses the batch instead of turning every remaining track into a new failing request',async()=>{
 const f=setup({tracks:[track('First'),track('Second')],resolve:async()=>{throw Object.assign(Error('temporarily unavailable'),{status:503})}});
 await until(()=>!f.api.job.running&&f.api.job.errors===1);f.api.schedule();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.resources.sourceCalls,1);assert.equal(f.api.job.cancelled,1);assert.equal(f.resources.decodes,0);
});
test('the user opt-out persists across initialization and one explicit setting enables the whole flow',async()=>{
 const f=setup({preference:'off'});await new Promise(r=>setTimeout(r,10));f.api.schedule();assert.equal(f.resources.sourceCalls,0);assert.equal(f.api.job.total,0);
 for(const handler of f.events.change)handler({target:{checked:true,matches:s=>s==='[data-gp-auto-enable]'}});
 await until(()=>f.api.job.done===1&&!f.api.job.running);assert.equal(f.preferences.get('grooveprint-auto-bpm-enabled'),'on');assert.equal(f.resources.decodes,1);
});
