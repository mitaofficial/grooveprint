/**
 * Private-only, rights-aware V1/V2/V3/V4 comparison with independently
 * annotated beat timestamps. Explicitly no network/audio upload.
 * This is a research tool, NOT called from the Grooveprint web product.
 *
 * Usage:
 * node scripts/bpm-v4-verified-eval.mjs --manifest .private/tempo-dataset/verified-beatgrids.json
 *     [--split development|validation|holdout] [--allow-holdout]
 *
 * `ffmpeg` must already be installed locally. The original files never
 * leave the host and are never saved to report artifacts.
 */
import {readFile,mkdir,writeFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve,dirname,relative,sep,extname} from 'node:path';
import {performance} from 'node:perf_hooks';
import {auditBeatCorpus} from '../src/bpm-corpus-policy.mjs';
import {beatFMeasure} from '../src/bpm-beatgrid-metrics.mjs';
import {analyzeTempoComparison} from '../src/bpm-compare-v3.mjs';
import {evaluateBeatGridOnsets} from '../src/bpm-beatgrid-v4.mjs';
const args=process.argv.slice(2);
const flag=k=>args.includes(k),value=(key,fallback)=>{const n=args.indexOf(key);return n<0?fallback:args[n+1]};
const manifestFile=resolve(value('--manifest','.private/tempo-dataset/verified-beatgrids.json'));
const onlySplit=value('--split','development');
if(!['development','validation','holdout'].includes(onlySplit))throw Error('Invalid split');
if(onlySplit==='holdout'&&!flag('--allow-holdout'))
 throw Error('Final holdout access requires explicit --allow-holdout after freezing the algorithm');
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
const audit=auditBeatCorpus(manifest);
if(!audit.valid)throw Error('Corpus audit failed: '+audit.problems.slice(0,20).join('; '));
const selected=manifest.tracks.filter(r=>r.split===onlySplit);
if(!selected.length)throw Error('No eligible records in split: '+onlySplit);
const root=await realpath(dirname(manifestFile));
async function safePath(file){
 const target=await realpath(resolve(root,file));
 if(relative(root,target).startsWith('..'+sep)||relative(root,target)==='..')
  throw Error('Audio escaped private manifest root');
 const meta=await stat(target);
 if(!meta.isFile()||meta.size<1000||meta.size>256*1024*1024)
  throw Error('Audio file size/type not permitted');
 if(!/\.(wav|flac|mp3|ogg|opus|m4a|aif|aiff)$/i.test(extname(target)))
  throw Error('Unsupported audio type');
 return target;
}
async function shaFile(path){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
function decode(file){
 const sr=12000,ch=2,seconds=180,limit=seconds*sr*ch*4+1024*1024;
 const result=spawnSync('ffmpeg',['-nostdin','-hide_banner','-v','error',
  '-i',file,'-t',String(seconds),'-ar',String(sr),'-ac',String(ch),
  '-f','f32le','-acodec','pcm_f32le','pipe:1'],
 {maxBuffer:limit,timeout:180000});
 if(result.error||result.status!==0||!result.stdout.length)throw Error('Local decoder failed');
 const b=result.stdout,n=Math.floor(b.byteLength/4/ch);
 if(n/sr<8)throw Error('Less than 8 seconds of valid audio');
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 const channels=Array.from({length:ch},()=>new Float32Array(n));
 for(let i=0;i<n;i++)for(let c=0;c<ch;c++)channels[c][i]=view.getFloat32((i*ch+c)*4,true);
 return {sr,channels};
}
const outDir=resolve(value('--out','.private/benchmarks/v4-verified-'+onlySplit));
if(!relative(resolve('.private/benchmarks'),outDir)||
 relative(resolve('.private/benchmarks'),outDir).startsWith('..')||
 relative(resolve('.private/benchmarks'),outDir).startsWith(sep))
 throw Error('Output must be a distinct directory inside .private/benchmarks');
const cases=[];
for(const item of selected){
 const started=performance.now();
 const file=await safePath(item.file);
 const hash=await shaFile(file);
 if(hash.toLowerCase()!==item.sha256.toLowerCase())
  throw Error('Audio SHA-256 mismatch for '+item.id+'; refusing uncertain version/recording');
 const {sr,channels}=decode(file);
 // Every engine sees the SAME decoded PCM, but receives an independent copy.
 const v3=analyzeTempoComparison(sr,channels.map(c=>c.slice()));
 const input={sampleRate:sr,duration:channels[0].length/sr,numberOfChannels:channels.length,
  getChannelData:i=>channels[i]};
 const v4=evaluateBeatGridOnsets(input);
 const grid=v4.candidateGrids[0];
 // The CLI deliberately decodes at most 180 seconds; a long recording's
 // reference beats outside this interval must not count as missed predictions.
 // Compare on the identical observed interval, and surface its coverage.
 const analyzedSeconds=channels[0].length/sr;
 const beatsInAnalyzedSpan=item.referenceBeatTimesSeconds.filter(t=>t<=analyzedSeconds);
 if(beatsInAnalyzedSpan.length<8)throw Error('Too few independently annotated beats in analyzed PCM window: '+item.id);
 const gridF=grid?beatFMeasure(grid.beatTimes,beatsInAnalyzedSpan):null;
 const correct=(bpm,tol)=>Number.isFinite(bpm)&&Number.isFinite(item.groundTruthBpm)&&Math.abs(bpm-item.groundTruthBpm)<=tol;
 cases.push({id:item.id,split:item.split,recordingGroup:item.recordingGroup,
  referenceType:item.verificationMethod,referenceBeatN:item.referenceBeatTimesSeconds.length,
  referenceBeatsInAnalyzedSpan:beatsInAnalyzedSpan.length,
  referenceFractionWithinAnalyzedSpan:beatsInAnalyzedSpan.length/item.referenceBeatTimesSeconds.length,
  referenceBpm:item.groundTruthBpm??null,
  v1Bpm:v3.comparisons[0].bpm,v2Bpm:v3.comparisons[1].bpm,
  v3Bpm:v3.decision.suggestedBpm,v3Status:v3.decision.status,
  v4Bpm:v4.suggestedBpm,v4Status:v4.status,reason:v4.reason,
  v4BeatFMeasure:gridF?.fMeasure??null,
  v4BeatPrecision:gridF?.precision??null,v4BeatRecall:gridF?.recall??null,
  v4MatchedBeats:gridF?.matchedBeats??0,
  within1Bpm:{v1:correct(v3.comparisons[0].bpm,1),v2:correct(v3.comparisons[1].bpm,1),
   v3:correct(v3.decision.suggestedBpm,1),v4:correct(v4.suggestedBpm,1)},
  audioSecondsAnalyzed:analyzedSeconds,
  elapsedMs:Math.round(performance.now()-started)});
}
function summary(label){
 const key=label.toLowerCase()+'Bpm';
 // Beat annotations can be valid for tempo-changing tracks that have NO
 // single scalar BPM. Keep those in F-measure but not in ±1 BPM denominators.
 const scalar=cases.filter(r=>Number.isFinite(r.referenceBpm));
 const proposed=scalar.filter(r=>Number.isFinite(r[key]));
 return {scalarReferenceN:scalar.length,proposed:proposed.length,
  precisionOnProposals:proposed.length?proposed.filter(r=>r.within1Bpm[label.toLowerCase()]).length/proposed.length:null,
  correctCoverage:scalar.length?scalar.filter(r=>r.within1Bpm[label.toLowerCase()]).length/scalar.length:null};
}
const report={kind:'PRIVATE_AUDIO_INDEPENDENT_BEAT_REFERENCE',split:onlySplit,
 disclaimers:['The beat timestamp annotations and rights were declared in the manifest and require human auditing.',
  'All detectors operated on at most the first 180 seconds of an exact SHA-256-checked file.',
  'V4 has NOT been trained or validated for production; candidate grids are research-only.',
  'No confidence percentage is calibrated; scalar BPM accuracy excludes variable-tempo tracks without scalar reference.'],
 referenceRows:cases.length,summary:Object.fromEntries(['V1','V2','V3','V4'].map(s=>[s,summary(s)])),
 beatGrid:{withGrid:cases.filter(r=>r.v4BeatFMeasure!==null).length,
  meanFMeasure:(()=>{const a=cases.filter(r=>r.v4BeatFMeasure!==null);return a.length?a.reduce((s,r)=>s+r.v4BeatFMeasure,0)/a.length:null})()},
 cases};
await mkdir(outDir,{recursive:true});
await writeFile(resolve(outDir,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('V4_VERIFIED_BEAT_CORPUS',JSON.stringify({split:onlySplit,
 summary:report.summary,beatGrid:report.beatGrid,reportPath:relative(resolve('.'),resolve(outDir,'report.json'))}));
