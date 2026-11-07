import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioSource,RESEARCH_RELEASE,checkSourceUrl,boundedBytes,publicAddress} from '../server/audio-source.mjs';
const input={releaseId:'3759149',artist:'Josh Woodward',album:'Crawford Street',position:'1',title:'Fight The Sea',duration:'4:39'};
const item=()=>({metadata:{creator:'Josh Woodward',title:'Crawford Street',licenseurl:RESEARCH_RELEASE.license,collection:['freemusicarchive']},files:[{name:'Fight.mp3',artist:'Josh Woodward',album:'Crawford Street',title:'Fight The Sea',source:'original',length:'277',size:'3',md5:'test'}]});
function fixture(change=()=>{}){let d=item();change(d);const calls=[];const source=createAudioSource({fetchImpl:async(url)=>{calls.push(url);return Response.json(url.includes('advancedsearch')?{response:{docs:[{identifier:RESEARCH_RELEASE.item}]}}:d)}});return {source,calls,d}}
test('approved live-source contract searches then checks exact identity, rights and duration; cached metadata is bounded',async()=>{
 const f=fixture(),a=await f.source.resolve(input);assert.equal(a.status,'matched');assert.equal(a.evidence.requiresReview,true);assert.equal(a.evidence.license,RESEARCH_RELEASE.license);assert.equal('bpm' in a,false);assert.match(a.asset.url,/^https:\/\/archive.org\/download\/Crawford_Street-17897\/Fight.mp3$/);
 await f.source.resolve({...input,artist:'Josh Woodward (2)'});assert.equal(f.calls.length,2);
 assert.equal((await f.source.resolve({...input,title:'Fight The Sea (Remix)'})).status,'unavailable');
 assert.equal((await f.source.resolve({...input,duration:'1:00'})).reason,'recording-duration-mismatch');
});
test('incomplete recording identities send no requests and cannot supply an arbitrary audio URL',async()=>{
 const f=fixture();for(const x of [{releaseId:'0'},{artist:'Various'},{album:''}])assert.equal((await f.source.resolve({...input,...x,url:'http://169.254.169.254/'})).status,'unavailable');assert.equal(f.calls.length,0);
 await assert.rejects(f.source.resolve({...input,title:42}),/invalid-track/);
});
test('ambiguous or changed rights/recording provenance abstain before audio download',async()=>{
 const f=fixture(d=>d.files.push({...d.files[0],name:'another.mp3'}));assert.equal((await f.source.resolve(input)).status,'review');
 const g=fixture(d=>d.metadata.licenseurl='https://creativecommons.org/licenses/by-nc/4.0/');assert.equal((await g.source.resolve(input)).status,'unavailable');
 const h=fixture(d=>d.files[0].artist='Someone Else');assert.equal((await h.source.resolve(input)).status,'unavailable');
});
test('strict service host allowlist blocks private addresses, credentials, ports and external redirects',async()=>{
 for(const url of ['http://archive.org/metadata/x','https://archive.org.evil.test/a','https://127.0.0.1/a','https://169.254.169.254/a','https://archive.org@evil.test/a','https://archive.org:8080/a','https://evil.archive.org/a'])await assert.rejects(checkSourceUrl(url),/host-not-allowed/);
 await assert.rejects(checkSourceUrl('https://archive.org/a',{lookupImpl:async()=>[{address:'127.0.0.1'}]}),/not-public/);
 assert.equal(publicAddress('10.0.0.1'),false);assert.equal(publicAddress('::ffff:127.0.0.1'),false);assert.equal(publicAddress('::1'),false);assert.equal(publicAddress('207.241.224.2'),true);
 let calls=0;const f=createAudioSource({fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://127.0.0.1/metadata'}})}});await assert.rejects(f.resolve(input),/host-not-allowed/);assert.equal(calls,1);
});
test('source rejects invalid MIME, oversize streams and 429 without unbounded retry',async()=>{
 await assert.rejects(boundedBytes(new Response('12345'),4),/too-large/);
 const html=createAudioSource({fetchImpl:async()=>new Response('<html>')} );await assert.rejects(html.resolve(input),/invalid-content-type/);
 let calls=0;const limited=createAudioSource({fetchImpl:async()=>{calls++;return new Response(null,{status:429,headers:{'retry-after':'120'}})}});
 await assert.rejects(limited.resolve(input),/http-429/);await assert.rejects(limited.resolve(input),/rate-limited/);assert.equal(calls,1);
});
test('resolver discovers a different FMA album without a pinned Discogs ID or source item',async()=>{
 const requests=[],d=item();d.metadata.creator='Another Artist';d.metadata.title='Different Album';d.metadata.licenseurl='https://creativecommons.org/publicdomain/zero/1.0/';
 d.files[0]={...d.files[0],artist:'Another Artist',album:'Different Album',title:'Different Track'};
 const f=createAudioSource({fetchImpl:async url=>{requests.push(url);return Response.json(url.includes('advancedsearch')?{response:{numFound:1,docs:[{identifier:'different-fma-item'}]}}:d)}});
 const r=await f.resolve({releaseId:'999',artist:'Another Artist',album:'Different Album',title:'Different Track',position:'A1',duration:'4:37'});
 assert.equal(r.status,'matched');assert.equal(r.evidence.license,'https://creativecommons.org/publicdomain/zero/1.0/');assert.match(r.asset.url,/different-fma-item/);assert.ok(new URL(requests[0]).searchParams.get('q').includes('Different Album'));assert.ok(!requests[0].includes('Josh'));
});
test('curation and each file license are required; broad query ambiguity abstains',async()=>{
 const f=fixture(d=>d.metadata.collection='opensource_audio');assert.equal((await f.source.resolve(input)).status,'unavailable');
 const g=fixture(d=>d.files[0].licenseurl='https://creativecommons.org/licenses/by-nc/4.0/');assert.equal((await g.source.resolve(input)).status,'unavailable');
 const q=createAudioSource({fetchImpl:async()=>Response.json({response:{numFound:4,docs:[{identifier:'a'},{identifier:'b'},{identifier:'c'}]}})});
 assert.equal((await q.resolve(input)).reason,'too-many-source-candidates');
});
test('a compilation uses the actual track artist and keeps remix distinctions',async()=>{
 const d=item();d.metadata.creator='Various Artists';d.metadata.title='Sampler';d.files[0]={...d.files[0],artist:'Track Artist',album:'Sampler',title:'Tool (Dub)'};let query='';
 const f=createAudioSource({fetchImpl:async url=>{if(url.includes('advancedsearch')){query=new URL(url).searchParams.get('q');return Response.json({response:{numFound:1,docs:[{identifier:'fma-sampler'}]}})}return Response.json(d)}});
 const t={releaseId:'77',artist:'Track Artist',albumArtist:'Various',album:'Sampler',position:'A1',title:'Tool (Dub)',duration:'4:37'};
 assert.equal((await f.resolve(t)).status,'matched');assert.ok(!query.includes('creator:'));assert.equal((await f.resolve({...t,title:'Tool (Remix)'})).status,'unavailable');
});

test('a guest track artist cannot override the release artist used for album discovery',async()=>{
 const d=item();d.metadata.creator='Album Artist';d.metadata.title='Guest Remixes';
 d.files[0]={...d.files[0],artist:'Guest Producer',album:'Guest Remixes',title:'Original (Guest Mix)'};
 let query='',searches=0;
 const f=createAudioSource({fetchImpl:async url=>{
  if(url.includes('advancedsearch')){searches++;query=new URL(url).searchParams.get('q');return Response.json({response:{numFound:1,docs:[{identifier:'guest-remixes-fma'}]}})}
  return Response.json(d);
 }});
 const t={releaseId:'88',artist:'Guest Producer',albumArtist:'Album Artist',album:'Guest Remixes',position:'B1',title:'Original (Guest Mix)',duration:'4:37'};
 assert.equal((await f.resolve(t)).status,'matched');
 assert.ok(query.includes('creator:"Album Artist"'),'album lookup must use the release-level credit');
 assert.ok(!query.includes('creator:"Guest Producer"'),'track credit is not the album credit');
 assert.equal((await f.resolve({...t,artist:'Different Guest'})).status,'unavailable','wrong track artist must never be matched');
 assert.equal(searches,1,'same release should reuse bounded album lookup despite track credits differing');
 assert.equal((await f.resolve({...t,albumArtist:'Wrong Album Artist'})).status,'unavailable','wrong release artist must fail metadata identity');
});
