import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {oauthAuthorization,parseTokenBody} from './oauth.mjs';
import {SessionStore} from './store.mjs';
import {resolveEvidence} from './bpm-match.mjs';

const folder=dirname(fileURLToPath(import.meta.url));
const origin=process.env.PUBLIC_ORIGIN || 'http://127.0.0.1:4173';
const publicOrigin=new URL(origin).origin;
const configured=Boolean(process.env.DISCOGS_CONSUMER_KEY && process.env.DISCOGS_CONSUMER_SECRET);
const consumerKey=process.env.DISCOGS_CONSUMER_KEY || '';
const consumerSecret=process.env.DISCOGS_CONSUMER_SECRET || '';
const ua=process.env.DISCOGS_USER_AGENT || 'GROOVEPRINT/1.9.2';
const getSongKey=process.env.GETSONGBPM_API_KEY||'';
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
let sequence=Promise.resolve(),pauseUntil=0,lastRequest=0;
async function gatedFetch(url,options){const run=async()=>{const wait=Math.max(0,pauseUntil-Date.now(),lastRequest+350-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));lastRequest=Date.now();const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);try{const r=await fetch(url,{...options,signal:ctrl.signal});if(r.status===429){const secs=Number(r.headers.get('retry-after'));pauseUntil=Date.now()+(Number.isFinite(secs)&&secs>0?Math.min(secs*1000,60000):6000);}return r;}finally{clearTimeout(timer);}};const p=sequence.then(run,run);sequence=p.catch(()=>{});return p;}
async function discogs(path,{method='GET',pair,callback,verifier}={}){const url='https://api.discogs.com'+path;const token=pair?.token,tokenSecret=pair?.secret||'';let last;for(let attempt=0;attempt<3;attempt++){let response;try{response=await gatedFetch(url,{method,headers:{Authorization:oauthAuthorization({method,url,consumerKey,consumerSecret,token,tokenSecret,callback,verifier}),Accept:'application/vnd.discogs.v2.discogs+json','User-Agent':ua}});}catch(e){last=e;if(attempt===2)throw httpError(502,'Discogs network error');await new Promise(r=>setTimeout(r,(attempt+1)*700));continue;}
if(response.ok){const ct=response.headers.get('content-type')||'';return ct.includes('json')?response.json():response.text();}
last=httpError(response.status,'Discogs request failed ('+response.status+')');
if(![429,500,502,503,504].includes(response.status)||attempt===2)throw last;
await new Promise(r=>setTimeout(r,Math.min((attempt+1)*1500,6000)));}
throw last||httpError(502,'Discogs unavailable');}

