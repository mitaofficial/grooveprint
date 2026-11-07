import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=name=>readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
async function until(predicate){for(let n=0;n<5000&&!predicate();n++)await new Promise(setImmediate);assert.ok(predicate(),'observable event did not arrive')}
const audio=()=>({length:120000,sampleRate:12000,numberOfChannels:1,getChannelData:()=>new Float32Array(120000)});
function fixture(n=1,options={}){
 const releases=[{id:'r',artist:'DJ',tracks:Array.from({length:n},(_,i)=>({position:'A'+(i+1),title:'Tool '+i,bpm:null}))}];
 const files=releases[0].tracks.map(t=>({name:'DJ - '+t.title+'.wav',size:128,arrayBuffer:async()=>new ArrayBuffer(128)}));
 const resources={contexts:0,workers:0,maxContexts:0,maxWorkers:0,decodes:0,posts:0,saves:0,fullRenders:0};
 const workers=[],events={};
 class Context{
  constructor(){resources.contexts++;resources.maxContexts=Math.max(resources.maxContexts,resources.contexts)}
  async decodeAudioData(bytes){resources.decodes++;return options.decode?options.decode(bytes):audio()}
  async close(){resources.contexts--}
 }
 class Worker{
  constructor(){resources.workers++;resources.maxWorkers=Math.max(resources.maxWorkers,resources.workers);workers.push(this)}
  postMessage(data){resources.posts++;if(options.post)return options.post(this,data);queueMicrotask(()=>this.onmessage?.({data:{id:data.id,result:{status:'estimated',bpm:138,requiresReview:false,bpmCandidates:[{bpm:138,relative:1}]}}}))}
  terminate(){if(!this.terminated){this.terminated=true;resources.workers--}}
 }
 const state={releases},context={window:{AudioContext:Context,Worker,GrooveprintBPMDevelopment:options.development===true},document:{addEventListener:(name,fn)=>events[name]=fn,querySelector:()=>({set outerHTML(x){}})},
  state,esc:String,gpLocalAudioEntry:(r,t,i)=>{const entry=context.localAudioFiles.get(r.id+':'+i);return entry?.track===t?entry:null},localAudioFiles:new Map(),confirm:()=>true,toast(){},renderApp(){resources.fullRenders++},storeLater(){resources.saves++},setTimeout:(f,ms)=>setTimeout(f,ms===0?0:ms),clearTimeout};
 vm.runInNewContext(source('bpm-evidence.js'),context);vm.runInNewContext(source('bpm-library.js'),context);
 return {api:context.window.GrooveprintAudioLibrary,evidence:context.window.GrooveprintBPMEvidence,state,releases,files,resources,workers,context,events};
}
function invariant(job){assert.equal(job.total,job.pending+job.active+job.completed+job.skipped+job.errors+job.cancelled);assert.equal(job.processed,job.completed+job.skipped+job.errors)}
test('stop during decode holds the resource lock, rejects duplicate starts and discards late output',async()=>{
 const decode=deferred();let slow=true;
 const f=fixture(2,{decode:()=>slow?decode.promise:audio()});
 const running=f.api.analyzeFiles(f.files);await until(()=>f.resources.decodes===1);
 invariant(f.api.job);f.api.stop();assert.equal(f.api.job.phase,'cancelling');
 await f.api.analyzeFiles(f.files);assert.equal(f.resources.maxContexts,1);assert.equal(f.resources.decodes,1);
 decode.resolve(audio());await running;
 assert.equal(f.api.job.phase,'cancelled');assert.equal(f.resources.posts,0);assert.equal(f.resources.saves,0);
 assert.equal(f.resources.contexts,0);assert.equal(f.api.job.cancelled,2);invariant(f.api.job);
 slow=false;await f.api.analyzeFiles(f.files);
 assert.equal(f.api.job.completed,2);assert.equal(f.resources.maxContexts,1);assert.equal(f.resources.workers,0);invariant(f.api.job);
});
test('stop during read starts no decoder; stop during DSP terminates the worker and settles the caller',async()=>{
 const reading=deferred(),readStarted=deferred(),f=fixture();
 f.files[0].arrayBuffer=()=>{readStarted.resolve();return reading.promise};
 const run=f.api.analyzeFiles(f.files);await readStarted.promise;f.api.stop();reading.resolve(new ArrayBuffer(32));await run;
 assert.equal(f.resources.decodes,0);assert.equal(f.api.job.cancelled,1);invariant(f.api.job);
 const g=fixture(2,{post(){}}),work=g.api.analyzeFiles(g.files);await until(()=>g.resources.posts===1);
 g.api.stop();await work;
 assert.equal(g.api.job.phase,'cancelled');assert.equal(g.resources.posts,1);assert.equal(g.resources.workers,0);assert.equal(g.resources.contexts,0);invariant(g.api.job);
});
test('manual clear, edit-and-revert and replaced collections invalidate an in-flight ticket',async()=>{
 for(const change of ['clear','revert','replace']){
  const gate=deferred(),f=fixture(1,{decode:()=>gate.promise}),track=f.releases[0].tracks[0];
  const work=f.api.analyzeFiles(f.files);await until(()=>f.resources.decodes===1);
  if(change==='clear'){track.bpm=null;track.bpmStatus='manual';f.evidence.userEdit(track)}
  if(change==='revert'){f.evidence.userEdit(track);track.title='Changed';track.title='Tool 0'}
  if(change==='replace')f.state.releases=structuredClone(f.releases);
  gate.resolve(audio());await work;
  assert.equal(track.bpm,null,change);assert.equal(f.api.job.stale,1);assert.equal(f.resources.saves,0);invariant(f.api.job);
 }
});
test('a broken file is counted once and does not prevent subsequent files; no audio remains in the job',async()=>{
 let calls=0;const f=fixture(3,{decode:()=>{if(++calls===2)throw Error('codec unsupported');return audio()}});
 await f.api.analyzeFiles(f.files);
 assert.equal(f.api.job.completed,2);assert.equal(f.api.job.errors,1);assert.equal(f.resources.saves,2);assert.equal(f.resources.fullRenders,0);
 assert.equal(f.resources.contexts,0);assert.equal(f.resources.workers,0);invariant(f.api.job);
 assert.ok(!JSON.stringify(f.api.job).includes('channels'));
});
test('file accounting, cap, collisions and protected empty BPMs are explicit',async()=>{
 const f=fixture();
 const plan=f.api.planFiles([...Array.from({length:1600},()=>({name:'x.jpg',size:5})),...Array.from({length:1502},()=>f.files[0]),{name:'empty.wav',size:0},{name:'huge.wav',size:170*1024*1024}]);
 assert.equal(plan.found,3104);assert.equal(plan.files.length,1500);assert.equal(plan.beyondLimit,2);assert.equal(plan.empty,1);assert.equal(plan.oversize,1);assert.equal(plan.unsupported,1600);
 await f.api.analyzeFiles([f.files[0],{...f.files[0],name:'DJ - Tool 0.flac'}]);
 assert.equal(f.api.job.ambiguous,2);assert.equal(f.resources.decodes,0);invariant(f.api.job);
 f.releases[0].tracks[0].bpmStatus='manual';await f.api.analyzeFiles(f.files);
 assert.equal(f.api.job.alreadyBpm,1);assert.equal(f.resources.decodes,0);invariant(f.api.job);
});
for(const n of [10,100,500,1500])test('controlled '+n+' file queue owns at most one context/worker and keeps its partition',async()=>{
 const f=fixture(n),start=performance.now();await f.api.analyzeFiles(f.files);
 assert.equal(f.api.job.completed,n);assert.equal(f.resources.maxContexts,1);assert.equal(f.resources.maxWorkers,1);assert.equal(f.resources.contexts,0);assert.equal(f.resources.workers,0);invariant(f.api.job);
 console.log(JSON.stringify({kind:'controlled-audio-queue',n,ms:Math.round(performance.now()-start),maxContexts:f.resources.maxContexts,maxWorkers:f.resources.maxWorkers,remainingContexts:f.resources.contexts,remainingWorkers:f.resources.workers}));
});
test('matching preserves numeric and non-ASCII titles, edits and duplicate recording ambiguity',()=>{
 const f=fixture(),r={id:'other',artist:'M.I.T.A. (2)',tracks:[{title:'Água 02 (Extended Mix)'},{title:'日本の音'},{title:'Água 02 (Radio Edit)'}]};
 const tracks=f.api.trackList([r]);
 assert.equal(f.api.matchFile({name:'M.I.T.A. - Agua 02 (Extended Mix).wav'},tracks).index,0);
 assert.equal(f.api.matchFile({name:'M.I.T.A. (2) - 日本の音.flac'},tracks).index,1);
 assert.equal(f.api.matchFile({name:'M.I.T.A. - Agua 02.wav'},tracks).status,'unmatched');
 assert.equal(f.api.matchFile({name:'M.I.T.A. - Agua 02 (Extended Mix).wav'},f.api.trackList([r,{...r,id:'copy',tracks:structuredClone(r.tracks)}])).status,'ambiguous');
});

