import test from 'node:test';
import assert from 'node:assert/strict';
import {decideBeatTimes,musicalAnalysisWindows} from '../src/bpm-beat-decision.mjs';
const beats=(bpm,from,to)=>Array.from({length:Math.floor((to-from)*bpm/60)},(_,i)=>from+.13+i*60/bpm).filter(t=>t<to);
test('fits a fractional musical tempo rather than quantizing single inter-beat intervals',()=>{
 const result=decideBeatTimes(beats(138,0,120).map(t=>Math.round(t*50)/50),{duration:120});
 assert.equal(result.status,'supported');assert.ok(Math.abs(result.suggestedBpm-138)<.1);
 assert.equal(result.requiresReview,false);assert.equal(result.windows.length,3);
});
test('a 3:2 tempo change is distinct from half/double and cannot be assigned a scalar',()=>{
 const result=decideBeatTimes([...beats(100,0,36),...beats(150,36,72)],{duration:72});
 assert.equal(result.status,'ambiguous');assert.equal(result.suggestedBpm,null);assert.equal(result.metricalRelation,'three-to-two');
});
test('a drifting middle section prevents a majority vote for constant tempo',()=>{
 const middle=Array.from({length:24},(_,i)=>30+i*.45+i*i*.005);
 const result=decideBeatTimes([...beats(100,0,12),...middle,...beats(100,60,72)].sort((a,b)=>a-b),{duration:72});
 assert.equal(result.requiresReview,true);assert.equal(result.suggestedBpm,null);
});
test('short context bounds cover every claimed analysis window without inventing duration',()=>{
 for(const duration of [8,12,15.9,16,22,24,36,180]){
  const windows=musicalAnalysisWindows(duration);
  assert.ok(windows.every(w=>w.startSeconds>=0&&w.endSeconds<=duration&&w.endSeconds-w.startSeconds<=12));
  if(duration<24)assert.equal(decideBeatTimes(beats(138,0,duration),{duration}).suggestedBpm,null);
 }
});
test('invalid and duplicate beat timestamps are rejected',()=>{
 for(const input of [[1,1],[NaN],[-1],[181]])assert.throws(()=>decideBeatTimes(input,{duration:120}));
});
