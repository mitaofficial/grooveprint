// Shared result contract; the original detector and its parameters are unchanged.
import {estimateLocalTempo} from './bpm-tempo.mjs';
export function tempoResult(raw,buffer,algorithm){
 const seconds=Number(buffer?.duration)>=8?Math.min(180,Number(buffer.duration)):0;
 const valid=raw?.status==='estimated'&&Number.isFinite(raw.bpm)&&raw.bpm>=40&&raw.bpm<=300;
 return {...raw,status:valid?'estimated':'unavailable',bpm:valid?raw.bpm:null,
  bpmCandidates:valid?(raw.bpmCandidates||[]).filter(c=>Number.isFinite(c.bpm)&&c.bpm>=40&&c.bpm<=300).slice(0,8).map(c=>({...c,algorithm})):[],
  algorithm,confidence:null,source:'local-dsp',requiresReview:valid?Boolean(raw.requiresReview):true,
  analysisSeconds:Math.min(seconds,Number(raw?.analysisSeconds)||seconds),analysisWindow:{startSeconds:0,endSeconds:Math.min(seconds,Number(raw?.analysisSeconds)||seconds)}};
}
export function estimateBaseline(buffer){return tempoResult(estimateLocalTempo(buffer),buffer,'grooveprint-onset-acf-v1')}
export function pcmBuffer(sampleRate,channels){
 if(!Number.isFinite(sampleRate)||sampleRate<8000||!Array.isArray(channels)||channels.length<1||channels.length>2||
  channels.some(c=>!(c instanceof Float32Array)||!c.length||c.length>sampleRate*180)||channels.some(c=>c.length!==channels[0].length))throw Error('Invalid PCM');
 return {sampleRate,duration:channels[0].length/sampleRate,numberOfChannels:channels.length,getChannelData:c=>channels[c]};
}
