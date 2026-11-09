import test from 'node:test';
import assert from 'node:assert/strict';
import {auditBeatCorpus} from '../src/bpm-corpus-policy.mjs';
const fixture=(overrides={})=>({id:'test_recording_001',file:'audio/test.wav',
 split:'development',recordingGroup:'group_001',sha256:'a'.repeat(64),
 rightToAnalyze:true,rightsEvidence:'local owner permission reference',
 verificationMethod:'independent-daw-beatgrid',
 referenceProvenance:'human beat-grid review in DAW, blinded to detector',
 referenceBeatTimesSeconds:Array.from({length:32},(_,i)=>i*.5),
 groundTruthBpm:120,...overrides});
test('private beat-grid manifest accepts independently referenced, rights-checked, grouped audio',()=>{
 const r=auditBeatCorpus({tracks:[fixture()]});assert.equal(r.valid,true);assert.equal(r.summary.tracks,1);
});
test('producer scalar BPM without timestamps cannot be claimed as independent beat tracking ground truth',()=>{
 const r=auditBeatCorpus({tracks:[fixture({verificationMethod:'publisher-label',referenceBeatTimesSeconds:[],referenceProvenance:''})]});
 assert.equal(r.valid,false);assert.ok(r.problems.some(x=>/independent beat annotation/.test(x)));
 assert.ok(r.problems.some(x=>/verified beat timestamps/.test(x)));
});
test('same remix/recording family cannot leak between development and final holdout',()=>{
 const b=fixture({id:'second_recording_002',file:'audio/second.wav',split:'holdout',sha256:'b'.repeat(64)});
 const r=auditBeatCorpus({tracks:[fixture(),b]});
 assert.ok(r.problems.some(x=>/recordingGroup spans multiple splits/.test(x)));
});
test('same audio bytes cannot leak into another split under a different release ID',()=>{
 const b=fixture({id:'second_recording_002',file:'audio/second.wav',split:'validation',recordingGroup:'group_002'});
 const r=auditBeatCorpus({tracks:[fixture(),b]});
 assert.ok(r.problems.some(x=>/SHA-256 appears in multiple splits/.test(x)));
});
test('audio paths cannot traverse the private corpus or refer to remote files',()=>{
 for(const path of ['../secret.wav','C:\\Temp\\file.wav','/tmp/file.wav']){
  const r=auditBeatCorpus({tracks:[fixture({file:path})]});
  assert.equal(r.valid,false,path);
 }
});
test('invalid or missing rights evidence prevents an evidence-grade benchmark',()=>{
 const r=auditBeatCorpus({tracks:[fixture({rightToAnalyze:false,rightsEvidence:''})]});
 assert.ok(r.problems.some(x=>/rights-to-analyze/.test(x)));
});
