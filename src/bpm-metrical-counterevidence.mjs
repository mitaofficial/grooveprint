/** Negative evidence only: a coherent competing metrical level forces review.
 * Agreement is never treated as independent validation or probability.
 */
import {estimateLocalTempo as estimateV2} from './bpm-tempo-experiment.mjs';
import {pcmBuffer} from './bpm-engine.mjs';
export function findMetricalCounterevidence(sampleRate,channels,decision){
 if(decision?.status!=='supported'||!Number.isFinite(decision.suggestedBpm))return null;
 const windows=(decision.windows||[]).filter(w=>w.strong);
 if(windows.length<2)return null;
 const evidence=windows.map(w=>{
  const first=Math.floor(w.startSeconds*sampleRate),last=Math.floor(w.endSeconds*sampleRate);
  const buffer=pcmBuffer(sampleRate,channels.map(c=>c.slice(first,last))),r=estimateV2(buffer);
  return {startSeconds:w.startSeconds,endSeconds:w.endSeconds,status:r.status,bpm:r.bpm};
 });
 if(evidence.some(w=>w.status!=='estimated'||!Number.isFinite(w.bpm))||
  Math.max(...evidence.map(w=>w.bpm))-Math.min(...evidence.map(w=>w.bpm))>1)return null;
 const alternate=evidence.reduce((n,w)=>n+w.bpm,0)/evidence.length;
 const ratio=Math.max(alternate,decision.suggestedBpm)/Math.min(alternate,decision.suggestedBpm);
 const relation=[[2,'half-double'],[1.5,'three-to-two'],[3,'triple']].find(([value])=>Math.abs(ratio-value)/value<=.025)?.[1];
 return relation?{bpm:Number(alternate.toFixed(2)),relation,windows:evidence}:null;
}
