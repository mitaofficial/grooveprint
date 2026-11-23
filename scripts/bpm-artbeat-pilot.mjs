#!/usr/bin/env node
import * as ort from 'onnxruntime-web/wasm';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {analyzeMusicalTempo} from '../src/bpm-musical-engine.mjs';
import {beatFMeasure} from '../src/bpm-beatgrid-metrics.mjs';
const root='.private/benchmarks/artbeat/ARTBeaT_Dataset';
ort.env.wasm.numThreads=1;ort.env.logLevel='error';
const session=await ort.InferenceSession.create(readFileSync('src/models/beat-this-small0/model.onnx'),{executionProviders:['wasm']});
const rows=[];
try{
 for(const name of readdirSync(root+'/Audio').filter(n=>n.endsWith('.wav')).sort()){
  const bytes=readFileSync(root+'/Audio/'+name),decoded=spawnSync('ffmpeg',['-nostdin','-v','error','-i',root+'/Audio/'+name,'-t','180','-ar','22050','-ac','1','-f','f32le','pipe:1'],{maxBuffer:12*1024*1024,timeout:60000});
  if(decoded.status!==0)throw Error('Decode failed: '+name);
  const pcm=new Float32Array(decoded.stdout.buffer.slice(decoded.stdout.byteOffset,decoded.stdout.byteOffset+decoded.stdout.byteLength));
  const start=performance.now(),result=await analyzeMusicalTempo(22050,[pcm],{session,Tensor:ort.Tensor});
  // Reference read AFTER inference; no file name/tempo/GT enters the model.
  const reference=readFileSync(root+'/Annotations/gt_csv/'+name.replace('.wav','_gt.csv'),'utf8').trim().split(/\s+/).map(Number);
  const bounds=result.analysisWindows||[],scope=reference.filter(t=>bounds.some(w=>t>=w.startSeconds&&t<w.endSeconds));
  const predicted=result.beatTracking?.beatTimes||[],f1=beatFMeasure(predicted,scope,{toleranceSeconds:.07});
  const row={id:name.replace('.wav',''),audioSha256:createHash('sha256').update(bytes).digest('hex'),duration:pcm.length/22050,
   result,referenceBeatsInScope:scope.length,beatMetric:f1,ms:performance.now()-start};
  rows.push(row);console.log(JSON.stringify({id:row.id,status:result.status,bpm:result.bpm,reason:result.reason,F1:f1.fMeasure,ms:row.ms}));
 }
}finally{await session.release()}
const totals=rows.reduce((s,r)=>({pred:s.pred+r.beatMetric.estimatedBeats,ref:s.ref+r.beatMetric.referenceBeats,matched:s.matched+r.beatMetric.matchedBeats}),{pred:0,ref:0,matched:0});
const precision=totals.pred?totals.matched/totals.pred:0,recall=totals.ref?totals.matched/totals.ref:0;
const result={kind:'EXTERNAL_AUTHOR_BEAT_TIMESTAMP_DIAGNOSTIC_NOT_TARGET_VALIDATION',source:'https://audiolabs-erlangen.de/resources/MIR/2024-ARTBeaT',license:'CC-BY-4.0',attribution:'Rico Rosenbusch, 2024',
 reference:'Author-provided ground-truth CSV timestamps; not a grid inferred by us; do not assert a new human annotation session',
 audio:'25 short crafted music/rhythm examples, one author and correlated arp family, not full tracks',
 scope:'Only explicitly analyzed disjoint windows; no phase shifting, octave forgiveness or loop repetition',
 trainingOverlap:'ARTBeaT absent from the model documented training list; original composition overlap not formally audited',
 summary:{total:rows.length,assigned:rows.filter(r=>r.result.status==='estimated').length,review:rows.filter(r=>r.result.status==='review').length,
  undetermined:rows.filter(r=>r.result.status==='unavailable').length,meanBeatF1:rows.reduce((n,r)=>n+r.beatMetric.fMeasure,0)/rows.length,
  microBeatF1:precision+recall?2*precision*recall/(precision+recall):0,...totals,nodeMaxRssKiB:process.resourceUsage().maxRSS},rows};
writeFileSync('.private/checkpoints/bpm-resolution-2026-11-23/artbeat-external.json',JSON.stringify(result,null,2)+'\n');console.log('ARTBEAT_SUMMARY',JSON.stringify(result.summary));
