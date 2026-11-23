import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const script=readFileSync(new URL('../src/collection-enrichment.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return {promise,resolve}};
function setup(releases,{sync=async()=>{},shared=false}={}){
 const calls=[],context={window:{},document:{addEventListener(){},querySelector:()=>null},state:{releases},discogsSync:{running:shared},
  AbortController,setTimeout,clearTimeout,esc:String,renderApp(){},
  gpRequest(){throw Error('Metadata enrichment must not query BPM endpoints')},
  syncDiscogsTracklists:async(...args)=>{calls.push(args);return sync(...args)}
 };
 vm.runInNewContext(script,context);return {api:context.window.GrooveprintCollectionEnrichment,calls,context};
}
test('tracklist-only enrichment without audio never invents or replaces any BPM, including an archived MBID',async()=>{
 const tracks=[{title:'Missing',bpm:null,recordingMbid:'6df2d3b5-25e1-4d4c-a196-0404990a93ec'},
  {title:'Manual',bpm:145,bpmStatus:'manual'},{title:'Verified',bpm:140,bpmStatus:'verified'},
  {title:'Cleared',bpm:null,bpmStatus:'manual'},{title:'Saved external',bpm:138,bpmStatus:'catalog',source:'external historical'}];
 const before=JSON.stringify(tracks),{api,calls}=setup([{id:'r',releaseId:'123',tracks}]);
 await api.run();assert.equal(api.job.phase,'complete');assert.equal(calls.length,0);assert.equal(JSON.stringify(tracks),before);
});
test('only missing valid release IDs trigger owned tracklist recovery, not catalog lookup',async()=>{
 const record={id:'r',releaseId:'123',tracks:[]};
 const {api,calls}=setup([record,{id:'bad',releaseId:'invalid',tracks:[]}],{sync:async(_,options)=>{
  assert.equal(options.autoEnrich,false);assert.equal(options.signal.aborted,false);record.tracks=[{title:'New metadata',bpm:null}];
 }});
 await api.run();assert.equal(calls.length,1);assert.equal(api.job.total,1);assert.equal(api.job.done,1);assert.equal(record.tracks[0].bpm,null);
});
test('CSV import with enrichment disabled performs no requests',async()=>{
 const {api,calls}=setup([{releaseId:'123',tracks:[]}]);await api.run({fetchTracklists:false});assert.equal(calls.length,0);assert.equal(api.job.phase,'complete');
});
test('stop aborts owned recovery and cancels a previously queued restart',async()=>{
 const entered=deferred(),drain=deferred();let signal;
 const {api,calls}=setup([{releaseId:'123',tracks:[]}],{sync:async(_,options)=>{signal=options.signal;entered.resolve();await drain.promise}});
 const run=api.run();await entered.promise;await api.run();api.stop();assert.equal(signal.aborted,true);drain.resolve();await run;await new Promise(setImmediate);
 assert.equal(api.job.phase,'interrupted');assert.equal(api.job.running,false);assert.equal(api.job.restartRequested,false);assert.equal(calls.length,1);
});
test('explicit start after stop waits for previous owner to drain before running',async()=>{
 const entered=deferred(),drain=deferred();let count=0;
 const {api,calls}=setup([{releaseId:'123',tracks:[]}],{sync:async()=>{if(++count===1){entered.resolve();await drain.promise}}});
 const run=api.run();await entered.promise;api.stop();await api.run();assert.equal(calls.length,1);drain.resolve();await run;
 for(let i=0;i<100&&calls.length<2;i++)await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls.length,2);assert.equal(api.job.phase,'complete');
});
test('an unrelated active tracklist sync is neither duplicated nor aborted',async()=>{
 const {api,calls,context}=setup([{releaseId:'123',tracks:[]}],{shared:true});await api.run();api.stop();
 assert.equal(calls.length,0);assert.equal(context.discogsSync.running,true);
});
test('temporary metadata failure leaves data intact and a later explicit retry works',async()=>{
 let count=0;const record={releaseId:'123',tracks:[]}, {api}=setup([record],{sync:async()=>{if(++count===1)throw Error('offline');record.tracks=[{title:'Recovered',bpm:null}]}});
 await api.run();assert.equal(api.job.phase,'error');assert.equal(record.tracks.length,0);await api.run();assert.equal(api.job.phase,'complete');assert.equal(record.tracks[0].bpm,null);
});
test('stopping the direct Discogs recovery control does not report successful completion',async()=>{
 const {api,context}=setup([{releaseId:'123',tracks:[]}],{sync:async()=>{context.discogsSync.cancelled=true}});
 await api.run();assert.equal(api.job.phase,'interrupted');assert.equal(api.job.running,false);
});
