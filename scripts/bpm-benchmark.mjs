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
import {scoreRows as stats,evaluateCase} from './tempo-evaluation.mjs';
import {execFileSync} from 'node:child_process';
import {cpus,platform,arch} from 'node:os';
import {synthesize,noBeat} from './tempo-synthetic.mjs';
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
const compareOptions=JSON.parse(arg('--compare-options','{}'));
if(!compareOptions||typeof compareOptions!=='object'||Array.isArray(compareOptions))throw Error('--compare-options must be a JSON object');
const comparePath=arg('--compare');
let challenger=null,challengerDefaults={};
if(comparePath){
 const full=resolve(root,comparePath);
 if(relative(root,full).startsWith('..'+sep)||relative(root,full)==='..')throw Error('Comparison module must be within project');
 const module=await import(pathToFileURL(full).href);
 if(typeof module.estimateLocalTempo!=='function')throw Error('Comparison module must export estimateLocalTempo()');
 challenger=module.estimateLocalTempo;challengerDefaults=module.TEMPO_PARAMETERS||{};
}
let inputs=[],realAvailability='NOT TESTED';
if(mode==='synthetic'){
 const tempos=arg('--tempos')?arg('--tempos').split(',').map(Number):quick?[70,138,174]:tempoSet;
 if(tempos.some(t=>!Number.isFinite(t)||t<20||t>300))throw Error('Synthetic --tempos must be comma-separated 20..300');
 const modes=quick?['four','sparse','antiphase']:patterns;
 for(const bpm of tempos)for(const pattern of modes){
  const id='synth_'+bpm+'_'+pattern;
  inputs.push({id,category:pattern,groundTruthBpm:bpm,groundTruthStatus:'verified',getBuffer:async()=>synthesize(arg('--seed')?id+'|'+arg('--seed'):id,bpm,pattern,{quick})});
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
const repetitions=Number(arg('--repetitions','3'));
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>20)throw Error('--repetitions must be 1..20');
const engines=[{name:'baseline',detector:baseline},...(challenger?[{name:'challenger',detector:challenger,options:{...challengerDefaults,...compareOptions}}]:[])];
const results=[];
for(const [caseIndex,entry] of inputs.entries())results.push(...await evaluateCase(entry,engines,{repetitions,caseIndex}));
if(mode==='real')realAvailability=results.some(r=>r.status!=='decode-error'&&r.groundTruthStatus==='verified')?'TESTED ON SUPPLIED VERIFIED REFERENCES':'NO VERIFIED AUDIO ANALYZED';
const grouped=Object.fromEntries(engines.map(e=>e.name).map(engine=>{
 const subset=results.filter(r=>r.engine===engine);
 const byCategory=Object.fromEntries([...new Set(subset.map(r=>r.category))].map(c=>[c,stats(subset.filter(r=>r.category===c))]));
 return [engine,{overall:stats(subset),byCategory}];
}));
const source=await readFile(resolve(root,'src/bpm-tempo.mjs'));
const engineMetadata={};
for(const engine of engines){const path=engine.name==='baseline'?'src/bpm-tempo.mjs':relative(root,resolve(root,comparePath));engineMetadata[engine.name]={module:path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex'),options:{minTempo:55,maxTempo:210,maxSeconds:180,...(engine.options||{})}}}
let gitHead=null;try{gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()}catch{}
const report={schemaVersion:2,metricDefinitions:{eligible:'verified scalar references, fixed before execution',top1:'correct / all eligible, including failures',conditional:'correct / valid predictions',candidateK:8,toleranceBpm:[1,2],octaveToleranceBpm:2,catastrophicAbsoluteErrorBpm:5,acceptance:'estimated, finite BPM, requiresReview === false',referenceLevel:mode==='synthetic'?'SYNTHETIC_GENERATED':'SUPPLIED_INDEPENDENT_REFERENCE'},engines:engineMetadata,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,gitHead},generatorSha256:createHash('sha256').update(await readFile(resolve(root,'scripts/tempo-synthetic.mjs'))).digest('hex'),repetitions,syntheticSeed:arg('--seed','original'),syntheticTempos:arg('--tempos',quick?'70,138,174':tempoSet.join(',')),timingMethod:'Independent PCM copies, alternating engine order per case and repetition; raw timings retained. No warmup excluded.',cases:results,mode,realAudioValidation:realAvailability,algorithmSha256:createHash('sha256').update(source).digest('hex'),
 generatedAt:new Date().toISOString(),groundTruthPolicy:'synthetic generator, or independent manually verified real BPM',
 data:grouped,notes:['First candidate and auto-accepted accuracy are scored separately.',
  'Top-1/candidate/octave rates use every eligible case, including failures. Conditional accuracy is named separately.',
  'No accepted predictions => precision and Wilson interval are null, coverage is zero.',
  'PCM input copies isolate detectors; their cost is measured separately.',
  'Wilson 95% intervals assume independent cases; related synthetic patterns are not independent music recordings.',
  'A non-null score is not a calibrated confidence value.',
  'A synthetic PASS never establishes musical accuracy on released recordings.',
  'Sampled process RSS is not peak heap usage, and timing varies with CI hardware.',
  'No music or audio bytes are included in report output.']};
await mkdir(out,{recursive:true});
await writeFile(resolve(out,'summary.json'),JSON.stringify(report,null,2)+'\n');
const fields=['id','category','groundTruthStatus','groundTruthBpm','engine','status','bpm','requiresReview','reason','candidateBpm','processingMs','sampledRssMb','decodeMs','inputCopyMs','copiedPcmBytes','processingSamplesMs'];
const csvCell=v=>{let s=Array.isArray(v)?v.join(';'):v==null?'':String(v);return '"'+s.replaceAll('"','""')+'"'};
await writeFile(resolve(out,'results.csv'),fields.join(',')+'\n'+results.map(r=>fields.map(k=>csvCell(r[k])).join(',')).join('\n')+'\n');
const markdown=['# GROOVEPRINT BPM benchmark','', 'Dataset: '+mode,'Real recording validation: '+realAvailability,
 ...Object.entries(engineMetadata).map(([engine,m])=>engine+' SHA-256: '+m.sha256),'',
 '| Engine | Ground truth N | Coverage % | Top-1 ±1 BPM % (all eligible) | Accepted ±1 BPM % | Candidate ±1 BPM % | Octave error % | Unflagged octave % | MAE |',
 '|---|---:|---:|---:|---:|---:|---:|---:|---:|'];
for(const [engine,value] of Object.entries(grouped)){
 const s=value.overall;
 markdown.push('| '+engine+' | '+s.groundTruthN+' | '+s.coveragePct+' | '+s.top1Within1Pct+' | '+s.acceptedWithin1Pct+' | '+s.candidateWithin1Pct+' | '+s.octaveErrorPct+' | '+s.unflaggedOctavePct+' | '+s.mae+' |');
}
markdown.push('','**Warning:** synthetic results cannot establish production music accuracy. All values refer to this run only.','',
 '## Largest absolute errors, both engines (all error types included)',
 '');
const worst=results.filter(r=>r.groundTruthStatus==='verified'&&Number.isFinite(r.bpm))
 .map(r=>({...r,error:Math.abs(r.bpm-r.groundTruthBpm)})).sort((a,b)=>b.error-a.error).slice(0,12);
for(const r of worst)markdown.push('- '+r.engine+' / '+r.id+': expected '+r.groundTruthBpm+', got '+r.bpm+', absolute error '+r.error.toFixed(2)+', review='+r.requiresReview);
await writeFile(resolve(out,'report.md'),markdown.join('\n')+'\n');
console.log(JSON.stringify({mode,realAudioValidation:realAvailability,reportDir:relative(root,out),summary:grouped.baseline.overall,comparison:challenger?grouped.challenger.overall:null}));
if(mode==='synthetic'&&challenger){
 const failures=results.filter(r=>r.engine==='challenger'&&r.groundTruthStatus==='verified'&&
   Number.isFinite(r.bpm)&&Math.abs(r.bpm-r.groundTruthBpm)>2)
  .map(r=>({id:r.id,expected:r.groundTruthBpm,bpm:r.bpm,requiresReview:r.requiresReview,
    reason:r.reason,candidates:r.candidateBpm.slice(0,5),relativeScores:r.candidateScores?.slice(0,5)}));
 console.log(JSON.stringify({diagnostic:'challenger-synthetic-misses',count:failures.length,cases:failures}));
}
