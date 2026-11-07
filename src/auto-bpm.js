/* GROOVEPRINT Zero-Click BPM v2 alpha.
 * Browser-tab orchestrator. NOT a persistent background worker.
 * Only authorized catalog metadata is queried; never downloads streaming audio.
 */
(function(){
'use strict';
const job={running:false,stopRequested:false,restartRequested:false,phase:'idle',openFound:0,
  done:0,total:0,catalog:0,review:0,unavailable:0,errors:0,message:'',controller:null};
const limit=4,evidence=window.GrooveprintBPMEvidence;
let generation=0,restartTimer=null,restartEpoch=0,pendingRun=null;
const lookupCache=new Map(); // In-memory only during this tab, never persistent provider-data storage
const missing=evidence.missing;
function collect(releases){
 const out=[];
 for(const record of releases||[]){
  for(let index=0;index<(record.tracks||[]).length;index++){
   const track=record.tracks[index];if(!missing(track)||evidence.protectedValue(track)||!String(track.title||'').trim())continue;
   const artist=String(track.artist||record.artist||'').replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'').trim();
   out.push({id:String(out.length),artist,title:String(track.title||'').trim(),recordingMbid:String(track.recordingMbid||''),record,index,track,ticket:evidence.capture(record,track)});
  }
 }
 return out;
}
function stats(){
 const all=state.releases.flatMap(r=>r.tracks||[]);
 return {tracks:all.length,catalog:all.filter(t=>t.bpmStatus==='catalog').length,
  estimated:all.filter(t=>t.bpmStatus==='estimated').length,
  verified:all.filter(t=>t.bpmStatus==='verified'||t.bpmStatus==='manual').length,
  review:all.filter(t=>t.bpmStatus==='review').length,missing:all.filter(missing).length};
}
function panel(){
 const st=stats(),status=job.running?'PROCESSING':job.phase==='disabled'?'PROVIDER INACTIVE':
   job.phase==='complete'?'COMPLETE':job.phase==='interrupted'?'INTERRUPTED':
   job.phase==='error'?'ERROR':job.phase==='tracklists'?'TRACKLIST SYNC':'READY';
 const pct=job.total?Math.min(100,Math.round(job.done*100/job.total)):0;
 return '<section class="gp-auto-panel" role="status"><div class="flex between" style="flex-wrap:wrap"><div class="eyebrow">ZERO-CLICK BPM INTELLIGENCE</div><span class="tag '+(job.phase==='complete'?'good':'')+'">'+esc(status)+'</span></div>'+
 '<div class="gp-auto-stats"><span>'+st.tracks+' TRACCE</span><span>'+st.catalog+' CATALOG BPM</span><span>'+st.review+' DA VERIFICARE</span><span>'+st.missing+' SENZA BPM</span></div>'+
 (job.running?'<div class="syncprogress"><span style="width:'+pct+'%"></span></div><p class="footnote">'+job.done+' / '+job.total+' brani</p><button class="small quiet" data-gp-auto-stop="1">INTERROMPI</button>':'')+
 '<p class="footnote">'+esc(job.message||'Dopo l’importazione, le tracklist vengono recuperate e i BPM cercati automaticamente dove possibile. Non serve caricare MP3 per ogni traccia.')+'</p>'+
 '<p class="footnote"><a href="https://acousticbrainz.org/" target="_blank" rel="noopener noreferrer">AcousticBrainz (CC0)</a> per recording MBID verificato · <a href="https://getsongbpm.com/" target="_blank" rel="noopener noreferrer">GetSongBPM</a> opzionale · nessuna estrazione YouTube.</p></section>';
}
function refresh(){
 const el=document.querySelector?.('.gp-auto-panel');if(el)el.outerHTML=panel();
 evidence.refreshFields();
}

function stop(){restartEpoch++;pendingRun=null;job.restartRequested=false;clearTimeout(restartTimer);restartTimer=null;job.stopRequested=true;job.controller?.abort();if(job.running)job.phase='interrupted';job.message='Interruzione richiesta; i BPM già trovati rimangono.';refresh()}
async function run({fetchTracklists=true}={}){
 if(job.running){job.restartRequested=true;pendingRun={fetchTracklists,epoch:restartEpoch};return;}
 clearTimeout(restartTimer);restartTimer=null;pendingRun=null;
 const runGeneration=++generation,controller=new AbortController();
 const stopped=()=>job.stopRequested||controller.signal.aborted||runGeneration!==generation;
 const progress=new Set(),markDone=items=>{for(const t of items)progress.add(t.id);job.done=progress.size};
 lookupCache.clear();Object.assign(job,{running:true,stopRequested:false,restartRequested:false,controller,phase:'tracklists',openFound:0,done:0,total:0,catalog:0,review:0,unavailable:0,errors:0,message:'Sincronizzo le tracklist…'});
 refresh();
 try{
  if(fetchTracklists&&!discogsSync.running&&state.releases.some(r=>!r.tracks?.length&&/^[1-9]\d*$/.test(String(r.releaseId||'')))){
   await syncDiscogsTracklists(false,{signal:controller.signal,autoBpm:false});
  }
  if(stopped()){job.phase='interrupted';return;}
  const tasks=collect(state.releases);job.total=tasks.length;
  if(!tasks.length){job.phase='complete';job.message='Nessun BPM mancante nelle tracklist disponibili.';return;}
  // Source A: CC0 AcousticBrainz, only when we have an exact recording MBID.
  // MusicBrainz public API title-search is deliberately not invoked; its free tier
  // has separate non-commercial restrictions and cannot be assumed SaaS-ready.
  const archived=tasks.filter(t=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t.recordingMbid));
  if(archived.length){
   job.phase='open-data';job.message='AcousticBrainz: recupero BPM CC0 con recording MBID…';refresh();
   for(let at=0;at<archived.length;at+=6){
    if(stopped()){job.phase='interrupted';break}
    const items=archived.slice(at,at+6);
    try{
     const data=await gpRequest('/api/bpm/open/batch',{method:'POST',body:JSON.stringify({tracks:items.map(x=>({id:x.id,recordingMbid:x.recordingMbid}))}),signal:controller.signal});
     if(stopped()){job.phase='interrupted';break}
     const lookup=new Map((data.results||[]).map(x=>[String(x.id),x]));
     for(const t of items){
      const x=lookup.get(t.id);
      if(!x||x.status!=='catalog'||!Number.isFinite(Number(x.bpm))||Number(x.bpm)<40||Number(x.bpm)>300)continue;
      if(stopped()||!evidence.canApply(t.ticket,state.releases))continue;
      t.track.bpm=Number(x.bpm);t.track.source='AcousticBrainz';t.track.bpmStatus='catalog';
      t.track.bpmReferenceUrl=String(x.referenceUrl||'');t.track.bpmReason='archived-algorithm-estimate';
      t.track.bpmCheckedAt=new Date().toISOString();
      job.openFound++;job.catalog++;
     }
    }catch{if(stopped()){job.phase='interrupted';break}job.errors+=items.length}
    markDone(items);storeLater();refresh();
   }
  }
  if(stopped())return;
  let enabled=typeof gpBpmProviderReady!=='undefined'?gpBpmProviderReady:null;
  if(enabled===null){
   try{
    const status=await gpRequest('/api/bpm/status',{signal:controller.signal});
    if(stopped()){job.phase='interrupted';return}
    if(typeof status.configured!=='boolean')throw Error('Risposta stato provider non valida');
    enabled=status.configured;gpBpmProviderReady=enabled;
   }catch(error){
    if(stopped()){job.phase='interrupted';return}
    job.phase='error';job.errors++;job.message='Provider BPM temporaneamente non raggiungibile: '+String(error.message||error)+'. Riprova più tardi.';return;
   }
  }
  if(stopped()){job.phase='interrupted';return}
  if(!enabled){job.phase=job.openFound?'complete':'disabled';job.message=job.openFound+' BPM dall’archivio CC0 AcousticBrainz. GetSongBPM non configurato. '+(archived.length?'Ricerche per MBID processate: '+archived.length+'.':'Senza recording MBID, i soli metadati Discogs non bastano per interrogare AcousticBrainz.')+' La libreria audio locale può essere analizzata con CONNECT AUDIO LIBRARY.';return;}
  if(!discogsConnect.connected){job.phase='disabled';job.message='Per la ricerca BPM tramite backend, collega prima Discogs. CSV, editor e stampa rimangono disponibili.';return;}
  job.phase='catalog';job.message='Ricerca automatica dei BPM mancanti su GetSongBPM…';refresh();
  for(let at=0;at<tasks.length;at+=limit){
   if(stopped()){job.phase='interrupted';break;}
   const batch=tasks.slice(at,at+limit).filter(t=>evidence.canApply(t.ticket,state.releases));
   if(!batch.length){markDone(tasks.slice(at,at+limit));continue}
   try{
    const fetched=new Set(),unique=[];
    const keyOf=t=>t.artist.toLowerCase().trim()+'|'+t.title.toLowerCase().trim();
    for(const item of batch){const key=keyOf(item);if(!lookupCache.has(key)&&!fetched.has(key)){unique.push(item);fetched.add(key)}}
    const data=unique.length?await gpRequest('/api/bpm/batch',{method:'POST',body:JSON.stringify({tracks:unique.map(t=>({id:t.id,title:t.title,artist:t.artist}))}),signal:controller.signal}):{configured:true,results:[]};
    if(stopped()){job.phase='interrupted';break}
    if(!data.configured){gpBpmProviderReady=false;job.phase='disabled';job.message='Provider BPM non configurato, ricerca sospesa.';break;}
    const remote=new Map((data.results||[]).map(x=>[String(x.id),x]));
    for(const item of unique){if(remote.has(item.id))lookupCache.set(keyOf(item),remote.get(item.id))}
    const results=new Map(batch.map(x=>[x.id,lookupCache.get(keyOf(x))]));
    for(const task of batch){
     const response=results.get(task.id);
     if(!response){job.errors++;continue;}
     if(stopped()||!evidence.canApply(task.ticket,state.releases))continue;
     if(response.status==='catalog'){
      const bpm=Number(response.bpm);
      if(!Number.isFinite(bpm)||bpm<40||bpm>300){job.errors++;continue;}
      task.track.bpm=bpm;task.track.bpmStatus='catalog';task.track.source='GetSongBPM';
      task.track.bpmReferenceUrl=String(response.referenceUrl||'https://getsongbpm.com/');
      task.track.bpmCheckedAt=new Date().toISOString();job.catalog++;
     }else if(response.status==='review'){
      task.track.bpmStatus='review';task.track.bpmReason=String(response.reason||'ambiguous');
      task.track.bpmCandidates=Array.isArray(response.candidates)?response.candidates.slice(0,8):[];
      job.review++;
     }else if(response.status==='unavailable'){
      task.track.bpmStatus='unavailable';task.track.bpmReason=String(response.reason||'not-found');job.unavailable++;
     }else{
      job.errors++;
      if(response.status==='rate-limited'){job.phase='error';job.message='Rate limit GetSongBPM raggiunto. Nessun valore dubbio è stato inserito.';job.stopRequested=true;}
     }
    }
    markDone(tasks.slice(at,at+limit));storeLater();refresh();
   }catch(error){
    if(stopped()){job.phase='interrupted';break;}
    job.errors+=batch.length;job.phase='error';job.message='La ricerca BPM è stata sospesa: '+String(error.message||error);break;
   }
   if(!stopped()&&at+limit<tasks.length)await new Promise(resolve=>{const done=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',done);resolve()};const timer=setTimeout(done,800);controller.signal.addEventListener('abort',done,{once:true})});
  }
  if(job.phase==='catalog')job.phase='complete';
  if(!job.message||job.message.startsWith('Ricerca automatica'))job.message=
   job.catalog+' BPM catalografici, '+job.review+' ambigui, '+job.unavailable+' senza risultati, '+job.errors+' errori. Mai sostituite le correzioni manuali.';
 }catch(error){job.phase=stopped()?'interrupted':'error';job.message=stopped()?'Ricerca interrotta; risultati precedenti conservati.':'Arricchimento interrotto: '+String(error.message||error)}
 finally{
  job.running=false;job.controller=null;storeLater();refresh(true);
  const next=pendingRun;pendingRun=null;job.restartRequested=false;
  if(next&&next.epoch===restartEpoch)restartTimer=setTimeout(()=>{restartTimer=null;if(next.epoch===restartEpoch&&generation===runGeneration)void run({fetchTracklists:next.fetchTracklists})},0);
 }
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-gp-auto-stop]')){stop()}
});
window.GrooveprintAutoBPM={run,stop,panel,stats,collect,job,refreshPanel:refresh};
if(typeof renderApp==='function')renderApp();
})();
