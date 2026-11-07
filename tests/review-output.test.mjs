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
