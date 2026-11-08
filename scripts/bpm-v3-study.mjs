/**
 * V3 *development-only* scoring on original deterministic rhythmic stimuli.
 * This is NOT an independently verified full-song accuracy study/holdout.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {synthesize,noBeat} from './tempo-synthetic.mjs';
import {analyzeTempoComparison} from '../src/bpm-compare-v3.mjs';
const rate=(n,d)=>d?Math.round(n/d*10000)/100:null;
const tempos=[70,100,138,150],patterns=['four','sparse','triplets'];
const cases=[];
for(const bpm of tempos)for(const pattern of patterns){
 const id='v3-development-'+bpm+'-'+pattern;
 const audio=synthesize(id,bpm,pattern);
 const channels=Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i).slice());
 const start=performance.now();
 const r=analyzeTempoComparison(audio.sampleRate,channels);
 const v1=r.comparisons[0],v2=r.comparisons[1],d=r.decision;
 cases.push({id,kind:'generated-synthetic',referenceBpm:bpm,
  v1Bpm:v1.bpm,v2Bpm:v2.bpm,v1Reason:v1.reason,v2Reason:v2.reason,v2RequiresReview:v2.requiresReview,v2SelectedFromHarmonic:v2.selectedFromHarmonic,v2HarmonicFactor:v2.harmonicFactor,metricalRelation:d.evidence.metricalRelation,windowBpm:d.evidence.windows.map(w=>w.bpm),
  v3Bpm:d.suggestedBpm,v3Status:d.status,v3Reason:d.reason,
  windowsPlanned:d.evidence.windowsPlanned,
  windowsConsistent:d.evidence.windowsConsistent??0,
  elapsedMs:Math.round((performance.now()-start)*10)/10});
}
const noBeatSignal=noBeat('v3-development-no-beat');
const silence=analyzeTempoComparison(noBeatSignal.sampleRate,[noBeatSignal.getChannelData(0).slice()]);
cases.push({id:'v3-development-no-beat',kind:'generated-synthetic-no-beat',referenceBpm:null,
  v1Bpm:silence.comparisons[0].bpm,v2Bpm:silence.comparisons[1].bpm,
  v3Bpm:silence.decision.suggestedBpm,v3Status:silence.decision.status,v3Reason:silence.decision.reason,
  elapsedMs:null});
const rhythmic=cases.filter(c=>Number.isFinite(c.referenceBpm));
const correct=(bpm,reference,tol=1)=>Number.isFinite(bpm)&&Math.abs(bpm-reference)<=tol;
const summaries=Object.fromEntries([['V1','v1Bpm'],['V2','v2Bpm'],['V3','v3Bpm']].map(([engine,key])=>{
 const proposed=rhythmic.filter(c=>Number.isFinite(c[key]));
 const good=proposed.filter(c=>correct(c[key],c.referenceBpm)).length;
 const octave=proposed.filter(c=>!correct(c[key],c.referenceBpm)&&(
  Math.abs(c[key]-2*c.referenceBpm)<=2||Math.abs(2*c[key]-c.referenceBpm)<=2)).length;
 const threeTwo=proposed.filter(c=>!correct(c[key],c.referenceBpm)&&(
  Math.abs(c[key]/c.referenceBpm-1.5)<=.04||Math.abs(c.referenceBpm/c[key]-1.5)<=.04)).length;
 return [engine,{total:rhythmic.length,proposed:proposed.length,coveragePct:rate(proposed.length,rhythmic.length),
  correctWithin1Bpm:good,precisionOnProposedPct:rate(good,proposed.length),
  correctOnAllPct:rate(good,rhythmic.length),octaveErrors:octave,threeToTwoErrors:threeTwo}];
}));
const report={kind:'synthetic-development-only',createdAt:new Date().toISOString(),
 label:'Generated waveforms, NOT artist recordings or independent ground truth',
 patternFamilies:patterns,tempos,rules:'Frozen in src/bpm-decision.mjs; do not tune on holdout',
 summaries,cases};
const output=resolve('.private/benchmarks/v3-development');
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));
console.log('V3_DEVELOPMENT_SYNTHETIC',JSON.stringify({summaries,silentCase:silence.decision.status,
 reportPath:'.private/benchmarks/v3-development/report.json'}));
console.log('V3_DEVELOPMENT_CASES',JSON.stringify(cases.map(({id,referenceBpm,v1Bpm,v2Bpm,v2RequiresReview,v2SelectedFromHarmonic,v2HarmonicFactor,metricalRelation,windowBpm,v3Bpm,v3Status,v3Reason})=>({id,referenceBpm,v1Bpm,v2Bpm,v2RequiresReview,v2SelectedFromHarmonic,v2HarmonicFactor,metricalRelation,windowBpm,v3Bpm,v3Status,v3Reason}))));
