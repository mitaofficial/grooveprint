import test from 'node:test';
import assert from 'node:assert/strict';
import {midiClock} from '../scripts/tempo-midi-clock.mjs';
test('a later same-tick conductor update determines the independent rendering clock',()=>{
 const events=Buffer.from([0,255,81,3,7,161,32,0,255,81,3,6,26,128,131,96,255,47,0]);
 const length=Buffer.alloc(4);length.writeUInt32BE(events.length);
 const file=Buffer.concat([Buffer.from('4d546864000000060000000101e0','hex'),Buffer.from('MTrk'),length,events]);
 const ref=midiClock(file);assert.equal(ref.explicitClock,true);assert.equal(ref.tempoMap.length,1);assert.equal(ref.tempoMap[0].bpm,150);assert.equal(ref.durationSeconds,.4);
});
