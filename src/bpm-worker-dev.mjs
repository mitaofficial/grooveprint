// Experimental V1/V2/V3 research worker; public V1 production stays unchanged.
import {analyzeTempoComparison} from './bpm-compare-v3.mjs';
self.onmessage=event=>{
 const {id,sampleRate,channels}=event.data||{};
 try{
  if(!Number.isSafeInteger(id))throw Error('Invalid id');
  self.postMessage({id,result:analyzeTempoComparison(sampleRate,channels)});
 }catch{self.postMessage({id,error:'analysis-failed'})}
};
