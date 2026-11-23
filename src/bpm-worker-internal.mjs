// Development only. Runs in the existing single owned worker, after one decode.
import * as ort from '/assets/ort/ort.wasm.min.mjs';
import {analyzeMusicalTempo} from './bpm-musical-engine.mjs';
import {pcmBuffer} from './bpm-engine.mjs';
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;ort.env.wasm.wasmPaths='/assets/ort/';ort.env.logLevel='error';
const MODEL_SHA256='9a46746dcd87354f67010c274fcde8ab8331048022d2b2c0043f5314b6468f07';
let modelPromise=null,busy=false;
async function model(){
 if(!modelPromise)modelPromise=(async()=>{
  const r=await fetch('/assets/beat-this-small0-9a46746d.onnx',{credentials:'omit'});
  if(!r.ok||Number(r.headers.get('content-length'))>12*1024*1024)throw Error('model-unavailable');
  const bytes=await r.arrayBuffer();if(bytes.byteLength!==10401060)throw Error('invalid-model-size');
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  if(Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')!==MODEL_SHA256)throw Error('model-integrity-failed');
  return ort.InferenceSession.create(new Uint8Array(bytes),{executionProviders:['wasm']});
 })();
 return modelPromise;
}
self.onmessage=async event=>{
 const {id,sampleRate,channels}=event.data||{};
 if(!Number.isSafeInteger(id)||busy){self.postMessage({id,error:'invalid-or-concurrent-analysis'});return}
 busy=true;
 try{
  pcmBuffer(sampleRate,channels);
  const session=await model(),result=await analyzeMusicalTempo(sampleRate,channels,{session,Tensor:ort.Tensor});
  result.decision&&(result.decision.modelId='beat-this-small0-'+MODEL_SHA256.slice(0,16));
  self.postMessage({id,result});
 }catch{self.postMessage({id,error:'internal-engine-unavailable'})}
 finally{busy=false}
};
