import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const script=resolve('scripts/waivops-pilot.mjs');

test('licensed techno audio pilot declares publisher labels not verified BPM',()=>{
 const p=spawnSync(process.execPath,[script,'--dry-run','--limit','12'],{encoding:'utf8',timeout:20000});
 assert.equal(p.status,0,p.stderr);
 const value=JSON.parse(p.stdout);
 assert.equal(value.mode,'DRY_RUN');
 assert.equal(value.license,'CC-BY-4.0');
 assert.match(value.type,/NOT INDEPENDENTLY VERIFIED/);
 assert.match(value.repoCommit,/^[a-f0-9]{40}$/);
 assert.equal(value.selected.length,12);
 assert.deepEqual([...new Set(value.selected.map(x=>x.publisherBpm))].sort((a,b)=>a-b),
  [128,132,134,135,136,137,138,139,140,142,145,148]);
});

test('licensed pilot rejects invalid batch sizes before downloading audio',()=>{
 for(const invalid of ['0','13','1000','abc']){
  const p=spawnSync(process.execPath,[script,'--dry-run','--limit',invalid],{encoding:'utf8',timeout:20000});
  assert.notEqual(p.status,0);
  assert.match(p.stderr,/--limit must be 1\.\.12/);
 }
});
