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
