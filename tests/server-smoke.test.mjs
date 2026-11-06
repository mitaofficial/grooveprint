import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
async function freePort(){
 const socket=createServer();
 await new Promise((resolve,reject)=>socket.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port;
}
test('real Node server health, static BPM worker and no-key API safety',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'gp-test-')),port=await freePort();
 const app=spawn(process.execPath,['server/app.mjs'],{cwd:process.cwd(),env:{...process.env,
   NODE_ENV:'test',PUBLIC_ORIGIN:'http://127.0.0.1:'+port,
   PORT:String(port),SQLITE_PATH:join(temp,'session.db'),
   SESSION_ENCRYPTION_KEY:'a'.repeat(64),
   DISCOGS_CONSUMER_KEY:'test',DISCOGS_CONSUMER_SECRET:'test',
   GETSONGBPM_API_KEY:''},stdio:['ignore','pipe','pipe']});
 let errors='';app.stderr.on('data',buf=>{errors+=String(buf).slice(0,3000)});
 const url='http://127.0.0.1:'+port;
 async function ready(){
  for(let n=0;n<75;n++){
   if(app.exitCode!==null)throw Error('Server exited early '+errors);
   try{const r=await fetch(url+'/health');if(r.ok)return;}catch{}
   await delay(75);
  }throw Error('Server did not become ready '+errors);
 }
 try{
  await ready();
  const health=await fetch(url+'/health');assert.equal((await health.json()).status,'ok');
  const html=await fetch(url+'/');assert.equal(html.status,200);
  assert.match(await html.text(),/<script src="\/assets\/auto-bpm\.js"><\/script>/);
  const worker=await fetch(url+'/assets/auto-bpm.js');assert.equal(worker.status,200);
  assert.match(await worker.text(),/ZERO-CLICK BPM INTELLIGENCE/);
  const status=await fetch(url+'/api/bpm/status');assert.equal(status.status,200);
  assert.equal((await status.json()).configured,false);
  const denied=await fetch(url+'/api/bpm/batch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:[{id:'1',artist:'A',title:'B'}]})});
  assert.notEqual(denied.status,200,'unauthenticated batch lookup must never call provider');
  const session=await fetch(url+'/api/discogs/status');
  const token=(await session.json()).csrf;
  const cookie=session.headers.get('set-cookie')?.split(';')[0]||'';
  assert.ok(token&&cookie,'session and CSRF should be provided');
  const open=await fetch(url+'/api/bpm/open/batch',{
   method:'POST',headers:{'Content-Type':'application/json','X-GROOVEPRINT-CSRF':token,Cookie:cookie},
   body:JSON.stringify({tracks:[{id:'A1',recordingMbid:'invalid-id'}]})
  });
  assert.equal(open.status,200,'CC0 adapter must not require Discogs OAuth or GetSongBPM key');
  const result=(await open.json()).results[0];
  assert.equal(result.id,'A1');assert.equal(result.bpm,null);
  assert.equal(result.reason,'recording-mbid-required');
  const tempoScript=await fetch(url+'/assets/bpm-tempo.mjs');
  assert.equal(tempoScript.status,200);assert.match(await tempoScript.text(),/estimateLocalTempo/);
  const folderScript=await fetch(url+'/assets/bpm-library.js');
  assert.equal(folderScript.status,200);assert.match(await folderScript.text(),/CONNECT AUDIO LIBRARY/);
  const credits=await fetch(url+'/credits');assert.equal(credits.status,200);
  assert.match(await credits.text(),/getsongbpm\.com/i);
 }finally{
  app.kill('SIGTERM');await delay(100);await rm(temp,{force:true,recursive:true});
 }
});
