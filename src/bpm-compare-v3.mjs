/**
 * An experimental side-by-side audio comparison. The production V1 worker is
 * not modified. The V3 decision makes an abstention possible without relying
 * on genre priors or external BPM metadata.
 */
import {estimateBaseline,tempoResult,pcmBuffer} from './bpm-engine.mjs';
import {estimateLocalTempo as estimateExperiment} from './bpm-tempo-experiment.mjs';
import {decideTempo} from './bpm-decision.mjs';

export function temporalWindows(sampleRate,channels){
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
export function analyzeTempoComparison(sampleRate,channels){
 const input=pcmBuffer(sampleRate,channels);
 const original=estimateBaseline(pcmBuffer(sampleRate,channels.map(c=>c.slice())));
 const experimental=tempoResult(estimateExperiment(pcmBuffer(sampleRate,channels.map(c=>c.slice()))),
  input,'grooveprint-onset-acf-v2-experimental');
 const windows=temporalWindows(sampleRate,channels);
 const decision=decideTempo({v1:original,v2:experimental,windows});
 const chosen=experimental.bpm!==null?experimental:original;
 // Preserve periodicity peaks only for internal diagnostics. They are not a
 // user-facing shortlist; the product renders the decision and at most two
 // reasons for uncertainty.
 const candidates=[...original.bpmCandidates.slice(0,4),...experimental.bpmCandidates.slice(0,4)];
 return {...chosen,bpmCandidates:candidates,requiresReview:true,
  algorithm:'grooveprint-v1-v2-local-comparison',decision,
  reason:decision.reason,comparisons:[original,experimental]};
}
