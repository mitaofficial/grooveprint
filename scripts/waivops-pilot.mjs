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
import {fileURLToPath,pathToFileURL} from 'node:url';
import {evaluateCase,scoreRows} from './tempo-evaluation.mjs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';
import {estimateLocalTempo as original} from '../src/bpm-tempo.mjs';
import {estimateLocalTempo as experimental,TEMPO_PARAMETERS} from '../src/bpm-tempo-experiment.mjs';
import {analyzeTempoComparison} from '../src/bpm-compare-v3.mjs';
import {evaluateBeatGridOnsets} from '../src/bpm-beatgrid-v4.mjs';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
const arg=(key,fallback)=>{const ix=args.indexOf(key);return ix===-1?fallback:args[ix+1]};
const offline=args.includes('--offline'),dryRun=args.includes('--dry-run');
const maxFiles=Number(arg('--limit','31'));
if(!Number.isInteger(maxFiles)||maxFiles<1||maxFiles>31)throw Error('--limit must be 1..31');
const target=resolve(project,arg('--out','.private/benchmarks/waivops-pilot'));
const repoCommit='fc8c78939c4cc1ceec664d0ed5feda6b8f44960d';
const base='https://raw.githubusercontent.com/WaivOps/WaivOps-EDM-TECH/'+repoCommit+'/examples/';
const filenames=[
 '128bpm_edm_tech_drm_id_01_003006.mp3',
 '128bpm_edm_tech_drm_id_01_005911.mp3',
 '128bpm_edm_tech_drm_id_01_007859.mp3',
 '128bpm_edm_tech_drm_id_01_008613.mp3',
 '132bpm_edm_tech_drm_id_01_001464.mp3',
 '132bpm_edm_tech_drm_id_01_003230.mp3',
 '132bpm_edm_tech_drm_id_01_004572.mp3',
 '132bpm_edm_tech_drm_id_01_009400.mp3',
 '134bpm_edm_tech_drm_id_01_003606.mp3',
 '135bpm_edm_tech_drm_id_01_000277.mp3',
 '135bpm_edm_tech_drm_id_01_000441.mp3',
 '135bpm_edm_tech_drm_id_01_007580.mp3',
 '135bpm_edm_tech_drm_id_01_009367.mp3',
 '136bpm_edm_tech_drm_id_01_007185.mp3',
 '136bpm_edm_tech_drm_id_01_007391.mp3',
 '137bpm_edm_tech_drm_id_01_002435.mp3',
 '137bpm_edm_tech_drm_id_01_006554.mp3',
 '137bpm_edm_tech_drm_id_01_006791.mp3',
 '137bpm_edm_tech_drm_id_01_009204.mp3',
 '137bpm_edm_tech_drm_id_01_010182.mp3',
 '138bpm_edm_tech_drm_id_01_007090.mp3',
 '139bpm_edm_tech_drm_id_01_003019.mp3',
 '139bpm_edm_tech_drm_id_01_007884.mp3',
 '140bpm_edm_tech_drm_id_01_007923.mp3',
 '140bpm_edm_tech_drm_id_01_008429.mp3',
 '142bpm_edm_tech_drm_id_01_000974.mp3',
 '142bpm_edm_tech_drm_id_01_003541.mp3',
 '142bpm_edm_tech_drm_id_01_010242.mp3',
 '145bpm_edm_tech_drm_id_01_006859.mp3',
 '148bpm_edm_tech_drm_id_01_000161.mp3',
 '148bpm_edm_tech_drm_id_01_005851.mp3'
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
function metrics(rows,model){
 const evaluated=rows.map(r=>{
  const out=r[model]||{status:'unavailable',bpm:null,requiresReview:true,reason:'no-decoded-audio'};
  return {id:r.id,category:'techno-loop',groundTruthBpm:r.publisherBpm,
   groundTruthStatus:'publisher-labelled',...out,candidateBpm:out.candidateBpm||out.candidates||[]};
 });
 const scored=scoreRows(evaluated,{referenceStatus:'publisher-labelled'});
 return {sourceLabelCount:rows.length,coveragePct:scored.coveragePct,primaryWithin1Pct:scored.top1Within1Pct,
  primaryConditionalWithin1Pct:scored.top1ConditionalWithin1Pct,publisherLabelAmongCandidatesPct:scored.candidateWithin1Pct,
  octaveErrorPct:scored.octaveErrorPct,unflaggedOctaveCount:scored.unflaggedOctaveN,autoAcceptedCount:scored.acceptedN,
  autoAcceptedCoveragePct:scored.autoAcceptedPct,acceptedWithin1Pct:scored.acceptedWithin1Pct,
  usefulCorrectCoveragePct:scored.usefulCorrectCoveragePct,autoPrecisionWilson95Pct:scored.autoPrecisionWilson95Pct,allMetrics:scored};
}
if(dryRun){
 console.log(JSON.stringify({mode:'DRY_RUN',publisher:'WaivOps/Patchbanks EDM-TECH',license:'CC-BY-4.0',
  type:'PUBLISHER-LABELLED; NOT INDEPENDENTLY VERIFIED',repoCommit,selected:targets.map(filename=>({filename,publisherBpm:labelOf(filename)}))}));
 process.exit(0);
}
await mkdir(target,{recursive:true});
const comparePath=arg('--compare','src/bpm-tempo-experiment.mjs');
const fullCompare=resolve(project,comparePath);
if(relative(project,fullCompare).startsWith('..'))throw Error('Comparison module must stay within project');
const challenger=comparePath==='src/bpm-tempo-experiment.mjs'?experimental:(await import(pathToFileURL(fullCompare).href)).estimateLocalTempo;
if(typeof challenger!=='function')throw Error('Comparison module must export estimateLocalTempo');
const selection=arg('--selection','default');
if(!['default','baseline','band-agreement'].includes(selection))throw Error('Invalid selection mode');
const defaults=comparePath==='src/bpm-tempo-experiment.mjs'?TEMPO_PARAMETERS:{};
const options={...defaults,...(selection==='default'?{}:{selectionMode:selection}),...(args.includes('--harmonic-refinement')?{harmonicRefinement:true}:{})};
const engines=[{name:'v1',detector:original},{name:'v2',detector:challenger,options}];
const rows=[],errors=[],includeV3=args.includes('--v3'),includeV4=args.includes('--v4');
for(let i=0;i<targets.length;i++){
 const name=targets[i],label=labelOf(name),id='waivops_'+String(i+1).padStart(2,'0');
 let file,loop;
 const results=await evaluateCase({id,category:'techno-loop',groundTruthBpm:label,groundTruthStatus:'publisher-labelled',getBuffer:async()=>{
  file=await getExample(name);loop=repeatLoop(decodeMp3(file.file));return loop;
 }},engines,{repetitions:3,caseIndex:i});
 if(results.some(r=>['decode-error','detector-error','invalid-output'].includes(r.status)))errors.push({id,error:'input-or-detector-failed'});
 let v3=null;
 if(includeV3&&loop){
  try{
   const input=Array.from({length:Math.min(2,loop.numberOfChannels)},(_,i)=>loop.getChannelData(i).slice());
   const result=analyzeTempoComparison(loop.sampleRate,input),d=result.decision;
   v3={status:['supported','provisional'].includes(d.status)?'estimated':'unavailable',bpm:d.suggestedBpm,
    decisionStatus:d.status,indicativeOnly:d.status==='provisional',
    v2SelectedFromHarmonic:result.comparisons[1].selectedFromHarmonic,v2HarmonicFactor:result.comparisons[1].harmonicFactor,
    requiresReview:true,reason:d.reason,candidateBpm:d.suggestedBpm===null?[]:[d.suggestedBpm],
    evidence:{...d.evidence},developmentOnly:true};
  }catch(e){v3={status:'detector-error',bpm:null,requiresReview:true,candidateBpm:[],reason:'v3-processing-failed'};
   errors.push({id,error:'v3-processing-failed'});}
 }
 let v4=null;
 if(includeV4&&loop){
  try{
   const outcome=evaluateBeatGridOnsets(loop);
   v4={status:outcome.status==='provisional'?'estimated':'unavailable',
    bpm:outcome.suggestedBpm,decisionStatus:outcome.status,requiresReview:true,
    reason:outcome.reason,candidateBpm:outcome.candidateGrids.map(g=>g.bpm),
    beatGridSummary:outcome.metrics||null,developmentOnly:true};
  }catch(error){v4={status:'detector-error',bpm:null,requiresReview:true,
    candidateBpm:[],reason:'v4-processing-failed'};
   errors.push({id,error:'v4-processing-failed'});}
 }
 rows.push({id,publisherBpm:label,audioSha256:file?.sha256||null,sourceName:name,originalDuration:loop?Number(loop.originalDuration.toFixed(3)):null,
  analysisDuration:loop?Number(loop.duration.toFixed(3)):null,loopRepetitions:loop?.repeats||0,
  ...Object.fromEntries(results.map(r=>[r.engine,{...r,candidates:r.candidateBpm,ms:r.processingMs}])),
  ...(includeV3?{v3}:{} ),...(includeV4?{v4}:{})});
}
const analyzed=rows.filter(r=>r.v1.status!=='decode-error').length;
const algorithmMetadata={};
for(const [name,path] of [['v1','src/bpm-tempo.mjs'],['v2',comparePath]])algorithmMetadata[name]={module:path,sha256:createHash('sha256').update(await readFile(resolve(project,path))).digest('hex'),options:name==='v2'?options:{}};
if(includeV3)algorithmMetadata.v3={module:'src/bpm-compare-v3.mjs',sha256:createHash('sha256').update(await readFile(resolve(project,'src/bpm-compare-v3.mjs'))).digest('hex'),decisionModule:'src/bpm-decision.mjs',decisionSha256:createHash('sha256').update(await readFile(resolve(project,'src/bpm-decision.mjs'))).digest('hex'),options:{experimental:true,reviewOnly:true}};
if(includeV4)algorithmMetadata.v4={module:'src/bpm-beatgrid-v4.mjs',sha256:createHash('sha256').update(await readFile(resolve(project,'src/bpm-beatgrid-v4.mjs'))).digest('hex'),options:{researchOnly:true,reviewOnly:true}};
const report={schemaVersion:includeV4?4:includeV3?3:2,engines:algorithmMetadata,repetitions:3,node:process.version,timingMethod:'Independent PCM copies, alternating order per case/repetition',validationType:'PUBLISHER_LABEL_ONLY',independentBpmGroundTruth:false,
 audioType:'CC-BY 4.0 real produced four-bar techno loops, repeated as PCM for >8s detector compatibility',
 copyright:'WaivOps / Patchbanks, EDM-TECH Dataset (2025), https://doi.org/10.5281/zenodo.17584890',
 copyrightLicense:'CC BY 4.0',sourceCommit:repoCommit,generatedAt:new Date().toISOString(),
 attempted:targets.length,analyzed,errors,
 v1:metrics(rows,'v1'),v2:metrics(rows,'v2'),...(includeV3?{v3:metrics(rows,'v3')}:{}) ,...(includeV4?{v4:metrics(rows,'v4')}:{}) ,cases:rows};
await writeFile(resolve(target,'report.json'),JSON.stringify(report,null,2)+'\n');
const table=['# WaivOps EDM-TECH — OPEN AUDIO PILOT','',
 '**Publisher-labelled rhythm loops only; NOT independent ground truth, NOT held-out full-track accuracy.**','',
 'Dataset: WaivOps / Patchbanks EDM-TECH (2025), CC BY 4.0, https://doi.org/10.5281/zenodo.17584890',
 'GitHub source pinned at '+repoCommit,'',
 'Four-bar loop PCM was repeated to accommodate V1/V2 minimum analysis length. This artificially repeats musical content and should not be interpreted as a full-song benchmark.','',
 '| Metric | V1 | V2 |'+(includeV3?' V3 |':'')+(includeV4?' V4 |':''),
 '|---|---:|---:|'+(includeV3?'---:|':'')+(includeV4?'---:|':''),
 ...['coveragePct','primaryWithin1Pct','publisherLabelAmongCandidatesPct','octaveErrorPct','unflaggedOctaveCount','autoAcceptedCoveragePct','acceptedWithin1Pct']
 .map(k=>'| '+k+' | '+(report.v1[k]??'N/A')+' | '+(report.v2[k]??'N/A')+' |'+
  (includeV3?' '+(report.v3[k]??'N/A')+' |':'')+(includeV4?' '+(report.v4[k]??'N/A')+' |':'')),
 '','Analyzed: '+analyzed+'/'+targets.length+'; download/decode errors: '+errors.length,
 '','**Real independent BPM verification: NOT TESTED**. Do not merge the experimental DSP based on this pilot.'];
await writeFile(resolve(target,'report.md'),table.join('\n')+'\n');
console.log(JSON.stringify({kind:'licensed-edm-tech-publisher-label-pilot',independentGroundTruth:false,
 out:relative(project,target),analyzed,downloadDecodeErrors:errors.length,v1:report.v1,v2:report.v2,...(includeV3?{v3:report.v3}:{} ),...(includeV4?{v4:report.v4}:{} )}));
// Diagnoses on publisher labels only. No audio or private file metadata in logs.
const sourceLabelMisses=rows.filter(r=>r.v2.status!=='estimated'||Math.abs(r.v2.bpm-r.publisherBpm)>1)
 .map(r=>({id:r.id,publisherBpm:r.publisherBpm,primaryBpm:r.v2.bpm,
   review:r.v2.requiresReview,reason:r.v2.reason,candidates:r.v2.candidates.slice(0,4)}));
console.log(JSON.stringify({kind:'publisher-label-v2-mismatches',count:sourceLabelMisses.length,cases:sourceLabelMisses,
 groundTruthVerified:false}));
if(includeV3)console.log('V3_LABEL_DIAGNOSTICS',JSON.stringify(rows.map(r=>({
 id:r.id,referenceLabel:r.publisherBpm,v1Bpm:r.v1.bpm,v2Bpm:r.v2.bpm,
 v2Review:r.v2.requiresReview,v2SelectedFromHarmonic:r.v3.v2SelectedFromHarmonic,v2HarmonicFactor:r.v3.v2HarmonicFactor,v3Status:r.v3.decisionStatus,v3IndicativeOnly:r.v3.indicativeOnly,v3Bpm:r.v3.bpm,
 reason:r.v3.reason,metricalRelation:r.v3.evidence?.metricalRelation,
 windowBpm:r.v3.evidence?.windows?.map(w=>w.bpm),
 windowsConsistent:r.v3.evidence?.windowsConsistent
}))));
if(errors.length)process.exitCode=2;

if(includeV4)console.log('V4_LABEL_DIAGNOSTICS',JSON.stringify(rows.map(r=>({
 id:r.id,publisherBpm:r.publisherBpm,v2Bpm:r.v2.bpm,v3Bpm:r.v3?.bpm,
 v4Status:r.v4?.decisionStatus,v4Bpm:r.v4?.bpm,
 v4Reason:r.v4?.reason,v4BeatGrid:r.v4?.beatGridSummary
}))));
