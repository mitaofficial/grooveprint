import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const script=readFileSync(new URL('../src/bpm-library.js',import.meta.url),'utf8');
function setup(){
 const win={},events={};
 const document={addEventListener:(n,cb)=>events[n]=cb};
 runInNewContext(script,{window:win,document,setTimeout,clearTimeout});
 return win.GrooveprintAudioLibrary;
}
test('matches exact artist-title in a batch',()=>{
 const api=setup(),r={id:'r1',artist:'The Advent',tracks:[{title:'Classic Tool (Original Mix)',bpm:null}]};
 const tr=api.trackList([r]);
 const match=api.matchFile({name:'The Advent - Classic Tool (Original Mix).wav'},tr);
 assert.equal(match.status,'matched');assert.equal(match.record,r);assert.equal(match.index,0);
});
test('refuses to conflate dub, remix and original',()=>{
 const api=setup(),r={id:'r1',artist:'DJ',tracks:[{title:'Groove (Original Mix)',bpm:null},{title:'Groove (Dub Mix)',bpm:null}]};
 const tr=api.trackList([r]);
 assert.equal(api.matchFile({name:'DJ - Groove (Original Mix).mp3'},tr).index,0);
 assert.equal(api.matchFile({name:'DJ - Groove (Dub Mix).mp3'},tr).index,1);
 assert.equal(api.matchFile({name:'DJ - Groove.mp3'},tr).status,'unmatched');
});
test('title-only filenames are rejected when multiple releases share the title',()=>{
 const api=setup();
 const a={id:'1',artist:'A',tracks:[{title:'Pressure',bpm:null}]},b={id:'2',artist:'B',tracks:[{title:'Pressure',bpm:null}]};
 assert.equal(api.matchFile({name:'Pressure.wav'},api.trackList([a,b])).status,'ambiguous');
});
test('no invented audio or duplicate artist title allows empty match',()=>{
 const api=setup();
 assert.equal(api.matchFile({name:'unknown.wav'},api.trackList([{artist:'DJ',tracks:[{title:'Pressure'}]}])).status,'unmatched');
});
