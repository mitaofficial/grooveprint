import test from 'node:test';
import assert from 'node:assert/strict';
import {DECISION_VERSION,DECISION_RULES,metricalRelation,decideTempo} from '../src/bpm-decision.mjs';
const score=(bpm,requiresReview=false)=>({status:'estimated',bpm,requiresReview});
const segment=(bpm,startSeconds)=>({...score(bpm),startSeconds,endSeconds:startSeconds+12});
test('3:2 metrical conflict is not incorrectly classified as half/double time',()=>{
 assert.equal(metricalRelation(100,66.7),'three-to-two');
 assert.equal(metricalRelation(70,140),'half-double');
 assert.equal(metricalRelation(100,99.84),'same-pulse');
});
test('user-observed Fight the Sea V1/V2 conflict abstains instead of suggesting 100 or 66.7',()=>{
 const d=decideTempo({v1:score(100),v2:score(66.7),
  windows:[segment(100,0),segment(100.2,70),segment(99.8,150)]});
 assert.equal(d.version,DECISION_VERSION);
 assert.equal(d.status,'ambiguous');
 assert.equal(d.suggestedBpm,null);
 assert.equal(d.reason,'discordant-three-to-two');
 assert.equal(d.evidence.metricalRelation,'three-to-two');
 assert.deepEqual(d.alternatives.map(x=>x.bpm),[100,66.7]);
 assert.equal(d.requiresReview,true);
 assert.equal(d.evidence.scoreIsProbability,false);
});
test('a single supported proposal requires agreement from both engines AND temporal segments',()=>{
 const d=decideTempo({v1:score(140),v2:score(140.15),
  windows:[segment(140.2,0),segment(139.9,30),segment(140,60)]});
 assert.equal(d.status,'supported');
 assert.ok(d.suggestedBpm>=139&&d.suggestedBpm<=141);
 assert.equal(d.alternatives.length,0);
 assert.equal(d.evidence.windowsConsistent,3);
 assert.equal(d.confidenceStatus,'cross-checked-not-calibrated');
 assert.equal(d.requiresReview,true);
 assert.ok(!('confidence' in d),'must never fabricate confidence percentages');
});
test('good agreement alone is insufficient with conflicting or absent audio sections',()=>{
 for(const windows of [[],[segment(140,0)], [segment(140,0),segment(95,12)],
  [segment(140,0),{status:'unavailable',bpm:null,startSeconds:30,endSeconds:40}]]){
  const d=decideTempo({v1:score(140),v2:score(140),windows});
  assert.equal(d.status,'ambiguous');
  assert.equal(d.suggestedBpm,null);
  assert.equal(d.reason,'temporal-consistency-not-established');
 }
 assert.ok(DECISION_RULES.minConsistentSegments>=2);
});
test('no beat is undetermined; a single engine output is explicitly insufficient',()=>{
 const none=decideTempo({v1:{status:'unavailable'},v2:{status:'unavailable'}});
 assert.equal(none.status,'undetermined');assert.equal(none.suggestedBpm,null);
 const one=decideTempo({v1:score(135),v2:{status:'unavailable'},windows:[segment(135,0),segment(135,12)]});
 assert.equal(one.status,'ambiguous');assert.equal(one.suggestedBpm,null);
});
test('wrong half-double or triple pulse cannot become supported through noisy windows',()=>{
 for(const [a,b] of [[70,140],[60,180],[120,180]]){
  const d=decideTempo({v1:score(a),v2:score(b),windows:[segment(a,0),segment(a,15),segment(a,30)]});
  assert.equal(d.status,'ambiguous');
  assert.equal(d.suggestedBpm,null);
 }
});

test('V3 abstains when V2 raises its own metrical warning, even if simple windows agree',()=>{
 const d=decideTempo({v1:score(140),v2:score(140.1,true),
  windows:[segment(140,0),segment(140.1,30),segment(140,60)]});
 assert.equal(d.status,'ambiguous');
 assert.equal(d.suggestedBpm,null);
 assert.equal(d.reason,'v2-flags-tempo-ambiguity');
 assert.equal(d.evidence.v2FlagsAmbiguity,true);
});
