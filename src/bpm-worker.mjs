// Production baseline only. The experimental detector is never imported here.
import {estimateBaseline,pcmBuffer} from './bpm-engine.mjs';
self.onmessage=event=>{
 const {id,sampleRate,channels}=event.data||{};
 try{
  if(!Number.isSafeInteger(id))throw Error('Invalid PCM message');
  self.postMessage({id,result:estimateBaseline(pcmBuffer(sampleRate,channels))});
 }catch{self.postMessage({id,error:'analysis-failed'})}
};
