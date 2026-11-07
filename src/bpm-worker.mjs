// Production baseline only. The experimental detector is never imported here.
import {estimateLocalTempo} from './bpm-tempo.mjs';
self.onmessage=event=>{
 const {id,sampleRate,channels}=event.data||{};
 try{
  if(!Number.isSafeInteger(id)||!Number.isFinite(sampleRate)||sampleRate<8000||!Array.isArray(channels)||channels.length<1||channels.length>2||
   channels.some(c=>!(c instanceof Float32Array)||c.length>sampleRate*180))throw Error('Invalid PCM message');
  const buffer={sampleRate,duration:channels[0].length/sampleRate,numberOfChannels:channels.length,getChannelData:c=>channels[c]};
  self.postMessage({id,result:estimateLocalTempo(buffer)});
 }catch{self.postMessage({id,error:'analysis-failed'})}
};
