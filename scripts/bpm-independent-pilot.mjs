#!/usr/bin/env node
/** Scalar clock-reference pilot. Never supplies labels/identities to inference.
 * Fetch: python scripts/bpm-gmd-acquire.py
 * Run each split deliberately: node scripts/bpm-independent-pilot.mjs --split train
 * Test is a small diagnostic holdout, NOT techno/hardgroove product validation.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {estimateBaseline,pcmBuffer} from '../src/bpm-engine.mjs';
import {estimateLocalTempo as estimateV2} from '../src/bpm-tempo-experiment.mjs';
import {analyzeBeatTempo,metricalRelation,BEAT_TRACKER_POLICY} from '../src/bpm-beat-tracker.mjs';

const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const split=arg('--split','train');
if(!['train','validation','test'].includes(split))throw Error('Explicit supported split required');
const root=resolve(arg('--data','.private/benchmarks/gmd-independent'));
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json'),'utf8'));
const selected=manifest.rows.filter(r=>r.split===split);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const [file,expected] of [['src/bpm-tempo.mjs','63e756e1fc3868ba8e239d80d8613d34f3e9358914d62c5c2c853ef9158d3bc4'],
 ['src/bpm-tempo-experiment.mjs','0dad1f5d80286818b9da3bd7cb5a45988f519542c7fa9cd26092e661024df8fc']])
 if(sha(readFileSync(file))!==expected)throw Error('Frozen comparator changed: '+file);

// Read acquisition-clock Set Tempo events from MIDI chunks, including VLQ and
// running status. CSV BPM alone is not the independent reference check.
export function midiTempos(bytes){
 const u16=i=>bytes.readUInt16BE(i),u32=i=>bytes.readUInt32BE(i);
 if(bytes.toString('ascii',0,4)!=='MThd')throw Error('Invalid MIDI header');
 let pos=8+u32(4);const tempi=[];
 for(let track=0;track<u16(10);track++){
  if(bytes.toString('ascii',pos,pos+4)!=='MTrk')throw Error('Invalid MIDI track');
  const end=pos+8+u32(pos+4);pos+=8;let running=0;
  const vlq=()=>{let n=0,b,count=0;do{if(pos>=end||count++>4)throw Error('Invalid MIDI VLQ');b=bytes[pos++];n=(n<<7)|(b&127)}while(b&128);return n};
  while(pos<end){
   vlq();let status=bytes[pos++];
   if(status<128){if(!running)throw Error('Missing MIDI status');pos--;status=running}
   else if(status<240)running=status;
   if(status===255){
    const type=bytes[pos++],length=vlq();
    if(type===81&&length===3)tempi.push(60000000/bytes.readUIntBE(pos,3));
    pos+=length;
   }else if(status===240||status===247){pos+=vlq();running=0}
   else if(status>=128&&status<240)pos+=((status&240)===192||(status&240)===208)?1:2;
   else throw Error('Unsupported MIDI event');
   if(pos>end)throw Error('MIDI chunk overflow');
  }
 }
 return [...new Set(tempi.map(n=>Number(n.toFixed(6))))];
}

function verified(file){
 if(!file?.path||!file.sha256)throw Error('Acquisition incomplete; wait for manifest');
 const path=resolve(root,file.path);if(!path.startsWith(root+'/'))throw Error('Invalid data path');
 const bytes=readFileSync(path);if(sha(bytes)!==file.sha256)throw Error('Audio/MIDI SHA mismatch');return {bytes,path};
}
function infer(label,fn,buffer){
 const before=performance.now(),r=fn(buffer);
 return {label,bpm:r.bpm,status:r.status,requiresReview:Boolean(r.requiresReview),reason:r.reason,
  ms:Number((performance.now()-before).toFixed(2)),candidates:r.bpmCandidates,
  decision:r.decision,beatTracking:r.beatTracking};
}
const rows=[];
for(const item of selected){
 const row={id:item.id,drummer:item.drummer,session:item.session,style:item.style,split,sourceStatus:'available',decoded:false};
 try{
  if(item.files?.audio?.status==='not-in-dataset'){
   row.sourceStatus='audio-not-in-dataset';rows.push(row);console.log(JSON.stringify({id:row.id,status:row.sourceStatus}));continue;
  }
  const midi=verified(item.files?.midi),tempi=midiTempos(midi.bytes);
  if(tempi.length!==1||Math.abs(tempi[0]-Number(item.bpm))>.01)throw Error('No unique matching acquisition tempo');
  row.referenceBpm=tempi[0];row.referenceKind='independent-acquisition-metronome-and-midi';
  const audio=verified(item.files?.audio);row.audioSha256=item.files.audio.sha256;
  const decoded=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error','-i',audio.path,'-t','180','-ar','12000','-ac','1','-f','f32le','pipe:1'],{maxBuffer:12*1024*1024,timeout:60000});
  if(decoded.status!==0)throw Error('FFmpeg decode failed');
  const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
  row.pcmSha256=sha(Buffer.from(pcm.buffer));row.analysisExtentSeconds=pcm.length/12000;row.sampleRate=12000;row.channels=1;row.decoded=true;
  const buffer=pcmBuffer(12000,[pcm]);
  row.engines=[infer('V1-frozen',estimateBaseline,buffer),infer('V2-frozen',estimateV2,buffer),infer('BeatRoot-preview',analyzeBeatTempo,buffer)];
  for(const e of row.engines){
   e.within1=Number.isFinite(e.bpm)&&Math.abs(e.bpm-row.referenceBpm)<=1;
   e.absoluteError=Number.isFinite(e.bpm)?Math.abs(e.bpm-row.referenceBpm):null;
   e.metricalError=e.within1?null:metricalRelation(e.bpm,row.referenceBpm);
   e.accepted=e.status==='estimated'&&!e.requiresReview;
  }
  console.log(JSON.stringify({id:row.id,ref:row.referenceBpm,engines:row.engines.map(e=>({label:e.label,bpm:e.bpm,accepted:e.accepted,reason:e.reason}))}));
 }catch(error){row.error=String(error.message||error);console.error(row.id,row.error)}
 rows.push(row);
}
function wilson(success,n){
 if(!n)return null;
 const z=1.959963984540054,p=success/n,d=1+z*z/n,m=(p+z*z/(2*n))/d,
  h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return [m-h,m+h].map(n=>Number(n.toFixed(4)));
}
const summary={selected:rows.length,audioAvailable:rows.filter(r=>r.sourceStatus==='available').length,
 sourceAbsent:rows.filter(r=>r.sourceStatus!=='available').length,decoded:rows.filter(r=>r.decoded).length,
 errors:rows.filter(r=>r.error).length,engines:[]};
for(const name of ['V1-frozen','V2-frozen','BeatRoot-preview']){
 const all=rows.flatMap(r=>(r.engines||[]).filter(e=>e.label===name)),accepted=all.filter(e=>e.accepted),correct=accepted.filter(e=>e.within1);
 summary.engines.push({name,evaluable:all.length,top1CorrectWithin1:all.filter(e=>e.within1).length,
  assigned:accepted.length,assignedCorrectWithin1:correct.length,reviewOrUnavailable:all.length-accepted.length,
  precision:accepted.length?correct.length/accepted.length:null,precisionWilson95:wilson(correct.length,accepted.length),
  correctCoverageConditionedOnAudio:all.length?correct.length/all.length:null,
  correctCoverageAllSelected:rows.length?correct.length/rows.length:null,
  acceptedMetricalErrors:accepted.filter(e=>['half-double','three-to-two','triple'].includes(e.metricalError)).length,
  averageMs:all.length?all.reduce((s,e)=>s+e.ms,0)/all.length:null});
}
const result={kind:'INDEPENDENT_CLOCK_DIAGNOSTIC_PILOT_NOT_PRODUCT_VALIDATION',split,
 source:manifest.documentation,license:manifest.license,domain:manifest.domain,
 preprocessing:'FFmpeg -> first min(180s,duration), 12000Hz mono float32, no tiling; every engine receives identical PCM',
 comparisonWindows:'Frozen V1/V2 use full extent; preview tracks disjoint fast windows then middle only if useful. Window bounds retained.',
 reference:'Only unique MIDI acquisition tempo matching CSV within .01, independent metronome documented by Google',
 beatgridAccuracy:'Not scored: acquisition clock phase vs musical beat annotations not independently verified',
 policy:BEAT_TRACKER_POLICY,candidateSha256:sha(readFileSync('src/bpm-beat-tracker.mjs')),
 inferenceHashes:Object.fromEntries(['src/bpm-tempo.mjs','src/bpm-tempo-experiment.mjs'].map(p=>[p,sha(readFileSync(p))])),
 uncertainty:'Wilson 95% is descriptive; repeated drummer/session observations are correlated. Not 100 target recordings.',
 resourceObservation:{nodeMaxRssKiB:process.resourceUsage().maxRSS},summary,rows};
const out=resolve(arg('--out',`.private/checkpoints/bpm-resolution-2026-11-23/gmd-${split}.json`));
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log('GMD_SUMMARY',JSON.stringify(summary));
if(summary.errors)process.exitCode=1;
