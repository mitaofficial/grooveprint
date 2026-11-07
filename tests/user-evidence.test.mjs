import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.slice(html.indexOf('let gpUserEvidenceCache=null;'),html.indexOf('function storeLater()'));
function setup(releases){
 const storage=new Map(),notices=[];
 const ctx={cleanDiscogsArtist:v=>String(v||'').replace(/\s+\([1-9]\d{0,3}\)/g,''),state:{releases},storageWarned:false,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},toast:(...args)=>notices.push(args)};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,storage,notices};
}
const release=(instance,bpm)=>({id:'r'+instance,releaseId:'123',artist:'DJ',discogsUsername:'test',discogsInstanceId:String(instance),tracks:[{position:'A1',title:'Tool (Dub)',bpm,bpmStatus:'manual',source:'manual'}]});
test('two expiry/resync cycles preserve values and explicit clears separately for two physical copies',()=>{
 const a=release(1,145),b=release(2,null),{ctx,storage}=setup([a,b]);
 ctx.gpPersistUserEvidence();
 for(let cycle=0;cycle<2;cycle++){
  const replacements=[release(1,null),release(2,null)];
  for(const r of replacements){r.tracks[0].bpmStatus='';r.tracks[0].source='discogs'}
  ctx.state.releases=replacements.reverse();for(const r of ctx.state.releases)ctx.gpRestoreUserEvidence(r);
  assert.equal(replacements.find(r=>r.discogsInstanceId==='1').tracks[0].bpm,145);
  const cleared=replacements.find(r=>r.discogsInstanceId==='2').tracks[0];assert.equal(cleared.bpm,null);assert.equal(cleared.bpmStatus,'manual');
  ctx.gpPersistUserEvidence();
 }
 const serialized=storage.get('grooveprint-user-tempos-v1');assert.ok(!serialized.includes('Tool'));assert.ok(!serialized.includes('DJ'));assert.ok(!serialized.includes('test'));assert.ok(!serialized.includes('instance'));
});
test('quota failure keeps in-memory corrections and provides a recovery message',()=>{
 const r=release(1,145),{ctx,notices}=setup([r]);ctx.localStorage.setItem=()=>{throw Error('quota')};ctx.gpPersistUserEvidence();
 assert.equal(r.tracks[0].bpm,145);assert.equal(notices.length,1);assert.match(notices[0][0],/backup JSON/);
});
test('quota recovery backup preserves opaque user-created evidence and sanitizes imported fields',()=>{
 const r=release(1,null),first=setup([r]);first.ctx.localStorage.setItem=()=>{throw Error('quota')};
 const backup=first.ctx.gpEvidenceBackup(),key=Object.keys(backup)[0];
 assert.match(key,/^user:[a-f0-9]{32}$/);
 const next=release(1,null),second=setup([next]);next.tracks[0].bpmStatus='';
 second.ctx.gpImportUserEvidence({...backup,[key]:{...backup[key],privateMetadata:'must be dropped'},'username|collection':{bpm:140,status:'manual'}});
 second.ctx.gpRestoreUserEvidence(next);
 assert.equal(next.tracks[0].bpmStatus,'manual');assert.equal(next.tracks[0].bpm,null);
 const serialized=JSON.stringify(second.ctx.gpEvidenceBackup());assert.ok(!serialized.includes('privateMetadata'));assert.ok(!serialized.includes('username|collection'));
});