function normalizedSong(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'').replace(/[^a-z0-9]+/gi,' ').toLowerCase().trim().replace(/\s+/g,' ');}
function strictSongMatch(expected,candidate){
 const left=normalizedSong(expected),right=normalizedSong(candidate);
 return left.length>=2&&left===right;
}
function providerArtist(x){if(typeof x==='string')return x;if(x&&typeof x==='object')return String(x.name||'');return '';}
async function getSongBpmLookup(artist,title){
 if(!getSongKey)throw httpError(503,'GetSongBPM API not configured on Railway');
 const q=new URLSearchParams({type:'both',lookup:'song:'+title+' artist:'+artist,limit:'15'});
 const url='https://api.getsong.co/search/?'+q;
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 let r;try{r=await fetch(url,{headers:{'X-API-KEY':getSongKey,'Accept':'application/json'},signal:controller.signal});}catch{throw httpError(502,'GetSongBPM network error')}finally{clearTimeout(timeout)}
 if(!r.ok)throw httpError(r.status===429?429:502,'GetSongBPM API responded with '+r.status);
 let data;try{data=await r.json()}catch{throw httpError(502,'GetSongBPM returned invalid data')}
 const arr=Array.isArray(data.search)?data.search:[];
 const candidates=arr.slice(0,15).map(item=>{
   const titleReturned=String(item.title||'').slice(0,160);
   const artists=Array.isArray(item.artist)?item.artist:[item.artist];
   const artistReturned=artists.map(providerArtist).filter(Boolean).join(', ').slice(0,180);
   const bpm=Number(item.tempo);
   const url=String(item.uri||'');
   const validUrl=/^https:\/\/(?:www\.)?getsongbpm\.com\/(?:song|artist)\//.test(url)?url:'https://getsongbpm.com/';
   const exactTitle=strictSongMatch(title,titleReturned);
   const exactArtist=artists.some(a=>strictSongMatch(artist,providerArtist(a)));
   const match=exactArtist&&exactTitle?'exact':exactTitle?'title-only':'unverified';
   return {title:titleReturned,artist:artistReturned,artists:artists.map(providerArtist).filter(Boolean),bpm:Number.isFinite(bpm)&&bpm>=40&&bpm<=300?bpm:null,match,url:validUrl};
 }).filter(x=>x.bpm!==null);
 candidates.sort((a,b)=>({exact:0,'title-only':1,unverified:2}[a.match]-{exact:0,'title-only':1,unverified:2}[b.match]));
 return {provider:'GetSongBPM',source:'https://getsongbpm.com/',candidates,exactMatches:candidates.filter(x=>x.match==='exact').length};
}

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
if(req.method==='GET'&&(path==='/'||path==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com https://s.ytimg.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.discogs.com https://www.youtube.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; media-src 'self' blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'"});res.end(await readFile(join(folder,'../index.html')));return;}
if(req.method==='GET'&&path==='/credits'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'});res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="index,follow"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GROOVEPRINT — Credits</title><style>body{background:#111;color:#eee;font:16px/1.6 system-ui,sans-serif;max-width:700px;margin:50px auto;padding:0 24px}a{color:#c5d36a}</style></head><body><h1>GROOVEPRINT — Credits</h1><p>GROOVEPRINT is an independent record collection and printable label app.</p><p>For BPM catalog lookups (when configured), we credit and link to <a href="https://getsongbpm.com/">GetSongBPM.com</a>.</p><p>Record catalog information is provided by <a href="https://www.discogs.com/">Discogs</a> and is subject to their API terms. GROOVEPRINT is not affiliated with either service.</p><p><a href="/">Back to GROOVEPRINT</a></p></body></html>');return;}
if(req.method==='GET'&&path==='/assets/auto-bpm.js'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(await readFile(join(folder,'../src/auto-bpm.js')));return;}
if(req.method==='GET'&&path==='/health')return send(res,200,{status:'ok',version:'1.9.2'});
if(!path.startsWith('/api/discogs/')&&!path.startsWith('/api/bpm/')){res.writeHead(404);res.end('Not Found');return;}
if(!['GET','POST'].includes(req.method))return send(res,405,{error:'Method not allowed'});
if(req.headers.origin&&req.headers.origin!==publicOrigin)throw httpError(403,'Wrong origin');
let sess=store.get(cookies(req.headers.cookie).gp_session);if(!sess){const newSession=store.create();res.setHeader('Set-Cookie','gp_session='+newSession.id+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800'+(origin.startsWith('https:')?'; Secure':''));sess=store.get(newSession.id);}
const csrf=()=>{if(!same(req.headers['x-grooveprint-csrf'],sess.csrf))throw httpError(403,'Invalid CSRF token');};
const auth=()=>{if(!sess.credentials||!sess.username)throw httpError(401,'Not connected to Discogs');};
if(path==='/api/discogs/status'&&req.method==='GET')return send(res,200,{configured,connected:!!sess.credentials,username:sess.username||null,csrf:sess.csrf,policy:sitePolicy,bpmProviderConfigured:Boolean(getSongKey)});
if(path==='/api/bpm/status'&&req.method==='GET')return send(res,200,{configured:Boolean(getSongKey),provider:'GetSongBPM',source:'https://getsongbpm.com/'});
if(path==='/api/bpm/lookup'&&req.method==='GET'){auth();throttle('bpm:'+sess.dbid);const query=new URL(req.url,publicOrigin).searchParams;const artist=String(query.get('artist')||'').trim(),title=String(query.get('title')||'').trim();if(!artist||!title||artist.length>160||title.length>160)throw httpError(400,'Artist and title are required, max 160 chars each');return send(res,200,await getSongBpmLookup(artist,title));}
if(path==='/api/bpm/batch'&&req.method==='POST'){
 csrf();auth();throttle('bpm-batch:'+sess.dbid);
 const payload=await body(req);
 if(!Array.isArray(payload.tracks)||payload.tracks.length<1||payload.tracks.length>12)throw httpError(400,'Pass between 1 and 12 tracks');
 const entries=payload.tracks.map((item,i)=>{
  if(!item||typeof item!=='object')throw httpError(400,'Track object required');
  const artist=String(item.artist||'').trim(),title=String(item.title||'').trim(),id=String(item.id??i).slice(0,96);
  if(!title||title.length>160||artist.length>160)throw httpError(400,'Invalid track identity');
  return {artist,title,id};
 });
 if(!getSongKey)return send(res,200,{configured:false,provider:'GetSongBPM',results:entries.map(x=>({id:x.id,status:'provider-unavailable',bpm:null,reason:'provider-not-configured'}))});
 const results=[];
 for(const x of entries){
  try{
   if(!x.artist||/^(?:various(?: artists)?|v\.?\s*a\.?|unknown)$/i.test(x.artist)) {
    results.push({id:x.id,status:'review',bpm:null,reason:'missing-track-artist'});continue;
   }
   throttle('bpm-provider:'+sess.dbid);
   const evidence=await getSongBpmLookup(x.artist,x.title);
   const resolved=resolveEvidence(x,evidence);
   results.push({id:x.id,...resolved});
  }catch(error){
   const status=error.status||502;
   results.push({id:x.id,status:status===429?'rate-limited':'error',bpm:null,reason:status===429?'provider-rate-limit':'provider-error'});
   if(status===429)break;
  }
 }
 return send(res,200,{configured:true,provider:'GetSongBPM',results});
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