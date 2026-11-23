/** Beat This! log-mel input. Reference: beat_this/preprocessing.py (MIT).
 * Magnitude STFT / sqrt(1024), periodic Hann, reflect-centered, 441-sample hop,
 * 128 Slaney mel-frequency triangles 30..11000Hz, no area normalization,
 * log1p(1000*x). Audio is never uploaded or decoded a second time.
 */
import FFT from './vendor/music-tempo/FFT.mjs';
export const NEURAL_SAMPLE_RATE=22050;
const SIZE=1024,HOP=441,MELS=128;
const hzToMel=hz=>hz<1000?hz/(200/3):15+Math.log(hz/1000)/(Math.log(6.4)/27);
const melToHz=mel=>mel<15?mel*(200/3):1000*Math.exp((mel-15)*(Math.log(6.4)/27));
const reflect=(index,length)=>index<0?-index:index>=length?2*length-index-2:index;
let filters=null;
function melFilters(){
 if(filters)return filters;
 const lo=hzToMel(30),hi=hzToMel(11000),points=Array.from({length:MELS+2},(_,i)=>melToHz(lo+(hi-lo)*i/(MELS+1)));
 filters=Array.from({length:MELS},(_,m)=>{
  const values=[];
  for(let k=0;k<=SIZE/2;k++){
   const hz=k*NEURAL_SAMPLE_RATE/SIZE,w=Math.max(0,Math.min((hz-points[m])/(points[m+1]-points[m]),(points[m+2]-hz)/(points[m+2]-points[m+1])));
   if(w>0)values.push([k,w]);
  }
  return values;
 });return filters;
}

export function resampleMono(channels,sampleRate){
 if(!Array.isArray(channels)||channels.length<1||channels.length>2||!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000)
  throw Error('Invalid PCM for neural features');
 const count=channels[0].length;
 if(count<sampleRate*8||count>sampleRate*180||channels.some(c=>!(c instanceof Float32Array)||c.length!==count))throw Error('Invalid PCM extent');
 let power=0,meanPower=0,largest=0,largestPower=-1;
 for(let c=0;c<channels.length;c++){
  let p=0;for(let i=0;i<count;i++){const v=channels[c][i];if(!Number.isFinite(v))throw Error('Invalid PCM sample');p+=v*v}
  power+=p/channels.length;if(p>largestPower){largestPower=p;largest=c}
 }
 const mono=new Float32Array(count);
 for(let i=0;i<count;i++){let sum=0;for(const c of channels)sum+=c[i];mono[i]=sum/channels.length;meanPower+=mono[i]*mono[i]}
 const antiPhase=channels.length===2&&meanPower<power*.05;
 if(antiPhase)mono.set(channels[largest]);
 const channelMode=antiPhase?'dominant-channel-anti-phase':channels.length===2?'stereo-average':'mono';
 if(sampleRate===NEURAL_SAMPLE_RATE)return {mono,channelMode,resampler:'none',inputRms:Math.sqrt(power/count)};
 const output=new Float32Array(Math.floor(count*NEURAL_SAMPLE_RATE/sampleRate));
 const phases=1024,taps=64,half=taps/2,cutoff=Math.min(1,NEURAL_SAMPLE_RATE/sampleRate)*.94;
 const table=Array.from({length:phases},(_,p)=>{
  const fraction=p/phases,weights=new Float64Array(taps);let sum=0;
  for(let k=0;k<taps;k++){
   const x=k-(half-1)-fraction,a=Math.PI*cutoff*x;
   const window=.42+.5*Math.cos(Math.PI*x/half)+.08*Math.cos(2*Math.PI*x/half);
   weights[k]=(Math.abs(a)<1e-10?1:Math.sin(a)/a)*cutoff*window;sum+=weights[k];
  }
  for(let k=0;k<taps;k++)weights[k]/=sum;
  return weights;
 });
 for(let i=0;i<output.length;i++){
  const position=i*sampleRate/NEURAL_SAMPLE_RATE,integer=Math.floor(position),fraction=position-integer;
  const weights=table[Math.min(phases-1,Math.round(fraction*phases))];let value=0;
  for(let k=0;k<taps;k++)value+=mono[reflect(integer+k-(half-1),count)]*weights[k];
  output[i]=value;
 }
 return {mono:output,channelMode,resampler:'windowed-sinc-64-phase1024',inputRms:Math.sqrt(power/count)};
}

export function neuralLogMel(mono){
 if(!(mono instanceof Float32Array)||mono.length<NEURAL_SAMPLE_RATE*8||mono.length>NEURAL_SAMPLE_RATE*180)throw Error('Invalid neural PCM');
 const frames=Math.floor(mono.length/HOP)+1,result=new Float32Array(frames*MELS);
 const re=new Float64Array(SIZE),im=new Float64Array(SIZE),window=Float64Array.from({length:SIZE},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/SIZE));
 const bank=melFilters();
 for(let frame=0;frame<frames;frame++){
  const first=frame*HOP-SIZE/2;
  for(let j=0;j<SIZE;j++){re[j]=mono[reflect(first+j,mono.length)]*window[j];im[j]=0}
  FFT.getSpectrum(re,im);
  for(let m=0;m<MELS;m++){
   let sum=0;for(const [bin,weight] of bank[m])sum+=re[bin]*weight/Math.sqrt(SIZE);
   result[frame*MELS+m]=Math.log1p(1000*sum);
  }
 }
 return {data:result,frames,bins:MELS};
}
