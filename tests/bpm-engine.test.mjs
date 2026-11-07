import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {estimateBaseline,tempoResult,pcmBuffer} from '../src/bpm-engine.mjs';
import {estimateLocalTempo as original} from '../src/bpm-tempo.mjs';
import {estimateLocalTempo as estimateExperiment} from '../src/bpm-tempo-experiment.mjs';
const audio=()=>pcmBuffer(12000,[Float32Array.from({length:12000*12},(_,i)=>Math.exp(-(i%5200)/30)*.8)]);
test('shared baseline contract preserves detector results and identifies the analyzed interval',()=>{
 const b=audio(),raw=original(b),wrapped=estimateBaseline(b);
 assert.equal(wrapped.bpm,raw.bpm);assert.equal(wrapped.requiresReview,raw.requiresReview);assert.equal(wrapped.reason,raw.reason);
 assert.equal(wrapped.algorithm,'grooveprint-onset-acf-v1');assert.equal(wrapped.confidence,null);
 assert.deepEqual(wrapped.analysisWindow,{startSeconds:0,endSeconds:12});
 assert.ok(wrapped.bpmCandidates.every(c=>c.algorithm===wrapped.algorithm));
});
test('worker contract rejects mismatched channels and never invents a value on unavailable audio',()=>{
 assert.throws(()=>pcmBuffer(12000,[new Float32Array(10),new Float32Array(20)]));
 const b=pcmBuffer(12000,[new Float32Array(12000)]),r=tempoResult(original(b),b,'grooveprint-onset-acf-v1');
 assert.equal(r.status,'unavailable');assert.equal(r.bpm,null);assert.deepEqual(r.bpmCandidates,[]);
});
test('development comparison runs both actual engines on independent PCM and always requires an explicit choice',()=>{
 let result;const b=audio();
 const context={estimateBaseline,tempoResult,pcmBuffer,estimateExperiment,Float32Array,Number,Array,self:{postMessage:x=>result=x.result}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../src/bpm-worker-dev.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,''),context);
 const before=b.getChannelData(0).slice();context.self.onmessage({data:{id:1,sampleRate:12000,channels:[b.getChannelData(0)]}});
 assert.equal(result.comparisons.length,2);assert.equal(result.requiresReview,true);assert.equal(result.confidence,null);
 assert.equal(result.comparisons[0].algorithm,'grooveprint-onset-acf-v1');assert.equal(result.comparisons[1].algorithm,'grooveprint-onset-acf-v2-experimental');
 assert.deepEqual(b.getChannelData(0),before);
});
