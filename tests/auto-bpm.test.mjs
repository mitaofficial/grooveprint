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
  esc:x=>String(x),renderApp(){},storeLater(){},syncDiscogsTracklists:async()=>{},
  gpRequest:async (url,opts)=>{
   calls.push({url,opts});
   if(config.onRequest)return config.onRequest(url,opts);
   if(url==='/api/bpm/status')return {configured:config.provider};
   return {configured:config.provider,results:JSON.parse(opts.body).tracks.map(t=>({id:t.id,status:'unavailable',reason:'not-found'}))};
  }
 };
 vm.runInNewContext(script,context,{filename:'auto-bpm.js'});
 return {api:context.window.GrooveprintAutoBPM,calls};
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
