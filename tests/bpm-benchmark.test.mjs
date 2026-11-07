import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

test('synthetic benchmark scores top-1 separately from candidate, writes reproducible report and no music',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'grooveprint-tempo-'));
 try{
  const runner=resolve('scripts/bpm-benchmark.mjs');
  const cmd=spawnSync(process.execPath,[runner,'--synthetic','--quick','--out',tmp],{encoding:'utf8',timeout:120000});
  assert.equal(cmd.status,0,(cmd.stderr||'')+' '+(cmd.stdout||''));
  const summary=JSON.parse(await readFile(join(tmp,'summary.json'),'utf8'));
  assert.equal(summary.mode,'synthetic');
  assert.equal(summary.realAudioValidation,'NOT TESTED');
  assert.match(summary.algorithmSha256,/^[0-9a-f]{64}$/);
  assert.equal(summary.data.baseline.overall.groundTruthN,9);
  assert.equal(summary.data.baseline.overall.n,10);
  assert.ok(summary.data.baseline.overall.top1Within1Pct===null||
   summary.data.baseline.overall.top1Within1Pct>=0);
  assert.ok(summary.data.baseline.overall.acceptedWithin1Pct===null||
   summary.data.baseline.overall.acceptedWithin1Pct>=0);
  assert.match(await readFile(join(tmp,'report.md'),'utf8'),/Top-1/);
  assert.match(await readFile(join(tmp,'results.csv'),'utf8'),/groundTruthBpm/);
  assert.deepEqual((await readdir(tmp)).sort(),['report.md','results.csv','summary.json']);
 }finally{await rm(tmp,{recursive:true,force:true})}
});

test('real benchmark without manifest does not invent validation results',()=>{
 const result=spawnSync(process.execPath,[resolve('scripts/bpm-benchmark.mjs'),'--real'],
  {encoding:'utf8',timeout:20000});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/requires --manifest/);
});

test('experimental detector flags a sparse octave alternative for human review',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'grooveprint-tempo-compare-'));
 try{
  const runner=resolve('scripts/bpm-benchmark.mjs');
  const cmd=spawnSync(process.execPath,[runner,'--synthetic','--quick','--compare','src/bpm-tempo-experiment.mjs','--out',tmp],{encoding:'utf8',timeout:120000});
  assert.equal(cmd.status,0,cmd.stderr);
  const lines=(await readFile(join(tmp,'results.csv'),'utf8')).split('\n');
  const header=lines[0].split(',').map(v=>v.replaceAll('"',''));
  const col=k=>header.indexOf(k);
  const target=lines.find(l=>l.includes('"synth_138_sparse"')&&l.includes('"challenger"'));
  assert.ok(target,'expected synthetic 138 sparse diagnostic');
  const cells=target.split(',').map(x=>x.replaceAll('"',''));
  assert.equal(cells[col('requiresReview')],'true','do not auto-accept an octave-ambiguous sparse groove');
  const summary=JSON.parse(await readFile(join(tmp,'summary.json'),'utf8'));
  assert.ok(summary.data.challenger.overall.autoAcceptedPct<=100);
 }finally{await rm(tmp,{recursive:true,force:true})}
});

test('local Chromium benchmark exposes help without Playwright or user music files',()=>{
 const cmd=spawnSync(process.execPath,[resolve('scripts/bpm-browser-benchmark.mjs'),'--help'],{encoding:'utf8',timeout:20000});
 assert.equal(cmd.status,0,cmd.stderr);
 assert.match(cmd.stdout,/No files\/audio are uploaded/);
});

test('experimental detector abstains rather than inferring BPM from steady, nonrhythmic audio',async()=>{
 const tmp=await mkdtemp(join(tmpdir(),'grooveprint-ambient-'));
 try{
  const cmd=spawnSync(process.execPath,[resolve('scripts/bpm-benchmark.mjs'),'--synthetic','--quick',
    '--compare','src/bpm-tempo-experiment.mjs','--out',tmp],{encoding:'utf8',timeout:120000});
  assert.equal(cmd.status,0,cmd.stderr);
  const lines=(await readFile(join(tmp,'results.csv'),'utf8')).trim().split('\n');
  const target=lines.find(line=>line.includes('"synth_no_beat"')&&line.includes('"challenger"'));
  assert.ok(target,'nonrhythmic control must be included');
  const cells=target.split(',').map(cell=>cell.replaceAll('"',''));
  const headers=lines[0].split(',');
  assert.equal(cells[headers.indexOf('status')],'unavailable','steady nonrhythmic waveform is not music BPM evidence');
 }finally{await rm(tmp,{recursive:true,force:true})}
});
test('a failed real input remains in both engine denominators, with independent identities and no false validation',async()=>{
 const {writeFile}=await import('node:fs/promises');
 const tmp=await mkdtemp(join(tmpdir(),'gp-failed-input-'));
 try{
  const manifest=join(tmp,'manifest.json');
  await writeFile(manifest,JSON.stringify({tracks:[{id:'missing_fixture',file:'missing.wav',category:'test-fixture',groundTruthStatus:'verified',groundTruthBpm:140,verificationMethod:'controlled test fixture (no actual recording)'}]}));
  const run=spawnSync(process.execPath,[resolve('scripts/bpm-benchmark.mjs'),'--real','--manifest',manifest,'--compare','src/bpm-tempo-experiment.mjs','--out',tmp],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(await readFile(join(tmp,'summary.json'),'utf8'));
  for(const engine of ['baseline','challenger']){assert.equal(report.data[engine].overall.groundTruthN,1);assert.equal(report.data[engine].overall.decodeFailuresN,1);assert.equal(report.data[engine].overall.top1Within1Pct,0);assert.match(report.engines[engine].sha256,/^[a-f0-9]{64}$/)}
  assert.notEqual(report.engines.baseline.sha256,report.engines.challenger.sha256);assert.equal(report.realAudioValidation,'NO VERIFIED AUDIO ANALYZED');
 }finally{await rm(tmp,{recursive:true,force:true})}
});
