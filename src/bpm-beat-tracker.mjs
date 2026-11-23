/**
 * Development beat tracker: spectral novelty -> BeatRoot IOI induction ->
 * event-following agents -> fitted beat period -> temporal/metrical decision.
 * No catalog BPM, track name or genre enters this function. Scores are not
 * probabilities. A small pilot cannot certify production music accuracy.
 */
import FFT from './vendor/music-tempo/FFT.mjs';
import OnsetDetection from './vendor/music-tempo/OnsetDetection.mjs';
import TempoInduction from './vendor/music-tempo/TempoInduction.mjs';
import BeatTracking from './vendor/music-tempo/BeatTracking.mjs';

export const BEAT_TRACKER_ALGORITHM='grooveprint-beatroot-spectral-v1';
export const BEAT_TRACKER_POLICY=Object.freeze({
 minTempo:55,maxTempo:210,minWindowSeconds:12,fastWindowSeconds:24,deepWindowSeconds:32,
 minObservedBeats:12,minObservedFraction:.70,minSpanFraction:.75,maxPhaseP90Seconds:.045,
 maxWindowSpreadBpm:1,competingScoreRatio:.75,maxInputSeconds:180
});
const round=(v,n=4)=>Number(v.toFixed(n));
const median=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length?(s.length%2?s[m]:(s[m-1]+s[m])/2):null};
const quantile=(a,p)=>{const s=a.slice().sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.floor((s.length-1)*p))]:null};
export function metricalRelation(a,b){
 if(!(a>0&&b>0))return null;
 const r=Math.max(a,b)/Math.min(a,b);
 if(Math.abs(a-b)<=1)return 'same-pulse';
 for(const [ratio,label] of [[2,'half-double'],[1.5,'three-to-two'],[3,'triple']])
  if(Math.abs(r-ratio)/ratio<=.025)return label;
 return 'unrelated';
}

// No whole-PCM conversion/concatenation. Each channel contributes magnitude
// novelty, so equal anti-phase stereo cannot cancel into silence. FFT length
// remains approximately 46ms and the timestamps use the exact hop/sampleRate.
function spectralFlux(arrays,sampleRate,first,count){
 const size=2**Math.round(Math.log2(sampleRate*.046)),hop=Math.max(1,Math.round(sampleRate*.01));
 const bins=size/2+1,window=FFT.getHammingWindow(size),frames=Math.ceil(count/hop);
 const broad=new Array(frames).fill(0),low=new Array(frames).fill(0);
 const re=new Float64Array(size),im=new Float64Array(size),previous=new Float64Array(bins);
 let energy=0;
 for(const channel of arrays){
  previous.fill(0);
  for(let f=0;f<frames;f++){
   const offset=f*hop-(size-hop);
   for(let j=0;j<size;j++){
    const index=offset+j,value=index>=0&&index<count?channel[first+index]:0;
    if(!Number.isFinite(value))throw Error('invalid-pcm-sample');
    re[j]=value*window[j];im[j]=0;
   }
   FFT.getSpectrum(re,im);
   let sum=0,bass=0;
   for(let k=0;k<bins;k++){
    const change=Math.max(0,re[k]-previous[k]);sum+=change;
    const hz=k*sampleRate/size;if(hz>=25&&hz<=250)bass+=change;
    previous[k]=re[k];
   }
   broad[f]+=sum/arrays.length;low[f]+=bass/arrays.length;energy+=sum;
  }
 }
 return {broad,low,hop,step:hop/sampleRate,offset:(hop-size/2)/sampleRate,energy};
}

function fitAgent(agent,windowSeconds){
 const events=agent.events.slice(),indices=[0];
 for(let i=1;i<events.length;i++)indices.push(indices[i-1]+Math.max(1,Math.round((events[i]-events[i-1])/agent.beatInterval)));
 if(events.length<3)return null;
 const xm=indices.reduce((a,b)=>a+b,0)/indices.length,ym=events.reduce((a,b)=>a+b,0)/events.length;
 let covariance=0,variance=0;
 for(let i=0;i<events.length;i++){covariance+=(indices[i]-xm)*(events[i]-ym);variance+=(indices[i]-xm)**2}
 const period=covariance/variance,phase=ym-period*xm,bpm=60/period;
 if(!(bpm>=BEAT_TRACKER_POLICY.minTempo&&bpm<=BEAT_TRACKER_POLICY.maxTempo))return null;
 const errors=events.map((t,i)=>Math.abs(t-phase-indices[i]*period));
 const expected=indices.at(-1)+1;
 return {bpm:round(bpm,3),score:agent.score,phaseSeconds:round(phase),periodSeconds:round(period,6),
  observedBeats:events.length,expectedBeats:expected,interpolatedBeats:expected-events.length,
  observedFraction:round(events.length/expected),spanFraction:round((events.at(-1)-events[0])/windowSeconds),
  phaseP90Seconds:round(quantile(errors,.9)),phaseMedianSeconds:round(median(errors)),
  // Onsets actually followed, not fillBeats() interpolations masquerading as evidence.
  observedBeatTimes:events.map(t=>round(t))};
}
function strongPath(path){
 return path.observedBeats>=BEAT_TRACKER_POLICY.minObservedBeats&&
  path.observedFraction>=BEAT_TRACKER_POLICY.minObservedFraction&&path.spanFraction>=BEAT_TRACKER_POLICY.minSpanFraction&&
  path.phaseP90Seconds<=BEAT_TRACKER_POLICY.maxPhaseP90Seconds;
}

