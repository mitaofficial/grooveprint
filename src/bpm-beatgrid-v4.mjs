/**
 * Research-only V4 beat-grid experiment.
 * Extracts real onset events and searches for a phase-coherent sequence of beats
 * using dynamic programming. Tempo induction remains V1/V2-based, so this is
 * NOT independent evidence of correctness, a calibrated probability or a
 * deployable production detector. No metadata, genre or catalog BPM is read.
 *
 * Research design: for each candidate pulse, search event-to-event intervals
 * of 1..4 beats; penalize skipped beats, phase drift and weak onsets. Retain
 * only a compact diagnostic set of beat timestamps. Do not auto-accept BPM.
 */
import {estimateLocalTempo as v1Tempo} from './bpm-tempo.mjs';
import {estimateLocalTempo as v2Tempo} from './bpm-tempo-experiment.mjs';
export const BEATGRID_VERSION='grooveprint-beatgrid-v4-research-1';
export const BEATGRID_PARAMETERS=Object.freeze({
 envelopeHz:100,minTempo:55,maxTempo:210,minDuration:8,
 maxSeconds:180,minGridBeats:10,maxSkippedBeats:3,
 maxJitterFraction:.15,skipPenalty:.42
});
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const finiteBpm=x=>Number.isFinite(x)&&x>=BEATGRID_PARAMETERS.minTempo&&x<=BEATGRID_PARAMETERS.maxTempo;
const round=x=>Math.round(x*100)/100;
function percentile(values,q){
 if(!values.length)return 0;
 const ordered=Array.from(values).sort((a,b)=>a-b);
 return ordered[Math.min(ordered.length-1,Math.floor(q*(ordered.length-1)))];
}
function audioInfo(buffer,maxSeconds){
 const sr=Number(buffer?.sampleRate),duration=Number(buffer?.duration),nch=Number(buffer?.numberOfChannels);
 if(!Number.isFinite(sr)||sr<8000||sr>192000||!Number.isFinite(duration)||duration<8||!Number.isInteger(nch)||nch<1)return null;
 const arrays=Array.from({length:Math.min(2,nch)},(_,i)=>buffer.getChannelData(i));
 if(arrays.some(a=>!a||typeof a.length!=='number'))return null;
 const samples=Math.min(...arrays.map(a=>a.length),Math.floor(Math.min(duration,maxSeconds)*sr));
 if(samples/sr<8)return null;
 return {sr,arrays,samples,duration:samples/sr};
}
export function extractBeatEvents(buffer,{maxSeconds=BEATGRID_PARAMETERS.maxSeconds}={}){
 const info=audioInfo(buffer,maxSeconds);
 if(!info)return {status:'unavailable',reason:'invalid-or-short-audio',events:[]};
 const {sr,arrays,samples,duration}=info,frame=Math.max(1,Math.round(sr/100)),hz=sr/frame,N=Math.floor(samples/frame);
 const lowFilter=new Float64Array(arrays.length),alpha=1-Math.exp(-2*Math.PI*175/sr);
 const low=new Float32Array(N),full=new Float32Array(N);
 let lastLow=0,lastFull=0,totalLevel=0,totalFlux=0,prevLow=0,prevFull=0;
 const smooth=1-Math.exp(-frame/(sr*.025));
 for(let k=0;k<N;k++){
  let bass=0,wide=0;
  for(let j=k*frame;j<(k+1)*frame;j+=2){
   for(let ch=0;ch<arrays.length;ch++){
    const x=arrays[ch][j]||0;
    lowFilter[ch]+=alpha*(x-lowFilter[ch]);
    bass+=lowFilter[ch]*lowFilter[ch];wide+=x*x;
   }
  }
  const divisor=Math.ceil(frame/2)*arrays.length;
  const b=Math.sqrt(bass/Math.max(1,divisor)),w=Math.sqrt(wide/Math.max(1,divisor));
  lastLow+=smooth*(b-lastLow);lastFull+=smooth*(w-lastFull);
  low[k]=Math.max(0,lastLow-prevLow);full[k]=Math.max(0,lastFull-prevFull);
  prevLow=lastLow;prevFull=lastFull;totalLevel+=lastFull;totalFlux+=full[k];
 }
 if(totalFlux/(totalLevel+1e-9)<.015)return {status:'unavailable',reason:'insufficient-transient-contrast',events:[],duration,hz};
 // Analyze relative attack strength rather than absolute loudness; an initial
 // transient should not dominate an entire track's phase score.
 // Sparse kicks occupy far fewer than 5% of frames. A P95 normalizer was
 // literally zero on sparse genuine rhythms; use P99 and absolute guards.
 const qLow=percentile(low,.99),qFull=percentile(full,.99);
 if(qLow<1e-7&&qFull<1e-7)return {status:'unavailable',reason:'no-onsets',events:[],duration,hz};
 const activation=new Float32Array(N);
 for(let i=0;i<N;i++)activation[i]=
  .55*clamp(low[i]/Math.max(1e-8,qLow),0,2)+.45*clamp(full[i]/Math.max(1e-8,qFull),0,2);
 const threshold=Math.max(.18,percentile(activation,.68));
 const events=[];
 // Non-maximum suppression over +- 2 frames keeps flam-like adjacent peaks
 // from contributing spurious distinct beats.
 for(let i=2;i<N-2;i++){
  const a=activation[i];
  if(a<threshold||a<activation[i-1]||a<activation[i-2]||a<=activation[i+1]||a<=activation[i+2])continue;
  const time=i/hz,weight=clamp(a,0,1.6),bass=clamp(low[i]/Math.max(1e-8,qLow),0,2),wide=clamp(full[i]/Math.max(1e-8,qFull),0,2);
  if(events.length&&time-events[events.length-1].time<.05){
   if(weight>events[events.length-1].weight)events[events.length-1]={time,weight,bass,wide};
  }else events.push({time,weight,bass,wide});
 }
 if(events.length<BEATGRID_PARAMETERS.minGridBeats)return {status:'unavailable',reason:'too-few-onsets',events,duration,hz};
 return {status:'ready',reason:'onset-events',events,duration,hz,onsetContrast:round(totalFlux/(totalLevel+1e-9))};
}
function lowerBound(arr,value){
 let l=0,r=arr.length;
 while(l<r){const m=(l+r)>>>1;if(arr[m]<value)l=m+1;else r=m}
 return l;
}
export function trackPulse(events,bpm,{duration=null}={}){
 if(!finiteBpm(bpm)||!Array.isArray(events)||events.length<10)return null;
 const period=60/bpm,times=events.map(e=>e.time),N=events.length;
 const best=new Float64Array(N),previous=new Int32Array(N),counts=new Uint16Array(N),skips=new Uint16Array(N),jitter=new Float64Array(N);
 previous.fill(-1);
 let strongest=-Infinity,top=-1;
 for(let i=0;i<N;i++){
  const event=events[i];best[i]=Math.min(1.6,Math.max(0,event.weight));
  counts[i]=1;
  for(let step=1;step<=BEATGRID_PARAMETERS.maxSkippedBeats+1;step++){
   const expected=event.time-period*step,tolerance=period*BEATGRID_PARAMETERS.maxJitterFraction;
   const from=lowerBound(times,expected-tolerance),to=lowerBound(times,expected+tolerance);
   for(let j=from;j<to&&j<i;j++){
    const error=Math.abs((event.time-times[j])-period*step)/period;
    const gain=best[j]+event.weight-1.7*error- BEATGRID_PARAMETERS.skipPenalty*(step-1);
    const nextCount=Math.min(65535,counts[j]+1);
    if(gain>best[i]&&nextCount>counts[i]){
     best[i]=gain;previous[i]=j;counts[i]=nextCount;
     skips[i]=skips[j]+step-1;jitter[i]=jitter[j]+error;
    }
   }
  }
  if(counts[i]>=BEATGRID_PARAMETERS.minGridBeats&&best[i]>strongest){
   strongest=best[i];top=i;
  }
 }
 if(top<0)return null;
 const path=[];for(let j=top;j>=0&&path.length<10000;j=previous[j]){path.push(events[j]);if(previous[j]<0)break}
 path.reverse();
 if(path.length<BEATGRID_PARAMETERS.minGridBeats)return null;
 const observed=path.length,missing=skips[top];
 const occupied=observed/(observed+missing);
 const span=path[path.length-1].time-path[0].time;
 const domain=Number.isFinite(duration)?duration:Math.max(span,events[events.length-1].time-events[0].time);
 const spanFraction=clamp(span/Math.max(1,domain),0,1);
 const phaseJitter=jitter[top]/Math.max(1,observed-1);
 // These are explicitly uncalibrated engineering diagnostics.
 const meanStrength=path.reduce((sum,x)=>sum+x.weight,0)/observed;
 const base=occupied*spanFraction*Math.min(1,meanStrength)*Math.exp(-4*phaseJitter);
 // Evaluate whether the proposed beat grid actually explains bass onsets,
 // including events the DP path did not choose. A 70 BPM sequence can be
 // mathematically stable while ignoring half of the 140 BPM kicks; a 3:2
 // spurious grid may align with subdivided hats but miss real bass accents.
 const bassEvents=events.filter(e=>Number.isFinite(e.bass)&&e.bass>.08);
 const totalBass=bassEvents.reduce((s,e)=>s+e.bass,0);
 const gridOrigin=path[0].time;
 const bassAligned=bassEvents.reduce((s,e)=>{
  const k=Math.round((e.time-gridOrigin)/period);
  const phaseError=Math.abs(e.time-gridOrigin-k*period)/period;
  return s+(phaseError<=.12?e.bass:0);
 },0);
 const bassAlignment=totalBass>.01?bassAligned/totalBass:null;
 // In sparse hardgroove, kicks may recur every TWO beats while backbeat
 // transients mark the missing beat. A half-tempo grid explains the kicks
 // yet leaves many broadband accents stranded between its pulse positions.
 // Compare the *entire onset stream*, not merely the DP-selected events.
 const wideEvents=events.filter(e=>Number.isFinite(e.wide)&&e.wide>.08);
 const totalWide=wideEvents.reduce((s,e)=>s+e.wide,0);
 const wideAligned=wideEvents.reduce((s,e)=>{
  const k=Math.round((e.time-gridOrigin)/period);
  const phaseError=Math.abs(e.time-gridOrigin-k*period)/period;
  return s+(phaseError<=.12?e.wide:0);
 },0);
 const wideAlignment=totalWide>.01?wideAligned/totalWide:null;
 const bassFactor=bassAlignment===null?1:bassAlignment;
 const wideFactor=wideAlignment===null?1:wideAlignment;
 // Diagnostic ranking, not a trained score or calibrated confidence.
 const score=base*(.15+.25*bassFactor+.6*wideFactor);
 return {bpm:round(bpm),score:round(score),baseScore:round(base),
  bassAlignment:bassAlignment===null?null:round(bassAlignment),
  wideAlignment:wideAlignment===null?null:round(wideAlignment),
  observedBeats:observed,missingBeats:missing,
  beatOccupancy:round(occupied),phaseJitter:round(phaseJitter),spanSeconds:round(span),
  spanFraction:round(spanFraction),meanStrength:round(meanStrength),
  beatTimes: path.slice(0,16).map(x=>round(x.time)),diagnosticOnly:true};
}
function hypothesesFrom(v1,v2){
 const values=[];
 const add=value=>{
  if(!finiteBpm(value)||values.some(x=>Math.abs(x-value)<1.1))return;
  values.push(value);
 };
 for(const r of [v2,v1]){
  if(finiteBpm(r?.bpm))add(r.bpm);
  for(const c of (r?.bpmCandidates||[]).slice(0,6))add(c.bpm);
 }
 const seeds=values.slice(0,9);
 for(const bpm of seeds){add(bpm*2);add(bpm/2)}
 return values.slice(0,20);
}
export function evaluateBeatGridOnsets(buffer,{hypotheses=null,maxSeconds=180}={}){
 const extracted=extractBeatEvents(buffer,{maxSeconds});
 if(extracted.status!=='ready')return {version:BEATGRID_VERSION,status:'undetermined',suggestedBpm:null,
  reason:extracted.reason,candidateGrids:[],requiresReview:true,algorithm:'onset-event-dp'};
 const v1=hypotheses?null:v1Tempo(buffer,{maxSeconds}),v2=hypotheses?null:v2Tempo(buffer,{maxSeconds});
 const tempos=Array.isArray(hypotheses)?hypotheses:hypothesesFrom(v1,v2);
 const grids=tempos.map(bpm=>trackPulse(extracted.events,bpm,{duration:extracted.duration}))
  .filter(Boolean).sort((a,b)=>b.score-a.score);
 const first=grids[0],runner=grids.find(g=>first&&
  Math.abs((g.bpm||0)-(first.bpm||0))>Math.max(2,first.bpm*.025));
 if(!first||first.beatOccupancy<.45||first.spanFraction<.3||first.score<.12){
  return {version:BEATGRID_VERSION,status:'undetermined',suggestedBpm:null,
   reason:'no-coherent-beatgrid',candidateGrids:grids.slice(0,4),
   requiresReview:true,algorithm:'onset-event-dp'};
 }
 const tie=Boolean(runner&&runner.score>first.score*.88);
 // Beat-path evidence alone is not ground truth and half/double ties are
 // common. This experiment never produces a "supported" label or BPM verified.
 return {version:BEATGRID_VERSION,status:tie?'ambiguous':'provisional',
  suggestedBpm:tie?null:first.bpm,requiresReview:true,
  reason:tie?'competing-coherent-grids':'single-coherent-grid-unvalidated',
  candidateGrids:grids.slice(0,4),runnerUpBpm:runner?.bpm??null,
  firstGridScore:first.score,algorithm:'onset-event-dp',
  metrics:{beatOccupancy:first.beatOccupancy,phaseJitter:first.phaseJitter,
   spanFraction:first.spanFraction,observedBeats:first.observedBeats},
  note:'No independent full-track accuracy validation'};
}
