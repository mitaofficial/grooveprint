/**
 * Research-only adapter for the existing matched-input benchmark CLI.
 * A provisional beatgrid is a candidate for human review, NEVER an accepted
 * or verified BPM. This file is NOT referenced by the production worker.
 */
import {evaluateBeatGridOnsets,BEATGRID_VERSION} from './bpm-beatgrid-v4.mjs';
export function estimateLocalTempo(buffer,options={}){
 const result=evaluateBeatGridOnsets(buffer,options);
 const proposed=result.status==='provisional'&&Number.isFinite(result.suggestedBpm);
 return {status:proposed?'estimated':'unavailable',
  bpm:proposed?result.suggestedBpm:null,
  requiresReview:true,reason:result.reason,algorithm:BEATGRID_VERSION,
  source:'local-dsp',confidence:null,
  bpmCandidates:result.candidateGrids.map(g=>({bpm:g.bpm,relative:g.score})),
  beatgridResearch:{status:result.status,metrics:result.metrics||null,
   alternativeBpm:result.runnerUpBpm||null,diagnosticOnly:true}};
}
