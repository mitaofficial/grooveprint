import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('internally analyzed BPM does not turn expiring Discogs track metadata into persistent user data',()=>{
 const context={clone:x=>JSON.parse(JSON.stringify(x))};vm.createContext(context);
 vm.runInContext(html.slice(html.indexOf('function gpRetainLocalOnly'),html.indexOf('let gpExpiredCount')),context);
 const owned={id:'local',tracks:[{title:'API title',source:'local-dsp',trackSource:'discogs',bpmStatus:'review'},{title:'User track',source:'manual'}]};
 const r=context.gpRetainLocalOnly({releases:[owned,{id:'private',discogsInstanceId:'1',tracks:[]}],selected:['local','private'],active:'private'});
 assert.equal(r.releases.length,1);assert.equal(r.releases[0].tracks.length,1);assert.equal(r.releases[0].tracks[0].title,'User track');assert.equal(r.active,'local');assert.equal(owned.tracks.length,2);
});
test('new persisted audio provenance strips signed URLs, audio bytes and unknown fields',()=>{
 const start=html.indexOf('function safeReferenceUrl'),end=html.indexOf('function normalizeRelease');
 const c={URL,finite:(x,f=0)=>Number.isFinite(Number(x))?Number(x):f};vm.createContext(c);vm.runInContext(html.slice(start,end),c);
 const r=c.gpCleanAudioEvidence({provider:'Archive',recordingId:'id/file.mp3',sourcePage:'https://archive.org/details/item?token=secret',license:'https://creativecommons.org/licenses/by/4.0/',rightsReference:'https://example.org/rights',audioUrl:'https://example.org/signed',channels:[1,2],recordingSeconds:20});
 assert.equal(r.sourcePage,'');assert.equal(r.license,'https://creativecommons.org/licenses/by/4.0/');assert.equal('audioUrl' in r,false);assert.equal('channels' in r,false);assert.equal(r.requiresReview,true);
});
