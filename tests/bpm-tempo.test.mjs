import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateLocalTempo} from '../src/bpm-tempo.mjs';
function synthetic(bpm,{duration=45,sampleRate=12000,noise=0}={}){
 const samples=Math.ceil(duration*sampleRate),data=new Float32Array(samples);
 const period=60*sampleRate/bpm;
 for(let n=0;n<samples;n++)if((n%1)===0){
  const beatDistance=n-Math.round(n/period)*period;
  const click=Math.exp(-Math.abs(beatDistance)/Math.max(1,sampleRate*.003));
  data[n]=click+noise*(Math.sin(n*.3)+Math.cos(n*.71));
 }
 return {duration,sampleRate,numberOfChannels:1,getChannelData:()=>data};
}
test('empty/silent audio must be unavailable, never invented BPM',()=>{
 const r=estimateLocalTempo({sampleRate:12000,duration:30,numberOfChannels:1,getChannelData:()=>new Float32Array(360000)});
 assert.equal(r.status,'unavailable');assert.equal(r.bpm,null);
});
test('rejects audio shorter than 8 seconds',()=>{
 assert.equal(estimateLocalTempo({duration:2,sampleRate:44100}).status,'unavailable');
});
for(const bpm of [100,124,138,160]){
 test('experimental local detector lists a candidate near '+bpm+' BPM',()=>{
  const result=estimateLocalTempo(synthetic(bpm));
  assert.equal(result.status,'estimated');
  assert.equal(result.audioAnalyzed,true);
  assert.equal(result.confidence,null);
  assert.ok(result.bpmCandidates.some(c=>Math.abs(c.bpm-bpm)<=3),
    'Expected candidate '+bpm+' from '+JSON.stringify(result));
 });
}
