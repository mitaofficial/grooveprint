/**
 * Benchmark-only adapter for the V3 decision. NOT served by production.
 * Same PCM path as browser comparison worker. Null prediction on abstention.
 */
import {analyzeTempoComparison} from './bpm-compare-v3.mjs';
export function estimateLocalTempo(buffer){
 const sr=Number(buffer?.sampleRate),duration=Number(buffer?.duration);
 if(!Number.isFinite(sr)||sr<8000||!Number.isFinite(duration)||duration<8)
  return {status:'unavailable',bpm:null,requiresReview:true,reason:'invalid-or-short-audio',
   bpmCandidates:[],confidence:null,source:'local-dsp'};
 const seconds=Math.min(180,duration),count=Math.floor(sr*seconds);
 const channels=Array.from({length:Math.min(2,buffer.numberOfChannels||1)},(_,i)=>
  buffer.getChannelData(i).slice(0,count));
 const result=analyzeTempoComparison(sr,channels),decision=result.decision;
 const supported=decision.status==='supported'&&Number.isFinite(decision.suggestedBpm);
 return {status:supported?'estimated':'unavailable',bpm:supported?decision.suggestedBpm:null,
  requiresReview:true,reason:decision.reason,algorithm:decision.version,
  source:'local-dsp',confidence:null,analysisSeconds:seconds,
  bpmCandidates:supported?[{bpm:decision.suggestedBpm,relative:null}]:[],
  decision};
}
