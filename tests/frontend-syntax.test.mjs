import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('both inline app scripts compile and worker is included exactly once',()=>{
 const inline=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(x=>!x[1].includes('src='));
 assert.equal(inline.length,2);
 for(const x of inline)assert.doesNotThrow(()=>new Function(x[2]));
 assert.equal((html.match(/<script src="\/assets\/collection-enrichment\.js"><\/script>/g)||[]).length,1);
});
test('metadata enrichment triggers remain independent of local-audio analysis',()=>{
 assert.match(html,/GrooveprintCollectionEnrichment\?\.run\(\{fetchTracklists:autoEnrich\}\)/);
 assert.match(html,/GrooveprintCollectionEnrichment\?\.run\(\{fetchTracklists:true\}\)/);
 assert.doesNotMatch(html,/data-bpm-quick="/);
 assert.doesNotMatch(html,/data-bpm-analyze="/);
 assert.match(html,/GROOVEPRINT/i);
});
test('A4 print geometry and pagination logic retained',()=>{
 assert.match(html,/function svgSheet/);
 assert.match(html,/function exportPDF|function pdfExport|function downloadPDF|function exportPdf/i);
 assert.match(html,/defaultTemplate/);
});
