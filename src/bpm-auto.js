/* Automatic import -> approved audio -> shared DSP. Research catalog, review-only. */
(function(){
'use strict';
const evidence=window.GrooveprintBPMEvidence,library=window.GrooveprintAudioLibrary;
const job={running:false,total:0,done:0,review:0,unavailable:0,errors:0,stale:0,protected:0,cancelled:0,phase:'idle',message:''};
let available=false,enabled=true,paused=false,ready=false,generation=0,current=null,queue=[],seen=new WeakMap(),memo=new Map(),csrf='',approved=null,exampleReleaseId='',exampleArtist='',exampleTitle='',comparisonPreparing=false,comparisonController=null,comparisonRecord=null,comparisonSerial=0,comparisonTrace=[],minInterval=0,lastResolve=0;
try{if(typeof localStorage!=='undefined')enabled=localStorage.getItem('grooveprint-auto-bpm-enabled')!=='off'}catch{}
const identity=(r,t)=>JSON.stringify([r.releaseId,r.title,r.artist,t.artist,t.position,t.title,t.duration]);
const fresh=r=>(!r.discogsInstanceId||discogsConnect.connected&&gpIsFresh(r.discogsFetchedAt))&&(!r.tracklistFetchedAt||gpIsFresh(r.tracklistFetchedAt));
function transition(phase,message){
 job.phase=phase;job.message=message;
 comparisonTrace.push({at:new Date().toISOString(),phase,message:message.slice(0,240),total:job.total,done:job.done});
 if(comparisonTrace.length>100)comparisonTrace.shift();
 refresh();
}
function panel(){
 if(!available)return '';
 return '<section class="gp-auto-audio" role="status" style="margin:12px 0;padding:12px;border:1px solid #566447"><b>BPM AUTOMATICI ALL’IMPORTAZIONE · RICERCA</b>'+
 '<label style="display:block;margin:8px 0"><input type="checkbox" data-gp-auto-enable '+(enabled?'checked':'')+'> Cerca e analizza automaticamente l’audio autorizzato dopo Discogs</label>'+
 '<p class="footnote">Ricerca nel catalogo Free Music Archive con licenze CC0/CC BY; nessuna copertura commerciale generale garantita. Artista e album vengono cercati su Internet Archive; il CSV e l’audio locale restano sul dispositivo. Risultati da verificare.</p>'+
 '<p class="footnote gp-auto-progress" data-gp-auto-phase="'+esc(job.phase)+'" aria-live="polite"><strong>'+esc(job.phase==='idle'?'Pronto':job.phase.toUpperCase())+'</strong> · '+job.done+'/'+job.total+' elaborate · '+job.review+' da verificare · '+job.unavailable+' senza fonte/stima · '+job.errors+' errori · '+job.stale+' obsolete · '+job.cancelled+' annullate · '+job.protected+' valori protetti saltati. '+esc(job.message)+'</p>'+
 '<div class="flex" style="flex-wrap:wrap;gap:8px">'+(job.running||comparisonPreparing?'<button class="small quiet" data-gp-auto-stop>INTERROMPI BPM AUTOMATICI</button>':'<button class="small quiet" data-gp-auto-retry>RIPROVA ERRORI / RIPRENDI</button>')+
 '<button class="small quiet" data-gp-auto-review>VEDI RISULTATI BPM</button>'+(window.GrooveprintBPMDevelopment===true?'<button class="small quiet" data-gp-auto-compare '+(job.running||comparisonPreparing||discogsSync.running?'disabled':'')+'>CONFRONTA V1/V2 CON AUDIO AUTORIZZATO</button>':'')+'<button class="small quiet" data-gp-auto-example '+(discogsSync.running||discogsConnect.running||comparisonPreparing?'disabled':'')+'>PROVA UNA RELEASE APERTA</button></div></section>';
}
function refresh(){const el=document.querySelector?.('.gp-auto-audio');if(el)el.outerHTML=panel();evidence.refreshFields()}
function stop({reset=false,pause=true}={}){
 generation++;paused=pause;comparisonController?.abort();comparisonController=null;comparisonPreparing=false;comparisonRecord=null;current?.controller.abort();if(current?.item&&['searching','analyzing'].includes(current.item.phase)){current.item.phase='cancelled';job.cancelled++}
 for(const item of queue){if(seen.get(item.track)===item)item.phase='cancelled';job.cancelled++}queue=[];
 if(reset){seen=new WeakMap();memo.clear();for(const k of Object.keys(job))if(typeof job[k]==='number')job[k]=0;paused=false;job.phase='idle';job.message='';}
 else{job.phase='cancelled';job.message='Interrotto: i valori precedenti restano disponibili.';}
 refresh();
}
function valid(item){return !current?.controller.signal.aborted&&item.generation===generation&&fresh(item.record)&&evidence.canApply(item.ticket,state.releases)}
async function getAudio(asset,signal){
 const u=new URL(asset.url);
 if(u.protocol!=='https:'||u.hostname!=='archive.org'||!/^\/download\/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,160}\/.+/.test(u.pathname)||u.username||u.password||u.search||u.hash||u.port)throw Error('Fonte audio non consentita');
 const controller=new AbortController(),cancel=()=>controller.abort(new DOMException('Download audio interrotto','AbortError')),
  timer=setTimeout(()=>controller.abort(new DOMException('Download audio non completato entro 45 secondi: riprova.','TimeoutError')),45000);
 signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();
 try{
  const r=await fetch(u.href,{mode:'cors',credentials:'omit',signal:controller.signal});
  if(!r.ok||!/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(r.headers.get('content-type')||''))throw Error('Audio non disponibile o formato non valido');
  const final=new URL(r.url||u.href);if(final.protocol!=='https:'||!(final.hostname==='archive.org'||/^(?:ia|dn)\d{5,8}\.(?:us|eu|ca)\.archive\.org$/.test(final.hostname)))throw Error('Redirect audio non consentito');
  if(Number(r.headers.get('content-length'))>16*1024*1024)throw Error('Audio oltre il limite di 16 MiB');
  const reader=r.body.getReader(),parts=[];let n=0,done=false;
  try{for(;;){signal.throwIfAborted();const x=await reader.read();if(x.done){done=true;break}n+=x.value.length;if(n>16*1024*1024)throw Error('Audio oltre il limite di 16 MiB');parts.push(x.value)}}finally{if(!done)await reader.cancel().catch(()=>{});reader.releaseLock()}
  if(n!==asset.size)throw Error('La fonte audio è cambiata');const bytes=new Uint8Array(n);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}return bytes.buffer;
 }finally{clearTimeout(timer);signal.removeEventListener('abort',cancel)}
}
async function pump(){
 if(job.running||!available||!enabled||paused||!queue.length)return;
 const owner={controller:new AbortController(),generation};current=owner;job.running=true;
 const count=key=>{if(owner.generation===generation)job[key]++};
 try{
  while(queue.length&&!owner.controller.signal.aborted&&owner.generation===generation){
   const item=queue.shift();owner.item=item;if(seen.get(item.track)!==item)continue;
   if(!valid(item)){item.phase='stale';count('stale');count('done');continue}
   job.phase='searching';item.phase='searching';job.message='Ricerca audio: '+item.track.title;refresh();
   try{
    const cached=memo.get(item.key);
    if(cached?.resolution){item.phase=cached.resolution.status==='review'?'review':'unavailable';item.reason=cached.resolution.reason;count(item.phase);continue}
    if(cached){if(library.applyAutomaticResult(item.ticket,cached.result,cached.evidence,()=>valid(item))){count(cached.result.status==='estimated'?'review':'unavailable');item.phase='complete'}else{count('stale');item.phase='stale'}continue}
    const wait=Math.max(0,lastResolve+minInterval-Date.now());if(wait)await abortablePause(wait,owner.controller.signal);lastResolve=Date.now();
    const resolved=await gpRequest('/api/audio/resolve',{method:'POST',headers:{'X-GROOVEPRINT-CSRF':csrf},body:JSON.stringify(item.input),signal:owner.controller.signal});
    if(!valid(item)){count('stale');item.phase='stale';continue}
    if(resolved.status!=='matched'){
     item.phase=resolved.status==='review'?'review':'unavailable';count(item.phase);item.reason=resolved.reason||'source-not-found';memo.set(item.key,{resolution:resolved});continue;
    }
    // Wait for the existing owner, never start a second decoder or worker.
    while(library.job.running&&!owner.controller.signal.aborted)await abortablePause(100,owner.controller.signal);
    if(!valid(item)){count('stale');item.phase='stale';continue}
    job.phase='analyzing';item.phase='analyzing';job.message='Analisi audio: '+item.track.title;refresh();
    const f={name:resolved.asset.name,size:resolved.asset.size,arrayBuffer:()=>getAudio(resolved.asset,owner.controller.signal)};
    const delivery=await library.analyzeFiles([f],{target:{record:item.record,track:item.track,index:item.record.tracks.indexOf(item.track)},
     writeTicket:item.ticket,automaticEvidence:resolved.evidence,signal:owner.controller.signal,valid:()=>valid(item),onCancel:()=>{if(!owner.controller.signal.aborted)stop()}});
    if(owner.controller.signal.aborted)throw new DOMException('Aborted','AbortError');
    if(delivery){memo.set(item.key,{result:delivery.result,evidence:resolved.evidence});if(memo.size>1500)memo.delete(memo.keys().next().value);count(delivery.result.status==='estimated'?'review':'unavailable');item.phase='complete'}
    else if(!valid(item)){count('stale');item.phase='stale'}else{count('errors');item.phase='error';item.reason=library.job.message}
   }catch(e){
    if(owner.controller.signal.aborted){item.phase='cancelled';count('cancelled');}
    else{item.phase='error';item.reason=String(e.message||e);count('errors');if([429,503].includes(e.status)){paused=true;owner.pauseMessage='Fonte temporaneamente non disponibile. Riprendi dal pannello dopo il limite o il disservizio.';owner.controller.abort();for(const next of queue){next.phase='cancelled';count('cancelled')}queue=[];}}
   }finally{count('done');refresh();}
   await new Promise(resolve=>setTimeout(resolve,0));
  }
 }finally{
  if(current===owner)current=null;job.running=false;if(owner.generation===generation){job.phase=owner.controller.signal.aborted?'cancelled':'complete';
  job.message=owner.pauseMessage|| (job.phase==='complete'?'Ricerca terminata. I casi fuori dal catalogo autorizzato restano senza BPM.':'Interrotto: nessun risultato tardivo viene applicato.');}refresh();
  if(queue.length&&!paused&&enabled)void pump();
 }
}
function schedule(){
 if(!ready||!available||!enabled||paused||!restoreReady||comparisonPreparing)return;
 for(const {record,track,index} of library.trackList(state.releases)){
  if(comparisonRecord&&record!==comparisonRecord)continue;
  if(!/^[1-9]\d*$/.test(String(record.releaseId||''))||!fresh(record))continue;
  const key=identity(record,track),prior=seen.get(track);
  if(prior?.key===key)continue;
  if(!evidence.missing(track)||evidence.protectedValue(track)){seen.set(track,{key,phase:'protected'});job.protected++;continue}
  const item={record,track,index,key,phase:'queued',generation,ticket:evidence.capture(record,track),input:{releaseId:String(record.releaseId),album:String(record.title||''),artist:String(track.artist||record.artist||''),albumArtist:String(record.artist||''),title:String(track.title||''),position:String(track.position||''),duration:String(track.duration||'')}};
  seen.set(track,item);job.total++;if(approved&&!approved.has(String(record.releaseId))){item.phase='unavailable';item.reason='outside-approved-audio-catalog';job.unavailable++;job.done++;continue}queue.push(item);
 }
 void pump();refresh();
}
function retry(){
 paused=false;
 for(const {track} of library.trackList(state.releases)){const item=seen.get(track);if(item&&['error','cancelled','stale'].includes(item.phase))seen.delete(track)}
 schedule();
}
function isResearchControl(record){
 return Boolean(exampleReleaseId&&String(record?.releaseId)===exampleReleaseId&&
  String(record.artist||'')===exampleArtist&&String(record.title||'')===exampleTitle&&
  !record.discogsInstanceId);
}
async function ensureTracklistForComparison(record,signal){
 if(!state.releases.includes(record))throw Error('La release selezionata non è più nella collezione.');
 if(record.tracks?.length)return record;
 const releaseId=String(record.releaseId||'');
 if(!/^[1-9]\d*$/.test(releaseId))throw Error('Release ID Discogs mancante o non valido.');
 const identity=[record.id,releaseId,record.artist,record.title];
 if(isResearchControl(record)){
  const data=await gpRequest('/api/audio/example',{signal});
  if(signal.aborted)throw new DOMException('Operazione interrotta','AbortError');
  const tracks=mappedDiscogsTracks(data);
  if(String(data.releaseId)!==releaseId||String(data.artist)!==record.artist||String(data.title)!==record.title||
     !gpIsFresh(data.fetchedAt)||!tracks.length)throw Error('Discogs ha restituito metadati vuoti, scaduti o di un’altra release.');
  if(!state.releases.includes(record)||identity.some((value,i)=>value!==[record.id,String(record.releaseId),record.artist,record.title][i]))
   throw Error('Release modificata durante il recupero: risultato scartato.');
  if(!record.tracks.length){
   commit(()=>{
    record.tracks=tracks;
    record.tracklistFetchedAt=data.fetchedAt;
    record.tracklistError='';
    record.gpResearchExample=true;
   });
  }
 }else{
  await syncDiscogsTracklists(true,{signal,autoEnrich:false});
  if(signal.aborted)throw new DOMException('Operazione interrotta','AbortError');
  if(!state.releases.includes(record)||identity.some((value,i)=>value!==[record.id,String(record.releaseId),record.artist,record.title][i]))
   throw Error('Release modificata o rimossa durante il recupero: risultato scartato.');
 }
 if(!record.tracks?.length)throw Error(record.tracklistError||'Discogs non ha fornito una tracklist utilizzabile.');
 return record;
}
async function compareEngines(){
 // The click must visibly acknowledge every path, including missing metadata and failures.
 if(comparisonPreparing||job.running||library.job.running){
  if(!comparisonPreparing)transition('busy','È già in corso un’analisi. Interrompila prima di avviarne un’altra.');
  return;
 }
 const record=state.releases.find(r=>r.id===state.active);
 const releaseId=String(record?.releaseId||'');
 const serial=++comparisonSerial;
 transition('preparing','Richiesta V1/V2 ricevuta · release '+(releaseId||'non selezionata')+'.');
 if(window.GrooveprintBPMDevelopment!==true||!available||!ready){
  transition('error','Il confronto V1/V2 è disponibile solo sulla preview di sviluppo con ricerca audio attiva.');return;
 }
 if(!enabled){transition('error','Attiva la ricerca automatica dell’audio autorizzato e riprova.');return;}
 if(discogsSync.running||discogsConnect.running){transition('error','Un recupero Discogs è già in corso. Riprova al termine.');return;}
 if(!record||!/^[1-9]\d*$/.test(releaseId)){transition('error','Seleziona una release con Release ID Discogs valido.');return;}
 if(record.discogsInstanceId&&!discogsConnect.connected){transition('error','La release OAuth richiede una sessione Discogs valida.');return;}
 // A stale or stripped tracklist is a *reason to refetch*, not a reason to silently reject the record.
 stop({reset:true,pause:false});
 comparisonPreparing=true;
 const controller=new AbortController();
 comparisonController=controller;
 transition('preparing','Preparazione V1/V2 · release '+releaseId+'.');
 try{
  if(!library.setEngineMode?.('compare'))throw Error('Motore V1/V2 non disponibile nel browser.');
  if(!record.tracks?.length){
   transition('recovering-tracklist','Recupero tracklist autentica Discogs · release '+releaseId+'…');
   await ensureTracklistForComparison(record,controller.signal);
  }
  if(controller.signal.aborted||serial!==comparisonSerial)throw new DOMException('Operazione interrotta','AbortError');
  if(!state.releases.includes(record)||!record.tracks.length||!fresh(record))
   throw Error('Tracklist non disponibile o non più valida: riprova il recupero Discogs.');
  // A preceding async import may have installed a queue while recovering: reset before compare.
  comparisonPreparing=false;comparisonController=null;comparisonRecord=record;
  transition('resolving-audio','Tracklist: '+record.tracks.length+' tracce. Ricerca fonti autorizzate e confronto V1/V2…');
  schedule();
  if(job.total===0&&!job.running)
   throw Error('Nessuna traccia eleggibile. Controlla dati Discogs e valori BPM protetti.');
 }catch(error){
  if(serial!==comparisonSerial)return;
  comparisonPreparing=false;comparisonController=null;
  const cancelled=controller.signal.aborted||error?.name==='AbortError';
  transition(cancelled?'cancelled':'error',(cancelled?'Confronto interrotto. ':'Confronto non avviato: ')+String(error?.message||error)+
   (cancelled?'':' Usa RIPROVA dopo aver controllato Discogs.'));
 }finally{
  if(serial===comparisonSerial){comparisonPreparing=false;comparisonController=null;refresh();}
 }
}
function openReview(){
 const tracks=library.trackList(state.releases);
 // Prefer actionable DSP candidates; a missing/unsupported audio source is not a BPM estimate.
 const item=tracks.find(x=>x.track.bpmStatus==='review'&&Array.isArray(x.track.bpmCandidates)&&x.track.bpmCandidates.length)
  ||tracks.find(x=>x.track.bpmStatus==='review'||seen.get(x.track)?.phase==='review')
  ||tracks.find(x=>x.track.bpmAudioEvidence);
 if(!item){toast('Nessun risultato BPM da verificare.',true);return}
 // Direct navigation must not leave the target hidden behind a previous collection filter.
 state.search='';state.statusFilter='All';state.formatFilter='All';state.folderFilter='All';
 if(typeof reviewPage!=='undefined')reviewPage=0;
 state.active=item.record.id;state.step=1;renderApp();
 // The overview keeps automatic rows compact; explicitly opening review reveals the first candidate.
 const panel=document.querySelector?.('.gp-bpm-lookup-results');if(panel){panel.open=true;panel.scrollIntoView?.({block:'nearest',behavior:'auto'});}
}
async function example({autoSchedule=true}={}){
 if(!available||discogsSync.running||discogsConnect.running)return;
 try{
  const d=await gpRequest('/api/audio/example');
  const tracks=mappedDiscogsTracks(d);
  // Do not create a misleading zero-track record if the public API is incomplete.
  if(!tracks.length)throw Error('Discogs non ha restituito una tracklist utilizzabile. Riprova quando il servizio è disponibile.');
  if(!gpIsFresh(d.fetchedAt))throw Error('Data dei metadati Discogs non valida: controlla l’orologio del PC e riprova.');
  const r=normalizeRelease({...d,tracks,tracklistFetchedAt:d.fetchedAt});
  // This is licensed-source research, not a permanent local record or an owned CSV.
  // A later save/export must not leave an empty Discogs-derived demo behind.
  r.gpResearchExample=true;
  const existing=state.releases.find(x=>x.gpResearchExample===true&&x.releaseId===r.releaseId
   ||x.releaseId===r.releaseId&&!x.discogsInstanceId&&!x.tracks.length&&!x.notes&&
     x.artist===r.artist&&x.title===r.title&&x.label===r.label&&x.format==='File');
  commit(()=>{
   if(existing){
    existing.gpResearchExample=true;
    if(!existing.tracks.length){existing.tracks=r.tracks;existing.tracklistFetchedAt=r.tracklistFetchedAt;existing.tracklistError=''}
    state.active=existing.id;
   }else{state.releases.push(r);state.active=r.id}
   if(!state.selected.includes(state.active))state.selected.push(state.active);
   state.step=1;
  });
  paused=false;if(autoSchedule)schedule();return true;
 }catch(e){toast('Esempio pubblico non disponibile: '+String(e.message||e),true);return false}
}
document.addEventListener('change',e=>{if(e.target.matches?.('[data-gp-auto-enable]')){enabled=e.target.checked;try{localStorage.setItem('grooveprint-auto-bpm-enabled',enabled?'on':'off')}catch{}if(!enabled)stop();else{paused=false;schedule()}refresh()}});
document.addEventListener('click',e=>{if(e.target.closest('[data-gp-auto-stop]'))stop();if(e.target.closest('[data-gp-auto-retry]'))retry();if(e.target.closest('[data-gp-auto-review]'))openReview();if(e.target.closest('[data-gp-auto-compare]'))void compareEngines().catch(error=>transition('error','Errore inatteso nel confronto V1/V2: '+String(error?.message||error)+'. Riprova.'));if(e.target.closest('[data-gp-auto-example]'))void example()});
window.GrooveprintAutomaticBPM={job,panel,schedule,stop,retry,example,refresh,compareEngines,trace:()=>comparisonTrace.slice(),inspect:track=>{const x=seen.get(track);return x?{phase:x.phase,reason:x.reason}:null}};
async function init(){
 if(!/^https?:$/.test(location.protocol))return;
 while(discogsConnect.loading)await new Promise(resolve=>setTimeout(resolve,50));
 try{const s=await gpRequest('/api/audio/status');available=s.enabled===true;csrf=s.csrf||'';exampleReleaseId=String(s.researchExampleReleaseId||'');exampleArtist=String(s.researchExampleArtist||'');exampleTitle=String(s.researchExampleTitle||'');approved=Array.isArray(s.approvedReleaseIds)?new Set(s.approvedReleaseIds):null;minInterval=Math.max(0,Number(s.minRequestIntervalMs)||0);ready=true;if(available){renderApp();schedule()}}catch{ready=true;}
}
void init();
})();
