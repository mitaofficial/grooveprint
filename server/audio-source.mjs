// Audited open-audio research catalog. No commercial-catalog coverage is implied.
import {isIP} from 'node:net';
export const AUDIO_LIMIT=16*1024*1024;
export const RESEARCH_RELEASE=Object.freeze({releaseId:'3759149',artist:'Josh Woodward',album:'Crawford Street',
 item:'Crawford_Street-17897',license:'https://creativecommons.org/licenses/by/4.0/',
 rightsReference:'https://freemusicarchive.org/music/Josh_Woodward/Crawford_Street/',
 sourcePage:'https://archive.org/details/Crawford_Street-17897'});
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const artist=v=>norm(String(v||'').replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,''));
export function seconds(v){const s=String(v||'').trim();if(/^\d+(?:\.\d+)?$/.test(s))return Number(s);if(/^\d{1,3}:\d{2}(?::\d{2})?$/.test(s))return s.split(':').reduce((n,x)=>n*60+Number(x),0);return null}
export function publicAddress(value){
 const ip=String(value).toLowerCase();
 if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !([0,10,127].includes(a)||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&[0,168].includes(b)||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b))}
 if(isIP(ip)===6)return !(/^(?:0*:)*0*1$|^::$|^f[cd]|^fe[89ab]|^ff|^::ffff:/i.test(ip));
 return false;
}
export async function checkSourceUrl(raw,{lookupImpl}={}){
 const u=new URL(raw);
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hash||
  !(u.hostname==='archive.org'||/^(?:ia|dn)\d{5,8}\.(?:us|eu|ca)\.archive\.org$/.test(u.hostname)))throw Error('source-host-not-allowed');
 // Host names are fixed to the trusted service, never supplied by the client.
 // A deployment can supply a transport-bound resolver; no DNS pinning is claimed
 // when the managed HTTPS proxy owns resolution. This research source is dev-only.
 if(lookupImpl){const addresses=await lookupImpl(u.hostname,{all:true});
 if(!addresses.length||addresses.some(x=>!publicAddress(x.address)))throw Error('source-address-not-public');}
 return u;
}
export async function boundedBytes(response,max,signal){
 const size=Number(response.headers.get('content-length'));if(size>max)throw Error('source-response-too-large');
 if(!response.body)throw Error('source-empty-response');
 const reader=response.body.getReader(),chunks=[];let n=0,finished=false;
 try{for(;;){signal?.throwIfAborted();const r=await reader.read();if(r.done){finished=true;break}n+=r.value.byteLength;if(n>max)throw Error('source-response-too-large');chunks.push(r.value)}}
 finally{if(!finished)await reader.cancel().catch(()=>{});reader.releaseLock()}
 const bytes=new Uint8Array(n);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}return bytes;
}
export function createAudioSource({fetchImpl=fetch,lookupImpl,timeoutMs=25000,now=Date.now}={}){
 const memo=new Map(),pending=new Map(),assets=new Map();let pauseUntil=0,lastRequest=0,sequence=Promise.resolve();
 const stats={requests:0,bytes:0};
 async function request(url,{signal,maxBytes=2*1024*1024,audio=false}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
  const cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  try{
   let current=url;
   for(let i=0;i<4;i++){
    controller.signal.throwIfAborted();await checkSourceUrl(current,{lookupImpl});
    const wait=Math.max(0,pauseUntil-now(),lastRequest+500-now());if(wait>30000)throw Error('source-rate-limited');
    if(wait)await new Promise((resolve,reject)=>{const stop=()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'))},t=setTimeout(()=>{controller.signal.removeEventListener('abort',stop);resolve()},wait);controller.signal.addEventListener('abort',stop,{once:true});if(controller.signal.aborted)stop()});
    lastRequest=now();stats.requests++;
    const r=await fetchImpl(current,{redirect:'manual',signal:controller.signal,headers:{Accept:audio?'audio/mpeg':'application/json','User-Agent':'GROOVEPRINT/3.0 research (https://github.com/mitaofficial/grooveprint)'}});
    if([301,302,303,307,308].includes(r.status)){await r.body?.cancel();const target=r.headers.get('location');if(!target)throw Error('source-invalid-redirect');current=new URL(target,current).href;continue}
    if(r.status===429){const h=r.headers.get('retry-after'),n=Number(h),until=Number.isFinite(n)&&n>0?now()+n*1000:Date.parse(h);pauseUntil=Math.max(pauseUntil,Number.isFinite(until)?until:now()+60000)}
    if(!r.ok){await r.body?.cancel();throw Error('source-http-'+r.status)}
    if(!(audio?/^audio\/(?:mpeg|mp3)(?:;|$)/i:/\bjson\b/i).test(r.headers.get('content-type')||'')){await r.body?.cancel();throw Error('source-invalid-content-type')}
    const bytes=await boundedBytes(r,maxBytes,controller.signal);stats.bytes+=bytes.length;return bytes;
   }
   throw Error('source-too-many-redirects');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel)}
 }
 // A global source sequence bounds traffic across sessions; failed requests never poison it.
 function queued(url,options){const task=()=>request(url,options),p=sequence.then(task,task);sequence=p.catch(()=>{});return p}
 async function json(url,signal){return JSON.parse(new TextDecoder().decode(await queued(url,{signal})))}
 function license(value){
  const x=String(value||'');if(/^https?:\/\/creativecommons\.org\/licenses\/by\/(?:3\.0|4\.0)\/$/.test(x)||/^https?:\/\/creativecommons\.org\/publicdomain\/zero\/1\.0\/$/.test(x))return x.replace(/^http:/,'https:');return null;
 }
 const quoted=value=>'"'+String(value).replace(/[\\"]/g,'\\$&')+'"';
 const safeItem=id=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}$/.test(String(id))&&!String(id).includes('..');
 function remember(key,data){
  if(memo.has(key))clearTimeout(memo.get(key).timer);
  const entry={data};entry.timer=setTimeout(()=>{if(memo.get(key)===entry)memo.delete(key)},5*60*1000);entry.timer.unref?.();memo.set(key,entry);
  if(memo.size>16){const oldest=memo.keys().next().value;clearTimeout(memo.get(oldest).timer);memo.delete(oldest)}return data;
 }
 async function album(input,signal){
  const albumArtist=String(input.albumArtist||input.artist);
  const compilation=/^(?:various|various artists)$/i.test(albumArtist);
  const key=JSON.stringify([compilation?'various':artist(albumArtist),norm(input.album)]);
  if(memo.has(key))return memo.get(key).data;
  if(pending.has(key)){await pending.get(key).catch(()=>{});signal?.throwIfAborted();if(memo.has(key))return memo.get(key).data}
  const task=(async()=>{
   const query='mediatype:audio AND collection:freemusicarchive AND title:'+quoted(input.album)+(compilation?'':' AND creator:'+quoted(albumArtist.replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'')));
   const url=new URL('https://archive.org/advancedsearch.php');url.search=new URLSearchParams({q:query,output:'json',rows:'3','fl[]':'identifier,title,creator,licenseurl'});
   const search=await json(url.href,signal),found=search?.response?.docs||[];
   if(Number(search?.response?.numFound||found.length)>3)return remember(key,{items:[],reason:'too-many-source-candidates',review:true});
   const items=[];let excluded=false;
   for(const row of found.slice(0,3)){
    if(!safeItem(row.identifier))continue;
    const data=await json('https://archive.org/metadata/'+encodeURIComponent(row.identifier),signal),m=data.metadata||{};
    if(norm(m.title)!==norm(input.album)||(!compilation&&!(Array.isArray(m.creator)?m.creator:[m.creator]).some(v=>artist(v)===artist(albumArtist))))continue;
    if(!license(m.licenseurl)||!(Array.isArray(m.collection)?m.collection:[m.collection]).includes('freemusicarchive')){excluded=true;continue}
    if(!Array.isArray(data.files)||data.files.length>600){excluded=true;continue}
    items.push({id:row.identifier,metadata:{title:m.title,creator:m.creator,licenseurl:m.licenseurl},files:data.files.filter(f=>f.source==='original'&&/\.mp3$/i.test(f.name||'')).map(f=>Object.fromEntries(['name','title','artist','creator','album','source','length','size','md5','licenseurl'].map(k=>[k,f[k]])))});
   }
   return remember(key,{items,reason:excluded?'source-rights-or-identity-unavailable':'no-open-license-source'});
  })();pending.set(key,task);try{return await task}finally{if(pending.get(key)===task)pending.delete(key)}
 }
 async function resolve(input,{signal}={}){
  if(!input||typeof input!=='object'||[input.artist,input.title,input.album,input.position].some(x=>typeof x!=='string'||x.length>500||/[\x00-\x1f]/.test(x)))throw Error('invalid-track');
  if(!/^[1-9]\d{0,11}$/.test(String(input.releaseId||''))||!input.title.trim()||!input.position.trim()||!input.album.trim()||!input.artist.trim()||/^(?:various|various artists|unknown)$/i.test(input.artist))return {status:'unavailable',reason:'incomplete-recording-identity'};
  const collection=await album(input,signal),dur=seconds(input.duration),files=[];
  for(const item of collection.items){const m=item.metadata;
   for(const f of item.files)if(norm(f.title)===norm(input.title)&&artist(f.artist||f.creator||m.creator)===artist(input.artist)&&norm(f.album||m.title)===norm(input.album)&&license(f.licenseurl||m.licenseurl))files.push({item,f,license:license(f.licenseurl||m.licenseurl)});
  }
  if(files.length!==1)return {status:files.length||collection.review?'review':'unavailable',reason:files.length?'ambiguous-audio-source':collection.items.length?'exact-version-not-found':collection.reason};
  const {item,f,license:lic}=files[0],length=seconds(f.length),size=Number(f.size);
  if(!dur||!length||Math.abs(length-dur)>5)return {status:'review',reason:'recording-duration-mismatch'};
  if(!Number.isSafeInteger(size)||size<1||size>AUDIO_LIMIT)return {status:'unavailable',reason:'audio-size-limit'};
  if(f.name.split('/').some(x=>x==='.'||x==='..')||/[\x00-\x1f]/.test(f.name))throw Error('invalid-source-file');
  const url='https://archive.org/download/'+encodeURIComponent(item.id)+'/'+f.name.split('/').map(encodeURIComponent).join('/');
  assets.set(url,{size,at:now()});if(assets.size>128)assets.delete(assets.keys().next().value);
  return {status:'matched',asset:{url,size,name:f.name,seconds:length},evidence:{provider:'Internet Archive / Free Music Archive',
   recordingId:item.id+'/'+f.name,sourcePage:'https://archive.org/details/'+item.id,license:lic,
   rightsReference:item.id===RESEARCH_RELEASE.item?RESEARCH_RELEASE.rightsReference:'https://archive.org/details/'+item.id,attribution:input.artist+' — '+f.title+' ('+(lic.includes('/zero/')?'CC0':'CC BY')+')',
   sourceChecksum:String(f.md5||''),match:'curated-open-license-exact-artist-title-version-album-duration',recordingSeconds:length,
   requiresReview:true,scope:'open-audio-research; not a full commercial catalog'}};
 }
 async function audio(asset,{signal}={}){
  const approved=assets.get(asset?.url);if(!approved||now()-approved.at>5*60*1000||approved.size!==asset.size)throw Error('invalid-source-asset');
  const bytes=await queued(asset.url,{signal,maxBytes:AUDIO_LIMIT,audio:true});
  if(bytes.length!==asset.size)throw Error('source-size-changed');
  return bytes;
 }
 return {resolve,audio,stats};
}
