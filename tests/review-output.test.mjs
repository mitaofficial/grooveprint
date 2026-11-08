import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('imported release identifiers remain literal data in review attributes and titles are keyboard buttons',()=>{
 const id='copy" onclick="alert(1)" data-forged="value';
 const release={id,artist:'Synthetic DJ',title:'Test EP',tracks:[]};
 const ctx={state:{releases:[release],selected:[id],active:id},filtered:()=>[release],reviewPage:0,
  clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),btn:()=>'',syncNotice:()=>'',window:{},discogsConnect:{connected:false},discogsSync:{running:false},
  gpDataAttribution:()=>'',esc,displayArtist:x=>x,statusOf:()=> 'Missing tracklist',formatOf:()=> 'Vinyl'};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function reviewMain(){'),html.indexOf('function reviewSide(){')),ctx);
 const result=ctx.reviewMain();
 assert.ok(result.includes('data-open-rel="'+esc(id)+'"'),'release ID must be escaped in the row attribute');
 assert.ok(result.includes('data-check-rel="'+esc(id)+'"'),'release ID must be escaped in the checkbox attribute');
 assert.ok(!result.includes(' onclick="'),'imported IDs must not create executable attributes');
 assert.match(result,/<h4><button[^>]+class="rel-open"/,'a release title must open with native keyboard activation');
});
test('a missing tracklist is not reported as physical layout overflow',()=>{
 const r={artist:'Synthetic DJ',title:'Empty tracklist',tracks:[]};
 let warnings=['Tracklist non disponibile: aggiungi i brani.'];
 const ctx={printable:()=>[r],state:{design:{}},composeLabel:()=>({warnings}),displayArtist:x=>x};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function gpPrintPreflight(){'),html.indexOf('function gpPreflightPanel(){')),ctx);
 let result=ctx.gpPrintPreflight();assert.equal(result.stats.missingTracks,1);assert.equal(result.stats.overflow,0);
 warnings.push('Elemento fuori area: artist');result=ctx.gpPrintPreflight();assert.equal(result.stats.overflow,1);
});

test('print preflight distinguishes missing BPM from available but unverified estimates',()=>{
 const r={artist:'Synthetic DJ',title:'EP',tracks:[{title:'A1',bpm:140,bpmStatus:'estimated'},{title:'B1',bpm:145,bpmStatus:'verified'}]};
 const ctx={printable:()=>[r],state:{design:{}},composeLabel:()=>({warnings:[]}),displayArtist:x=>x};
 vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function gpPrintPreflight(){'),html.indexOf('function gpPreflightPanel(){')),ctx);
 let result=ctx.gpPrintPreflight();
 assert.equal(result.stats.missingBpm,0);
 assert.equal(result.stats.unverifiedBpm,1);
 assert.match(result.issues[0].flags.join(' '),/not confirmed/);
 r.tracks[0].bpmStatus='verified';result=ctx.gpPrintPreflight();
 assert.equal(result.stats.unverifiedBpm,0);
 r.tracks[1].bpm=null;result=ctx.gpPrintPreflight();
 assert.equal(result.stats.missingBpm,1);
});

test('automatic BPM hypotheses stay collapsible and clearly state that correlation is not certainty',()=>{
 const record={id:'r-control',tracks:[{bpm:null,bpmStatus:'review',source:'local-dsp',bpmAlgorithm:'grooveprint-onset-acf-v1',
  bpmAnalysisSeconds:180,bpmAudioEvidence:{attribution:'Open audio example',sourcePage:'https://archive.org/details/sample'},
  bpmCandidates:[{bpm:100,relative:.44,algorithm:'grooveprint-onset-acf-v1'},{bpm:206.9,relative:.429,algorithm:'grooveprint-onset-acf-v1'}]}]};
 const ctx={esc,safeReferenceUrl:x=>x};vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function gpLocalBpmCandidates(record,index){'),html.indexOf('function gpBpmHistory(record,index){')),ctx);
 const rendered=ctx.gpLocalBpmCandidates(record,0);
 assert.match(rendered,/<details class="gp-bpm-lookup-results" >/,'automatic estimates should remain collapsed until requested');
 assert.match(rendered,/<summary>ANALISI BPM · 2 candidati da verificare<\/summary>/);
 assert.match(rendered,/correlazione, non probabilità/);
 assert.equal((rendered.match(/data-bpm-choose/g)||[]).length,2,'every candidate remains selectable after expansion');
 assert.equal(record.tracks[0].bpm,null,'display changes cannot assign numerical BPM');
 delete record.tracks[0].bpmAudioEvidence;
 const manual=ctx.gpLocalBpmCandidates(record,0);
 assert.match(manual,/<details class="gp-bpm-lookup-results" open>/,'explicit local comparison remains immediately accessible');
 assert.match(manual,/grooveprint-onset-acf-v1/);
});
