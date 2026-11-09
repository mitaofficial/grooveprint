/* Shared, audio-free evaluation: fixed denominators, isolated detector inputs, honest failures. */
import {performance} from 'node:perf_hooks';
export const rate=(a,b)=>b?Number((100*a/b).toFixed(2)):null;
export const median=values=>{if(!values.length)return null;const a=values.slice().sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length%2?a[i]:(a[i-1]+a[i])/2};
export function wilson95(successes,n){
 if(!n)return null;
 const z=1.95996398454,p=successes/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return [Math.max(0,100*(center-half)),Math.min(100,100*(center+half))].map(x=>Number(x.toFixed(2)));
}
export function scoreRows(rows,{referenceStatus='verified'}={}){
 const all=rows.filter(r=>r.groundTruthStatus===referenceStatus&&Number.isFinite(r.groundTruthBpm));
 const predicted=all.filter(r=>r.status==='estimated'&&Number.isFinite(r.bpm)),accepted=predicted.filter(r=>!r.requiresReview);
 const good=(r,tol)=>Math.abs(r.bpm-r.groundTruthBpm)<=tol;
 const octave=r=>Math.abs(r.bpm-r.groundTruthBpm/2)<=2||Math.abs(r.bpm-r.groundTruthBpm*2)<=2;
 const correct1=predicted.filter(r=>good(r,1)).length,correct2=predicted.filter(r=>good(r,2)).length;
 const acceptedCorrect=accepted.filter(r=>good(r,1)).length;
 const candidateN=all.filter(r=>(r.candidateBpm||[]).slice(0,8).some(x=>Math.abs(x-r.groundTruthBpm)<=1)).length;
 const nonrhythmic=rows.filter(r=>r.category==='nonrhythmic');
 const falseAccepted=nonrhythmic.filter(r=>r.status==='estimated'&&Number.isFinite(r.bpm)&&!r.requiresReview).length;
 const average=a=>a.length?Number((a.reduce((x,y)=>x+y,0)/a.length).toFixed(4)):null;
 const errors=predicted.map(r=>Math.abs(r.bpm-r.groundTruthBpm));
 return {n:rows.length,groundTruthN:all.length,predictedN:predicted.length,acceptedN:accepted.length,correctWithin1N:correct1,correctWithin2N:correct2,acceptedCorrectWithin1N:acceptedCorrect,
  coveragePct:rate(predicted.length,all.length),autoAcceptedPct:rate(accepted.length,all.length),
  top1Within1Pct:rate(correct1,all.length),top1Within2Pct:rate(correct2,all.length),
  top1ConditionalWithin1Pct:rate(correct1,predicted.length),top1ConditionalWithin2Pct:rate(correct2,predicted.length),
  acceptedWithin1Pct:rate(acceptedCorrect,accepted.length),acceptedWithin2Pct:rate(accepted.filter(r=>good(r,2)).length,accepted.length),
  usefulCorrectCoveragePct:rate(acceptedCorrect,all.length),candidateWithin1N:candidateN,candidateWithin1Pct:rate(candidateN,all.length),candidateK:8,
  octaveErrorN:predicted.filter(octave).length,octaveErrorPct:rate(predicted.filter(octave).length,all.length),
  unflaggedOctaveN:accepted.filter(octave).length,unflaggedOctavePct:rate(accepted.filter(octave).length,accepted.length),
  catastrophicN:predicted.filter(r=>!good(r,5)&&!octave(r)).length,catastrophicPct:rate(predicted.filter(r=>!good(r,5)&&!octave(r)).length,all.length),
  unflaggedOver5N:accepted.filter(r=>!good(r,5)).length,
  reviewN:all.filter(r=>r.requiresReview||r.status==='review').length,reviewPct:rate(all.filter(r=>r.requiresReview||r.status==='review').length,all.length),
  unavailableN:rows.filter(r=>r.status==='unavailable').length,decodeSuccessN:rows.filter(r=>r.status!=='decode-error').length,decodeFailuresN:rows.filter(r=>r.status==='decode-error').length,
  detectorErrorsN:rows.filter(r=>r.status==='detector-error').length,invalidOutputsN:rows.filter(r=>r.status==='invalid-output').length,
  nonrhythmicN:nonrhythmic.length,nonrhythmicFalseAcceptN:falseAccepted,nonrhythmicFalseAcceptPct:rate(falseAccepted,nonrhythmic.length),
  autoPrecisionWilson95Pct:wilson95(acceptedCorrect,accepted.length),top1Wilson95Pct:wilson95(correct1,all.length),
  mae:average(errors),medianAe:median(errors),meanProcessingMs:average(rows.map(r=>r.processingMs).filter(Number.isFinite)),
  medianProcessingMs:median(rows.flatMap(r=>r.processingSamplesMs||[])),meanSampledRssMb:average(rows.map(r=>r.sampledRssMb).filter(Number.isFinite))};
}
const failed=(status,reason)=>({status,bpm:null,requiresReview:false,reason,candidateBpm:[],candidateScores:[]});
export function normalizeOutput(output){
 if(!output||typeof output!=='object'||!['estimated','unavailable','review'].includes(output.status))return failed('invalid-output','invalid-detector-contract');
 if(output.status==='estimated'&&(!Number.isFinite(output.bpm)||output.bpm<20||output.bpm>300||typeof output.requiresReview!=='boolean'))return failed('invalid-output','invalid-estimated-tempo');
 const candidates=(Array.isArray(output.bpmCandidates)?output.bpmCandidates:[]).slice(0,8);
 if(candidates.some(c=>!c||!Number.isFinite(c.bpm)||c.bpm<20||c.bpm>300))return failed('invalid-output','invalid-candidates');
 return {status:output.status,bpm:Number.isFinite(output.bpm)?output.bpm:null,requiresReview:output.requiresReview===true,reason:String(output.reason||'').slice(0,120),
  candidateBpm:candidates.map(c=>c.bpm),candidateScores:candidates.map(c=>Number.isFinite(c.relative)?c.relative:null)};
}
export function copyAudio(buffer){
 const channels=Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c).slice());
 return {sampleRate:buffer.sampleRate,duration:buffer.duration,numberOfChannels:channels.length,getChannelData:c=>channels[c],copiedPcmBytes:channels.reduce((n,c)=>n+c.byteLength,0)};
}
export async function evaluateCase(entry,engines,{repetitions=3,caseIndex=0}={}){
 const meta={id:entry.id,category:entry.category,groundTruthBpm:entry.groundTruthBpm,groundTruthStatus:entry.groundTruthStatus};
 let buffer;const decodeStart=performance.now();
 try{buffer=await entry.getBuffer()}catch{return engines.map(engine=>({...meta,engine:engine.name,...failed('decode-error','decode-failed'),processingMs:0,processingSamplesMs:[],decodeMs:Number((performance.now()-decodeStart).toFixed(3))}))}
 const decodeMs=Number((performance.now()-decodeStart).toFixed(3)),trials=new Map(engines.map(e=>[e.name,[]]));
 for(let repeat=0;repeat<repetitions;repeat++){
  const order=engines.slice();if((caseIndex+repeat)%2)order.reverse();
  for(const engine of order){
   let output,isolated;const copyStart=performance.now();
   try{isolated=copyAudio(buffer)}catch{trials.get(engine.name).push({...failed('decode-error','invalid-decoded-pcm'),ms:0});continue}
   const inputCopyMs=Number((performance.now()-copyStart).toFixed(3)),copiedPcmBytes=isolated.copiedPcmBytes,start=performance.now();
   try{output=normalizeOutput(engine.detector(isolated,engine.options||{}))}catch{output=failed('detector-error','detector-threw')}
   const ms=Number((performance.now()-start).toFixed(3));isolated=null;
   trials.get(engine.name).push({...output,ms,inputCopyMs,copiedPcmBytes,order:order.map(e=>e.name),sampledRssMb:Number((process.memoryUsage().rss/1048576).toFixed(2))});
  }
 }
 buffer=null;
 return engines.map(engine=>{
  const trial=trials.get(engine.name),first=trial[0],different=trial.some(x=>JSON.stringify([x.status,x.bpm,x.requiresReview,x.candidateBpm])!==JSON.stringify([first.status,first.bpm,first.requiresReview,first.candidateBpm]));
  const output=different?failed('invalid-output','nondeterministic-detector-output'):first;
  return {...meta,engine:engine.name,status:output.status,bpm:output.bpm,requiresReview:output.requiresReview,reason:output.reason,candidateBpm:output.candidateBpm,candidateScores:output.candidateScores,
   processingMs:median(trial.map(t=>t.ms)),processingSamplesMs:trial.map(t=>t.ms),sampledRssMb:first.sampledRssMb,decodeMs,inputCopyMs:median(trial.map(t=>t.inputCopyMs).filter(Number.isFinite)),copiedPcmBytes:first.copiedPcmBytes,trialOrder:trial.map(t=>t.order)};
 });
}
