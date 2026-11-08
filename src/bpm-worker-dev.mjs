// Experimental V1/V2/V3 comparison worker, never used by public production.
import {estimateBaseline,tempoResult,pcmBuffer} from './bpm-engine.mjs';
import {estimateLocalTempo as estimateExperiment} from './bpm-tempo-experiment.mjs';
import {decideTempo} from './bpm-decision.mjs';
function temporalWindows(sampleRate,channels){
 const seconds=channels[0].length/sampleRate;
 const length=seconds>=72?24:seconds>=18?seconds/2:0;
 if(length<8)return [];
 const starts=seconds>=72?[0,(seconds-length)/2,seconds-length]:[0,seconds-length];
 return starts.map(start=>{
  const first=Math.floor(start*sampleRate),last=Math.floor((start+length)*sampleRate);
  const audio=pcmBuffer(sampleRate,channels.map(c=>c.slice(first,last)));
  const estimated=tempoResult(estimateExperiment(audio),audio,'grooveprint-onset-acf-v2-experimental');
  return {status:estimated.status,bpm:estimated.bpm,reason:estimated.reason,
   startSeconds:Math.round(start*10)/10,endSeconds:Math.round((start+length)*10)/10};
 });
}
self.onmessage=event=>{
 const {id,sampleRate,channels}=event.data||{};
 try{
  if(!Number.isSafeInteger(id))throw Error('Invalid id');
  const input=pcmBuffer(sampleRate,channels);
  const original=estimateBaseline(pcmBuffer(sampleRate,channels.map(c=>c.slice())));
  const experimental=tempoResult(estimateExperiment(pcmBuffer(sampleRate,channels.map(c=>c.slice()))),
   input,'grooveprint-onset-acf-v2-experimental');
  const windows=temporalWindows(sampleRate,channels);
  const decision=decideTempo({v1:original,v2:experimental,windows});
  const chosen=experimental.bpm!==null?experimental:original;
  // Preserve raw periodicity peaks only as internal diagnostic data.
  // The user-facing result uses decision.status and never shows 8 choices.
  const candidates=[...original.bpmCandidates.slice(0,4),...experimental.bpmCandidates.slice(0,4)];
  self.postMessage({id,result:{...chosen,bpmCandidates:candidates,requiresReview:true,
   algorithm:'grooveprint-v1-v2-local-comparison',decision,
   reason:decision.reason,comparisons:[original,experimental]}});
 }catch{self.postMessage({id,error:'analysis-failed'})}
};
