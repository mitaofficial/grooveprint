import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {oauthAuthorization,parseTokenBody} from './oauth.mjs';
import {SessionStore} from './store.mjs';
import {validRecordingMbid,lookupAcousticBrainz} from './bpm-open.mjs';
import {createAudioSource,RESEARCH_RELEASE} from './audio-source.mjs';

const folder=dirname(fileURLToPath(import.meta.url));
const audioSource=createAudioSource();
const audioResearch=process.env.NODE_ENV==='development';
let activeAudioResolves=0;
const origin=process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4173';
const publicOrigin=new URL(origin).origin;
const configured=Boolean(process.env.DISCOGS_CONSUMER_KEY && process.env.DISCOGS_CONSUMER_SECRET);
const consumerKey=process.env.DISCOGS_CONSUMER_KEY || '';
const consumerSecret=process.env.DISCOGS_CONSUMER_SECRET || '';
const ua=process.env.DISCOGS_USER_AGENT || 'GROOVEPRINT/3.0-alpha';
const keyHex=process.env.SESSION_ENCRYPTION_KEY || '';
if(process.env.NODE_ENV==='production' && !origin.startsWith('https://'))throw Error('PUBLIC_ORIGIN must be HTTPS in production');
if(!/^[0-9a-f]{64}$/i.test(keyHex))throw Error('SESSION_ENCRYPTION_KEY must be 64 random hex characters');
const store=new SessionStore(process.env.SQLITE_PATH || join(folder,'../.private/sessions.db'),Buffer.from(keyHex,'hex'));
const maxAge=15*60*1000;
const sitePolicy={displayMaxAgeMs:maxAge,commercialApproval:false,imageExportAllowed:false};
const counters=new Map();
const httpError=(status,message)=>Object.assign(new Error(message),{status});
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));}
function cookies(raw=''){const o={};for(const p of raw.split(';')){const at=p.indexOf('=');if(at>0)o[p.slice(0,at).trim()]=p.slice(at+1).trim();}return o;}
function same(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y);}
function throttle(id){let now=Date.now(),prior=(counters.get(id)||[]).filter(t=>now-t<60000);if(prior.length>=45)throw httpError(429,'Too many requests');prior.push(now);counters.set(id,prior);if(counters.size>500)for(const [k,v] of counters)if(v[v.length-1]<now-60000)counters.delete(k);}
async function body(req){let data='',n=0;for await(const b of req){n+=b.length;if(n>8192)throw httpError(413,'Request too large');data+=b.toString();}try{return JSON.parse(data||'{}')}catch{throw httpError(400,'Invalid JSON')}}
let acousticSequence=Promise.resolve();
async function limitedArchiveLookup(mbid){
 const task=async()=>{await new Promise(resolve=>setTimeout(resolve,1100));return lookupAcousticBrainz(mbid,{timeoutMs:7000})};
 const next=acousticSequence.then(task,task);acousticSequence=next.catch(()=>{});return next;
}
let sequence=Promise.resolve(),pauseUntil=0,lastRequest=0;
async function gatedFetch(url,options){const run=async()=>{const wait=Math.max(0,pauseUntil-Date.now(),lastRequest+350-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);try{const r=await fetch(url,{...options,signal:ctrl.signal});if(r.status===429){const secs=Number(r.headers.get('retry-after'));pauseUntil=Date.now()+(Number.isFinite(secs)&&secs>0?Math.min(secs*1000,60000):6000);}return r;}finally{clearTimeout(timer);}};const p=sequence.then(run,run);sequence=p.catch(()=>{});return p;}
async function discogs(path,{method='GET',pair,callback,verifier}={}){const url='https://api.discogs.com'+path;const token=pair?.token,tokenSecret=pair?.secret||'';let last;for(let attempt=0;attempt<3;attempt++){let response;try{response=await gatedFetch(url,{method,headers:{Authorization:oauthAuthorization({method,url,consumerKey,consumerSecret,token,tokenSecret,callback,verifier}),Accept:'application/vnd.discogs.v2.discogs+json','User-Agent':ua}});}catch(e){last=e;if(attempt===2)throw httpError(502,'Discogs network error');await new Promise(r=>setTimeout(r,(attempt+1)*700));continue;}
if(response.ok){const ct=response.headers.get('content-type')||'';return ct.includes('json')?response.json():response.text();}
last=httpError(response.status,'Discogs request failed ('+response.status+')');
if(![429,500,502,503,504].includes(response.status)||attempt===2)throw last;
await new Promise(r=>setTimeout(r,Math.min((attempt+1)*1500,6000)));}
throw last||httpError(502,'Discogs unavailable');}

