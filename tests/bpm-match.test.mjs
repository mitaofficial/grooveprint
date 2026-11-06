import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeArtist,normalizeTitle,resolveEvidence,makeTrackTasks,validTempo} from '../server/bpm-match.mjs';
test('Discogs artist suffix disappears only for matching, not version',()=>{
 assert.equal(normalizeArtist('Ben Sims (4)'), 'ben sims');
 assert.notEqual(normalizeTitle('Pulse (Original Mix)'),normalizeTitle('Pulse (Remix)'));
 assert.notEqual(normalizeTitle('Tool (Dub)'),normalizeTitle('Tool (Edit)'));
});
test('only exact artist + exact version gets catalog BPM',()=>{
 const r=resolveEvidence({artist:'Ben Sims (4)',title:'Warehouse Tool (Original Mix)'},{candidates:[
 {artist:'Ben Sims',title:'Warehouse Tool (Original Mix)',bpm:138,url:'https://getsongbpm.com/song/test/X'},
 {artist:'Ben Sims',title:'Warehouse Tool (Dub)',bpm:141}
 ]});
 assert.equal(r.bpm,138);assert.equal(r.status,'catalog');assert.equal(r.verified,false);
});
test('no match of different remix or other artist',()=>{
 for(const c of [{artist:'The Advent',title:'Warehouse Tool (Original Mix)',bpm:139},{artist:'Ben Sims',title:'Warehouse Tool (Remix)',bpm:140}]){
  const r=resolveEvidence({artist:'Ben Sims',title:'Warehouse Tool (Original Mix)'},{candidates:[c]});
  assert.equal(r.status,'review');assert.equal(r.bpm,null);
 }
});
test('conflicting exact tempos => review; never guess',()=>{
 const r=resolveEvidence({artist:'A',title:'B'},{candidates:[{artist:'A',title:'B',bpm:138},{artist:'A',title:'B',bpm:69}]});
 assert.equal(r.status,'review');assert.equal(r.reason,'conflicting-tempo');assert.equal(r.bpm,null);
});
test('Various Artists track metadata needs real track artist',()=>{
 const r=resolveEvidence({artist:'Various Artists',title:'Tool'},{candidates:[{artist:'Correct DJ',title:'Tool',bpm:140}]});
 assert.equal(r.status,'review');assert.equal(r.reason,'missing-track-artist');
 const tasks=makeTrackTasks([{id:'one',artist:'Various Artists',tracks:[{artist:'Correct DJ',title:'Tool',bpm:null}]}]);
 assert.equal(tasks[0].artist,'Correct DJ');
});
test('existing user and verified BPMs cannot be queued for replacement',()=>{
 const t=makeTrackTasks([{id:'r1',artist:'Artist',tracks:[{title:'A',bpm:140,bpmStatus:'verified'},{title:'B',bpm:137,bpmStatus:'manual'},{title:'C',bpm:null}]}]);
 assert.equal(t.length,1);assert.equal(t[0].index,2);
});
test('malformed tempo and empty data never become 0 BPM',()=>{
 assert.equal(validTempo(null),null);assert.equal(validTempo(''),null);assert.equal(validTempo('not a number'),null);
 assert.equal(resolveEvidence({artist:'A',title:'B'},{candidates:[{artist:'A',title:'B',bpm:'bad'}]}).status,'unavailable');
});
