import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBeatTempo} from '../src/bpm-beat-tracker.mjs';
import {pcmBuffer,estimateBaseline} from '../src/bpm-engine.mjs';

function clock(bpm,{sampleRate=12000,seconds=36,stereo=false}={}){
 const a=new Float32Array(Math.floor(seconds*sampleRate));
 const period=60/bpm;
 for(let t=.25;t<seconds;t+=period){
  const first=Math.round(t*sampleRate);
  for(let n=0;n<sampleRate*.025&&first+n<a.length;n++)
   a[first+n]=Math.exp(-n/(sampleRate*.006))*Math.sin(2*Math.PI*1200*n/sampleRate);
 }
 return pcmBuffer(sampleRate,stereo?[a,Float32Array.from(a,v=>-v)]:[a]);
}

test('temporal fit removes the reproducible integer-lag BPM resolution defect',()=>{
 const audio=clock(138);
 assert.ok(Math.abs(estimateBaseline(audio).bpm-138)>1,'the frozen baseline must reproduce the defect');
 const result=analyzeBeatTempo(audio);
 assert.ok(Math.abs(result.bpm-138)<=1,JSON.stringify(result));
 assert.equal(result.confidence,null);
 assert.ok(result.beatTracking.windows.every(w=>w.observedBeats>20));
});

test('equal anti-phase stereo does not erase rhythmic evidence',()=>{
 const result=analyzeBeatTempo(clock(138,{stereo:true}));
 assert.ok(Math.abs(result.bpm-138)<=1,JSON.stringify(result));
});

test('hop timestamps use the actual sample rate',()=>{
 for(const sampleRate of [12000,22050,44100,48000]){
  const result=analyzeBeatTempo(clock(123.4,{sampleRate}));
  assert.ok(Math.abs(result.bpm-123.4)<.5,JSON.stringify({sampleRate,result}));
 }
});

test('silence and short inputs never acquire a BPM',()=>{
 for(const seconds of [2,36]){
  const result=analyzeBeatTempo(pcmBuffer(12000,[new Float32Array(12000*seconds)]));
  assert.equal(result.bpm,null);assert.equal(result.requiresReview,true);
 }
});

test('different tempos in distinct sections cannot become one usable scalar',()=>{
 const a=clock(100).getChannelData(0),b=clock(150).getChannelData(0);
 const all=new Float32Array(a.length+b.length);all.set(a);all.set(b,a.length);
 const result=analyzeBeatTempo(pcmBuffer(12000,[all]));
 assert.equal(result.requiresReview,true);assert.equal(result.decision.suggestedBpm,null);
 assert.ok(['tempo-varies-or-metrical-change','metrical-conflict'].includes(result.reason),JSON.stringify(result));
});
