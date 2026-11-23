/**
 * GROOVEPRINT experimental local-tempo detector (original implementation).
 * Does not upload PCM. Emits a candidate, never audio VERIFIED.
 * Conservative about ambiguous metrical multiples.
 */
export function estimateLocalTempo(buffer,{minTempo=55,maxTempo=210,maxSeconds=180}={}){
 const sampleRate=Number(buffer?.sampleRate),duration=Number(buffer?.duration);
 if(!Number.isFinite(sampleRate)||sampleRate<=0||!Number.isFinite(duration)||duration<8) return {status:'unavailable',bpm:null,reason:'audio-too-short'};
 const channels=Math.max(1,Math.min(2,buffer.numberOfChannels||1));
 const arrays=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
 const count=Math.min(Math.floor(sampleRate*maxSeconds),arrays[0]?.length||0);
 const frame=Math.max(1,Math.round(sampleRate/100)); // 100 Hz RMS/onset envelope
 const N=Math.floor(count/frame);
 if(N<800)return {status:'unavailable',bpm:null,reason:'audio-too-short'};
 const onset=new Float32Array(N);let prior=0;
 for(let k=0;k<N;k++){
  let energy=0,derivative=0;
  for(let j=k*frame+1;j<(k+1)*frame&&j<count;j+=2){
   let v=0,p=0;for(let ch=0;ch<channels;ch++){v+=arrays[ch][j]||0;p+=arrays[ch][j-1]||0}
   v/=channels;p/=channels;
   energy+=v*v;const d=v-p;derivative+=d*d;
  }
  const loud=Math.sqrt(energy/Math.max(1,frame/2));
  const bright=Math.sqrt(derivative/Math.max(1,frame/2));
  // Suppress sustained sounds and privilege newly appearing transients.
  const novelty=Math.max(0,loud-prior*0.92)+Math.max(0,bright*0.32);
  onset[k]=novelty;prior=loud;
 }
 let mean=0;for(let i=0;i<N;i++)mean+=onset[i];mean/=N;
 let variance=0;for(let i=0;i<N;i++){onset[i]=Math.max(0,onset[i]-mean*0.8);variance+=onset[i]*onset[i]}
 if(variance<1e-7)return {status:'unavailable',bpm:null,reason:'no-rhythmic-onsets'};
 const hz=sampleRate/frame;
 const lowLag=Math.max(2,Math.ceil(60*hz/maxTempo)), highLag=Math.min(N-3,Math.floor(60*hz/minTempo));
 const scores=[];
 for(let lag=lowLag;lag<=highLag;lag++){
  let sum=0,aa=0,bb=0;
  for(let i=lag;i<N;i++){
   const x=onset[i],y=onset[i-lag];
   sum+=x*y;aa+=x*x;bb+=y*y;
  }
  const similarity=sum/(Math.sqrt(aa*bb)+1e-12);
  scores.push({lag,score:similarity,tempo:60*hz/lag});
 }
 scores.sort((a,b)=>b.score-a.score);
 const shortlist=[];
 for(const c of scores){
  if(shortlist.every(x=>Math.abs(x.tempo-c.tempo)>2.5))shortlist.push(c);
  if(shortlist.length===6)break;
 }
 const top=shortlist[0];
 if(!top||top.score<0.10)return {status:'unavailable',bpm:null,reason:'no-stable-beat'};
 // Metrical ambiguity exists when a half/double candidate is similarly strong.
 const related=shortlist.filter(c=>Math.abs(c.tempo/top.tempo-0.5)<0.035||Math.abs(c.tempo/top.tempo-2)<0.07);
 const ambiguous=related.some(c=>c.score>top.score*.78);
 const candidates=shortlist.map(c=>({bpm:Math.round(c.tempo*100)/100,relative:Math.round(c.score*1000)/1000}));
 return {status:'estimated',bpm:Math.round(top.tempo*100)/100,source:'local-dsp',
  bpmCandidates:candidates,confidence:null,requiresReview:ambiguous,
  reason:ambiguous?'half-double-tempo-ambiguity':'experimental-local-tempo',
  audioAnalyzed:true,analysisSeconds:Math.round(N/hz*10)/10,
  algorithm:'grooveprint-onset-acf-v1'};
}
