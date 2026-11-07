/**
 * GROOVEPRINT fast, offline repository preflight.
 * Uses the Git index (not a filesystem scan) to prevent committing private
 * audio, databases and credentials. Safe for CI and developers' computers.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const args=process.argv.slice(2);
const flag=args.indexOf('--root');
if (flag>=0 && (!args[flag+1] || flag!==0 || args.length!==2)) {
  throw new Error('Usage: node scripts/repository-guard.mjs [--root PROJECT_DIRECTORY]');
}
if (flag===-1 && args.length) {
  throw new Error('Usage: node scripts/repository-guard.mjs [--root PROJECT_DIRECTORY]');
}
const root=resolve(flag===0?args[1]:process.cwd());
const errors=[];
const assert=(condition,message)=>{if(!condition)errors.push(message)};
const text=relative=>readFileSync(join(root,relative),'utf8');

let pkg,railway;
try { pkg=JSON.parse(text('package.json')); }
catch(e) {errors.push('package.json is absent or invalid JSON');}
try { railway=JSON.parse(text('railway.json')); }
catch(e) {errors.push('railway.json is absent or invalid JSON');}
if(pkg){
 assert(pkg.type==='module','package.json must stay type=module');
 assert(typeof pkg.scripts?.test==='string','npm test script missing');
 assert(typeof pkg.scripts?.['test:syntax']==='string','Syntax test script missing');
 assert(typeof pkg.scripts?.['test:guard']==='string','Repository guard script missing');
 assert(typeof pkg.scripts?.validate==='string','npm run validate script missing');
 assert(/>=\s*22/.test(String(pkg.engines?.node||'')),'Node 22+ engine restriction missing');
}
if(railway){
 assert(railway.build?.builder==='DOCKERFILE','Railway Dockerfile builder must be explicit');
 assert(railway.deploy?.healthcheckPath==='/health','Railway healthcheck must be /health');
}
try {
 const ignore=text('.gitignore');
 assert(/^\.private\/?\s*$/m.test(ignore),'Private benchmark files must be Git-ignored');
 assert(/^\.env\s*$/m.test(ignore),'Secrets must be Git-ignored');
}catch(e){errors.push('.gitignore is absent or unreadable')}
try {
 const ignore=text('.dockerignore');
 assert(/^\.private\/?\s*$/m.test(ignore),'Private data must be Docker-ignored');
 assert(/^\.env\s*$/m.test(ignore),'Secrets must be Docker-ignored');
}catch(e){errors.push('.dockerignore is absent or unreadable')}

let tracked=[];
try {
 tracked=execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8',timeout:10000,maxBuffer:10*1024*1024})
  .split('\0').filter(Boolean).map(p=>p.replaceAll('\\','/'));
}catch(e) { errors.push('Cannot inspect tracked Git files; run in a checked-out repository'); }
for(const file of tracked){
 const lower=file.toLowerCase();
 if(/(^|\/)\.env(?:\.|$)/.test(lower)&&!lower.endsWith('.env.example')) errors.push('Private environment file tracked: '+file);
 if(/(^|\/)\.private\//.test(lower))errors.push('Private dataset tracked: '+file);
 if(/(^|\/)node_modules\//.test(lower))errors.push('node_modules tracked: '+file);
 if(/\.(?:db|sqlite|sqlite3|db-wal|db-shm|pem|p12|pfx|key)$/i.test(file))errors.push('Credential/database file tracked: '+file);
 if(/\.(?:wav|mp3|flac|aif|aiff|aac|m4a|ogg|opus|wma|mp4|mov|mkv)$/i.test(file))errors.push('Audio/video media tracked: '+file);
}
if(errors.length){
 console.error('GROOVEPRINT repository guard FAILED ('+errors.length+' findings):\n'+errors.map(x=>' - '+x).join('\n'));
 process.exitCode=1;
}else{
 console.log('GROOVEPRINT repository guard OK: JSON/config valid, '+tracked.length+' tracked files checked, no private audio or secrets tracked.');
}
