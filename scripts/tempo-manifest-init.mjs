/**
 * Local benchmark manifest builder. NO uploads or audio processing.
 * Place authorized files in .private/tempo-dataset/audio and run.
 * The generated manifest has NO "verified" BPM until the user checks it.
 */
import {readdir,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,relative,sep} from 'node:path';
const args=process.argv.slice(2);
const value=(key,defaultValue)=>{const index=args.indexOf(key);return index<0?defaultValue:args[index+1]};
const dataset=resolve(value('--dataset','.private/tempo-dataset'));
const source=join(dataset,'audio');
const target=join(dataset,'manifest.json');
const force=args.includes('--force');
const max=1500;
const extensions=/\.(wav|aiff?|flac|mp3|m4a|aac|ogg|opus)$/i;
const paths=[];
async function visit(folder,depth){
 if(depth>6)throw Error('Audio folder nesting exceeds 6');
 const entries=(await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
 for(const e of entries){
  const file=join(folder,e.name);
  if(e.isSymbolicLink())continue;
  if(e.isDirectory()){await visit(file,depth+1);continue}
  if(e.isFile()&&extensions.test(e.name)){
   const info=await stat(file);
   if(info.size<1000||info.size>160*1024*1024)continue;
   paths.push(relative(dataset,file).split(sep).join('/'));
   if(paths.length>max)throw Error('More than 1500 files; use a smaller authorized pilot selection');
  }
 }
}
await visit(source,0);
if(!paths.length)throw Error('No supported audio files found inside '+source);
const manifest={schemaVersion:1,note:'Private GROOVEPRINT BPM development fixture. Do NOT upload or commit audio or this manifest. BPMs are NOT VERIFIED until independently reviewed in a DAW.',
 tracks:paths.map((file,index)=>({id:'recording_'+String(index+1).padStart(4,'0'),file,
  category:'unclassified',groundTruthBpm:null,groundTruthStatus:'unavailable',
  verificationMethod:'',split:'unassigned',notes:'Verify in DAW; check grid after 16/32 beats and in a distant section.'}))};
await mkdir(dataset,{recursive:true});
if(!force){
 try{const f=await import('node:fs/promises');await f.access(target);throw Error('manifest.json exists: refusing to overwrite manual BPM edits; add --force to replace')}catch(error){
  if(error.code!=='ENOENT')throw error;
 }
}
await writeFile(target,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({created:target,records:paths.length,verifiedBpmCount:0,independentGroundTruth:false,
 next:'Edit groundTruthBpm, groundTruthStatus="verified" and verificationMethod after independent DAW verification.'}));
