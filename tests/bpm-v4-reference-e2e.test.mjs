import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {synthesize} from '../scripts/tempo-synthetic.mjs';
const ffmpeg=spawnSync('ffmpeg',['-version'],{timeout:5000}).status===0;
function wav16(audio){
 const data=audio.getChannelData(0),bytes=Buffer.alloc(44+data.length*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);
 bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(audio.sampleRate,24);bytes.writeUInt32LE(audio.sampleRate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);
 bytes.writeUInt32LE(data.length*2,40);
 for(let i=0;i<data.length;i++)bytes.writeInt16LE(
  Math.round(Math.max(-1,Math.min(1,data[i]))*32767),44+i*2);
 return bytes;
}
test('private independent-reference CLI computes beat timestamps from exact hash-matched PCM',
 {skip:!ffmpeg?'FFmpeg unavailable; cannot run offline validation integration':false},async()=>{
 const folder=await mkdtemp(join(tmpdir(),'gp-v4-integration-'));
 const suffix='v4-fixture-'+process.pid+'-'+Date.now();
 const out=resolve('.private/benchmarks',suffix);
 try{
  await mkdir(join(folder,'audio'));
  const audio=synthesize('v4-fixture-original',120,'four',{quick:true});
  const wav=wav16(audio),hash=createHash('sha256').update(wav).digest('hex');
  await writeFile(join(folder,'audio','example.wav'),wav);
  const metadata={tracks:[{id:'synthetic_fixture_only',file:'audio/example.wav',
   split:'development',recordingGroup:'test_generated_audio',
   sha256:hash,rightToAnalyze:true,rightsEvidence:'generated in test with no third-party material',
   verificationMethod:'independent-daw-beatgrid',
   referenceProvenance:'test-synthesized beat timestamps, NOT independent music annotation',
   referenceBeatTimesSeconds:Array.from({length:24},(_,i)=>i*.5),
   groundTruthBpm:120}]};
  const path=join(folder,'manifest.json');await writeFile(path,JSON.stringify(metadata));
  const result=spawnSync(process.execPath,['scripts/bpm-v4-verified-eval.mjs','--manifest',path,
   '--split','development','--out',out],{encoding:'utf8',timeout:120000,maxBuffer:3e6});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/V4_VERIFIED_BEAT_CORPUS/);
  const report=JSON.parse(await readFile(join(out,'report.json'),'utf8'));
  assert.equal(report.referenceRows,1);
  assert.equal(report.cases[0].referenceBpm,120);
  assert.equal(report.cases[0].referenceBeatsInAnalyzedSpan,24);
  assert.equal(report.cases[0].referenceFractionWithinAnalyzedSpan,1);
  assert.ok('v4BeatFMeasure' in report.cases[0]);
  assert.equal(report.cases[0].audioSecondsAnalyzed,12);
  // Detect an exact-version mismatch before doing DSP.
  metadata.tracks[0].sha256='f'.repeat(64);
  await writeFile(path,JSON.stringify(metadata));
  const mismatch=spawnSync(process.execPath,['scripts/bpm-v4-verified-eval.mjs','--manifest',path,
   '--split','development','--out',out],{encoding:'utf8',timeout:30000});
  assert.notEqual(mismatch.status,0);
  assert.match(mismatch.stderr,/SHA-256 mismatch/);
 }finally{
  await rm(folder,{recursive:true,force:true});await rm(out,{recursive:true,force:true});
 }
});
