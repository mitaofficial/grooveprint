import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

test('development launcher serves the real app with isolated in-memory sessions and no setup secrets',async()=>{
 const socket=createServer();await new Promise((yes,no)=>socket.once('error',no).listen(0,'127.0.0.1',yes));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const temp=await mkdtemp(join(tmpdir(),'gp-dev-')),sentinel=join(temp,'existing.sqlite'),marker='do not open or overwrite';
 await writeFile(sentinel,marker);
 const inheritedKey='f'.repeat(64),url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['scripts/dev.mjs'],{env:{...process.env,NODE_ENV:'development',PORT:String(port),PUBLIC_ORIGIN:url,
  SQLITE_PATH:sentinel,SESSION_ENCRYPTION_KEY:inheritedKey,DISCOGS_CONSUMER_KEY:'',DISCOGS_CONSUMER_SECRET:''},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
 const closed=new Promise(resolve=>child.once('close',resolve));
 try{
  let ready=false;
  for(let i=0;i<80;i++){if(child.exitCode!==null)throw Error('Development server exited: '+logs);try{if((await fetch(url+'/health')).ok){ready=true;break}}catch{}await delay(75)}
  assert.ok(ready,'development server did not become ready');
  const response=await fetch(url+'/');assert.equal(response.status,200);assert.match(await response.text(),/\/assets\/bpm-library.js/);
  for(const asset of ['bpm-worker-dev.mjs','bpm-tempo-experiment.mjs'])assert.equal((await fetch(url+'/assets/'+asset)).status,200);
  assert.match(await(await fetch(url+'/')).text(),/window.GrooveprintBPMDevelopment=true/);
  const status=await(await fetch(url+'/api/discogs/status')).json();assert.equal(status.connected,false);assert.equal(status.configured,false);
  const csrf=status.csrf;assert.ok(typeof csrf==='string'&&csrf.length>20,'normal session/CSRF protection must still exist');
  assert.equal(await readFile(sentinel,'utf8'),marker,'configured databases must stay untouched');
  assert.ok(!logs.includes(inheritedKey),'development logs must not expose a key');assert.match(logs,/sessions are in memory/);
 }finally{child.kill('SIGTERM');await closed;await rm(temp,{recursive:true,force:true})}
});
test('development launcher refuses production mode and invalid ports before starting',()=>{
 for(const env of [{NODE_ENV:'production',PORT:'4173'},{NODE_ENV:'development',PORT:'70000'}]){
  const child=spawnSync(process.execPath,['scripts/dev.mjs'],{env:{...process.env,...env},encoding:'utf8',timeout:3000});
  assert.equal(child.status,1);assert.match(child.stderr,/local-only|PORT must/);assert.ok(!child.stdout.includes('listening'));
 }
});
test('production server cannot expose comparison modules or activate the local experiment',async()=>{
 const socket=createServer();await new Promise((yes,no)=>socket.once('error',no).listen(0,'127.0.0.1',yes));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const child=spawn(process.execPath,['server/app.mjs'],{env:{...process.env,NODE_ENV:'production',PORT:String(port),PUBLIC_ORIGIN:'https://preview.invalid',SQLITE_PATH:':memory:',SESSION_ENCRYPTION_KEY:'a'.repeat(64)},stdio:['ignore','pipe','pipe']});
 const closed=new Promise(resolve=>child.once('close',resolve));const base='http://127.0.0.1:'+port;
 try{
  let ready=false;for(let n=0;n<60;n++){if(child.exitCode!==null)throw Error('Production test server exited');try{if((await fetch(base+'/health')).ok){ready=true;break}}catch{}await delay(60)}
  assert.ok(ready);assert.ok(!(await(await fetch(base+'/')).text()).includes('window.GrooveprintBPMDevelopment=true'));
  for(const file of ['bpm-worker-dev.mjs','bpm-tempo-experiment.mjs'])assert.equal((await fetch(base+'/assets/'+file+'?compare=1')).status,404);
  assert.equal((await fetch(base+'/assets/bpm-engine.mjs')).status,200);
 }finally{child.kill('SIGTERM');await closed}
});