function normal(item,folderId){const i=item.basic_information||{},labels=i.labels||[];return{discogsInstanceId:String(item.instance_id||''),discogsFolderId:Number(item.folder_id??folderId),releaseId:String(i.id||item.id||''),artist:(i.artists||[]).map(x=>x.name).join(', '),title:String(i.title||''),label:labels.map(x=>x.name).filter(Boolean).join(', '),catalog:labels.map(x=>x.catno).filter(Boolean).join(' / '),year:i.year?String(i.year):'',format:(i.formats||[]).map(x=>x.name).join(' / ')||'Vinyl',added:String(item.date_added||''),sourceUrl:i.id?'https://www.discogs.com/release/'+encodeURIComponent(i.id):''};}
function validVideos(v){return Array.isArray(v)?v.filter(x=>{try{const u=new URL(x.uri);return u.protocol==='https:'&&['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname);}catch{return false}}).slice(0,60).map(x=>({uri:x.uri,title:String(x.title||'').slice(0,200),embed:x.embed===true})):[];}
function sanitRelease(data){
 const mapTrack=t=>({
  position:String(t.position||'').slice(0,30),
  title:String(t.title||'').slice(0,500),
  type_:String(t.type_||'track'),
  duration:String(t.duration||''),
  artists:Array.isArray(t.artists)?t.artists.slice(0,8).map(a=>({name:String(a.name||'').slice(0,160),id:Number(a.id)||0})):[],
  sub_tracks:Array.isArray(t.sub_tracks)?t.sub_tracks.slice(0,100).map(s=>({
   position:String(s.position||'').slice(0,30),title:String(s.title||'').slice(0,500),
   duration:String(s.duration||''),type_:String(s.type_||'track'),
   artists:Array.isArray(s.artists)?s.artists.slice(0,8).map(a=>({name:String(a.name||'').slice(0,160),id:Number(a.id)||0})):[]
  })):undefined
 });
 return {releaseId:String(data.id||''),sourceUrl:'https://www.discogs.com/release/'+encodeURIComponent(data.id),
 tracklist:(data.tracklist||[]).slice(0,300).map(mapTrack),videos:validVideos(data.videos),
 fetchedAt:new Date().toISOString(),category:'CC0_CATALOG'};
}
const server=http.createServer(async(req,res)=>{res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Permissions-Policy','camera=(),microphone=(),geolocation=()');try{const path=new URL(req.url||'/',publicOrigin).pathname;
if(req.method==='GET'&&(path==='/'||path==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.discogs.com https://www.youtube.com"+(audioResearch?" https://archive.org https://*.us.archive.org https://*.eu.archive.org https://*.ca.archive.org":"")+"; frame-src https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self' blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'"});const html=await readFile(join(folder,'../index.html'),'utf8');res.end(process.env.NODE_ENV==='development'?html.replace('<script>', '<script>window.GrooveprintBPMDevelopment=true;</script><script>'):html);return;}
if(req.method==='GET'&&path==='/credits'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="index,follow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GROOVEPRINT — Credits</title><style>body{background:#111;color:#eee;font:16px/1.6 system-ui,sans-serif;max-width:700px;margin:50px auto;padding:0 24px}a{color:#c5d36a}</style></head><body><h1>GROOVEPRINT — Credits</h1><p>GROOVEPRINT is an independent record collection and printable label app.</p><p>Audio tempo estimates are calculated locally by the experimental GROOVEPRINT BPM Engine. Audio is not uploaded.</p><p>Record catalog information is provided by <a href="https://www.discogs.com/">Discogs</a> and is subject to their API terms. GROOVEPRINT is not affiliated with Discogs.</p><p><a href="/">Back to GROOVEPRINT</a></p></body></html>');return;}
if(req.method==='GET'&&['/assets/bpm-tempo.mjs','/assets/bpm-library.js','/assets/bpm-evidence.js','/assets/bpm-worker.mjs','/assets/collection-enrichment.js','/assets/bpm-engine.mjs','/assets/bpm-auto.js'].includes(path)){
 const target=path.slice('/assets/'.length);
 res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(await readFile(join(folder,'../src',target)));return;
}
if(req.method==='GET'&&process.env.NODE_ENV==='development'&&['/assets/bpm-worker-dev.mjs','/assets/bpm-tempo-experiment.mjs','/assets/bpm-decision.mjs','/assets/bpm-compare-v3.mjs'].includes(path)){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'});res.end(await readFile(join(folder,'../src',path.slice('/assets/'.length))));return;}
if(req.method==='GET'&&path==='/health')return send(res,200,{status:'ok',version:'3.0.0-alpha.1',devSha:process.env.NODE_ENV==='development'?process.env.GROOVEPRINT_DEV_SHA||null:undefined});
if(req.method==='GET'&&path==='/examples/grooveprint-demo.csv'){
 const csv=await readFile(join(folder,'../examples/grooveprint-demo.csv'));
 res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="GROOVEPRINT_esempio_fittizio.csv"','Cache-Control':'no-store'});
 res.end(csv);return;
}
if(!path.startsWith('/api/discogs/')&&!path.startsWith('/api/bpm/')&&!path.startsWith('/api/audio/')){res.writeHead(404);res.end('Not Found');return;}
if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'});
if(req.headers.origin&&req.headers.origin!==publicOrigin)throw httpError(403,'Wrong origin');
let sess=store.get(cookies(req.headers.cookie).gp_session);if(!sess){const newSession=store.create();res.setHeader('Set-Cookie','gp_session='+newSession.id+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(origin.startsWith('https:')?'; Secure':''));sess=store.get(newSession.id);}
const csrf=()=>{if(!same(req.headers['x-grooveprint-csrf'],sess.csrf))throw httpError(403,'Invalid CSRF token');};
const auth=()=>{if(!sess.credentials||!sess.username)throw httpError(401,'Not connected to Discogs');};
if(path==='/api/audio/status'&&req.method==='GET')return send(res,200,{enabled:audioResearch,reviewOnly:true,approvedCollection:audioResearch?'freemusicarchive':null,approvedReleaseIds:null,researchExampleReleaseId:audioResearch?RESEARCH_RELEASE.releaseId:null,researchExampleArtist:audioResearch?RESEARCH_RELEASE.artist:null,researchExampleTitle:audioResearch?RESEARCH_RELEASE.album:null,devSha:process.env.NODE_ENV==='development'?process.env.GROOVEPRINT_DEV_SHA||null:undefined,minRequestIntervalMs:1500,
 scope:'research-only FMA CC0/BY audio; general commercial catalog coverage not established',csrf:sess.csrf});
if(path.startsWith('/api/audio/')){
 if(!audioResearch)throw httpError(404,'Automatic audio research is unavailable in this environment');
 if(path==='/api/audio/resolve'&&req.method==='POST'){
  csrf();throttle('audio:'+sess.dbid);throttle('audio-global');
  if(activeAudioResolves>=2){res.setHeader('Retry-After','5');return send(res,429,{error:'Audio research busy; retry later'})}
  const input=await body(req),ctrl=new AbortController(),cancel=()=>ctrl.abort();activeAudioResolves++;res.once('close',cancel);
  try{return send(res,200,await audioSource.resolve(input,{signal:ctrl.signal}))}
  catch(e){if(ctrl.signal.aborted)return;return send(res,/invalid-track/.test(e.message)?400:503,{error:'Audio source unavailable',reason:e.message==='source-rate-limited'?'rate-limited':'source-error'})}
  finally{activeAudioResolves--;res.removeListener('close',cancel)}
 }
 if(path==='/api/audio/example'&&req.method==='GET'){
  throttle('audio-example:'+sess.dbid);const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
  try{const r=await fetch('https://api.discogs.com/releases/'+RESEARCH_RELEASE.releaseId,{signal:ctrl.signal,headers:{Accept:'application/json','User-Agent':ua}});
   if(!r.ok)throw httpError(503,'Public Discogs example unavailable');const d=await r.json(),safe=sanitRelease(d);
   if(safe.releaseId!==RESEARCH_RELEASE.releaseId||!safe.tracklist.some(x=>x.type_==='track'||x.sub_tracks?.length))throw httpError(503,'Public Discogs example has no usable tracklist');
   return send(res,200,{...safe,artist:(d.artists||[]).map(a=>a.name).join(', '),title:String(d.title||''),label:(d.labels||[]).map(x=>x.name).join(', '),format:'File',exampleScope:'open-audio integration control, not techno/hardgroove accuracy'});
  }finally{clearTimeout(timer)}
 }
 throw httpError(404,'Unknown audio endpoint');
}
if(path==='/api/discogs/status'&&req.method==='GET')return send(res,200,{configured,connected:!!sess.credentials,username:sess.username||null,csrf:sess.csrf,policy:sitePolicy});
if(path==='/api/bpm/status'&&req.method==='GET')return send(res,200,{
 engine:'GROOVEPRINT BPM Engine',mode:'local-audio',experimental:true,requiresAudio:true,
 audioUpload:false,catalogLookup:false,algorithm:'grooveprint-onset-acf-v1'
});
if((path==='/api/bpm/lookup'&&req.method==='GET')||(path==='/api/bpm/batch'&&req.method==='POST')){
 if(req.method==='POST')csrf();throttle('retired-bpm:'+sess.dbid);
 return send(res,410,{code:'BPM_CATALOG_RETIRED',error:'Catalog tempo lookup has been retired. Analyze authorized audio locally.'});
}
if(path==='/api/bpm/open/batch'&&req.method==='POST'){
 csrf();throttle('bpm-open-session:'+sess.dbid);throttle('bpm-open-global');
 const request=await body(req);
 if(!Array.isArray(request.tracks)||request.tracks.length<1||request.tracks.length>8)
  throw httpError(400,'Provide 1 to 8 tracks');
 const tracks=request.tracks.map((v,i)=>{
  if(!v||typeof v!=='object')throw httpError(400,'Track object required');
  const id=String(v.id??i).slice(0,64),mbid=validRecordingMbid(v.recordingMbid);
  return {id,mbid};
 });
 const cache=new Map(),results=[];
 for(const item of tracks){
  if(!item.mbid){results.push({id:item.id,status:'unavailable',bpm:null,reason:'recording-mbid-required',source:'AcousticBrainz'});continue}
  if(!cache.has(item.mbid))cache.set(item.mbid,await limitedArchiveLookup(item.mbid));
  results.push({id:item.id,...cache.get(item.mbid)});
 }
 return send(res,200,{provider:'AcousticBrainz',sourceLicense:'CC0',results,
 note:'Archive lookup requires an exact MusicBrainz recording MBID; no title search or fabricated IDs'});
}
if(!configured)throw httpError(503,'Discogs credentials not configured');
if(path==='/api/discogs/connect'&&req.method==='POST'){csrf();throttle(sess.dbid);const token=parseTokenBody(await discogs('/oauth/request_token',{method:'POST',callback:publicOrigin+'/api/discogs/callback'}));store.pendingSet(sess,token.token,token.secret);return send(res,200,{authorizeUrl:'https://www.discogs.com/oauth/authorize?oauth_token='+encodeURIComponent(token.token)});}
if(path==='/api/discogs/callback'&&req.method==='GET'){const q=new URL(req.url,publicOrigin).searchParams;const tok=q.get('oauth_token'),ver=q.get('oauth_verifier'),pending=tok&&ver?store.pendingTake(sess,tok):null;if(!pending){res.writeHead(302,{Location:'/?discogs=authorization_failed'});res.end();return;}const grant=parseTokenBody(await discogs('/oauth/access_token',{method:'POST',pair:{token:pending.token,secret:pending.secret},verifier:ver}));const id=await discogs('/oauth/identity',{pair:grant});if(!id.username)throw httpError(502,'No username returned');store.authorize(sess,String(id.username),grant);res.writeHead(302,{Location:'/?discogs=connected','Cache-Control':'no-store'});res.end();return;}
if(path==='/api/discogs/disconnect'&&req.method==='POST'){csrf();store.disconnect(sess);return send(res,200,{connected:false});}
auth();throttle(sess.dbid);
const username=encodeURIComponent(sess.username),pair=sess.credentials;
if(path==='/api/discogs/folders'&&req.method==='GET'){const data=await discogs('/users/'+username+'/collection/folders',{pair});return send(res,200,{fetchedAt:new Date().toISOString(),category:'RESTRICTED_USER_COLLECTION',folders:(data.folders||[]).map(f=>({id:Number(f.id),name:String(f.name||'Folder'),count:Number(f.count)||0})).filter(f=>Number.isInteger(f.id))});}
if(path==='/api/discogs/sync'&&req.method==='POST'){csrf();const b=await body(req),f=Number(b.folderId),p=Number(b.page);if(!Number.isInteger(f)||f<0||f>999999999||!Number.isInteger(p)||p<1||p>10000)throw httpError(400,'Invalid folder or page');const data=await discogs('/users/'+username+'/collection/folders/'+f+'/releases?page='+p+'&per_page=100',{pair});return send(res,200,{pagination:{page:Number(data.pagination?.page)||p,pages:Number(data.pagination?.pages)||1,items:Number(data.pagination?.items)||0},releases:(data.releases||[]).map(x=>normal(x,f)),category:'RESTRICTED_USER_COLLECTION',fetchedAt:new Date().toISOString()});}
const found=path.match(/^\/api\/discogs\/releases\/([1-9]\d{0,11})$/);if(found&&req.method==='GET')return send(res,200,sanitRelease(await discogs('/releases/'+found[1],{pair})));
if(path==='/api/discogs/discover'&&req.method==='GET'){const q=new URL(req.url,publicOrigin).searchParams;const args=new URLSearchParams({type:'release',per_page:'30',page:'1'});for(const k of ['q','artist','genre','style']){const v=(q.get(k)||'').trim().slice(0,90);if(v)args.set(k,v);}if(args.size===3)throw httpError(400,'Enter search terms');const data=await discogs('/database/search?'+args.toString(),{pair});return send(res,200,{releases:(data.results||[]).filter(x=>x.type==='release'&&Number.isInteger(Number(x.id))).slice(0,30).map(x=>({releaseId:String(x.id),title:String(x.title||''),label:(x.label||[]).join(', '),catalog:String(x.catno||''),year:String(x.year||''),genre:x.genre||[],style:x.style||[],sourceUrl:'https://www.discogs.com/release/'+x.id})),category:'CC0_CATALOG_METADATA',fetchedAt:new Date().toISOString(),source:'Discogs API',noStorage:true});}
throw httpError(404,'Unknown API endpoint');
}catch(e){const status=[400,401,403,404,413,429,500,502,503,504].includes(e.status)?e.status:502;send(res,status,{error:status===502?'Discogs unavailable; please retry':e.message||'Request failed'});}});
const port=Number(process.env.PORT)||4173;
server.listen(port,'0.0.0.0',()=>console.log('GROOVEPRINT listening on '+port+'; Discogs '+(configured?'configured':'not configured')));
