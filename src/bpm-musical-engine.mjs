import {resampleMono,neuralLogMel,NEURAL_SAMPLE_RATE} from './bpm-neural-features.mjs';
import {inferMusicalBeatWindows} from './bpm-neural-inference.mjs';
import {decideBeatTimes,musicalAnalysisWindows,NEURAL_BEAT_POLICY} from './bpm-beat-decision.mjs';
import {findMetricalCounterevidence} from './bpm-metrical-counterevidence.mjs';
export const MUSICAL_BPM_ALGORITHM='grooveprint-musical-beats-small0-v1';
export async function analyzeMusicalTempo(sampleRate,channels,{session,Tensor,onProgress}={}){
 const seconds=channels[0]?.length/sampleRate;
 const base={algorithm:MUSICAL_BPM_ALGORITHM,source:'local-dsp',confidence:null,audioAnalyzed:true,
  status:'unavailable',bpm:null,requiresReview:true,bpmCandidates:[],analysisSeconds:0};
 if(!(seconds>=8&&seconds<=180))return {...base,reason:'audio-too-short'};
 const preprocessing=resampleMono(channels,sampleRate);
 if(preprocessing.inputRms<1e-6)return {...base,reason:'no-rhythmic-onsets'};
 const duration=preprocessing.mono.length/NEURAL_SAMPLE_RATE,features=neuralLogMel(preprocessing.mono);
 const bounds=musicalAnalysisWindows(duration);
 const inferred=await inferMusicalBeatWindows(features,bounds,{session,Tensor,onProgress});
 let decision=decideBeatTimes(inferred.beats,{duration});
 const counter=findMetricalCounterevidence(sampleRate,channels,decision);
 if(counter)decision={...decision,status:'ambiguous',suggestedBpm:null,requiresReview:true,reason:'coherent-metrical-counterevidence',
  metricalRelation:counter.relation,counterevidence:counter,alternatives:[{bpm:decision.suggestedBpm},{bpm:counter.bpm}]};
 const usable=decision.status==='supported'&&Number.isFinite(decision.suggestedBpm);
 const candidates=usable?[{bpm:decision.suggestedBpm,algorithm:MUSICAL_BPM_ALGORITHM}]:
  decision.alternatives.map(c=>({...c,algorithm:MUSICAL_BPM_ALGORITHM}));
 return {...base,status:usable?'estimated':inferred.beats.length?'review':'unavailable',bpm:usable?decision.suggestedBpm:null,
  requiresReview:!usable,bpmCandidates:candidates,reason:decision.reason,decision,
  analysisSeconds:bounds.reduce((n,w)=>n+w.endSeconds-w.startSeconds,0),analysisWindows:bounds,
  analysisWindow:{startSeconds:0,endSeconds:duration},
  beatTracking:{model:'Beat This! small0',modelContextFrames:768,modelCalls:inferred.modelCalls,
   beatCount:inferred.beats.length,downbeatCount:inferred.downbeats.length,
   beatTimes:inferred.beats,downbeatTimes:inferred.downbeats,
   channelMode:preprocessing.channelMode,resampler:preprocessing.resampler,sampleRate:NEURAL_SAMPLE_RATE,
   inputSeconds:seconds,windows:decision.windows,contexts:inferred.contexts,policy:NEURAL_BEAT_POLICY}};
}
