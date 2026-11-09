import test from 'node:test';
import assert from 'node:assert/strict';
import {synthesize,noBeat} from '../scripts/tempo-synthetic.mjs';
import {BEATGRID_VERSION,extractBeatEvents,trackPulse,evaluateBeatGridOnsets}
 from '../src/bpm-beatgrid-v4.mjs';

const eventGrid=(bpm,beats=32)=>{
 const period=60/bpm;
 return Array.from({length:beats},(_,i)=>({time:i*period,weight:1}));
};
test('DP tracker reconstructs a musical sequence and returns beat timestamps, not just an ACF peak',()=>{
 const events=eventGrid(120,40);
 const result=trackPulse(events,120,{duration:20});
 assert.ok(result,'a coherent beat sequence should be recoverable');
 assert.equal(result.bpm,120);
 assert.equal(result.observedBeats,40);
 assert.equal(result.missingBeats,0);
 assert.ok(result.beatOccupancy>.99);
 assert.ok(result.phaseJitter<.01);
 assert.ok(result.spanFraction>.9);
 assert.deepEqual(result.beatTimes.slice(0,4),[0,.5,1,1.5]);
 assert.equal(result.diagnosticOnly,true);
});
test('DP tracker tolerates one missing beat but explicitly counts that gap',()=>{
 const events=eventGrid(128,32).filter((_,i)=>i!==11);
 const result=trackPulse(events,128,{duration:15});
 assert.ok(result);
 assert.ok(result.observedBeats>=25);
 assert.ok(result.missingBeats>=1);
 assert.ok(result.beatOccupancy<1);
 assert.ok(result.phaseJitter<.04);
});
test('DP tracker reports no grid for unrelated, too few, or invalid events',()=>{
 assert.equal(trackPulse(eventGrid(120,8),120),null);
 assert.equal(trackPulse(eventGrid(120,30),NaN),null);
 assert.equal(trackPulse(eventGrid(120,30),500),null);
});
test('PCM onset extraction is bounded, returns timed events and consumes no metadata',()=>{
 const audio=synthesize('research-bass-kick',140,'four');
 const info=extractBeatEvents(audio);
 assert.equal(info.status,'ready');
 assert.ok(info.events.length>=20);
 assert.ok(info.events.every(e=>Number.isFinite(e.time)&&e.time>=0&&Number.isFinite(e.weight)));
 assert.ok(info.events.every((e,i)=>i===0||e.time>info.events[i-1].time));
 const analysis=evaluateBeatGridOnsets(audio,{hypotheses:[140,70,100]});
 assert.equal(analysis.version,BEATGRID_VERSION);
 assert.ok(['ambiguous','provisional','undetermined'].includes(analysis.status));
 assert.equal(analysis.requiresReview,true);
 assert.ok(analysis.candidateGrids.every(x=>x.diagnosticOnly===true));
 assert.ok(analysis.candidateGrids.length<=4);
 assert.equal(analysis.status==='provisional',Number.isFinite(analysis.suggestedBpm));
 assert.ok(analysis.status!=='supported','research-stage beat grid is not validated to be supported');
});
test('non-rhythmic signal cannot be converted into a verified BPM',()=>{
 const audio=noBeat('v4-no-beat');
 const result=evaluateBeatGridOnsets(audio);
 assert.equal(result.status,'undetermined');
 assert.equal(result.suggestedBpm,null);
 assert.equal(result.requiresReview,true);
 assert.deepEqual(result.candidateGrids,[]);
});
test('same PCM yields deterministic results on repeated research analyses',()=>{
 const audio=synthesize('research-repeat',138,'tribal',{quick:true});
 const a=evaluateBeatGridOnsets(audio,{hypotheses:[138,69,120]});
 const b=evaluateBeatGridOnsets(audio,{hypotheses:[138,69,120]});
 assert.deepEqual(a,b);
});
