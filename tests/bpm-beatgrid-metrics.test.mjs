import test from 'node:test';
import assert from 'node:assert/strict';
import {beatFMeasure} from '../src/bpm-beatgrid-metrics.mjs';
test('independently annotated exact beatgrid scores 1',()=>{
 const beats=Array.from({length:40},(_,i)=>i*.5);
 const r=beatFMeasure(beats,beats);
 assert.equal(r.matchedBeats,40);
 assert.equal(r.precision,1);assert.equal(r.recall,1);assert.equal(r.fMeasure,1);
 assert.equal(r.meanAbsoluteTimingErrorSeconds,0);
});
test('missing half the beats cannot earn full F-measure by matching only some beat positions',()=>{
 const beats=Array.from({length:40},(_,i)=>i*.5);
 const half=beats.filter((_,i)=>i%2===0);
 const r=beatFMeasure(half,beats);
 assert.equal(r.matchedBeats,20);
 assert.equal(r.precision,1);assert.equal(r.recall,.5);
 assert.ok(Math.abs(r.fMeasure-2/3)<1e-12);
});
test('double-time event stream is penalized for its additional incorrect beat positions',()=>{
 const reference=Array.from({length:40},(_,i)=>i*.5);
 const doubled=Array.from({length:80},(_,i)=>i*.25);
 const r=beatFMeasure(doubled,reference);
 assert.equal(r.matchedBeats,40);assert.equal(r.precision,.5);assert.equal(r.recall,1);
 assert.ok(Math.abs(r.fMeasure-2/3)<1e-12);
});
test('wrong beat phase is penalized even when global BPM is numerically identical',()=>{
 const reference=Array.from({length:40},(_,i)=>i*.5);
 const phaseShift=reference.map(x=>x+.20);
 const r=beatFMeasure(phaseShift,reference);
 assert.equal(r.matchedBeats,0);assert.equal(r.fMeasure,0);
});
test('matching tolerates small timing jitter, records absolute alignment error',()=>{
 const ref=Array.from({length:20},(_,i)=>i*.5);
 const est=ref.map((x,i)=>x+(i%2===0?.025:-.025));
 const r=beatFMeasure(est,ref);
 assert.equal(r.matchedBeats,20);
 assert.ok(Math.abs(r.meanAbsoluteTimingErrorSeconds-.025)<1e-9);
});
test('no estimates, no references and invalid timestamps are distinguishable',()=>{
 assert.equal(beatFMeasure([],Array.from({length:8},(_,i)=>i)).recall,0);
 assert.equal(beatFMeasure([],[]).fMeasure,0);
 assert.throws(()=>beatFMeasure([1,1],[1]),/duplicate/i);
 assert.throws(()=>beatFMeasure([NaN],[1]),/finite/i);
 assert.throws(()=>beatFMeasure([1],[1],{toleranceSeconds:1}),/Tolerance/);
});
