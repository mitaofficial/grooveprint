import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {SessionStore} from '../server/store.mjs';
async function freePort(){const socket=createServer();await new Promise((yes,no)=>socket.once('error',no).listen(0,'127.0.0.1',yes));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port}
for(const legacyKey of ['', 'dummy-retired-key-must-have-no-effect'])test('internal engine server contract and zero backend egress '+(legacyKey?'with':'without')+' a legacy key',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'gp-test-')),port=await freePort(),audit=join(temp,'egress.jsonl'),db=join(temp,'session.db');
 await writeFile(audit,'');
 const store=new SessionStore(db,Buffer.from('a'.repeat(64),'hex')),session=store.create();
 store.authorize(store.get(session.id),'FIXTURE_ACCOUNT',{token:'fixture-token',secret:'fixture-secret'});store.close();
 const env={...process.env,NODE_ENV:'test',PUBLIC_ORIGIN:'http://127.0.0.1:'+port,PORT:String(port),SQLITE_PATH:db,
  SESSION_ENCRYPTION_KEY:'a'.repeat(64),DISCOGS_CONSUMER_KEY:'test',DISCOGS_CONSUMER_SECRET:'test',
  GROOVEPRINT_TEST_NETWORK_AUDIT:audit,GETSONGBPM_API_KEY:legacyKey};
 const app=spawn(process.execPath,['--import',resolve('tests/fixtures/outbound-network-audit.mjs'),'server/app.mjs'],{cwd:process.cwd(),env,stdio:['ignore','pipe','pipe']});
 let errors='';app.stderr.on('data',buf=>errors+=String(buf).slice(0,3000));const url='http://127.0.0.1:'+port;
 try{
  for(let n=0;n<75;n++){if(app.exitCode!==null)throw Error('Server exited '+errors);try{if((await fetch(url+'/health')).ok)break}catch{}await delay(75)}
  const html=await fetch(url+'/'),text=await html.text();assert.equal(html.status,200);assert.ok(!/getsongbpm|getsong\.co|gsb-public/i.test(text));
  assert.ok(text.includes('/assets/collection-enrichment.js'));
  for(const asset of ['collection-enrichment.js','bpm-library.js','bpm-worker.mjs','bpm-evidence.js','bpm-tempo.mjs'])assert.equal((await fetch(url+'/assets/'+asset)).status,200,asset);
  assert.equal((await fetch(url+'/assets/auto-bpm.js')).status,404);
  const status=await (await fetch(url+'/api/bpm/status')).json();
  assert.deepEqual(status,{engine:'GROOVEPRINT BPM Engine',mode:'local-audio',experimental:true,requiresAudio:true,audioUpload:false,catalogLookup:false,algorithm:'grooveprint-onset-acf-v1'});
  const cookie='gp_session='+session.id,headers={Cookie:cookie,'Content-Type':'application/json','X-GROOVEPRINT-CSRF':session.csrf};
  const connected=await (await fetch(url+'/api/discogs/status',{headers})).json();assert.equal(connected.connected,true);assert.equal('bpmProviderConfigured' in connected,false);
  for(const [path,options] of [['/api/bpm/lookup?artist=Fixture&title=Original',{}],['/api/bpm/batch',{method:'POST',body:JSON.stringify({tracks:[{id:'A1',artist:'Fixture',title:'Original'}]})}]]){
   const response=await fetch(url+path,{...options,headers});assert.equal(response.status,410);assert.equal((await response.json()).code,'BPM_CATALOG_RETIRED');
  }
  const badCsrf=await fetch(url+'/api/bpm/batch',{method:'POST',headers:{Cookie:cookie},body:'{}'});assert.equal(badCsrf.status,403);
  const wrongOrigin=await fetch(url+'/api/bpm/lookup',{headers:{...headers,Origin:'https://invalid.example'}});assert.equal(wrongOrigin.status,403);
  const protectedSync=await fetch(url+'/api/discogs/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(protectedSync.status,401);
  const open=await fetch(url+'/api/bpm/open/batch',{method:'POST',headers,body:JSON.stringify({tracks:[{id:'A1',recordingMbid:'invalid-id'}]})});
  assert.equal(open.status,200);assert.equal((await open.json()).results[0].reason,'recording-mbid-required');
  const credits=await (await fetch(url+'/credits')).text();assert.ok(!/getsongbpm|getsong\.co/i.test(credits));assert.match(credits,/GROOVEPRINT BPM Engine/);
  assert.equal(await readFile(audit,'utf8'),'','No outgoing request from backend, including authenticated retired endpoints');
 }finally{app.kill('SIGTERM');await delay(100);await rm(temp,{force:true,recursive:true})}
});
