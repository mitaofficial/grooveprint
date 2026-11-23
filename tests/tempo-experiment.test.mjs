import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateLocalTempo} from '../src/bpm-tempo-experiment.mjs';
import {synthesize,noBeat} from '../scripts/tempo-synthetic.mjs';
test('band agreement selects the faster pulse of constructed alternating bass accents without a tempo-range prior',()=>{
 // Both periods are present. The faster pulse is supported by both bands;
 // this is a signal construction test, not independent music validation.
 for(const bpm of [63,79,107,131,157,181]){
  const audio=synthesize('band_'+bpm,bpm,'hats-dominant');
  const estimate=estimateLocalTempo(audio);
  assert.ok(Math.abs(estimate.bpm-bpm)<=1,JSON.stringify({bpm,result:estimate.bpm}));
  assert.equal(estimate.confidence,null);
 }
});
test('sparse octave alternatives are never auto-accepted in new phase/tempo regression controls',()=>{
 for(const bpm of [131,149,157,197,207]){
  const audio=synthesize('synth_'+bpm+'_sparse|followup-20261107',bpm,'sparse');
  const estimate=estimateLocalTempo(audio);
  assert.equal(estimate.requiresReview,true,'unresolved alternate pulse at '+bpm);
  assert.ok(estimate.bpmCandidates.some(c=>Math.abs(c.bpm-bpm)<1));
 }
 assert.equal(estimateLocalTempo(noBeat('steady-tone-control')).status,'unavailable');
});
