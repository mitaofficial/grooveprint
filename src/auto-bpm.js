/* GROOVEPRINT Zero-Click BPM v2 alpha.
 * Browser-tab orchestrator. NOT a persistent background worker.
 * Only authorized catalog metadata is queried; never downloads streaming audio.
 */
(function(){
'use strict';
const job={running:false,stopRequested:false,restartRequested:false,phase:'idle',
  done:0,total:0,catalog:0,review:0,unavailable:0,errors:0,message:'',controller:null};
const limit=4;
const lookupCache=new Map(); // In-memory only during this tab, never persistent provider-data storage
function missing(t){return t.bpm===null||t.bpm===undefined||t.bpm===''||!Number.isFinite(Number(t.bpm))||Number(t.bpm)<=0;}
function collect(releases){
 const out=[];
 for(const record of releases||[]){
  for(let index=0;index<(record.tracks||[]).length;index++){
   const track=record.tracks[index];if(!missing(track)||!String(track.title||'').trim())continue;
   const artist=String(track.artist||record.artist||'').replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'').trim();
   out.push({id:String(out.length),artist,title:String(track.title||'').trim(),record,index,track});
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
 '<p class="footnote"><a href="https://getsongbpm.com/" target="_blank" rel="noopener noreferrer">GetSongBPM</a> · nessuna estrazione audio da YouTube · il processo richiede la scheda aperta.</p></section>';
}
let queuedRefresh=false;
function refresh(){
 const el=document.activeElement;
 const inside=el && /^(INPUT|TEXTAREA|SELECT)$/.test(String(el.tagName||'')) && document.querySelector?.('#app')?.contains?.(el);
 if(inside){queuedRefresh=true;return;}
 queuedRefresh=false;renderApp();
}
document.addEventListener('focusout',()=>{if(queuedRefresh)setTimeout(refresh,0)});

function stop(){job.stopRequested=true;job.controller?.abort();job.message='Interruzione richiesta; i BPM già trovati rimangono.';renderApp()}
async function run({fetchTracklists=true}={}){
 if(job.running){job.restartRequested=true;return;}
 lookupCache.clear();Object.assign(job,{running:true,stopRequested:false,phase:'tracklists',done:0,total:0,catalog:0,review:0,unavailable:0,errors:0,message:'Sincronizzo le tracklist…'});
 refresh();
 try{
  if(fetchTracklists&&!discogsSync.running&&state.releases.some(r=>!r.tracks?.length&&/^[1-9]\d*$/.test(String(r.releaseId||'')))){
   await syncDiscogsTracklists(false);
  }
  if(job.stopRequested){job.phase='interrupted';return;}
  const tasks=collect(state.releases);job.total=tasks.length;
  if(!tasks.length){job.phase='complete';job.message='Nessun BPM mancante nelle tracklist disponibili.';return;}
  let enabled=typeof gpBpmProviderReady!=='undefined'?gpBpmProviderReady:null;
  if(enabled===null){
   try{enabled=Boolean((await gpRequest('/api/bpm/status')).configured);gpBpmProviderReady=enabled}
   catch{enabled=false;gpBpmProviderReady=false}
  }
  if(!enabled){job.phase='disabled';job.message='Tracklist disponibili. BPM online non disponibili: la chiave GetSongBPM non è configurata. I dati esistenti non vengono alterati.';return;}
  if(!discogsConnect.connected){job.phase='disabled';job.message='Per la ricerca BPM tramite backend, collega prima Discogs. CSV, editor e stampa rimangono disponibili.';return;}
  job.phase='catalog';job.message='Ricerca automatica di BPM per ogni traccia…';refresh();
  for(let at=0;at<tasks.length;at+=limit){
   if(job.stopRequested){job.phase='interrupted';break;}
   const batch=tasks.slice(at,at+limit);
   const controller=new AbortController();job.controller=controller;
   try{
    const fetched=new Set(),unique=[];
    const keyOf=t=>t.artist.toLowerCase().trim()+'|'+t.title.toLowerCase().trim();
    for(const item of batch){const key=keyOf(item);if(!lookupCache.has(key)&&!fetched.has(key)){unique.push(item);fetched.add(key)}}
    const data=unique.length?await gpRequest('/api/bpm/batch',{method:'POST',body:JSON.stringify({tracks:unique.map(t=>({id:t.id,title:t.title,artist:t.artist}))}),signal:controller.signal}):{configured:true,results:[]};
    if(!data.configured){gpBpmProviderReady=false;job.phase='disabled';job.message='Provider BPM non configurato, ricerca sospesa.';break;}
    const remote=new Map((data.results||[]).map(x=>[String(x.id),x]));
    for(const item of unique){if(remote.has(item.id))lookupCache.set(keyOf(item),remote.get(item.id))}
    const results=new Map(batch.map(x=>[x.id,lookupCache.get(keyOf(x))]));
    for(const task of batch){
     const response=results.get(task.id);
     if(!response){job.errors++;continue;}
     if(!state.releases.includes(task.record)||task.record.tracks[task.index]!==task.track||!missing(task.track))continue;
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
    job.done+=batch.length;storeLater();refresh();
   }catch(error){
    if(job.stopRequested){job.phase='interrupted';break;}
    job.errors+=batch.length;job.phase='error';job.message='La ricerca BPM è stata sospesa: '+String(error.message||error);break;
   }finally{job.controller=null}
   if(!job.stopRequested&&at+limit<tasks.length)await new Promise(resolve=>setTimeout(resolve,800));
  }
  if(job.phase==='catalog')job.phase='complete';
  if(!job.message||job.message.startsWith('Ricerca automatica'))job.message=
   job.catalog+' BPM catalografici, '+job.review+' ambigui, '+job.unavailable+' senza risultati, '+job.errors+' errori. Mai sostituite le correzioni manuali.';
 }catch(error){job.phase='error';job.message='Arricchimento interrotto: '+String(error.message||error)}
 finally{
  job.running=false;job.controller=null;storeLater();refresh();
  if(job.restartRequested){job.restartRequested=false;setTimeout(()=>{void run({fetchTracklists:false})},0)}
 }
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-gp-auto-stop]')){stop()}
});
window.GrooveprintAutoBPM={run,stop,panel,stats,collect,job};
if(typeof renderApp==='function')refresh();
})();
