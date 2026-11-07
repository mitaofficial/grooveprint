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

test('local manifest initializer never fabricates independently verified BPM and protects user edits',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const folder=await mkdtemp(join(tmpdir(),'grooveprint-local-manifest-'));
 try{
  await mkdir(join(folder,'audio'));
  await writeFile(join(folder,'audio','my-track.wav'),Buffer.alloc(2048));
  const run=()=>spawnSync(process.execPath,[resolve('scripts/tempo-manifest-init.mjs'),'--dataset',folder],
   {encoding:'utf8',timeout:20000});
  const first=run();
  assert.equal(first.status,0,first.stderr);
  const manifest=JSON.parse(await readFile(join(folder,'manifest.json'),'utf8'));
  assert.equal(manifest.tracks.length,1);
  assert.equal(manifest.tracks[0].groundTruthStatus,'unavailable');
  assert.equal(manifest.tracks[0].groundTruthBpm,null);
  assert.equal(manifest.tracks[0].verificationMethod,'');
  const second=run();
  assert.notEqual(second.status,0);
  assert.match(second.stderr,/refusing to overwrite manual BPM edits/);
 }finally{await rm(folder,{recursive:true,force:true})}
});
