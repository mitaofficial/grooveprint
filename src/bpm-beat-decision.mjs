/** Decisions from inferred musical beat timestamps, never catalog labels. */
export const NEURAL_BEAT_POLICY=Object.freeze({minSeconds:24,windowSeconds:12,minWindowSeconds:8,
 minObservedBeats:12,minObservedFraction:.85,minSpanFraction:.65,maxPhaseP90Seconds:.07,
 maxWindowSpreadBpm:1,minBpm:40,maxBpm:300});
const median=a=>{const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length?(b.length%2?b[m]:(b[m-1]+b[m])/2):null};
const round=(n,d=4)=>Number(n.toFixed(d));
function percentile(a,p){const b=a.slice().sort((x,y)=>x-y);return b[Math.floor((b.length-1)*p)]}
export function fitBeatTimes(beats,startSeconds,endSeconds){
 const events=beats.filter(t=>t>=startSeconds&&t<endSeconds),span=endSeconds-startSeconds;
 const base={startSeconds,endSeconds,observedBeats:events.length,strong:false};
 if(events.length<4)return {...base,reason:'too-few-musical-beats'};
 const deltas=events.slice(1).map((v,i)=>v-events[i]),seed=median(deltas),indices=[0];
 if(!(seed>0))return {...base,reason:'invalid-beat-intervals'};
 for(const delta of deltas)indices.push(indices.at(-1)+Math.max(1,Math.round(delta/seed)));
 const xm=indices.reduce((a,b)=>a+b,0)/indices.length,ym=events.reduce((a,b)=>a+b,0)/events.length;
 let cov=0,variance=0;
 for(let i=0;i<events.length;i++){cov+=(indices[i]-xm)*(events[i]-ym);variance+=(indices[i]-xm)**2}
 const period=cov/variance,phase=ym-period*xm,bpm=60/period;
 const errors=events.map((t,i)=>Math.abs(t-phase-period*indices[i]));
 const expected=indices.at(-1)+1,fraction=events.length/expected,spanFraction=(events.at(-1)-events[0])/span;
 const phase90=percentile(errors,.9);
 const strong=events.length>=NEURAL_BEAT_POLICY.minObservedBeats&&fraction>=NEURAL_BEAT_POLICY.minObservedFraction&&
  spanFraction>=NEURAL_BEAT_POLICY.minSpanFraction&&phase90<=NEURAL_BEAT_POLICY.maxPhaseP90Seconds&&
  bpm>=NEURAL_BEAT_POLICY.minBpm&&bpm<=NEURAL_BEAT_POLICY.maxBpm;
 return {...base,bpm:round(bpm,3),periodSeconds:round(period,6),phaseSeconds:round(phase),
  expectedBeats:expected,observedFraction:round(fraction),spanFraction:round(spanFraction),
  phaseP90Seconds:round(phase90),strong,reason:strong?'coherent-musical-beats':'weak-or-variable-musical-beats'};
}
export function musicalAnalysisWindows(duration){
 const length=Math.min(NEURAL_BEAT_POLICY.windowSeconds,duration/2);
 const starts=length>=NEURAL_BEAT_POLICY.minWindowSeconds?[0,duration-length]:[0];
 if(duration>=72)starts.splice(1,0,(duration-length)/2);
 return starts.map(start=>({startSeconds:start,endSeconds:starts.length===1?Math.min(12,duration):start+length}));
}
export function decideBeatTimes(beats,{duration}={}){
 if(!Array.isArray(beats)||beats.length>4000||beats.some((t,i)=>!Number.isFinite(t)||t<0||t>180||i>0&&t<=beats[i-1]))throw Error('Invalid beat timestamps');
 if(!(duration>=8&&duration<=180))throw Error('Invalid analysis duration');
 const windows=musicalAnalysisWindows(duration).map(w=>fitBeatTimes(beats,w.startSeconds,w.endSeconds));
 const strong=windows.filter(w=>w.strong),values=strong.map(w=>w.bpm);
 const stable=values.length>=2&&Math.max(...values)-Math.min(...values)<=NEURAL_BEAT_POLICY.maxWindowSpreadBpm;
 const center=values.length?median(values):null;
 const weakConflict=values.length>=2&&windows.some(w=>!w.strong&&w.observedBeats>=12&&Number.isFinite(w.bpm)&&Math.abs(w.bpm-center)>3);
 const usable=duration>=NEURAL_BEAT_POLICY.minSeconds&&stable&&!weakConflict;
 const bpm=usable?round(median(values),2):null;
 let relation=null;
 if(values.length>=2&&!stable){const ratio=Math.max(...values)/Math.min(...values);
  relation=Math.abs(ratio-2)/2<.025?'half-double':Math.abs(ratio-1.5)/1.5<.025?'three-to-two':Math.abs(ratio-3)/3<.025?'triple':null;
 }
 const reason=usable?'stable-musical-beats':weakConflict?'tempo-varies-or-tracking-error':values.length>=2&&!stable?(relation?'metrical-conflict':'tempo-varies'):
  beats.length?'insufficient-musical-beat-support':'no-musical-beats';
 const alternatives=[];
 for(const v of windows.map(w=>w.bpm).filter(Number.isFinite))if(alternatives.every(a=>Math.abs(a.bpm-v)>1))alternatives.push({bpm:v});
 return {version:'grooveprint-musical-beat-decision-v1',status:usable?'supported':values.length>=2||weakConflict?'ambiguous':'undetermined',suggestedBpm:bpm,
  requiresReview:!usable,reason,metricalRelation:relation,alternatives:usable?[]:alternatives.slice(0,2),
  validation:'independent-diagnostic-pilot-only',windows};
}
