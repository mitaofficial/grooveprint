/**
 * GROOVEPRINT local Chromium BPM validation.
 * Browser reads selected files from disk via Playwright; the HTTP server only
 * serves an empty test page and the checked-in DSP module. No audio HTTP route.
 */
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname,relative,sep,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),args=process.argv.slice(2);
const flag=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]};
if(args.includes('--help')){
 console.log('Usage: node scripts/bpm-browser-benchmark.mjs --manifest .private/tempo-dataset/manifest.json [--out .private/benchmarks/browser]');
 console.log('Requires local Playwright + Chromium. No files/audio are uploaded to a server.');
 process.exit(0);
}
const manifestFile=resolve(root,flag('--manifest','.private/tempo-dataset/manifest.json'));
const output=resolve(root,flag('--out','.private/benchmarks/browser'));
const manifest=JSON.parse(await readFile(manifestFile,'utf8'));
if(!Array.isArray(manifest.tracks))throw Error('Manifest must contain tracks[]');
const seen=new Set(),jobs=[];
for(const item of manifest.tracks){
 if(!item||typeof item.id!=='string'||!/^[a-z0-9_-]{1,64}$/i.test(item.id)||seen.has(item.id))throw Error('Invalid or duplicate opaque recording id');
 if(typeof item.file!=='string'||isAbsolute(item.file))throw Error('File must be a relative path');
 if(!['verified','variable','ambiguous','unavailable'].includes(item.groundTruthStatus))throw Error('Invalid ground truth status: '+item.id);
 if(item.groundTruthStatus==='verified'&&(!Number.isFinite(item.groundTruthBpm)||item.groundTruthBpm<20||item.groundTruthBpm>300||!item.verificationMethod))throw Error('Verified item needs independently checked BPM and method: '+item.id);
 const full=resolve(dirname(manifestFile),item.file),rel=relative(dirname(manifestFile),full);
 if(rel==='..'||rel.startsWith('..'+sep))throw Error('Audio must remain inside manifest directory');
 seen.add(item.id);
 jobs.push({id:item.id,category:String(item.category||'unspecified').slice(0,80),
  groundTruthBpm:item.groundTruthStatus==='verified'?item.groundTruthBpm:null,groundTruthStatus:item.groundTruthStatus,file:full});
}
const {chromium}=await import('playwright');
const js=await readFile(resolve(root,'src/bpm-tempo.mjs'),'utf8');
const server=createServer((req,res)=>{
 if(req.url==='/tempo.mjs'){res.writeHead(200,{'content-type':'application/javascript; charset=utf-8','cache-control':'no-store'});res.end(js);return}
 res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
 res.end('<!doctype html><title>Local BPM Validation</title><input id="audio" type="file" accept="audio/*">');
});
let browser;
try{
 await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen)});
 const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 const page=await context.newPage();
 await page.route('**/*',route=>{
  if(route.request().url().startsWith(origin+'/'))return route.continue();
  return route.abort();
 });
 await page.goto(origin+'/');
 const rows=[];
 for(const job of jobs){
  let result={id:job.id,category:job.category,groundTruthBpm:job.groundTruthBpm,
   groundTruthStatus:job.groundTruthStatus,status:'decode-error',bpm:null,requiresReview:false,
   candidates:[],decodeMs:null,estimateMs:null,sampleRate:null,reason:'local-browser-decode-failed'};
  try{
   const info=await stat(job.file);
   if(info.size>160*1024*1024||info.size===0)throw Error('Invalid size');
   await page.locator('#audio').setInputFiles(job.file);
   const value=await page.evaluate(async()=>{
    const file=document.getElementById('audio').files[0];
    const audio=new (window.AudioContext||window.webkitAudioContext)();
    try{
     const start=performance.now();
     const decoded=await audio.decodeAudioData(await file.arrayBuffer());
     const decodeMs=performance.now()-start;
     const detector=(await import('/tempo.mjs')).estimateLocalTempo;
     const begin=performance.now(),output=detector(decoded),estimateMs=performance.now()-begin;
     return {status:output.status,bpm:output.bpm,requiresReview:output.requiresReview===true,
      candidates:(output.bpmCandidates||[]).map(x=>x.bpm),reason:output.reason,
      decodeMs,estimateMs,sampleRate:decoded.sampleRate};
    }finally{await audio.close()}
   });
   result={...result,...value,reason:String(value.reason||'')};
  }catch{
   // Never emit private filenames or full local paths in logs.
  }
  rows.push(result);
 }
 const verified=rows.filter(r=>r.groundTruthStatus==='verified');
 const predicted=verified.filter(r=>r.status==='estimated'&&Number.isFinite(r.bpm));
 const accepted=predicted.filter(r=>!r.requiresReview);
 const pct=(good,total)=>total?Number((100*good/total).toFixed(2)):null;
 const accurate=(r,n)=>Math.abs(r.bpm-r.groundTruthBpm)<=n;
 const totalError=predicted.reduce((sum,r)=>sum+Math.abs(r.bpm-r.groundTruthBpm),0);
 const sum={records:rows.length,verified:verified.length,predicted:predicted.length,accepted:accepted.length,
  decodeFailures:rows.filter(r=>r.status==='decode-error').length,
  top1Within1Pct:pct(predicted.filter(r=>accurate(r,1)).length,predicted.length),
  acceptedWithin1Pct:pct(accepted.filter(r=>accurate(r,1)).length,accepted.length),
  coveragePct:pct(predicted.length,verified.length),autoAcceptedPct:pct(accepted.length,verified.length),
  octaveErrorPct:pct(predicted.filter(r=>Math.abs(r.bpm-r.groundTruthBpm*2)<=2||Math.abs(r.bpm-r.groundTruthBpm/2)<=2).length,predicted.length),
  mae:predicted.length?Number((totalError/predicted.length).toFixed(4)):null};
 await mkdir(output,{recursive:true});
 await writeFile(resolve(output,'browser-summary.json'),JSON.stringify({kind:'Chromium Web Audio local playback-free decode',realAudioValidation:rows.length?'TESTED':'NOT TESTED',metrics:sum},null,2)+'\n');
 const keys=['id','category','groundTruthStatus','groundTruthBpm','status','bpm','requiresReview','reason','candidates','decodeMs','estimateMs','sampleRate'];
 const csv=v=>'"'+(Array.isArray(v)?v.join(';'):v??'').toString().replaceAll('"','""')+'"';
 await writeFile(resolve(output,'browser-results.csv'),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>csv(r[k])).join(',')).join('\n')+'\n');
 console.log(JSON.stringify({kind:'local-chromium-bpm-benchmark',out:relative(root,output),metrics:sum}));
}finally{
 if(browser)await browser.close().catch(()=>{});
 await new Promise(done=>server.listening?server.close(done):done());
}