test('single-track comparison shares the owned queue, preserves manual data and records only real diagnostics',async()=>{
 const f=fixture(1,{development:true,post(worker,data){queueMicrotask(()=>worker.onmessage?.({data:{id:data.id,result:{status:'estimated',bpm:138,requiresReview:true,bpmCandidates:[{bpm:138,relative:1,algorithm:'v2'}],comparisons:[{algorithm:'v1',bpm:140},{algorithm:'v2',bpm:138}]}}}))}});
 const r=f.releases[0],t=r.tracks[0];Object.assign(t,{bpm:145,bpmStatus:'manual',source:'manual'});
 f.context.localAudioFiles.set('r:0',{track:t,file:{...f.files[0],name:'Explicitly selected different filename.wav'}});
 f.events.change({target:{matches:()=>true,value:'compare'}});
 await f.api.analyzeTrack('r',0);
 assert.equal(t.bpm,145);assert.equal(t.bpmStatus,'manual');assert.equal(t.source,'manual');
 assert.equal(t.bpmComparisonCandidates[0].algorithm,'v2');assert.equal(t.bpmComparisons.length,2);
 assert.equal(f.api.job.review,1);assert.equal(f.resources.maxWorkers,1);assert.equal(f.resources.contexts,0);invariant(f.api.job);
 f.evidence.userEdit(t);assert.equal(t.bpmComparisonCandidates,undefined,'manual edits invalidate pending choices');
});

test('a single-file association cannot move to another track after removal/reordering',async()=>{
 const f=fixture(2),r=f.releases[0];f.context.localAudioFiles.set('r:0',{track:r.tracks[0],file:f.files[0]});
 r.tracks.shift();await f.api.analyzeTrack('r',0);assert.equal(f.resources.decodes,0);assert.equal(r.tracks[0].bpm,null);
});
