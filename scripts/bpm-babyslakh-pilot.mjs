#!/usr/bin/env node
import * as ort from 'onnxruntime-web/wasm';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {midiClock} from './tempo-midi-clock.mjs';
import {analyzeMusicalTempo} from '../src/bpm-musical-engine.mjs';
import {estimateBaseline,pcmBuffer} from '../src/bpm-engine.mjs';
import {estimateLocalTempo as v2} from '../src/bpm-tempo-experiment.mjs';
import {metricalRelation} from '../src/bpm-beat-tracker.mjs';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const root=resolve(arg('--data','.private/benchmarks/babyslakh-independent')),manifest=JSON.parse(readFileSync(root+'/manifest.json'));
if(manifest.rows.length!==(manifest.expectedRecords||20))throw Error('Wait for the complete declared acquisition; never evaluate a result-selected prefix');
const hash=b=>createHash('sha256').update(b).digest('hex'),families=new Set(),midiHashes=new Set();
const items=manifest.rows.map(r=>{
 const get=name=>{const f=r.files[name]||r.files[name==='all_src.mid'?'midi':'audio'],path=resolve(root,f.path);if(!path.startsWith(root+'/'))throw Error('Invalid path');const b=readFileSync(path);if(hash(b)!==f.sha256)throw Error('Source hash mismatch');return {bytes:b,path}};
 const midi=get('all_src.mid'),clock=midiClock(midi.bytes),audio=get('mix.wav');
 const duplicate=families.has(r.family)||midiHashes.has(hash(midi.bytes));families.add(r.family);midiHashes.add(hash(midi.bytes));
 return {row:r,clock,audio,duplicate};
});
ort.env.wasm.numThreads=1;ort.env.logLevel='error';
const session=await ort.InferenceSession.create(readFileSync('src/models/beat-this-small0/model.onnx'),{executionProviders:['wasm']});
const rows=[];
try{
 for(const item of items){
  const {row:r,clock,audio}=item;
  if(item.duplicate){rows.push({id:r.id,duplicateFamily:true});continue}
  const decoded=spawnSync('ffmpeg',['-nostdin','-v','error','-i',audio.path,'-t','180','-ar','22050','-ac','1','-f','f32le','pipe:1'],{maxBuffer:18*1024*1024,timeout:60000});
  if(decoded.status!==0)throw Error('Decode failed');const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
  const duration=pcm.length/22050;
  // Qualify before looking at predictions. Use only the decoded extent, never
  // disqualify a scalar because a change lies after the first 180 seconds.
  const changes=clock.tempoMap.filter(c=>c.seconds<duration);
  const bpms=changes.map(c=>c.bpm),scalar=clock.explicitClock&&Math.max(...bpms)-Math.min(...bpms)<=.02;
  const referenceBpm=scalar?bpms[0]:null;
  const t=performance.now(),result=await analyzeMusicalTempo(22050,[pcm],{session,Tensor:ort.Tensor});
  const controls=pcmBuffer(22050,[pcm]);
  const row={id:r.id,family:r.family,audioSha256:(r.files['mix.wav']||r.files.audio).sha256,midiSha256:(r.files['all_src.mid']||r.files.midi).sha256,
   duration,referenceKind:'independent-MIDI-quarter-note-render-clock-not-human-tactus-annotation',
   scalarEligible:scalar,referenceBpm,clockChanges:changes.map(c=>({seconds:c.seconds,bpm:c.bpm})),result,ms:performance.now()-t,
   correctWithin1:scalar&&result.bpm!==null?Math.abs(result.bpm-referenceBpm)<=1:null,
   controls:[['V1-frozen',estimateBaseline(controls)],['V2-frozen',v2(controls)]].map(([name,e])=>({name,bpm:e.bpm,within1:scalar&&e.bpm!==null?Math.abs(e.bpm-referenceBpm)<=1:null}))};
  row.metricalError=scalar&&result.bpm!==null&&!row.correctWithin1?metricalRelation(result.bpm,referenceBpm):null;
  rows.push(row);console.log(JSON.stringify({id:row.id,scalar,ref:referenceBpm,bpm:result.bpm,status:result.status,reason:result.reason,ms:row.ms}));
 }
}finally{await session.release()}
const unique=rows.filter(r=>!r.duplicateFamily),scalar=unique.filter(r=>r.scalarEligible),assigned=scalar.filter(r=>r.result.status==='estimated'),correct=assigned.filter(r=>r.correctWithin1),variable=unique.filter(r=>!r.scalarEligible);
const z=1.95996398454,n=assigned.length,p=n?correct.length/n:0,d=1+z*z/n,m=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
const summary={selected:rows.length,unique:unique.length,duplicateFamilies:rows.length-unique.length,decoded:unique.length,scalarEligible:scalar.length,variableClock:variable.length,
 assignedScalar:assigned.length,correctScalarWithin1:correct.length,scalarReview:scalar.filter(r=>r.result.status==='review').length,
 scalarUndetermined:scalar.filter(r=>r.result.status==='unavailable').length,scalarPrecision:n?correct.length/n:null,scalarPrecisionWilson95:n?[m-h,m+h]:null,
 correctScalarCoverage:scalar.length?correct.length/scalar.length:null,correctCoverageAllUnique:correct.length/unique.length,
 acceptedMetricalErrors:assigned.filter(r=>['half-double','three-to-two','triple'].includes(r.metricalError)).length,
 variableClockAssigned:variable.filter(r=>r.result.status==='estimated').length,variableClockReview:variable.filter(r=>r.result.status==='review').length,
 controls:['V1-frozen','V2-frozen'].map(name=>({name,correctTop1:scalar.filter(r=>r.controls.find(c=>c.name===name).within1).length,total:scalar.length})),nodeMaxRssKiB:process.resourceUsage().maxRSS};
writeFileSync(arg('--out','.private/checkpoints/bpm-resolution-2026-11-23/babyslakh-external.json'),JSON.stringify({
 kind:'EXTERNAL_RENDER_CLOCK_POLYPHONIC_DIAGNOSTIC_NOT_TARGET_VALIDATION',source:manifest.source,license:manifest.license,
 attribution:manifest.attribution,trainingOverlap:manifest.trainingOverlap,
 scope:'First <=180s decoded; disjoint 12s evidence windows with <=768 frames context; same PCM all controls',
 referenceLimitation:'DAW/MIDI quarter-note clock is independent of audio inference, but not a human audit of musical tactus; no original-recording claim',
 qualification:'Exact MIDI/family dedup; scalar only when explicit MIDI clock range <=.02 BPM over decoded extent. Variable-clock cases kept separate, including proposals.',
 summary,rows},null,2)+'\n');console.log('BABYSLAKH_SUMMARY',JSON.stringify(summary));
