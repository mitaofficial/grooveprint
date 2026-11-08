import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
async function until(check){for(let i=0;i<2000&&!check();i++)await new Promise(r=>setTimeout(r,2));assert.ok(check(),'condition timed out')}
const track=(title='Tool')=>({position:'1',title,duration:'0:22',bpm:null,source:'discogs',trackSource:'discogs'});
function setup({resolve,decode,tracks=[track()],tracksByCopy=null,copies=1,preference='on',development=false,demo=false,exampleError=false}={}){
 const state={releases:Array.from({length:copies},(_,i)=>({id:'r'+i,releaseId:'3759149',artist:'DJ',title:'Album',tracklistFetchedAt:new Date().toISOString(),tracks:structuredClone(tracksByCopy?.[i]??tracks)}))};
 if(demo)for(const r of state.releases)Object.assign(r,{artist:'Josh Woodward',title:'Crawford Street',label:'Snooter Records',format:'File',tracks:[]});
 state.active=state.releases[0]?.id;state.selected=[];
 const preferences=new Map([['grooveprint-auto-bpm-enabled',preference]]);
 const resources={contexts:0,maxContexts:0,workers:0,decodes:0,sourceCalls:0,downloads:0,exampleCalls:0,tracklistSyncs:0,workerModes:[]},events={};
 class Context{constructor(){resources.contexts++;resources.maxContexts=Math.max(resources.contexts,resources.maxContexts)}async decodeAudioData(){resources.decodes++;if(decode)await decode();return {sampleRate:12000,length:264000,numberOfChannels:1,getChannelData:()=>new Float32Array(264000)}}async close(){resources.contexts--}}
 class Worker{
  constructor(url){resources.workers++;resources.workerModes.push(url);this.compare=String(url).includes('worker-dev')}
  postMessage(d){
   const baseline={status:'estimated',bpm:140,bpmCandidates:[{bpm:140,relative:1}],algorithm:'grooveprint-onset-acf-v1',analysisSeconds:22,requiresReview:false};
   const result=this.compare?{...baseline,algorithm:'grooveprint-v1-v2-local-comparison',requiresReview:true,
    bpmCandidates:[{bpm:140,relative:1,algorithm:'grooveprint-onset-acf-v1'},{bpm:140.1,relative:.97,algorithm:'grooveprint-onset-acf-v2-experimental'}],
    comparisons:[baseline,{...baseline,bpm:140.1,algorithm:'grooveprint-onset-acf-v2-experimental'}],
    decision:{version:'grooveprint-tempo-decision-v3-experimental',status:'supported',suggestedBpm:140,requiresReview:true,
      reason:'two-engine-and-temporal-agreement',evidence:{v1Bpm:140,v2Bpm:140.1,metricalRelation:'same-pulse',windowsPlanned:2,windowsConsistent:2},alternatives:[]}}:baseline;
   queueMicrotask(()=>this.onmessage?.({data:{id:d.id,result}}));
  }
  terminate(){resources.workers--}
 }
 const evidence={provider:'Test fixture',sourcePage:'https://archive.org/details/Crawford_Street-17897',recordingId:'synthetic-test',requiresReview:true};
 const result={status:'matched',asset:{name:'test.mp3',size:3,url:'https://archive.org/download/Crawford_Street-17897/test.mp3'},evidence};
 const c={localStorage:{getItem:k=>preferences.get(k),setItem:(k,v)=>preferences.set(k,v)},window:{AudioContext:Context,Worker,GrooveprintBPMDevelopment:development},document:{addEventListener:(n,f)=>(events[n]??=[]).push(f),querySelector:()=>null},state,location:{protocol:'http:'},restoreReady:true,discogsConnect:{loading:false,connected:false,running:false},discogsSync:{running:false},gpIsFresh:v=>Date.now()-Date.parse(v)<900000,
  mappedDiscogsTracks:data=>data.tracklist.map(t=>({...t,bpm:null,source:'discogs',trackSource:'discogs'})),
  normalizeRelease:x=>({...x,id:'fresh-demo',tracks:x.tracks||[]}),
  commit:fn=>fn(),syncDiscogsTracklists:async()=>{resources.tracklistSyncs++;const record=state.releases.find(x=>x.id===state.active);if(record){record.tracks=[track('Recovered')];record.tracklistFetchedAt=new Date().toISOString();c.window.GrooveprintAutomaticBPM.schedule();}},
  storeLater(){},renderApp(){},toast(){},esc:String,AbortController,DOMException,URL,setTimeout,clearTimeout,queueMicrotask,
  abortablePause:(ms,s)=>new Promise((yes,no)=>{const t=setTimeout(yes,ms);s.addEventListener('abort',()=>{clearTimeout(t);no(new DOMException('Aborted','AbortError'))},{once:true})}),
  gpRequest:async(path,o)=>{if(path.endsWith('/status'))return {enabled:true,approvedReleaseIds:['3759149'],researchExampleReleaseId:'3759149',researchExampleArtist:'Josh Woodward',researchExampleTitle:'Crawford Street',csrf:'fixture'};
   if(path.endsWith('/example')){resources.exampleCalls++;if(exampleError===true||typeof exampleError==='function'&&exampleError(resources.exampleCalls))throw Error('Discogs temporary failure');return {releaseId:'3759149',artist:'Josh Woodward',title:'Crawford Street',label:'Snooter Records',format:'File',fetchedAt:new Date().toISOString(),tracklist:[{position:'1',title:'Recovered',duration:'0:22',type_:'track'}]}}
   resources.sourceCalls++;return resolve?resolve(JSON.parse(o.body),o.signal):structuredClone(result)},
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
 await until(()=>f.api.job.done===2&&!f.api.job.running);assert.equal(f.api.job.unavailable,1);assert.equal(f.api.job.errors,1);assert.equal(f.api.job.phase,'complete-with-errors');assert.match(f.api.job.message,/errore.*RIPROVA/i);f.api.schedule();assert.equal(calls,2);f.api.retry();await until(()=>calls===3&&!f.api.job.running);assert.equal(f.api.job.total,2);assert.equal(f.api.job.done,2);assert.equal(f.resources.decodes,0);
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
test('transient audio error clears after Retry without reanalyzing successful tracks',async()=>{
 let failOnce=true,attempts=[];
 const f=setup({tracks:[track('Good'),track('Transient')],resolve:async x=>{
  attempts.push(x.title);
  if(x.title==='Transient'&&failOnce){failOnce=false;throw Error('temporary MP3 source timeout')}
  return {status:'unavailable',reason:'no-source'};
 }});
 await until(()=>!f.api.job.running&&f.api.job.done===2);
 assert.equal(f.api.job.phase,'complete-with-errors');
 assert.equal(f.api.job.errors,1);
 assert.match(f.api.job.message,/temporary MP3 source timeout/);
 f.api.retry();
 await until(()=>f.api.job.done===2&&!f.api.job.running&&attempts.length===3);
 assert.deepEqual(attempts,['Good','Transient','Transient']);
 assert.equal(f.api.job.errors,0);
 assert.equal(f.api.job.total,2);
 assert.equal(f.api.job.phase,'complete');
});

test('source outage pauses the batch instead of turning every remaining track into a new failing request',async()=>{
 const f=setup({tracks:[track('First'),track('Second')],resolve:async()=>{throw Object.assign(Error('temporarily unavailable'),{status:503})}});
 await until(()=>!f.api.job.running&&f.api.job.errors===1);f.api.schedule();await new Promise(r=>setTimeout(r,10));
 assert.equal(f.resources.sourceCalls,1);assert.equal(f.api.job.cancelled,1);assert.equal(f.resources.decodes,0);
});
test('resetting the automatic pipeline leaves a neutral idle panel rather than a false interruption warning',async()=>{
 const f=setup({preference:'off'});
 await new Promise(r=>setTimeout(r,15));
 f.api.stop({reset:true,pause:false});
 assert.equal(f.api.job.total,0);
 assert.equal(f.api.job.phase,'idle');
 assert.equal(f.api.job.message,'');
});

test('the user opt-out persists across initialization and one explicit setting enables the whole flow',async()=>{
 const f=setup({preference:'off'});await new Promise(r=>setTimeout(r,10));f.api.schedule();assert.equal(f.resources.sourceCalls,0);assert.equal(f.api.job.total,0);
 for(const handler of f.events.change)handler({target:{checked:true,matches:s=>s==='[data-gp-auto-enable]'}});
 await until(()=>f.api.job.done===1&&!f.api.job.running);assert.equal(f.preferences.get('grooveprint-auto-bpm-enabled'),'on');assert.equal(f.resources.decodes,1);
});

test('review navigation prefers an actual BPM candidate over a preceding unavailable source and reveals filtered results',async()=>{
 const matched={status:'matched',asset:{name:'test.mp3',size:3,url:'https://archive.org/download/Crawford_Street-17897/test.mp3'},evidence:{provider:'Test fixture',recordingId:'fixture',requiresReview:true}};
 const f=setup({copies:2,tracksByCopy:[[track('Unavailable')],[track('Candidate')]],resolve:async x=>x.title==='Unavailable'?{status:'unavailable',reason:'no-open-license-source'}:matched});
 await until(()=>f.api.job.done===2&&!f.api.job.running);
 assert.equal(f.state.releases[0].tracks[0].bpmStatus,undefined);
 assert.equal(f.state.releases[1].tracks[0].bpmStatus,'review');
 f.state.active='r0';f.state.search='unrelated';f.state.statusFilter='Ready';f.state.formatFilter='CD';f.state.folderFilter='other';
 for(const handler of f.events.click||[])handler({target:{closest:selector=>selector==='[data-gp-auto-review]'?{}:null}});
 assert.equal(f.state.active,'r1','first actionable BPM candidate should be selected');
 assert.equal(f.state.step,1);assert.equal(f.state.search,'');assert.equal(f.state.statusFilter,'All');
 assert.equal(f.state.formatFilter,'All');assert.equal(f.state.folderFilter,'All');
});

test('album title, audio duration and metadata-source changes reject stale automatic BPM writes',async()=>{
 for(const change of ['album title','duration','track source']){
  const gate=deferred(),f=setup({resolve:()=>gate.promise});
  await until(()=>f.resources.sourceCalls===1);
  const record=f.state.releases[0],t=record.tracks[0];
  if(change==='album title')record.title='New Album';
  else if(change==='duration')t.duration='0:42';
  else t.trackSource='locally-corrected';
  gate.resolve(f.result);
  await until(()=>!f.api.job.running);
  assert.equal(f.resources.decodes,0,change+' changed while source was resolving');
  assert.equal(t.bpm,null);
  assert.equal(t.bpmStatus,undefined);
  assert.equal(f.api.job.stale,1,change+' must be counted stale');
 }
});

test('development uses V3 decision by default, and explicit reanalysis keeps protected values',async()=>{
 const f=setup({development:true,tracks:[track(),{...track('Protected'),bpm:138,bpmStatus:'verified',source:'user-verified'}]});
 await until(()=>f.api.job.done===1&&!f.api.job.running);
 assert.ok(f.resources.workerModes.every(x=>x.endsWith('bpm-worker-dev.mjs')),
  'automatic development analysis must not quietly fall back to six V1 peaks');
 assert.equal(f.state.releases[0].tracks[0].bpmStatus,'review');
 assert.equal(f.state.releases[0].tracks[0].bpmDecision?.version,'grooveprint-tempo-decision-v3-experimental');
 for(const handler of f.events.click)handler({target:{closest:selector=>selector==='[data-gp-auto-compare]'?{}:null}});
 await until(()=>f.api.job.done===1&&!f.api.job.running&&f.resources.decodes===2);
 const t=f.state.releases[0].tracks[0];
 assert.ok(f.resources.workerModes.some(x=>x.endsWith('bpm-worker-dev.mjs')));
 assert.equal(t.bpm,null,'comparison must remain review-only');
 assert.equal(t.bpmStatus,'review');
 assert.equal(t.bpmComparisons.length,2,'V1 and V2 diagnoses are retained');
 assert.equal(t.bpmComparisonCandidates.length,2);
 assert.equal(t.bpmDecision.status,'supported');
 assert.equal(f.state.releases[0].tracks[1].bpm,138,'previously verified values stay protected');
 assert.equal(f.api.job.protected,1);
});
test('V1/V2 reanalysis is disabled outside the development research mode',async()=>{
 const f=setup();
 await until(()=>f.api.job.done===1&&!f.api.job.running);
 for(const handler of f.events.click)handler({target:{closest:selector=>selector==='[data-gp-auto-compare]'?{}:null}});
 await new Promise(r=>setTimeout(r,5));
 assert.equal(f.resources.decodes,1);
 assert.equal(f.c.window.GrooveprintAudioLibrary.setEngineMode('compare'),false);
});

test('V1/V2 click on a legacy zero-track demo hydrates it automatically and starts the comparison',async()=>{
 const f=setup({development:true,demo:true,tracks:[]});
 await new Promise(r=>setTimeout(r,15));
 assert.equal(f.state.releases[0].tracks.length,0);
 for(const handler of f.events.click||[])handler({target:{closest:s=>s==='[data-gp-auto-compare]'?{}:null}});
 await until(()=>f.resources.exampleCalls===1&&f.api.job.done===1&&!f.api.job.running);
 const r=f.state.releases[0],t=r.tracks[0];
 assert.equal(f.state.releases.length,1,'do not duplicate the legacy record');
 assert.equal(r.gpResearchExample,true,'repair legacy control as transient research data');
 assert.equal(t.bpm,null,'comparison does not accept numbers silently');
 assert.equal(t.bpmStatus,'review');
 assert.equal(t.bpmComparisons.length,2,'compare both detectors after hydration');
 assert.equal(f.resources.tracklistSyncs,0,'public demo uses server-approved metadata path');
 assert.equal(f.resources.decodes,1,'no manual audio upload required');
 assert.match(f.resources.workerModes[0],/bpm-worker-dev\.mjs$/);
});
test('V1/V2 click on a generic empty Discogs release requests its tracklist before analysis',async()=>{
 const f=setup({development:true,tracks:[]});
 await new Promise(r=>setTimeout(r,15));
 for(const handler of f.events.click||[])handler({target:{closest:s=>s==='[data-gp-auto-compare]'?{}:null}});
 await until(()=>f.resources.tracklistSyncs===1&&f.api.job.done===1&&!f.api.job.running);
 assert.equal(f.resources.exampleCalls,0);
 assert.equal(f.state.releases[0].tracks[0].bpmStatus,'review');
 assert.equal(f.resources.decodes,1);
});
test('V1/V2 metadata failure is visible and cannot produce misleading zero-of-zero success',async()=>{
 const f=setup({development:true,demo:true,tracks:[],exampleError:true});
 await new Promise(r=>setTimeout(r,15));
 for(const handler of f.events.click||[])handler({target:{closest:s=>s==='[data-gp-auto-compare]'?{}:null}});
 await until(()=>f.api.job.phase==='error');
 assert.match(f.api.job.message,/Confronto non avviato/);
 assert.equal(f.state.releases[0].tracks.length,0);
 assert.equal(f.resources.decodes,0);
});

test('Retry button re-runs a failed zero-track comparison and clears the persistent error',async()=>{
 const f=setup({development:true,demo:true,tracks:[],exampleError:n=>n===1});
 await new Promise(r=>setTimeout(r,15));
 for(const handler of f.events.click||[])handler({target:{closest:q=>q==='[data-gp-auto-compare]'?{}:null}});
 await until(()=>f.api.job.phase==='error');
 assert.match(f.api.job.message,/Confronto non avviato/);
 assert.equal(f.state.releases[0].tracks.length,0);
 for(const handler of f.events.click||[])handler({target:{closest:q=>q==='[data-gp-auto-retry]'?{}:null}});
 await until(()=>f.resources.exampleCalls===2&&f.api.job.done===1&&!f.api.job.running);
 assert.equal(f.state.releases[0].tracks.length,1);
 assert.equal(f.state.releases[0].tracks[0].bpmStatus,'review');
 assert.equal(f.state.releases[0].tracks[0].bpm,null);
 assert.equal(f.api.job.errors,0);
 assert.ok(f.api.trace().some(x=>x.phase==='recovering-tracklist'));
});
