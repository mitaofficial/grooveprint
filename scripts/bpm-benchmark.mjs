/**
 * GROOVEPRINT reproducible BPM benchmark. Run locally; never uploads audio.
 * Synthetic ground truth is generated. Real ground truth must be independently verified.
 * No "confidence" numbers are fabricated.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {estimateLocalTempo as baseline} from '../src/bpm-tempo.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(flag,fallback=null)=>{const n=args.indexOf(flag);return n>=0?args[n+1]??fallback:fallback};
const includes=flag=>args.includes(flag);
const usage=()=>{
 console.log('Usage: node scripts/bpm-benchmark.mjs [--synthetic|--real --manifest path] [--quick] [--out .private/benchmarks/run] [--compare local-module-path]');
 console.log('Real manifest: {tracks:[{id, file, category, groundTruthBpm, groundTruthStatus:"verified", verificationMethod:"DAW beat-grid"}]}');
};
if(includes('--help')){usage();process.exit(0)}
const mode=includes('--real')?'real':'synthetic';
const out=resolve(root,arg('--out','.private/benchmarks/'+mode));
const quick=includes('--quick');
const tempoSet=[60,69,70,100,120,128,136,138,140,145,150,160,174,200];
const patterns=['four','backbeat','hats-dominant','swing','tribal','breaks','triplets','sparse','distorted','vinyl-noise','intro','antiphase'];
function seeded(seed){let v=seed>>>0;return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296}}
function hashSeed(text){let n=2166136261;for(const ch of text){n=Math.imul(n^ch.charCodeAt(0),16777619)}return n>>>0}
function synthesize(id,bpm,pattern){
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
function noBeat(id){
 const sampleRate=12000,duration=12,rng=seeded(hashSeed(id)),array=new Float32Array(sampleRate*duration);
 for(let i=0;i<array.length;i++)array[i]=.025*Math.sin(2*Math.PI*92*i/sampleRate)+.002*(rng()*2-1);
 return {sampleRate,duration,numberOfChannels:1,getChannelData:()=>array};
}
function stats(rows){
 const hasTruth=r=>r.groundTruthStatus==='verified'&&Number.isFinite(r.groundTruthBpm);
 const all=rows.filter(hasTruth),predicted=all.filter(r=>r.status==='estimated'&&Number.isFinite(r.bpm));
 const accepted=predicted.filter(r=>!r.requiresReview),review=all.filter(r=>r.requiresReview||r.status==='review');
 const good=(r,tol)=>Math.abs(r.bpm-r.groundTruthBpm)<=tol;
 const rate=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
 const mean=arr=>arr.length?Number((arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(4)):null;
 const median=arr=>arr.length?arr.slice().sort((a,b)=>a-b)[Math.floor(arr.length/2)]:null;
 const errors=predicted.map(r=>Math.abs(r.bpm-r.groundTruthBpm));
 const octave=r=>Math.abs(r.bpm-r.groundTruthBpm/2)<=2||Math.abs(r.bpm-r.groundTruthBpm*2)<=2;
 const errorsUnaccepted=accepted.filter(r=>Math.abs(r.bpm-r.groundTruthBpm)>5);
 return {n:rows.length,groundTruthN:all.length,predictedN:predicted.length,acceptedN:accepted.length,
  coveragePct:rate(predicted.length,all.length),autoAcceptedPct:rate(accepted.length,all.length),
  reviewPct:rate(review.length,all.length),
  top1Within1Pct:rate(predicted.filter(r=>good(r,1)).length,predicted.length),
  top1Within2Pct:rate(predicted.filter(r=>good(r,2)).length,predicted.length),
  acceptedWithin1Pct:rate(accepted.filter(r=>good(r,1)).length,accepted.length),
  acceptedWithin2Pct:rate(accepted.filter(r=>good(r,2)).length,accepted.length),
  candidateWithin1Pct:rate(predicted.filter(r=>r.candidateBpm.some(x=>Math.abs(x-r.groundTruthBpm)<=1)).length,predicted.length),
  octaveErrorPct:rate(predicted.filter(octave).length,predicted.length),
  unflaggedOctavePct:rate(accepted.filter(octave).length,accepted.length),
  catastrophicPct:rate(predicted.filter(r=>Math.abs(r.bpm-r.groundTruthBpm)>5&&!octave(r)).length,predicted.length),
  unflaggedOver5N:errorsUnaccepted.length,
  mae:mean(errors),medianAe:median(errors),meanProcessingMs:mean(rows.map(r=>r.processingMs)),meanSampledRssMb:mean(rows.filter(r=>Number.isFinite(r.sampledRssMb)).map(r=>r.sampledRssMb)),
  unavailableN:rows.filter(r=>r.status==='unavailable').length,
  decodeFailuresN:rows.filter(r=>r.status==='decode-error').length};
}
function validateEntry(t){
 if(!t||typeof t!=='object'||typeof t.id!=='string'||!/^[a-z0-9_-]{1,64}$/i.test(t.id))throw Error('Each track requires an opaque id [a-z0-9_-] (1-64 chars)');
 if(typeof t.file!=='string'||isAbsolute(t.file)||t.file.includes('\0'))throw Error('Each file path must be relative');
 if(!['verified','variable','ambiguous','unavailable'].includes(t.groundTruthStatus))throw Error('Invalid groundTruthStatus for '+t.id);
 if(t.groundTruthStatus==='verified'&&(!Number.isFinite(t.groundTruthBpm)||t.groundTruthBpm<20||t.groundTruthBpm>300||!t.verificationMethod))throw Error('Verified records require independent BPM and verificationMethod: '+t.id);
}
function localAudioPath(base,file){
 const full=resolve(base,file);
 if(relative(base,full).startsWith('..'+sep)||relative(base,full)==='..')throw Error('Audio file must remain inside local manifest folder');
 return full;
}
function readWavPCM(bytes){
 const b=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<44||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw Error('Unsupported WAV header');
 let fmt=null,data=null;
 for(let at=12;at+8<=bytes.length;){
  const id=bytes.toString('ascii',at,at+4),size=b.getUint32(at+4,true),end=at+8+size;
  if(end>bytes.length)throw Error('Broken WAV chunk');
  if(id==='fmt '){fmt={format:b.getUint16(at+8,true),channels:b.getUint16(at+10,true),sampleRate:b.getUint32(at+12,true),bits:b.getUint16(at+22,true),blockAlign:b.getUint16(at+20,true)}}
  if(id==='data')data={at:at+8,size};
  at=end+(size%2);
 }
 if(!fmt||!data||fmt.channels<1||fmt.channels>8||fmt.sampleRate<8000||fmt.sampleRate>192000)throw Error('Unsupported WAV layout');
 if(!((fmt.format===1&&[16,24,32].includes(fmt.bits))||(fmt.format===3&&fmt.bits===32)))throw Error('Unsupported WAV PCM bit depth');
 const samples=Math.min(Math.floor(data.size/fmt.blockAlign),Math.floor(fmt.sampleRate*180));
 const output=Array.from({length:Math.min(fmt.channels,2)},()=>new Float32Array(samples));
 for(let i=0;i<samples;i++)for(let ch=0;ch<output.length;ch++){
  const at=data.at+i*fmt.blockAlign+ch*fmt.bits/8;
  let v;
  if(fmt.format===3)v=b.getFloat32(at,true);
  else if(fmt.bits===16)v=b.getInt16(at,true)/32768;
  else if(fmt.bits===24){let n=bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;if(n&0x800000)n|=0xff000000;v=n/8388608}
  else v=b.getInt32(at,true)/2147483648;
  output[ch][i]=Number.isFinite(v)?v:0;
 }
 return {sampleRate:fmt.sampleRate,duration:samples/fmt.sampleRate,numberOfChannels:output.length,getChannelData:i=>output[i]};
}
async function decodeLocal(file,decoder){
 if(file.toLowerCase().endsWith('.wav'))return readWavPCM(await readFile(file));
 if(decoder!=='ffmpeg')throw Error('Compressed audio requires --decoder ffmpeg, installed locally');
 const rate=12000,channels=2,limit=180*rate*channels*4+1024;
 const p=spawnSync('ffmpeg',['-nostdin','-v','error','-i',file,'-t','180','-ar',String(rate),'-ac',String(channels),'-f','f32le','pipe:1'],{maxBuffer:limit,timeout:120000});
 if(p.error||p.status!==0||!p.stdout.length)throw Error('Local ffmpeg decoder failed');
 const floats=new Float32Array(p.stdout.byteLength/4|0);
 const view=new DataView(p.stdout.buffer,p.stdout.byteOffset,p.stdout.byteLength);
 for(let i=0;i<floats.length;i++)floats[i]=view.getFloat32(i*4,true);
 const samples=Math.floor(floats.length/channels),output=Array.from({length:channels},()=>new Float32Array(samples));
 for(let i=0;i<samples;i++)for(let c=0;c<channels;c++)output[c][i]=floats[i*channels+c];
 return {sampleRate:rate,duration:samples/rate,numberOfChannels:channels,getChannelData:i=>output[i]};
}
const comparePath=arg('--compare');
let challenger=null;
if(comparePath){
 const full=resolve(root,comparePath);
 if(relative(root,full).startsWith('..'+sep)||relative(root,full)==='..')throw Error('Comparison module must be within project');
 const module=await import(pathToFileURL(full).href);
 if(typeof module.estimateLocalTempo!=='function')throw Error('Comparison module must export estimateLocalTempo()');
 challenger=module.estimateLocalTempo;
}
function analyze(id,category,groundTruthBpm,groundTruthStatus,buffer,detector,engine){
 const start=performance.now();
 const output=detector(buffer);
 const elapsed=performance.now()-start;
 const sampledRssMb=Number((process.memoryUsage().rss/1048576).toFixed(2));
 const candidates=Array.isArray(output.bpmCandidates)?output.bpmCandidates.map(c=>Number(c.bpm)).filter(Number.isFinite):[];
 return {id,category,groundTruthBpm,groundTruthStatus,engine,status:output.status||'unavailable',
  bpm:Number.isFinite(output.bpm)?output.bpm:null,requiresReview:output.requiresReview===true,
  reason:String(output.reason||''),candidateBpm:candidates,candidateScores:Array.isArray(output.bpmCandidates)?output.bpmCandidates.slice(0,8).map(x=>Number(x.relative)||0):[],processingMs:Number(elapsed.toFixed(3)),sampledRssMb};
}
let inputs=[],realAvailability='NOT TESTED';
if(mode==='synthetic'){
 const tempos=quick?[70,138,174]:tempoSet;
 const modes=quick?['four','sparse','antiphase']:patterns;
 for(const bpm of tempos)for(const pattern of modes){
  const id='synth_'+bpm+'_'+pattern;
  inputs.push({id,category:pattern,groundTruthBpm:bpm,groundTruthStatus:'verified',getBuffer:async()=>synthesize(id,bpm,pattern)});
 }
 inputs.push({id:'synth_no_beat',category:'nonrhythmic',groundTruthBpm:null,groundTruthStatus:'unavailable',getBuffer:async()=>noBeat('synth_no_beat')});
}else{
 const manifestArg=arg('--manifest');
 if(!manifestArg)throw Error('--real requires --manifest path');
 const manifestFile=resolve(root,manifestArg),manifest=JSON.parse(await readFile(manifestFile,'utf8'));
 if(!Array.isArray(manifest.tracks))throw Error('Manifest must contain tracks[]');
 const seen=new Set();
 for(const t of manifest.tracks){
  validateEntry(t);
  if(seen.has(t.id))throw Error('Duplicate opaque id: '+t.id);
  seen.add(t.id);
  inputs.push({id:t.id,category:String(t.category||'unspecified').slice(0,80),
   groundTruthBpm:t.groundTruthStatus==='verified'?t.groundTruthBpm:null,groundTruthStatus:t.groundTruthStatus,
   getBuffer:async()=>decodeLocal(localAudioPath(dirname(manifestFile),t.file),arg('--decoder','wav'))});
 }
 realAvailability=inputs.length?'TESTED':'NOT TESTED';
}
const results=[];
for(const entry of inputs){
 let buffer;
 try{buffer=await entry.getBuffer()}
 catch(error){
  // Don't leak local paths, codec stderr or audio metadata to reports.
  results.push({id:entry.id,category:entry.category,groundTruthBpm:entry.groundTruthBpm,groundTruthStatus:entry.groundTruthStatus,
   engine:'baseline',status:'decode-error',bpm:null,requiresReview:false,reason:'decode-failed',candidateBpm:[],processingMs:0});
  continue;
 }
 results.push(analyze(entry.id,entry.category,entry.groundTruthBpm,entry.groundTruthStatus,buffer,baseline,'baseline'));
 if(challenger)results.push(analyze(entry.id,entry.category,entry.groundTruthBpm,entry.groundTruthStatus,buffer,challenger,'challenger'));
}
const grouped=Object.fromEntries([...new Set(results.map(r=>r.engine))].map(engine=>{
 const subset=results.filter(r=>r.engine===engine);
 const byCategory=Object.fromEntries([...new Set(subset.map(r=>r.category))].map(c=>[c,stats(subset.filter(r=>r.category===c))]));
 return [engine,{overall:stats(subset),byCategory}];
}));
const source=await readFile(resolve(root,'src/bpm-tempo.mjs'));
const report={schemaVersion:1,mode,realAudioValidation:realAvailability,algorithmSha256:createHash('sha256').update(source).digest('hex'),
 generatedAt:new Date().toISOString(),groundTruthPolicy:'synthetic generator, or independent manually verified real BPM',
 data:grouped,notes:['First candidate and auto-accepted accuracy are scored separately.',
  'A non-null score is not a calibrated confidence value.',
  'A synthetic PASS never establishes musical accuracy on released recordings.',
  'Sampled process RSS is not peak heap usage, and timing varies with CI hardware.',
  'No music or audio bytes are included in report output.']};
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const fields=['id','category','groundTruthStatus','groundTruthBpm','engine','status','bpm','requiresReview','reason','candidateBpm','processingMs','sampledRssMb'];
const csvCell=v=>{let s=Array.isArray(v)?v.join(';'):v==null?'':String(v);return '"'+s.replaceAll('"','""')+'"'};
await writeFile(resolve(out,'results.csv'),fields.join(',')+'\n'+results.map(r=>fields.map(k=>csvCell(r[k])).join(',')).join('\n')+'\n');
const markdown=['# GROOVEPRINT BPM benchmark','', 'Dataset: '+mode,'Real recording validation: '+realAvailability,
 'Algorithm SHA-256: '+report.algorithmSha256,'',
 '| Engine | Ground truth N | Coverage % | Top-1 ±1 BPM % | Accepted ±1 BPM % | Candidate ±1 BPM % | Octave error % | Unflagged octave % | MAE |',
 '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(const [engine,value] of Object.entries(grouped)){
 const s=value.overall;
 markdown.push('| '+engine+' | '+s.groundTruthN+' | '+s.coveragePct+' | '+s.top1Within1Pct+' | '+s.acceptedWithin1Pct+' | '+s.candidateWithin1Pct+' | '+s.octaveErrorPct+' | '+s.unflaggedOctavePct+' | '+s.mae+' |');
}
markdown.push('','**Warning:** synthetic results cannot establish production music accuracy. All values refer to this run only.','',
 '## Most significant errors (non-octave errors >5 BPM excluded from this ranking only after listing)',
 '');
const worst=results.filter(r=>r.engine==='baseline'&&r.groundTruthStatus==='verified'&&Number.isFinite(r.bpm))
 .map(r=>({...r,error:Math.abs(r.bpm-r.groundTruthBpm)})).sort((a,b)=>b.error-a.error).slice(0,12);
for(const r of worst)markdown.push('- '+r.id+': expected '+r.groundTruthBpm+', got '+r.bpm+', absolute error '+r.error.toFixed(2)+', review='+r.requiresReview);
await writeFile(resolve(out,'report.md'),markdown.join('\n')+'\n');
console.log(JSON.stringify({mode,realAudioValidation:realAvailability,reportDir:relative(root,out),summary:grouped.baseline.overall,comparison:challenger?grouped.challenger.overall:null}));
if(mode==='synthetic'&&challenger){
 const failures=results.filter(r=>r.engine==='challenger'&&r.groundTruthStatus==='verified'&&
   Number.isFinite(r.bpm)&&Math.abs(r.bpm-r.groundTruthBpm)>2)
  .map(r=>({id:r.id,expected:r.groundTruthBpm,bpm:r.bpm,requiresReview:r.requiresReview,
    reason:r.reason,candidates:r.candidateBpm.slice(0,5),relativeScores:r.candidateScores?.slice(0,5)}));
 console.log(JSON.stringify({diagnostic:'challenger-synthetic-misses',count:failures.length,cases:failures}));
}
