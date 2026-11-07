import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=readFileSync(new URL('../src/auto-bpm.js',import.meta.url),'utf8');
function setup(releases,config={}){
 config={provider:true,connected:true,onRequest:null,...config};
 const calls=[],context={
  window:{},document:{addEventListener(){}},state:{releases},
  discogsConnect:{connected:config.connected},discogsSync:{running:false},
  gpBpmProviderReady:config.provider,
  AbortController,URLSearchParams,setTimeout,clearTimeout,
  esc:x=>String(x),renderApp(){},storeLater(){},syncDiscogsTracklists:config.sync||(async()=>{}),
  gpRequest:async (url,opts)=>{
   calls.push({url,opts});
   if(config.onRequest)return config.onRequest(url,opts);
   if(url==='/api/bpm/status')return {configured:config.provider};
   return {configured:config.provider,results:JSON.parse(opts.body).tracks.map(t=>({id:t.id,status:'unavailable',reason:'not-found'}))};
  }
 };
 vm.runInNewContext(readFileSync(new URL('../src/bpm-evidence.js',import.meta.url),'utf8'),context);
 vm.runInNewContext(script,context,{filename:'auto-bpm.js'});
 return {api:context.window.GrooveprintAutoBPM,calls,context};
}
test('zero-click task collection skips known BPM, prefers track artist for VA',()=>{
 const release={id:'r',artist:'Various Artists',tracks:[
  {position:'A1',artist:'DJ A',title:'Tribal Tool',bpm:null},
  {position:'A2',artist:'DJ B',title:'Other Tool',bpm:140,bpmStatus:'manual'}
 ]};
 const {api}=setup([release]);
 const jobs=api.collect([release]);
 assert.equal(jobs.length,1);assert.equal(jobs[0].artist,'DJ A');assert.equal(jobs[0].title,'Tribal Tool');
});
test('without API key, automatic import never invents BPM or blocks app',async()=>{
 const t={title:'Unknown Groove',bpm:null};
 const {api,calls}=setup([{id:'r',artist:'DJ',tracks:[t]}],{provider:false});
 await api.run({fetchTracklists:false});
 assert.equal(api.job.phase,'disabled');assert.equal(t.bpm,null);
 assert.equal(calls.length,0);
});
test('automatically assigns catalog BPM only, preserves human BPM, sends proper POST',async()=>{
 const a={position:'A1',title:'Groove',bpm:null};
 const b={position:'A2',title:'Manual Tune',bpm:140,bpmStatus:'manual'};
 const c={position:'B1',title:'Dub',bpm:null};
 const {api,calls}=setup([{id:'r',artist:'DJ',tracks:[a,b,c]}],{onRequest:async(url,opts)=>{
  assert.equal(url,'/api/bpm/batch');assert.equal(opts.method,'POST');
  const tasks=JSON.parse(opts.body).tracks;
  return {configured:true,results:tasks.map(x=>x.title==='Groove'?{id:x.id,status:'catalog',bpm:138,referenceUrl:'https://getsongbpm.com/song/x'}:{id:x.id,status:'review',reason:'conflicting-tempo',candidates:[]})};
 }});
 await api.run({fetchTracklists:false});
 assert.equal(a.bpm,138);assert.equal(a.bpmStatus,'catalog');
 assert.equal(b.bpm,140);assert.equal(b.bpmStatus,'manual');
 assert.equal(c.bpm,null);assert.equal(c.bpmStatus,'review');
 assert.equal(api.job.catalog,1);assert.equal(api.job.review,1);
 assert.equal(api.job.phase,'complete');assert.equal(calls.length,1);
});
test('manual edit that arrives during provider request wins',async()=>{
 const track={title:'A',bpm:null};
 const {api}=setup([{id:'x',artist:'X',tracks:[track]}],{onRequest:async(url,opts)=>{
  track.bpm=145;track.bpmStatus='manual';
  return {configured:true,results:JSON.parse(opts.body).tracks.map(x=>({id:x.id,status:'catalog',bpm:138}))};
 }});
 await api.run({fetchTracklists:false});
 assert.equal(track.bpm,145);assert.equal(track.bpmStatus,'manual');
});
test('no Discogs login -> no exposed provider calls',async()=>{
 const track={title:'A',bpm:null};
 const {api,calls}=setup([{id:'r',artist:'DJ',tracks:[track]}],{connected:false});
 await api.run({fetchTracklists:false});
 assert.equal(api.job.phase,'disabled');assert.equal(calls.length,0);
});
test('a manually cleared BPM is not resurrected by a late provider response',async()=>{
 const track={title:'A',bpm:null};
 const {api}=setup([{id:'x',artist:'X',tracks:[track]}],{onRequest:async(url,opts)=>{
  track.bpm=null;track.bpmStatus='manual';track.source='manual';
  return {configured:true,results:JSON.parse(opts.body).tracks.map(x=>({id:x.id,status:'catalog',bpm:138}))};
 }});
 await api.run({fetchTracklists:false});
 assert.equal(track.bpm,null);assert.equal(track.bpmStatus,'manual');
});
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}};
for(const stage of ['archive','status','catalog'])test('stop during '+stage+' aborts the owned request and discards a late response / queued restart',async()=>{
 const track={title:'A',bpm:null,...(stage==='archive'?{recordingMbid:'6df2d3b5-25e1-4d4c-a196-0404990a93ec'}:{})};
 const entered=deferred(),response=deferred();let signal;
 const {api,calls}=setup([{id:'x',artist:'X',tracks:[track]}],{provider:stage==='status'?null:true,onRequest:(url,opts)=>{signal=opts.signal;entered.resolve();return response.promise}});
 const run=api.run({fetchTracklists:false});await entered.promise;
 await api.run();assert.equal(api.job.restartRequested,true);api.stop();assert.equal(signal.aborted,true);
 response.resolve(stage==='status'?{configured:true}:{configured:true,results:[{id:'0',status:'catalog',bpm:138}]});await run;
 await new Promise(setImmediate);
 assert.equal(track.bpm,null);assert.equal(api.job.running,false);assert.equal(api.job.phase,'interrupted');assert.equal(calls.length,1);assert.equal(api.job.restartRequested,false);
});
test('stop during owned tracklist synchronization forwards cancellation without starting provider work',async()=>{
 const entered=deferred(),synced=deferred();let signal;
 const {api,calls}=setup([{id:'x',artist:'X',releaseId:'123',tracks:[]}],{sync:async(active,options)=>{signal=options.signal;entered.resolve();await synced.promise}});
 const run=api.run();await entered.promise;api.stop();assert.equal(signal.aborted,true);synced.resolve();await run;
 assert.equal(api.job.phase,'interrupted');assert.equal(calls.length,0);
});
test('a transient provider status failure is retried on the next explicit run, never cached as unconfigured',async()=>{
 let attempts=0;
 const track={title:'A',bpm:null};
 const {api,context}=setup([{id:'x',artist:'X',tracks:[track]}],{provider:null,onRequest:async(url,opts)=>{
  if(url==='/api/bpm/status'){if(++attempts===1)throw new TypeError('offline');return {configured:true}}
  return {configured:true,results:[{id:'0',status:'catalog',bpm:138}]};
 }});
 await api.run({fetchTracklists:false});assert.equal(api.job.phase,'error');assert.equal(context.gpBpmProviderReady,null);assert.equal(track.bpm,null);
 await api.run({fetchTracklists:false});assert.equal(attempts,2);assert.equal(track.bpm,138);
});
test('replaced collection and user edit-and-revert invalidate provider evidence',async()=>{
 for(const action of ['replace','revert']){
  const entered=deferred(),response=deferred(),track={title:'A',bpm:null},record={id:'x',artist:'X',tracks:[track]};
  const {api,context}=setup([record],{onRequest:()=>{entered.resolve();return response.promise}});
  const run=api.run({fetchTracklists:false});await entered.promise;
  if(action==='replace')context.state.releases=structuredClone([record]);
  else{context.window.GrooveprintBPMEvidence.userEdit(track);track.bpm=140;track.bpm=null}
  response.resolve({configured:true,results:[{id:'0',status:'catalog',bpm:138}]});await run;assert.equal(track.bpm,null,action);
 }
});
test('an explicit new request after stop is honored after the old request drains, with no overlapping jobs',async()=>{
 const entered=deferred(),response=deferred(),track={title:'A',bpm:null};let n=0;
 const {api}=setup([{id:'r',artist:'DJ',tracks:[track]}],{onRequest:async()=>{if(++n===1){entered.resolve();return response.promise}return {configured:true,results:[{id:'0',status:'catalog',bpm:139}]}}});
 const old=api.run({fetchTracklists:false});await entered.promise;api.stop();await api.run({fetchTracklists:false});
 response.resolve({configured:true,results:[{id:'0',status:'catalog',bpm:70}]});await old;
 for(let i=0;i<100&&track.bpm!==139;i++)await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(n,2);assert.equal(track.bpm,139);assert.equal(api.job.phase,'complete');
});
