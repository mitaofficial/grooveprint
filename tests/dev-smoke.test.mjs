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