function followFlux(values,flux,seconds){
 const normalized=values.slice();OnsetDetection.normalize(normalized);
 const peaks=OnsetDetection.findPeaks(normalized),events=peaks.map(i=>i*flux.step+flux.offset);
 const floor=Math.min(0,...normalized),scores=peaks.map(i=>normalized[i]-floor);
 const positive=peaks.map(i=>Math.max(0,normalized[i]));
 const scale=quantile(positive,.9)||1,weights=positive.map(v=>Math.min(1,v/scale));
 const totalMass=weights.reduce((a,b)=>a+b,0);
 if(events.length>3200)throw Error('beat-onset-budget');
 const params={minBeatInterval:60/BEAT_TRACKER_POLICY.maxTempo,maxBeatInterval:60/BEAT_TRACKER_POLICY.minTempo};
 let clusters=TempoInduction.processRhythmicEvents(events,params);
 clusters=TempoInduction.mergeClusters(clusters,params);
 Object.assign(clusters,TempoInduction.calculateScore(clusters,params));
 const tempos=TempoInduction.createTempoList(clusters,params);
 const agents=BeatTracking.trackBeat(events,scores,tempos,params).filter(a=>a.score>0).sort((a,b)=>b.score-a.score);
 const paths=[];
 for(const agent of agents){
  const fitted=fitAgent(agent,seconds);
  if(!fitted)continue;
  let j=0,mass=0;
  for(const beat of agent.events){
   while(j<events.length&&events[j]<beat-1e-7)j++;
   if(j<events.length&&Math.abs(events[j]-beat)<1e-7){mass+=weights[j];j++}
  }
  const expected=seconds/fitted.periodSeconds;
  const support=2*mass/(expected+totalMass);
  paths.push({...fitted,rawAgentScore:fitted.score,score:support,onsetMass:round(mass),totalOnsetMass:round(totalMass)});
 }
 // An agent that follows different subdivisions with accumulated phase drift
 // cannot outrank an actually coherent beat path just by accepting more hits.
 paths.sort((a,b)=>Number(strongPath(b))-Number(strongPath(a))||b.score-a.score);
 const hypotheses=[];
 for(const path of paths){
  if(hypotheses.every(h=>Math.abs(h.bpm-path.bpm)>Math.max(1,Math.min(h.bpm,path.bpm)*.025)))hypotheses.push(path);
  if(hypotheses.length===6)break;
 }
 const top=hypotheses[0];if(!top)return {status:'unavailable',reason:'no-beat-path',hypotheses:[]};
 const strong=strongPath(top);
 const competitor=hypotheses.slice(1).find(h=>strongPath(h)&&h.score>=top.score*BEAT_TRACKER_POLICY.competingScoreRatio);
 return {status:'estimated',bpm:top.bpm,strong,reason:!strong?'weak-or-drifting-beat-path':competitor?'competing-beat-paths':'coherent-beat-path',
  ...top,hypotheses:hypotheses.map(h=>({...h,relative:round(h.score/top.score)})),
  competitor:competitor?{bpm:competitor.bpm,relation:metricalRelation(top.bpm,competitor.bpm)}:null,
  onsetCount:events.length,agents:agents.length};
}

function analyzeWindow(arrays,sampleRate,start,seconds){
 const first=Math.floor(start*sampleRate),count=Math.min(arrays[0].length-first,Math.floor(seconds*sampleRate));
 const bounds={startSeconds:round(first/sampleRate),endSeconds:round((first+count)/sampleRate)};
 try{
  const flux=spectralFlux(arrays,sampleRate,first,count);
  if(flux.energy<1e-7)return {...bounds,status:'unavailable',reason:'no-rhythmic-onsets'};
  const tracked=followFlux(flux.broad,flux,count/sampleRate);
  return {...bounds,...tracked};
 }catch(error){
  const reason=['beat-agent-budget','beat-onset-budget','invalid-pcm-sample'].includes(error?.message)?error.message:'no-beat-path';
  return {...bounds,status:'unavailable',reason};
 }
}

