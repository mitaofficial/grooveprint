// Served only by the development server, or bundled into an explicitly local file.
import {estimateBaseline,tempoResult,pcmBuffer} from './bpm-engine.mjs';
import {estimateLocalTempo as estimateExperiment} from './bpm-tempo-experiment.mjs';
self.onmessage=event=>{
 const {id,sampleRate,channels}=event.data||{};
 try{
  if(!Number.isSafeInteger(id))throw Error('Invalid id');
  pcmBuffer(sampleRate,channels);
  const original=estimateBaseline(pcmBuffer(sampleRate,channels.map(c=>c.slice())));
  const experimental=tempoResult(estimateExperiment(pcmBuffer(sampleRate,channels.map(c=>c.slice()))),pcmBuffer(sampleRate,channels),'grooveprint-onset-acf-v2-experimental');
  const chosen=experimental.bpm!==null?experimental:original;
  const candidates=[...original.bpmCandidates.slice(0,4),...experimental.bpmCandidates.slice(0,4)];
  self.postMessage({id,result:{...chosen,bpmCandidates:candidates,requiresReview:true,algorithm:'grooveprint-v1-v2-local-comparison',
   reason:'local-comparison-explicit-choice-required',comparisons:[original,experimental]}});
 }catch{self.postMessage({id,error:'analysis-failed'})}
};
