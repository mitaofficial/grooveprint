/**
 * GROOVEPRINT Tempo Experiment v2 — benchmark-only candidate, NOT production.
 * Independent-channel low-band onsets, 200 Hz envelope, sub-frame lag refinement.
 * Never marks audio as VERIFIED or emits fabricated probability/confidence.
 */
export function estimateLocalTempo(buffer,{minTempo=55,maxTempo=210,maxSeconds=180}={}){
 const sr=Number(buffer?.sampleRate),duration=Number(buffer?.duration);
 if(!Number.isFinite(sr)||sr<8000||!Number.isFinite(duration)||duration<8)
  return {status:'unavailable',bpm:null,reason:'invalid-or-short-audio'};
 const channels=Math.max(1,Math.min(2,buffer.numberOfChannels||1));
 const arrays=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));
 const length=Math.min(Math.floor(sr*maxSeconds),...arrays.map(a=>a.length));
 const frame=Math.max(1,Math.round(sr/200)),N=Math.floor(length/frame);
 if(N<1200)return {status:'unavailable',bpm:null,reason:'too-few-analysis-frames'};
 const low=new Float32Array(N),full=new Float32Array(N);
 const lp=new Float64Array(channels),alpha=1-Math.exp(-2*Math.PI*160/sr);
 let prevLow=0,prevFull=0,smoothedLow=0,smoothedFull=0;
 const smoothFactor=1-Math.exp(-frame/(sr*.022)); // reduce carrier-frequency envelope ripple
 for(let k=0;k<N;k++){
  let lowEnergy=0,wideEnergy=0;
  for(let j=k*frame;j<(k+1)*frame;j+=2){
   let le=0,we=0;
   for(let c=0;c<channels;c++){
    const x=arrays[c][j]||0;lp[c]+=alpha*(x-lp[c]);
    le+=lp[c]*lp[c];we+=x*x;
   }
   lowEnergy+=le/channels;
   wideEnergy+=we/channels;
  }
  const n=Math.ceil(frame/2),l=Math.sqrt(lowEnergy/n),f=Math.sqrt(wideEnergy/n);
  smoothedLow+=smoothFactor*(l-smoothedLow);
  smoothedFull+=smoothFactor*(f-smoothedFull);
  low[k]=Math.max(0,smoothedLow-prevLow);
  full[k]=Math.max(0,smoothedFull-prevFull);
  prevLow=smoothedLow;prevFull=smoothedFull;
 }
 function whiten(x){
  let mean=0,ss=0;
  for(const v of x)mean+=v;
  mean/=x.length;
  for(let i=0;i<x.length;i++){
   x[i]=Math.max(0,x[i]-mean*.58);
   ss+=x[i]*x[i];
  }
  const rms=Math.sqrt(ss/Math.max(1,x.length));
  if(rms>1e-10)for(let i=0;i<x.length;i++)x[i]/=rms;
  return rms;
 }
 const lowStrength=whiten(low),fullStrength=whiten(full);
 if(Math.max(lowStrength,fullStrength)<1e-5)return {status:'unavailable',bpm:null,reason:'no-rhythmic-onsets'};
 const hz=sr/frame;
 const lo=Math.max(2,Math.ceil(60*hz/maxTempo)),hi=Math.min(N-5,Math.floor(60*hz/minTempo));
 const weightLow=lowStrength>1e-5?.76:0, weightFull=1-weightLow;
 const scores=new Float64Array(hi+1);
 function corr(x,lag){
  let dot=0,aa=0,bb=0;
  for(let i=lag;i<N;i++){
   const a=x[i],b=x[i-lag];
   dot+=a*b;aa+=a*a;bb+=b*b;
  }
  return dot/(Math.sqrt(aa*bb)+1e-12);
 }
 for(let lag=lo;lag<=hi;lag++){
  scores[lag]=weightLow*corr(low,lag)+weightFull*corr(full,lag);
 }
 function refined(lag){
  if(lag<=lo||lag>=hi)return lag;
  const a=scores[lag-1],b=scores[lag],c=scores[lag+1];
  const den=a-2*b+c;
  if(!Number.isFinite(den)||Math.abs(den)<1e-8)return lag;
  return lag+Math.max(-.5,Math.min(.5,.5*(a-c)/den));
 }
 const peaks=[];
 for(let lag=lo;lag<=hi;lag++){
  if(lag>lo&&scores[lag]<scores[lag-1])continue;
  if(lag<hi&&scores[lag]<scores[lag+1])continue;
  const tempo=60*hz/refined(lag);
  const score=scores[lag];
  // Weak tie preference for a higher pulse rate; a 70 BPM kick will still win
  // when its 140 BPM candidate is not independently supported by bass onsets.
  peaks.push({lag,score,rank:score*Math.pow(tempo/120,.05),tempo});
 }
 peaks.sort((a,b)=>b.rank-a.rank);
 const top=peaks[0];
 if(!top||top.score<.11)return {status:'unavailable',bpm:null,reason:'no-stable-beat'};
 const distinct=[];
 for(const p of peaks){
  if(distinct.every(q=>Math.abs(q.tempo-p.tempo)>2))distinct.push(p);
  if(distinct.length>=8)break;
 }
 const bpm=Number(top.tempo.toFixed(2));
 const alternatives=distinct.map(p=>({bpm:Number(p.tempo.toFixed(2)),relative:Number(p.score.toFixed(3))}));
 const related=peaks.filter(p=>p.lag!==top.lag &&
  (Math.abs(p.tempo/top.tempo-2)<.045||Math.abs(p.tempo/top.tempo-.5)<.035));
 const octaveCompetition=related.some(p=>p.score>=top.score*.81);
 // Sparse kick / backbeat signals may have a stronger half-tempo maximum
 // despite an entirely plausible double-tempo alternative. Do not auto-accept
 // this case merely because the two scores are not within an arbitrary 81%.
 // A strong candidate at twice the selected tempo is common when a sparse
 // kick is incorrectly interpreted as the fundamental pulse. Require review
 // when it carries at least a quarter of the normalized autocorrelation.
 // Apply a stricter threshold to a half-tempo alternative to avoid flagging
 // every stable four-on-the-floor pattern. These are experimental, not calibrated.
 const octaveTopAlternatives=distinct.slice(1,3).some(p=>{
  const ratio=p.tempo/top.tempo;
  if(Math.abs(ratio-2)<.045)return p.score>=top.score*.25;
  if(Math.abs(ratio-.5)<.035)return p.score>=top.score*.65;
  return false;
 });
 const closeCompetition=distinct.slice(1,4).some(p=>
  Math.abs(p.tempo/top.tempo-1)>.06&&p.score>=top.score*.96);
 const ambiguous=octaveCompetition||octaveTopAlternatives||closeCompetition;
 return {status:'estimated',bpm,source:'local-dsp',confidence:null,
  bpmCandidates:alternatives,requiresReview:ambiguous,
  reason:(octaveCompetition||octaveTopAlternatives)?'octave-tempo-ambiguity':closeCompetition?'competing-tempo-peaks':'experimental-onset-acf-v2',
  audioAnalyzed:true,analysisSeconds:Number((N/hz).toFixed(1)),algorithm:'grooveprint-onset-acf-v2-experimental'};
}
