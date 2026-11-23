#!/usr/bin/env node
/** Evaluate the ACTUAL WebAssembly + JS frontend path against MIDI clocks.
 * GMD was in Beat This! training; this is an in-domain regression diagnostic,
 * NOT an independent-model holdout even when its official split says test.
 * No Python dependencies needed for inference; FFmpeg is the offline decoder.
 * References are read only after inference. Source acquisition is separate.
 */
import * as ort from 'onnxruntime-web/wasm';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {analyzeMusicalTempo} from '../src/bpm-musical-engine.mjs';
import {estimateBaseline,pcmBuffer} from '../src/bpm-engine.mjs';
import {estimateLocalTempo as v2} from '../src/bpm-tempo-experiment.mjs';
import {metricalRelation} from '../src/bpm-beat-tracker.mjs';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const split=arg('--split','train');if(!['train','validation','test'].includes(split))throw Error('Invalid split');
const root=resolve(arg('--data','.private/benchmarks/gmd-independent')),
 manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'))),selected=manifest.rows.filter(r=>r.split===split);
const out=resolve(arg('--out',`.private/checkpoints/bpm-resolution-2026-11-23/gmd-neural-${split}.json`));mkdirSync(dirname(out),{recursive:true});
const hash=b=>createHash('sha256').update(b).digest('hex');
ort.env.wasm.numThreads=1;ort.env.logLevel='error';
const modelBytes=readFileSync('src/models/beat-this-small0/model.onnx');
const start=performance.now(),session=await ort.InferenceSession.create(modelBytes,{executionProviders:['wasm']});
const rows=[];
try{
 for(const item of selected){
  const row={id:item.id,drummer:item.drummer,session:item.session,style:item.style,split};
  if(!item.audio_filename){row.status='source-absent';rows.push(row);continue}
  if(!item.files?.audio?.sha256)throw Error('Acquisition incomplete');
  const path=resolve(root,item.audio_filename);if(!path.startsWith(root+'/'))throw Error('Invalid audio path');
  const bytes=readFileSync(path);if(hash(bytes)!==item.files.audio.sha256)throw Error('Audio SHA mismatch');
  const decoded=spawnSync('ffmpeg',['-nostdin','-v','error','-i',path,'-t','180','-ar','22050','-ac','1','-f','f32le','pipe:1'],{maxBuffer:18*1024*1024,timeout:60000});
  if(decoded.status!==0)throw Error('FFmpeg failed');
  const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
  const before=performance.now();const result=await analyzeMusicalTempo(22050,[pcm],{session,Tensor:ort.Tensor});
  row.ms=performance.now()-before;row.status=result.status;row.result=result;row.pcmSha256=hash(Buffer.from(pcm.buffer));row.audioSha256=item.files.audio.sha256;
  // The acquisition MIDI tempo was independently verified by the paired pilot.
  const clock=JSON.parse(readFileSync(`.private/checkpoints/bpm-resolution-2026-11-23/gmd-${split}.json`)).rows.find(r=>r.id===item.id);
  if(!clock?.referenceBpm||clock.referenceKind!=='independent-acquisition-metronome-and-midi')throw Error('Verified acquisition reference absent');
  row.referenceBpm=clock.referenceBpm;row.errorWithin1=result.bpm!==null?Math.abs(result.bpm-row.referenceBpm)<=1:null;
  row.metricalError=result.bpm!==null&&!row.errorWithin1?metricalRelation(result.bpm,row.referenceBpm):null;
  const buffer=pcmBuffer(22050,[pcm]);
  row.controls=[['V1-frozen',estimateBaseline(buffer)],['V2-frozen',v2(buffer)]].map(([name,r])=>({name,bpm:r.bpm,within1:r.bpm!==null&&Math.abs(r.bpm-row.referenceBpm)<=1,
    ruleReview:r.requiresReview,actualAutomaticAssignments:0}));
  rows.push(row);
  writeFileSync(out,JSON.stringify({split,complete:false,modelSha256:hash(modelBytes),rows},null,2)+'\n');
  console.log(JSON.stringify({id:row.id,ref:row.referenceBpm,bpm:result.bpm,status:result.status,reason:result.reason,ms:row.ms}));
 }
}finally{await session.release()}
function wilson(k,n){if(!n)return null;const z=1.95996398454,p=k/n,d=1+z*z/n,m=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return[m-h,m+h]}
const decoded=rows.filter(r=>r.result),assigned=decoded.filter(r=>r.status==='estimated'),correct=assigned.filter(r=>r.errorWithin1);
const summary={selected:rows.length,sourceAbsent:rows.length-decoded.length,decoded:decoded.length,
 assigned:assigned.length,correctWithin1:correct.length,review:decoded.filter(r=>r.status==='review').length,undetermined:decoded.filter(r=>r.status==='unavailable').length,
 precision:assigned.length?correct.length/assigned.length:null,precisionWilson95:wilson(correct.length,assigned.length),
 correctCoverageWithAudio:correct.length/decoded.length,correctCoverageAllSelected:correct.length/rows.length,
 acceptedMetricalErrors:assigned.filter(r=>['half-double','three-to-two','triple'].includes(r.metricalError)).length,
 controls:['V1-frozen','V2-frozen'].map(name=>({name,top1Within1:decoded.filter(r=>r.controls.find(c=>c.name===name).within1).length,total:decoded.length,actualAutomaticAssignments:0})),
 averageMs:decoded.reduce((n,r)=>n+r.ms,0)/decoded.length,totalMs:performance.now()-start,nodeMaxRssKiB:process.resourceUsage().maxRSS};
writeFileSync(out,JSON.stringify({kind:'KNOWN_TRAINING_DATA_CLOCK_DIAGNOSTIC_ACTUAL_JS_WASM_NOT_VALIDATION',complete:true,split,
 modelTrainingOverlap:'Beat This! paper explicitly includes Groove MIDI recordings longer than 20s. Official GMD split is NOT its model holdout.',
 modelSha256:hash(modelBytes),inferenceVersion:'small0-opset17-context768',source:manifest.documentation,license:manifest.license,
 preprocessing:'First min(180s,duration), FFmpeg 22050Hz mono float32, no tiling; all engines receive same PCM',
 scope:'Scalar decision from disjoint 12s musical-beat windows with <=15.36s model context. 2 or 3 windows, bounds retained.',
 uncertainty:'Wilson 95% descriptive only; repeated drummer/session observations correlated; not target techno full mixes.',
 summary,rows},null,2)+'\n');console.log('NEURAL_PILOT_SUMMARY',JSON.stringify(summary));
