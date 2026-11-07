/**
 * OPEN-AUDIO PILOT — publisher-labelled WaivOps techno drum-loop examples.
 *
 * This is NOT a musical ground-truth benchmark. Labels are authored by the
 * dataset publisher and have NOT been independently confirmed by a DJ.
 *
 * Upstream license: CC BY 4.0. Attribution: WaivOps / Patchbanks,
 * "EDM-TECH Dataset" (2025), doi:10.5281/zenodo.17584890.
 * Source: https://github.com/WaivOps/WaivOps-EDM-TECH
 * Never bundle audio in GROOVEPRINT or publish audio as CI artifacts.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {estimateLocalTempo as original} from '../src/bpm-tempo.mjs';
import {estimateLocalTempo as experimental} from '../src/bpm-tempo-experiment.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(key,fallback)=>{const ix=args.indexOf(key);return ix===-1?fallback:args[ix+1]};
const offline=args.includes('--offline'),dryRun=args.includes('--dry-run');
const maxFiles=Number(arg('--limit','12'));
if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>12)throw Error('--limit must be 1..12');
const target=resolve(project,arg('--out','.private/benchmarks/waivops-pilot'));
const repoCommit='fc8c78939c4cc1ceec664d0ed5feda6b8f44960d';
const base='https://raw.githubusercontent.com/WaivOps/WaivOps-EDM-TECH/'+repoCommit+'/examples/';
const filenames=[
 '128bpm_edm_tech_drm_id_01_003006.mp3',
 '132bpm_edm_tech_drm_id_01_001464.mp3',
 '134bpm_edm_tech_drm_id_01_003606.mp3',
 '135bpm_edm_tech_drm_id_01_000277.mp3',
 '136bpm_edm_tech_drm_id_01_007185.mp3',
 '137bpm_edm_tech_drm_id_01_002435.mp3',
 '138bpm_edm_tech_drm_id_01_007090.mp3',
 '139bpm_edm_tech_drm_id_01_003019.mp3',
 '140bpm_edm_tech_drm_id_01_007923.mp3',
 '142bpm_edm_tech_drm_id_01_000974.mp3',
 '145bpm_edm_tech_drm_id_01_006859.mp3',
 '148bpm_edm_tech_drm_id_01_000161.mp3'
];
const targets=filenames.slice(0,maxFiles);
function labelOf(filename){
 const m=/^(\d{2,3})bpm_edm_tech_drm_id_01_\d{6}\.mp3$/.exec(filename);
 if(!m)throw Error('Unexpected dataset filename; refusing untrusted path');
 return Number(m[1]);
}
function validateAudio(bytes){
 // Detect a plausible MP3 frame or ID3 tag, not a text error page.
 if(bytes.length<16000||bytes.length>800000)throw Error('Example MP3 length outside expected bound');
 const id3=bytes.subarray(0,3).toString('ascii')==='ID3';
 const frame=bytes[0]===0xff&&(bytes[1]&0xe0)===0xe0;
 if(!id3&&!frame)throw Error('File is not a plausible MP3');
}
async function getExample(name){
 const file=resolve(target,'audio',name);
 if(offline){
  const bytes=await readFile(file);validateAudio(bytes);return {file,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
 }
 const url=base+name;
 let data;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const res=await fetch(url,{redirect:'error',headers:{'User-Agent':'GROOVEPRINT-tempo-pilot/1.0'},signal:AbortSignal.timeout(20000)});
   if(!res.ok)throw Error('public-source HTTP '+res.status);
   const claimed=Number(res.headers.get('content-length'));
   if(claimed>800000)throw Error('Source exceeds download budget');
   const buffer=Buffer.from(await res.arrayBuffer());
   validateAudio(buffer);
   data=buffer;break;
  }catch(e){if(attempt===3)throw Error('Unable to retrieve licensed reference sample: '+name+' ('+String(e.message||e)+')')}
 }
 await mkdir(dirname(file),{recursive:true});
 await writeFile(file,data);
 return {file,sha256:createHash('sha256').update(data).digest('hex'),bytes:data.length};
}
function decodeMp3(file){
 // Audio never leaves the runner. Decoded PCM is kept in process memory.
 const rate=12000,channels=2;
 const cmd=spawnSync('ffmpeg',['-nostdin','-v','error','-i',file,'-t','16','-ac',String(channels),'-ar',String(rate),'-f','f32le','pipe:1'],{
  encoding:null,timeout:30000,maxBuffer:16*rate*channels*4+4096
 });
 if(cmd.error||cmd.status!==0||!cmd.stdout?.length)throw Error('FFmpeg decoding failed');
 const bytes=cmd.stdout;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const length=Math.floor(bytes.byteLength/(4*channels));
 if(length<rate*5)throw Error('Decoded sample too short');
 const arrays=Array.from({length:channels},()=>new Float32Array(length));
 for(let i=0;i<length;i++)for(let c=0;c<channels;c++){
  const v=view.getFloat32((i*channels+c)*4,true);
  arrays[c][i]=Number.isFinite(v)?v:0;
 }
 return {rate,channels,arrays,length};
}
function repeatLoop(decoded,minSeconds=20){
 // Four-bar EDM-TECH loops are typically ~6–7.5 s, below V1's 8-s limit.
 // A *repeated loop* is not a full recording. All reports disclose this.
 const {rate,channels,arrays,length}=decoded;
 const repeats=Math.max(1,Math.ceil(minSeconds*rate/length)),newLength=length*repeats;
 const repeated=arrays.map(a=>{const result=new Float32Array(newLength);for(let i=0;i<repeats;i++)result.set(a,i*length);return result});
 return {duration:newLength/rate,sampleRate:rate,numberOfChannels:channels,
  getChannelData:ch=>repeated[ch],originalDuration:length/rate,repeats};
}
function evaluate(model,buffer){
 const t=performance.now();
 const answer=model==='v1'?original(buffer):experimental(buffer);
 const ms=Number((performance.now()-t).toFixed(3));
 return {status:answer.status,bpm:Number.isFinite(answer.bpm)?answer.bpm:null,
  requiresReview:answer.requiresReview===true,reason:String(answer.reason||''),
  candidates:Array.isArray(answer.bpmCandidates)?answer.bpmCandidates.map(x=>x.bpm):[],ms};
}
function metrics(rows,model){
 const matching=rows.map(r=>({label:r.publisherBpm,output:r[model]}));
 const predicted=matching.filter(r=>r.output.status==='estimated'&&Number.isFinite(r.output.bpm));
 const auto=predicted.filter(r=>!r.output.requiresReview);
 const near=(r,n)=>Math.abs(r.output.bpm-r.label)<=n;
 const octave=r=>Math.abs(r.output.bpm-r.label*.5)<=2||Math.abs(r.output.bpm-r.label*2)<=2;
 const fraction=(n,d)=>d?Number((n*100/d).toFixed(2)):null;
 return {sourceLabelCount:rows.length,coveragePct:fraction(predicted.length,rows.length),
  primaryWithin1Pct:fraction(predicted.filter(r=>near(r,1)).length,predicted.length),
  publisherLabelAmongCandidatesPct:fraction(predicted.filter(r=>r.output.candidates.some(c=>Math.abs(c-r.label)<=1)).length,predicted.length),
  octaveErrorPct:fraction(predicted.filter(octave).length,predicted.length),
  unflaggedOctaveCount:auto.filter(octave).length,
  autoAcceptedCount:auto.length,autoAcceptedCoveragePct:fraction(auto.length,rows.length),
  acceptedWithin1Pct:fraction(auto.filter(r=>near(r,1)).length,auto.length)};
}
if(dryRun){
 console.log(JSON.stringify({mode:'DRY_RUN',publisher:'WaivOps/Patchbanks EDM-TECH',license:'CC-BY-4.0',
  type:'PUBLISHER-LABELLED; NOT INDEPENDENTLY VERIFIED',repoCommit,selected:targets.map(filename=>({filename,publisherBpm:labelOf(filename)}))}));
 process.exit(0);
}
await mkdir(target,{recursive:true});
const rows=[],errors=[];
for(let i=0;i<targets.length;i++){
 const name=targets[i],label=labelOf(name);
 try{
  const file=await getExample(name);
  const loop=repeatLoop(decodeMp3(file.file));
  rows.push({id:'waivops_'+String(i+1).padStart(2,'0'),publisherBpm:label,
   audioSha256:file.sha256,sourceName:name,originalDuration:Number(loop.originalDuration.toFixed(3)),
   analysisDuration:Number(loop.duration.toFixed(3)),loopRepetitions:loop.repeats,
   v1:evaluate('v1',loop),v2:evaluate('v2',loop)});
 }catch(error){
  errors.push({id:'waivops_'+String(i+1).padStart(2,'0'),
   error:String(error.message||error).slice(0,160)});
 }
}
const report={schemaVersion:1,validationType:'PUBLISHER_LABEL_ONLY',independentBpmGroundTruth:false,
 audioType:'CC-BY 4.0 real produced four-bar techno loops, repeated as PCM for >8s detector compatibility',
 copyright:'WaivOps / Patchbanks, EDM-TECH Dataset (2025), https://doi.org/10.5281/zenodo.17584890',
 copyrightLicense:'CC BY 4.0',sourceCommit:repoCommit,generatedAt:new Date().toISOString(),
 attempted:targets.length,analyzed:rows.length,errors,
 v1:metrics(rows,'v1'),v2:metrics(rows,'v2'),cases:rows};
await writeFile(resolve(target,'report.json'),JSON.stringify(report,null,2)+'\n');
const table=['# WaivOps EDM-TECH — OPEN AUDIO PILOT','',
 '**Publisher-labelled rhythm loops only; NOT independent ground truth, NOT held-out full-track accuracy.**','',
 'Dataset: WaivOps / Patchbanks EDM-TECH (2025), CC BY 4.0, https://doi.org/10.5281/zenodo.17584890',
 'GitHub source pinned at '+repoCommit,'',
 'Four-bar loop PCM was repeated to accommodate V1/V2 minimum analysis length. This artificially repeats musical content and should not be interpreted as a full-song benchmark.','',
 '| Metric | V1 | V2 |','|---|---:|---:|',
 ...['coveragePct','primaryWithin1Pct','publisherLabelAmongCandidatesPct','octaveErrorPct','unflaggedOctaveCount','autoAcceptedCoveragePct','acceptedWithin1Pct']
 .map(k=>'| '+k+' | '+(report.v1[k]??'N/A')+' | '+(report.v2[k]??'N/A')+' |'),
 '','Analyzed: '+rows.length+'/'+targets.length+'; download/decode errors: '+errors.length,
 '','**Real independent BPM verification: NOT TESTED**. Do not merge the experimental DSP based on this pilot.'];
await writeFile(resolve(target,'report.md'),table.join('\n')+'\n');
console.log(JSON.stringify({kind:'licensed-edm-tech-publisher-label-pilot',independentGroundTruth:false,
 out:relative(project,target),analyzed:rows.length,downloadDecodeErrors:errors.length,v1:report.v1,v2:report.v2}));
// Diagnoses on publisher labels only. No audio or private file metadata in logs.
const sourceLabelMisses=rows.filter(r=>r.v2.status!=='estimated'||Math.abs(r.v2.bpm-r.publisherBpm)>1)
 .map(r=>({id:r.id,publisherBpm:r.publisherBpm,primaryBpm:r.v2.bpm,
   review:r.v2.requiresReview,reason:r.v2.reason,candidates:r.v2.candidates.slice(0,4)}));
console.log(JSON.stringify({kind:'publisher-label-v2-mismatches',count:sourceLabelMisses.length,cases:sourceLabelMisses,
 groundTruthVerified:false}));
if(errors.length)process.exitCode=2;
