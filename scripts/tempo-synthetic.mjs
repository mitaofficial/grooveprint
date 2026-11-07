/* Deterministic original signals. No publisher audio or musical ground truth. */
function seeded(seed){let v=seed>>>0;return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296}}
function hashSeed(text){let n=2166136261;for(const ch of text){n=Math.imul(n^ch.charCodeAt(0),16777619)}return n>>>0}
export function synthesize(id,bpm,pattern,{quick=false}={}){
 const sampleRate=12000,duration=quick?12:24,numberOfChannels=pattern==='antiphase'?2:1;
 const n=Math.floor(duration*sampleRate),data=Array.from({length:numberOfChannels},()=>new Float32Array(n));
 const rng=seeded(hashSeed(id)),secondsPerBeat=60/bpm;
 function pulse(time,type,amp){
  if(time<0||time>=duration)return;
  const pos=Math.round(time*sampleRate),length=Math.round(sampleRate*(type==='kick'?.11:.045));
  for(let j=0;j<length&&pos+j<n;j++){
   const t=j/sampleRate;
   const env=Math.exp(-t*(type==='kick'?36:91));
   let v=0;
   if(type==='kick')v=Math.sin(2*Math.PI*(54*t+135*(1-Math.exp(-t*27))/27))*env;
   else if(type==='snare')v=(rng()*2-1)*env*.82+Math.sin(2*Math.PI*175*t)*env*.18;
   else v=(rng()*2-1)*env;
   data[0][pos+j]+=v*amp;
   if(numberOfChannels===2)data[1][pos+j]-=v*amp;
  }
 }
 for(let beat=0;beat<Math.ceil(duration/secondsPerBeat);beat++){
  const time=beat*secondsPerBeat;
  if(pattern==='intro'&&time<7)continue;
  const bar=beat%4;
  const shouldKick=pattern==='sparse'?bar===0||bar===2:pattern==='breaks'?bar===0||bar===2||bar===3:true;
  const kickAmp=pattern==='hats-dominant'?.18:pattern==='tribal'?.62:.95;
  if(shouldKick)pulse(time,'kick',kickAmp);
  if(bar===1||bar===3)pulse(time,'snare',pattern==='breaks'?.8:.46);
  if(pattern==='breaks'&&bar===3)pulse(time+secondsPerBeat*.74,'kick',.55);
  if(pattern==='tribal'){
   pulse(time+secondsPerBeat*.25,'snare',.6);
   pulse(time+secondsPerBeat*.75,'snare',.4);
  }
  if(pattern==='triplets')for(let k=1;k<3;k++)pulse(time+secondsPerBeat*k/3,'hat',.6);
  else if(pattern!=='sparse'){
   const shifted=pattern==='swing'&&beat%2===0?.66:.5;
   pulse(time+secondsPerBeat*shifted,'hat',pattern==='hats-dominant'?1:.32);
  }
  if(pattern==='hats-dominant')pulse(time+secondsPerBeat*.25,'hat',.7);
 }
 for(let j=0;j<n;j++){
  const noise=pattern==='vinyl-noise'?(rng()*2-1)*.065:0;
  if(pattern==='intro'&&j<7*sampleRate)data[0][j]+=.015*Math.sin(2*Math.PI*83*j/sampleRate);
  if(pattern==='vinyl-noise')data[0][j]+=noise;
  if(pattern==='distorted')data[0][j]=Math.tanh(data[0][j]*4)*.9;
 }
 return {sampleRate,duration,numberOfChannels,getChannelData:i=>data[i]};
}
export function noBeat(id){
 const sampleRate=12000,duration=12,rng=seeded(hashSeed(id)),array=new Float32Array(sampleRate*duration);
 for(let i=0;i<array.length;i++)array[i]=.025*Math.sin(2*Math.PI*92*i/sampleRate)+.002*(rng()*2-1);
 return {sampleRate,duration,numberOfChannels:1,getChannelData:()=>array};
}
