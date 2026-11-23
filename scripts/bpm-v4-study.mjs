/**
 * V4 development-only, diagnostic-only comparison.
 * SYNTHETIC audio is not a holdout or evidence about released recordings.
 * Publisher-loop and independently verified real corpus remain separate.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {synthesize,noBeat} from './tempo-synthetic.mjs';
import {analyzeTempoComparison} from '../src/bpm-compare-v3.mjs';
import {evaluateBeatGridOnsets,BEATGRID_VERSION} from '../src/bpm-beatgrid-v4.mjs';
const tempos=[70,100,138,150],patterns=['four','sparse','triplets'];
const rows=[];
for(const bpm of tempos)for(const pattern of patterns){
 const audio=synthesize('v4-study-'+bpm+'-'+pattern,bpm,pattern);
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice());
 const begin=performance.now(),v3=analyzeTempoComparison(audio.sampleRate,channels);
 const v4=evaluateBeatGridOnsets(audio),elapsedMs=performance.now()-begin;
 rows.push({case:'synthetic-'+bpm+'-'+pattern,kind:'synthetic-development-not-holdout',
  referenceBpm:bpm,pattern,
  v1Bpm:v3.comparisons[0].bpm,v2Bpm:v3.comparisons[1].bpm,
  v3Bpm:v3.decision.suggestedBpm,v3Status:v3.decision.status,
  v4Bpm:v4.suggestedBpm,v4Status:v4.status,v4Reason:v4.reason,
  v4GridCandidates:v4.candidateGrids.map(g=>({bpm:g.bpm,score:g.score,
   coverage:g.beatOccupancy,phaseJitter:g.phaseJitter,observedBeats:g.observedBeats})),
  processingMs:Math.round(elapsedMs)});
}
const none=noBeat('v4-study-no-beat'),silence=evaluateBeatGridOnsets(none);
rows.push({case:'synthetic-no-beat',kind:'synthetic-development-nonrhythmic',
 referenceBpm:null,v4Status:silence.status,v4Bpm:silence.suggestedBpm,v4Reason:silence.reason});
if(silence.suggestedBpm!==null||silence.status!=='undetermined')
 throw Error('Non-rhythmic audio must not produce a proposed beatgrid BPM');
function count(key){
 const rhythmic=rows.filter(x=>Number.isFinite(x.referenceBpm));
 const proposed=rhythmic.filter(x=>Number.isFinite(x[key]));
 return {eligible:rhythmic.length,proposed:proposed.length,
  correctWithin1Bpm:proposed.filter(x=>Math.abs(x[key]-x.referenceBpm)<=1).length,
  incorrectHalfDouble:proposed.filter(x=>Math.abs(x[key]*2-x.referenceBpm)<=2||
    Math.abs(x[key]/2-x.referenceBpm)<=2).length};
}
const report={kind:'SYNTHETIC_DEVELOPMENT_ONLY',algorithm:BEATGRID_VERSION,
 limitations:['Not an independent holdout or full recordings',
  'V4 tempo hypotheses are derived from V1/V2; DP tracking is not independent tempo induction',
  'No calibrated confidence or validated support: V4 can return only provisional, ambiguous or undetermined',
  'No real songs, licensed publisher loops or Beatport previews are bundled or downloaded here'],
 summary:{v1:count('v1Bpm'),v2:count('v2Bpm'),v3:count('v3Bpm'),v4:count('v4Bpm')},rows};
const out=resolve('.private/benchmarks/v4-development');await mkdir(out,{recursive:true});
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('V4_DEVELOPMENT_SYNTHETIC',JSON.stringify({summary:report.summary,
 nonrhythmic:{status:silence.status,bpm:silence.suggestedBpm},
 report:'.private/benchmarks/v4-development/report.json'}));
console.log('V4_DEVELOPMENT_CASES',JSON.stringify(rows.map(({case:label,referenceBpm,
 v3Status,v3Bpm,v4Status,v4Bpm,v4Reason,v4GridCandidates})=>
 ({case:label,referenceBpm,v3Status,v3Bpm,v4Status,v4Bpm,v4Reason,
  grids:v4GridCandidates?.slice(0,2)}))));
