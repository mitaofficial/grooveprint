// Explicit network research proof; not part of the offline test suite.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {createAudioSource,RESEARCH_RELEASE} from '../server/audio-source.mjs';
import {estimateBaseline,tempoResult,pcmBuffer} from '../src/bpm-engine.mjs';
import {estimateLocalTempo as experiment} from '../src/bpm-tempo-experiment.mjs';
const source=createAudioSource(),start=performance.now();
await mkdir('.private/checkpoints/auto-discogs',{recursive:true});
const response=await fetch('https://api.discogs.com/releases/'+RESEARCH_RELEASE.releaseId,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'GROOVEPRINT/3.0 research (https://github.com/mitaofficial/grooveprint)'}});
if(!response.ok||!response.headers.get('content-type')?.includes('json'))throw Error('Live Discogs metadata unavailable: '+response.status);
const release=await response.json(),rows=[];let proof=null;
for(const t of release.tracklist||[]){
 if(t.type_!=='track')continue;
 const input={releaseId:String(release.id),album:release.title,artist:(t.artists||release.artists).map(x=>x.name).join(', '),title:t.title,position:t.position,duration:t.duration};
 const resolved=await source.resolve(input);rows.push({position:t.position,title:t.title,status:resolved.status,reason:resolved.reason||'matched'});
 if(!proof&&resolved.status==='matched'){
  const bytes=await source.audio(resolved.asset);await writeFile('.private/checkpoints/auto-discogs/live-original.mp3',bytes);const pcm=execFileSync('ffmpeg',['-v','error','-i','.private/checkpoints/auto-discogs/live-original.mp3','-t','180','-ar','12000','-ac','1','-f','f32le','pipe:1'],{maxBuffer:16*1024*1024});
  const channel=new Float32Array(pcm.buffer.slice(pcm.byteOffset,pcm.byteOffset+pcm.byteLength));
  const v1=estimateBaseline(pcmBuffer(12000,[channel.slice()])),v2=tempoResult(experiment(pcmBuffer(12000,[channel.slice()])),pcmBuffer(12000,[channel]),'grooveprint-onset-acf-v2-experimental');
  proof={input,evidence:resolved.evidence,audioBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),modifiedAudio:false,window:'first 180 seconds; decoded to 12 kHz mono, no repetition',v1,v2};
 }
}
const report={at:new Date().toISOString(),kind:'live-authorized-open-audio-integration',metadata:'live Discogs public release',source:'live IA search + metadata + complete original MP3',
 noUserAudioUpload:true,noBpmProvider:true,sourceCatalog:'freemusicarchive CC0/BY research',testedReleases:1,importedTracks:rows.length,matchedTracks:rows.filter(x=>x.status==='matched').length,review:rows.filter(x=>x.status==='review').length,unavailable:rows.filter(x=>x.status==='unavailable').length,rows,proof,requests:source.stats.requests,bytes:source.stats.bytes,elapsedMs:Math.round(performance.now()-start),
 independentBpmReference:null,musicalAccuracy:'NOT VALIDATED',targetTechnoHardgrooveCoverage:'NOT ESTABLISHED; this album is an integration control outside the target genre',automaticAssignmentPolicy:'force review until acceptance policy has independent evidence'};
if(!proof)throw Error('No live audio chain succeeded');
await mkdir('.private/checkpoints/auto-discogs',{recursive:true});await writeFile('.private/checkpoints/auto-discogs/live-proof.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({kind:report.kind,importedTracks:report.importedTracks,matchedTracks:report.matchedTracks,review:report.review,unavailable:report.unavailable,proofTitle:proof.input.title,audioBytes:proof.audioBytes,v1:proof.v1.bpm,v2:proof.v2.bpm,musicalAccuracy:report.musicalAccuracy,elapsedMs:report.elapsedMs}));
