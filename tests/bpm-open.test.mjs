import test from 'node:test';
import assert from 'node:assert/strict';
import {validRecordingMbid,parseAcousticBrainzLowLevel,lookupAcousticBrainz} from '../server/bpm-open.mjs';
const id='65c567a9-7091-4bfe-96ff-594fd1a97524';
test('valid MBID only; prevents arbitrary URL paths',()=>{
 assert.equal(validRecordingMbid(id.toUpperCase()),id);
 for(const s of ['/etc/passwd','https://musicbrainz.org/','foo',id+'/low-level'])assert.equal(validRecordingMbid(s),null);
});
test('extracts archived AcousticBrainz rhythm.bpm without calling it audio-verified',()=>{
 const r=parseAcousticBrainzLowLevel({rhythm:{bpm:138.234}},id);
 assert.equal(r.status,'catalog');assert.equal(r.bpm,138.23);
 assert.equal(r.verified,false);assert.equal(r.audioAnalyzed,false);
 assert.match(r.referenceUrl,/^https:\/\/acousticbrainz\.org\/api\/v1\//);
});
test('missing/null/noisy and absurd BPM are unavailable, not BPM 0',()=>{
 for(const value of [undefined,null,'',0,39,301,'unknown']){
  const r=parseAcousticBrainzLowLevel({rhythm:{bpm:value}},id);
  assert.equal(r.status,'unavailable');assert.equal(r.bpm,null);
 }
});
test('archive 404 is unavailable and provider 503 is handled',async()=>{
 const mock=status=>async()=>({status,ok:status===200,json:async()=>({rhythm:{bpm:140}})});
 assert.equal((await lookupAcousticBrainz(id,{fetchImpl:mock(404)})).reason,'not-in-archive');
 assert.equal((await lookupAcousticBrainz(id,{fetchImpl:mock(503)})).reason,'http-503');
 assert.equal((await lookupAcousticBrainz(id,{fetchImpl:mock(200)})).bpm,140);
});
