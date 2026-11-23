import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as ort from 'onnxruntime-web/wasm';
import {resampleMono,neuralLogMel} from '../src/bpm-neural-features.mjs';
import {inferenceChunks} from '../src/bpm-neural-inference.mjs';

test('pinned model and WebAssembly logits match the independent PyTorch export diagnostic',async()=>{
 const bytes=readFileSync(new URL('../src/models/beat-this-small0/model.onnx',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),'9a46746dcd87354f67010c274fcde8ab8331048022d2b2c0043f5314b6468f07');
 ort.env.wasm.numThreads=1;ort.env.logLevel='error';
 const session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm']});
 try{
  const data=Float32Array.from({length:400*128},(_,i)=>(Math.sin(Math.floor(i/128)*.017+(i%128)*.13)+1)*2);
  const result=await session.run({spectrogram:new ort.Tensor('float32',data,[1,400,128])});
  // Golden values from beat-this 1.1.0 / torch 2.5.1 CPU, not from ONNX.
  const expected={beat:[-4.05426645,-7.03514528,-7.94317675,-7.47276592,-7.87224579],
   downbeat:[-4.86879730,-7.71675968,-8.29916573,-8.18197632,-8.14050674]};
  for(const key of ['beat','downbeat']){
   assert.deepEqual(result[key].dims,[1,400]);
   [0,6,50,199,399].forEach((index,n)=>assert.ok(Math.abs(result[key].data[index]-expected[key][n])<.0001));
   result[key].dispose();
  }
 }finally{await session.release()}
});
test('sinc resampling preserves a physical tone and anti-phase stereo instead of silence',()=>{
 const sr=48000,tone=Float32Array.from({length:sr*8},(_,i)=>.25*Math.sin(2*Math.PI*1000*i/sr));
 const result=resampleMono([tone,Float32Array.from(tone,v=>-v)],sr);
 assert.equal(result.channelMode,'dominant-channel-anti-phase');assert.equal(result.mono.length,22050*8);
 let signal=0,error=0;
 for(let i=100;i<result.mono.length-100;i++){
  const expected=.25*Math.sin(2*Math.PI*1000*i/22050);signal+=expected**2;error+=(result.mono[i]-expected)**2;
 }
 assert.ok(10*Math.log10(signal/error)>45,'resampling should preserve frequency, phase and amplitude');
 const features=neuralLogMel(result.mono);assert.equal(features.frames,401);assert.equal(features.bins,128);
 assert.ok(features.data.every(Number.isFinite));
});
test('reference full-piece chunking covers short and long spectrograms without holes',()=>{
 for(const frames of [401,1501,9001]){
  const features={frames,bins:128,data:new Float32Array(frames*128)};
  const covered=new Set();
  for(const c of inferenceChunks(features)){
   assert.ok(c.frames<=1500);
   for(let i=6;i<c.frames-6;i++)if(c.start+i>=0&&c.start+i<frames)covered.add(c.start+i);
  }
  assert.equal(covered.size,frames);
 }
});
