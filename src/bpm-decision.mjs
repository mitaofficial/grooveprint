/**
 * V3 experimental *decision* layer, not an auto-acceptance engine.
 * All evidence comes from signal-derived V1/V2 outputs and independent PCM
 * windows, never release metadata, expected genres or catalog BPM.
 * "supported" is an uncalibrated cross-check label, NOT a probability or
 * permission to print/verify BPM. No commercial accuracy is claimed.
 */
export const DECISION_VERSION='grooveprint-tempo-decision-v3-experimental';
export const DECISION_RULES=Object.freeze({
 agreementAbsoluteBpm:1.5,
 agreementRelative:0.015,
 segmentAbsoluteBpm:2,
 segmentRelative:0.02,
 minConsistentSegments:2,
 minSegments:2
});
const valid=b=>Number.isFinite(b)&&b>=40&&b<=300;
const near=(a,b,absolute=1.5,relative=.015)=>valid(a)&&valid(b)&&Math.abs(a-b)<=Math.max(absolute,Math.min(a,b)*relative);
const rounded=x=>Math.round(x*100)/100;
const topBpm=x=>x?.status==='estimated'&&valid(x.bpm)?x.bpm:null;
export function metricalRelation(a,b){
 if(!valid(a)||!valid(b))return 'unavailable';
 if(near(a,b))return 'same-pulse';
 const hi=Math.max(a,b),lo=Math.min(a,b),ratio=hi/lo;
 if(Math.abs(ratio-2)<=.035)return 'half-double';
 if(Math.abs(ratio-1.5)<=.035)return 'three-to-two';
 if(Math.abs(ratio-3)<=.045)return 'triple-pulse';
 return 'different-pulses';
}
function med(values){
 const s=values.slice().sort((a,b)=>a-b),m=Math.floor(s.length/2);
 return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function alternatives(sources,segments){
 const values=[];
 for(const entry of sources){
  if(valid(entry.bpm)&&!values.some(v=>near(v.bpm,entry.bpm,1.5,.015)))
   values.push({bpm:rounded(entry.bpm),source:entry.source});
 }
 // Window evidence is diagnostic: do not turn noisy ACF peaks into ten options.
 if(values.length<2)for(const entry of segments){
  if(valid(entry.bpm)&&!values.some(v=>near(v.bpm,entry.bpm,1.5,.015)))
   values.push({bpm:rounded(entry.bpm),source:'temporal-window'});
  if(values.length>=2)break;
 }
 return values.slice(0,2);
}
export function decideTempo({v1,v2,windows=[]}={}){
 const a=topBpm(v1),b=topBpm(v2);
 const source=[{source:'V1',bpm:a},{source:'V2',bpm:b}];
 const temporal=Array.isArray(windows)?windows.slice(0,5).map(w=>({
  bpm:topBpm(w),startSeconds:Number.isFinite(w?.startSeconds)?w.startSeconds:null,
  endSeconds:Number.isFinite(w?.endSeconds)?w.endSeconds:null,
  reason:String(w?.reason||'').slice(0,64)
 })):[];
 const available=temporal.filter(w=>valid(w.bpm));
 const relation=metricalRelation(a,b);
 const evidence={v1Bpm:a,v2Bpm:b,metricalRelation:relation,
  windowsPlanned:temporal.length,windowsAnalyzed:available.length,
  windows:temporal.map(w=>({...w,bpm:valid(w.bpm)?rounded(w.bpm):null})),
  crossEngineAgreement:relation==='same-pulse',
  // Correlation peaks and these agreement counts are NOT calibrated probabilities.
  scoreIsProbability:false};
 if(!valid(a)&&!valid(b))return {version:DECISION_VERSION,status:'undetermined',suggestedBpm:null,
  requiresReview:true,confidenceStatus:'insufficient',reason:'no-valid-tempo',
  evidence,alternatives:[]};
 if(!valid(a)||!valid(b))return {version:DECISION_VERSION,status:'ambiguous',suggestedBpm:null,
  requiresReview:true,confidenceStatus:'insufficient',reason:'only-one-engine-available',
  evidence,alternatives:alternatives(source,available)};
 if(relation!=='same-pulse')return {version:DECISION_VERSION,status:'ambiguous',suggestedBpm:null,
  requiresReview:true,confidenceStatus:'conflicting',reason:'discordant-'+relation,
  evidence,alternatives:alternatives(source,available)};
 const anchors=[a,b];
 const center=med(anchors);
 const consistent=available.filter(w=>near(w.bpm,center,
  DECISION_RULES.segmentAbsoluteBpm,DECISION_RULES.segmentRelative));
 evidence.windowsConsistent=consistent.length;
 evidence.windowsConflicting=available.length-consistent.length;
 if(temporal.length<DECISION_RULES.minSegments||consistent.length<DECISION_RULES.minConsistentSegments||
    available.length!==temporal.length||consistent.length!==available.length){
  return {version:DECISION_VERSION,status:'ambiguous',suggestedBpm:null,
   requiresReview:true,confidenceStatus:'insufficient',reason:'temporal-consistency-not-established',
   evidence,alternatives:alternatives(source,available)};
 }
 // A single representative, not a fabricated 100.00% accurate BPM.
 // Median reduces bias from a window with a slightly different ACF lag.
 const bpm=rounded(med([...anchors,...consistent.map(w=>w.bpm)]));
 return {version:DECISION_VERSION,status:'supported',suggestedBpm:bpm,
  requiresReview:true,confidenceStatus:'cross-checked-not-calibrated',
  reason:'two-engine-and-temporal-agreement',evidence,
  alternatives:[]};
}
