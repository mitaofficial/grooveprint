import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const guard=resolve('scripts/repository-guard.mjs');
async function fixture(fn){
 const root=await mkdtemp(join(tmpdir(),'gp-guard-'));
 try{
  execFileSync('git',['init','-q',root]);
  await mkdir(join(root,'scripts'));
  await writeFile(join(root,'package.json'),JSON.stringify({type:'module',engines:{node:'>=22.13'},scripts:{test:'node --test', 'test:syntax':'node --check', 'test:guard':'node scripts/repository-guard.mjs',validate:'npm test'}}));
  await writeFile(join(root,'railway.json'),JSON.stringify({build:{builder:'DOCKERFILE'},deploy:{healthcheckPath:'/health'}}));
  await writeFile(join(root,'.gitignore'),'.env\n.private/\n');
  await writeFile(join(root,'.dockerignore'),'.env\n.private\n');
  await writeFile(join(root,'scripts','repository-guard.mjs'),'// placeholder');
  execFileSync('git',['-C',root,'add','-A']);
  await fn(root);
 }finally{await rm(root,{recursive:true,force:true})}
}
const run=root=>spawnSync(process.execPath,[guard,'--root',root],{encoding:'utf8',timeout:20000});

test('guard accepts a clean tracked source checkout',()=>fixture(async root=>{
 const p=run(root);
 assert.equal(p.status,0,p.stderr);
 assert.match(p.stdout,/repository guard OK/);
}));

test('guard rejects staged private audio and environment secrets',()=>fixture(async root=>{
 await writeFile(join(root,'private.wav'),Buffer.alloc(64));
 await writeFile(join(root,'.env.production'),'DISCOGS_CONSUMER_SECRET=placeholder');
 execFileSync('git',['-C',root,'add','-f','private.wav','.env.production']);
 const p=run(root);
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/Audio\/video media tracked/);
 assert.match(p.stderr,/Private environment file tracked/);
}));

test('guard rejects invalid deployment JSON',()=>fixture(async root=>{
 await writeFile(join(root,'railway.json'),'{invalid json');
 const p=run(root);
 assert.notEqual(p.status,0);
 assert.match(p.stderr,/railway.json is absent or invalid JSON/);
}));