export function analyzeBeatTempo(buffer){
 const sampleRate=Number(buffer?.sampleRate),duration=Number(buffer?.duration);
 const base={algorithm:BEAT_TRACKER_ALGORITHM,source:'local-dsp',confidence:null,audioAnalyzed:true,
  bpm:null,bpmCandidates:[],requiresReview:true,status:'unavailable',analysisSeconds:0,
  decision:{status:'undetermined',suggestedBpm:null,reason:'audio-too-short',requiresReview:true}};
 if(!Number.isFinite(sampleRate)||sampleRate<8000||!Number.isFinite(duration)||duration<8)
  return {...base,reason:'audio-too-short'};
 const seconds=Math.min(BEAT_TRACKER_POLICY.maxInputSeconds,duration),channels=Math.min(2,buffer.numberOfChannels||1);
 const arrays=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
 if(arrays.some(a=>!(a instanceof Float32Array)||a.length<Math.floor(seconds*sampleRate)))return {...base,reason:'invalid-pcm'};
 const length=Math.min(BEAT_TRACKER_POLICY.fastWindowSeconds,seconds/2);
 const windows=length>=BEAT_TRACKER_POLICY.minWindowSeconds?
  [analyzeWindow(arrays,sampleRate,0,length),analyzeWindow(arrays,sampleRate,seconds-length,length)]:
  [analyzeWindow(arrays,sampleRate,0,seconds)];
 const stable=items=>items.length>=2&&items.every(w=>w.strong&&!w.competitor)&&
  Math.max(...items.map(w=>w.bpm))-Math.min(...items.map(w=>w.bpm))<=BEAT_TRACKER_POLICY.maxWindowSpreadBpm;
 let phase='fast';
 if(!stable(windows)&&seconds>=48){
  phase='deep';const deepLength=Math.min(BEAT_TRACKER_POLICY.deepWindowSeconds,seconds);
  windows.push(analyzeWindow(arrays,sampleRate,(seconds-deepLength)/2,deepLength));
 }
 const measured=windows.filter(w=>w.status==='estimated'),strong=measured.filter(w=>w.strong);
 // Never discard a strong disagreeing section simply because the middle agrees
 // with one end. A medley/variable pulse needs review, not a majority vote.
 const usable=windows.length>=2&&strong.length>=2&&stable(strong)&&
  measured.every(w=>Math.abs(w.bpm-median(strong.map(x=>x.bpm)))<=1||!w.strong);
 const bpm=usable?round(median(strong.map(w=>w.bpm)),2):strong[0]?.bpm??measured[0]?.bpm??null;
 const different=strong.some(w=>Math.abs(w.bpm-(strong[0]?.bpm??w.bpm))>1);
 const relation=different?metricalRelation(strong[0].bpm,strong.find(w=>Math.abs(w.bpm-strong[0].bpm)>1).bpm):null;
 const reason=usable?'stable-observed-beat-paths':different?(relation==='unrelated'?'tempo-varies-or-metrical-change':'metrical-conflict'):
  measured.some(w=>w.competitor)?'competing-beat-paths':measured.length?'insufficient-coherent-beat-evidence':'no-beat-path';
 const candidates=[];
 const coherent=measured.flatMap(w=>w.hypotheses.filter(strongPath));
 for(const h of coherent.length?coherent:measured.flatMap(w=>w.hypotheses))
  if(candidates.every(c=>Math.abs(c.bpm-h.bpm)>1))candidates.push({bpm:h.bpm,relative:h.relative,algorithm:BEAT_TRACKER_ALGORITHM});
 const decision={status:usable?'supported':measured.length?'ambiguous':'undetermined',suggestedBpm:usable?bpm:null,
  reason,metricalRelation:relation,requiresReview:!usable,validation:'not-target-validated',
  alternatives:usable?[]:candidates.slice(0,2).map(c=>({bpm:c.bpm}))};
 const intervals=windows.map(w=>[w.startSeconds,w.endSeconds]).sort((a,b)=>a[0]-b[0]);
 let inspected=0,last=0;
 for(const [start,end] of intervals){inspected+=Math.max(0,end-Math.max(last,start));last=Math.max(last,end)}
 return {...base,status:measured.length?'estimated':'unavailable',bpm,bpmCandidates:candidates.slice(0,6),
  requiresReview:!usable,reason,analysisSeconds:round(inspected,2),analysisWindow:{startSeconds:0,endSeconds:round(seconds,2)},
  analysisWindows:windows.map(w=>({startSeconds:w.startSeconds,endSeconds:w.endSeconds})),decision,
  beatTracking:{phase,extentSeconds:round(seconds,2),policy:BEAT_TRACKER_POLICY,windows}};
}
