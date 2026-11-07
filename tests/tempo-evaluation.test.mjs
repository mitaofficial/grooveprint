import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCase,scoreRows,normalizeOutput} from '../scripts/tempo-evaluation.mjs';
const meta={id:'case',category:'four',groundTruthBpm:140,groundTruthStatus:'verified'};
const estimated=(bpm,requiresReview=false)=>({status:'estimated',bpm,requiresReview,bpmCandidates:[{bpm,relative:.5}]});
const buffer=()=>{const a=new Float32Array([1,2,3]);return {sampleRate:12000,duration:3/12000,numberOfChannels:1,getChannelData:()=>a}};
test('shared denominators retain unavailable, decode, exception and malformed cases; nonrhythmic false accepts are separate',()=>{
 const row=(status,bpm,requiresReview=false)=>({...meta,status,bpm,requiresReview,candidateBpm:bpm===null?[]:[bpm]});
 const rows=[row('estimated',140),row('estimated',70),row('estimated',140,true),row('unavailable',null),row('decode-error',null),row('detector-error',null),row('invalid-output',null),{...row('estimated',120),category:'nonrhythmic',groundTruthBpm:null,groundTruthStatus:'unavailable'}];
 const s=scoreRows(rows);assert.equal(s.groundTruthN,7);assert.equal(s.predictedN,3);assert.equal(s.top1Within1Pct,28.57);assert.equal(s.top1ConditionalWithin1Pct,66.67);
 assert.equal(s.acceptedWithin1Pct,50);assert.equal(s.autoAcceptedPct,28.57);assert.equal(s.usefulCorrectCoveragePct,14.29);
 assert.equal(s.decodeFailuresN,1);assert.equal(s.detectorErrorsN,1);assert.equal(s.invalidOutputsN,1);assert.equal(s.octaveErrorN,1);assert.equal(s.unflaggedOctaveN,1);
 assert.equal(s.nonrhythmicN,1);assert.equal(s.nonrhythmicFalseAcceptN,1);assert.equal(s.nonrhythmicFalseAcceptPct,100);
 const abstain=scoreRows([row('estimated',140,true)]);assert.equal(abstain.acceptedWithin1Pct,null);assert.equal(abstain.autoPrecisionWilson95Pct,null);assert.equal(abstain.autoAcceptedPct,0);
 assert.equal(scoreRows([]).top1Within1Pct,null);
});
test('decode failure produces a row for every engine; exceptions and malformed outputs do not lose cases',async()=>{
 const engines=[{name:'baseline',detector:()=>estimated(140)},{name:'challenger',detector:()=>estimated(140)}];
 const failed=await evaluateCase({...meta,getBuffer:async()=>{throw Error('private file path must not leak')}},engines);
 assert.deepEqual(failed.map(r=>[r.engine,r.status]),[['baseline','decode-error'],['challenger','decode-error']]);
 assert.ok(!JSON.stringify(failed).includes('private file path'));
 const outputs=await evaluateCase({...meta,getBuffer:async()=>buffer()},[{name:'throws',detector:()=>{throw Error('private')}},{name:'malformed',detector:()=>({status:'estimated',bpm:NaN})}]);
 assert.deepEqual(outputs.map(r=>r.status),['detector-error','invalid-output']);
 assert.equal(normalizeOutput({status:'estimated',bpm:140,requiresReview:false,bpmCandidates:[{bpm:Infinity}]}).status,'invalid-output');
});
test('each detector receives an independent PCM copy, alternating order and raw repetitions are recorded',async()=>{
 const original=buffer(),seen=[];
 const rows=await evaluateCase({...meta,getBuffer:async()=>original},[
  {name:'mutator',detector:b=>{seen.push('mutator');b.getChannelData(0)[0]=999;return estimated(140)}},
  {name:'reader',detector:b=>{seen.push('reader');assert.equal(b.getChannelData(0)[0],1);return estimated(140)}}
 ],{repetitions:3});
 assert.equal(original.getChannelData(0)[0],1);assert.deepEqual(seen,['mutator','reader','reader','mutator','mutator','reader']);
 for(const r of rows){assert.equal(r.processingSamplesMs.length,3);assert.equal(r.copiedPcmBytes,12);assert.equal(r.status,'estimated')}
});
