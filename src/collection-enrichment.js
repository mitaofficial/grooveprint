/* Metadata only. Tracklist recovery never infers tempo or calls a BPM catalog. */
(function(){
'use strict';
const job={running:false,stopRequested:false,restartRequested:false,phase:'idle',total:0,done:0,message:'',controller:null};
let generation=0,restartEpoch=0,restartTimer=null,pendingRun=null;
function stats(){
 const releases=state.releases||[];
 return {releases:releases.length,withTracks:releases.filter(r=>r.tracks?.length).length,tracks:releases.reduce((n,r)=>n+(r.tracks?.length||0),0)};
}
function panel(){
 const st=stats();
 return '<section class="gp-enrich-panel" role="status"><div class="flex between"><b>TRACKLIST DISCOGS</b>'+
 (job.running?'<button type="button" class="small quiet" data-gp-enrich-stop="1">INTERROMPI RECUPERO</button>':'')+'</div>'+
 '<p class="footnote">'+st.withTracks+' / '+st.releases+' release con tracklist · '+st.tracks+' tracce. '+esc(job.message||'Il recupero aggiunge i metadati. Per stimare i BPM collega i file audio al motore interno.')+'</p></section>';
}
function refresh(){const el=document.querySelector?.('.gp-enrich-panel');if(el)el.outerHTML=panel();}
function stop(){
 restartEpoch++;pendingRun=null;job.restartRequested=false;clearTimeout(restartTimer);restartTimer=null;
 job.stopRequested=true;job.controller?.abort();
 if(job.running){job.phase='interrupted';job.message='Recupero interrotto. Tracklist e BPM già salvati restano disponibili.';refresh()}
}
async function run({fetchTracklists=true}={}){
 if(job.running){job.restartRequested=true;pendingRun={fetchTracklists,epoch:restartEpoch};return}
 clearTimeout(restartTimer);restartTimer=null;pendingRun=null;
 const runGeneration=++generation,controller=new AbortController();
 const stopped=()=>job.stopRequested||controller.signal.aborted||runGeneration!==generation;
 Object.assign(job,{running:true,stopRequested:false,restartRequested:false,phase:'tracklists',controller,total:0,done:0,message:'Preparazione delle tracklist…'});refresh();
 try{
  const missing=state.releases.filter(r=>!r.tracks?.length&&/^[1-9]\d*$/.test(String(r.releaseId||'')));
  job.total=missing.length;
  if(fetchTracklists&&missing.length){
   if(discogsSync.running){job.message='Un recupero tracklist è già in corso; nessuna operazione duplicata.';job.phase='complete';return}
   await syncDiscogsTracklists(false,{signal:controller.signal,autoEnrich:false});
  }
  if(stopped()||(fetchTracklists&&discogsSync.cancelled)){job.phase='interrupted';job.message='Recupero interrotto. I dati già ottenuti restano disponibili.';return}
  job.done=missing.filter(r=>state.releases.includes(r)&&r.tracks?.length).length;
  job.phase='complete';
  job.message='Metadati disponibili. I BPM mancanti restano vuoti fino all’analisi audio o all’inserimento manuale.';
 }catch(error){job.phase=stopped()?'interrupted':'error';job.message=stopped()?'Recupero interrotto.':'Recupero tracklist non riuscito: '+String(error?.message||error)}
 finally{
  job.running=false;job.controller=null;refresh();
  const next=pendingRun;pendingRun=null;job.restartRequested=false;
  if(next&&next.epoch===restartEpoch)restartTimer=setTimeout(()=>{restartTimer=null;if(next.epoch===restartEpoch&&generation===runGeneration)void run({fetchTracklists:next.fetchTracklists})},0);
 }
}
document.addEventListener('click',event=>{if(event.target.closest('[data-gp-enrich-stop]'))stop()});
window.GrooveprintCollectionEnrichment={run,stop,panel,stats,job,refreshPanel:refresh};
if(typeof renderApp==='function')renderApp();
})();
