/* Local audio stays in the browser. One decoder and one reusable DSP worker per job. */
(function(){
'use strict';
const evidence=window.GrooveprintBPMEvidence;
const MAX_FILES=1500,MAX_FILE_BYTES=160*1024*1024,MAX_PCM_BYTES=128*1024*1024,ANALYSIS_SECONDS=180;
const job={running:false,generation:0,total:0,processed:0,pending:0,active:0,completed:0,skipped:0,cancelled:0,
 matched:0,estimated:0,review:0,unavailable:0,errors:0,unmatched:0,ambiguous:0,alreadyBpm:0,stale:0,
 found:0,unsupported:0,empty:0,oversize:0,beyondLimit:0,contexts:0,workers:0,maxDecodedBytesObserved:0,phase:'idle',message:''};
let input=null,current=null;
const norm=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').toLowerCase().trim().replace(/\s+/g,' ');
const artistName=v=>String(v||'').replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'');
function trackList(releases){
 const result=[];
 for(const r of releases||[])for(const [index,t] of (r.tracks||[]).entries())
  if(t&&String(t.title||'').trim())result.push({record:r,track:t,index,title:norm(t.title),artist:norm(artistName(t.artist||r.artist)),originalArtist:norm(t.artist||r.artist)});
 return result;
}
function matchFile(file,tracks){
 const name=norm(String(file?.name||'').replace(/\.[^.]+$/,''));
 if(!name)return {status:'unmatched'};
 const candidates=[];
 for(const item of tracks){
  const exact=[item.artist,item.originalArtist].some(a=>a&&(name===a+' '+item.title||name===item.title+' '+a));
  if(exact)candidates.push({item,grade:2});
  else if(name===item.title)candidates.push({item,grade:1});
 }
 const topGrade=Math.max(0,...candidates.map(x=>x.grade)),best=candidates.filter(x=>x.grade===topGrade);
 if(best.length!==1)return {status:best.length?'ambiguous':'unmatched',candidates:best.length};
 return {status:'matched',...best[0].item};
}
function planFiles(files){
 const plan={files:[],found:0,unsupported:0,empty:0,oversize:0,beyondLimit:0};
 for(const file of files||[]){
  plan.found++;
  if(!/\.(wav|mp3|m4a|aac|flac|aiff?|ogg|opus)$/i.test(String(file.name||'')))plan.unsupported++;
  else if(!(file.size>0))plan.empty++;
  else if(file.size>MAX_FILE_BYTES)plan.oversize++;
  else if(plan.files.length===MAX_FILES)plan.beyondLimit++;
  else plan.files.push(file);
 }
 return plan;
}
function localReviews(){return trackList(state.releases).filter(item=>item.track.bpmStatus==='review'&&['local-dsp','audio-estimate'].includes(item.track.source))}
function openReview(){const first=localReviews()[0];if(first){state.active=first.record.id;state.step=1;if(typeof renderApp==='function')renderApp()}}
function panel(){
 const label=job.running?(job.phase==='cancelling'?'INTERRUZIONE IN CORSO':'ANALISI LOCALE'):job.phase==='complete'?'SCANSIONE COMPLETATA':job.phase==='cancelled'?'SCANSIONE INTERROTTA':'LIBRERIA AUDIO LOCALE';
 return '<section class="gp-local-audio" role="status" style="margin:12px 0;border-top:1px solid #465239;padding-top:12px">'+
 '<div class="flex between" style="flex-wrap:wrap;gap:8px"><div><b>GROOVEPRINT BPM Engine · sperimentale</b><div class="footnote">'+esc(label)+'</div></div><div class="flex">'+
 '<button type="button" class="small quiet" data-gp-library-pick="1" '+(job.running?'disabled':'')+'>♫ CONNECT AUDIO LIBRARY</button>'+
 (localReviews().length?'<button type="button" class="small quiet" data-gp-library-review="1">VEDI CANDIDATI</button>':'')+
 (job.running?'<button type="button" class="small quiet" data-gp-library-stop="1" '+(job.phase==='cancelling'?'disabled':'')+'>INTERROMPI AUDIO</button>':'')+'</div></div>'+
 '<p class="footnote">Cartella audio locale: abbinamento esatto di artista e versione, stime sul dispositivo. Nessun audio viene caricato. Usa soltanto file autorizzati; mantieni aperta la scheda.</p>'+
 (job.phase!=='idle'?'<p class="footnote">'+job.processed+'/'+job.total+' elaborati · '+job.estimated+' stime · '+job.review+' da verificare · '+job.unavailable+' senza stima · '+job.skipped+' saltati · '+job.errors+' errori · '+job.cancelled+' annullati</p><p class="footnote">'+job.found+' file trovati · '+job.total+' accettati · '+job.unsupported+' non audio/supportati · '+job.empty+' vuoti · '+job.oversize+' oltre 160 MB · '+job.beyondLimit+' oltre il limite di '+MAX_FILES+'</p>':'')+
 (job.message?'<p class="footnote">'+esc(job.message)+'</p>':'')+'</section>';
}
function redraw(){
 const el=document.querySelector?.('.gp-local-audio');if(el)el.outerHTML=panel();
 evidence.refreshFields();window.GrooveprintCollectionEnrichment?.refreshPanel();
}
const abortError=()=>Object.assign(new Error('Analisi interrotta'),{name:'AbortError'});
function stop(){
 if(!current||!job.running||current.cancelled)return;
 current.cancelled=true;job.phase='cancelling';
 job.message='Interruzione richiesta. Attendo il rilascio della lettura/decodifica in corso; nessun nuovo file verrà avviato.';
 current.rejectAnalysis?.(abortError());
 if(current.worker){current.worker.terminate();current.worker=null;job.workers=0}
 redraw();
}
function runWorker(token,audio){
 if(!token.worker){
  if(typeof window.Worker!=='function')throw Error('Analisi audio locale non disponibile in questo browser: usa un browser aggiornato o inserisci il BPM manualmente.');
  token.worker=new window.Worker('/assets/bpm-worker.mjs',{type:'module'});job.workers=1;
 }
 // AudioBuffer is not transferred. Copy only the first two channels / 180 seconds;
 // transfer ownership of these copies. Full-file decode memory remains separate.
 const count=Math.min(audio.length||audio.getChannelData(0).length,Math.floor(audio.sampleRate*ANALYSIS_SECONDS));
 const channels=Array.from({length:Math.min(2,audio.numberOfChannels)},(_,c)=>audio.getChannelData(c).slice(0,count));
 const id=++token.sequence;
 return new Promise((resolve,reject)=>{
  let timer;
  const finish=(error,value)=>{clearTimeout(timer);token.rejectAnalysis=null;if(token.worker){token.worker.onmessage=null;token.worker.onerror=null;token.worker.onmessageerror=null}error?reject(error):resolve(value)};
  token.rejectAnalysis=error=>finish(error);
  token.worker.onmessage=event=>{if(event.data?.id===id)event.data.error?finish(Error('Il calcolo audio non è riuscito.')):finish(null,event.data.result)};
  const failed=event=>{event?.preventDefault?.();const worker=token.worker;finish(Error('Calcolo audio non disponibile o interrotto.'));worker?.terminate();token.worker=null;job.workers=0};
  token.worker.onerror=failed;token.worker.onmessageerror=failed;
  timer=setTimeout(()=>{const worker=token.worker;finish(Error('Tempo massimo del calcolo audio superato.'));worker?.terminate();token.worker=null;job.workers=0},60000);
  try{token.worker.postMessage({id,sampleRate:audio.sampleRate,channels},channels.map(c=>c.buffer))}catch{failed()}
 });
}
async function analyzeFiles(files){
 if(job.running)return;
 const plan=planFiles(files),list=plan.files,token={cancelled:false,worker:null,rejectAnalysis:null,sequence:0};current=token;
 const generation=job.generation+1;
 for(const k of Object.keys(job))if(typeof job[k]==='number')job[k]=0;
 Object.assign(job,{...plan,files:undefined,running:true,generation,total:list.length,pending:list.length,phase:'preparing',message:''});delete job.files;
 redraw();
 let ctx=null;
 try{
  if(!list.length){job.phase='complete';job.message='Nessun file audio accettato nella cartella.';return}
  if(typeof window.Worker!=='function')throw Error('Analisi audio locale non disponibile in questo browser: usa un browser aggiornato o inserisci il BPM manualmente.');
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!AudioContext)throw Error('Decodifica audio non supportata da questo browser.');
  ctx=new AudioContext({sampleRate:12000});job.contexts=1;
  const targets=trackList(state.releases),matches=[],occurrences=new Map();
  for(let n=0;n<list.length&&!token.cancelled;n++){
   if(n%30===0)await new Promise(resolve=>setTimeout(resolve,0));
   if(token.cancelled)break;
   const m=matchFile(list[n],targets);matches.push(m);
   if(m.status==='matched')occurrences.set(m.track,(occurrences.get(m.track)||0)+1);
  }
  job.phase='running';
  for(let n=0;n<list.length&&!token.cancelled;n++){
   if(n%3===0)await new Promise(resolve=>setTimeout(resolve,0));
   if(token.cancelled)break;
   job.pending--;job.active=1;
   const file=list[n],match=matches[n];
   let outcome='skipped',audio=null;
   try{
    if(match.status!=='matched'){job[match.status==='ambiguous'?'ambiguous':'unmatched']++;continue}
    if(occurrences.get(match.track)>1){job.ambiguous++;continue}
    job.matched++;
    if(!evidence.missing(match.track)||evidence.protectedValue(match.track)){job.alreadyBpm++;continue}
    const ticket=evidence.capture(match.record,match.track);
    const encoded=await file.arrayBuffer();
    if(token.cancelled)break;
    audio=await ctx.decodeAudioData(encoded);
    if(token.cancelled)break;
    const pcmBytes=(audio.length||audio.getChannelData(0).length)*audio.numberOfChannels*4;
    job.maxDecodedBytesObserved=Math.max(job.maxDecodedBytesObserved,pcmBytes);
    if(pcmBytes>MAX_PCM_BYTES)throw Error('Audio decodificato oltre il limite di memoria (128 MiB).');
    const pending=runWorker(token,audio);audio=null;
    const result=await pending;
    if(token.cancelled)break;
    if(!evidence.canApply(ticket,state.releases)){job.stale++;continue}
    if(result?.status==='estimated'&&Number.isFinite(result.bpm)&&result.bpm>=40&&result.bpm<=300){
     match.track.bpmCandidates=Array.isArray(result.bpmCandidates)?result.bpmCandidates.slice(0,8):[];
     match.track.bpmCheckedAt=new Date().toISOString();match.track.bpmReason=String(result.reason||'local-estimate');
     match.track.bpm=result.requiresReview?null:result.bpm;match.track.bpmStatus=result.requiresReview?'review':'estimated';match.track.source='local-dsp';
     job[result.requiresReview?'review':'estimated']++;
    }else if(result?.status==='unavailable'){
     match.track.bpmStatus='unavailable';match.track.bpmReason=String(result.reason||'no-beat-detected');job.unavailable++;
    }else throw Error('Risultato audio non valido.');
    outcome='completed';storeLater();
   }catch(error){
    if(!token.cancelled){outcome='errors';job.message='Un file non è stato analizzato (codec, dati o risorse): '+String(error?.message||error)}
   }finally{
    audio=null;job.active=0;
    if(token.cancelled)job.cancelled++;
    else{job[outcome]++;job.processed++}
   }
   if(job.processed%3===0)redraw();
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  job.phase=token.cancelled?'cancelled':'complete';
  job.message=token.cancelled?'Analisi interrotta: risultati precedenti conservati, risultati tardivi scartati.':'Analisi terminata. Stime da verificare; file non associati o ambigui rimangono invariati.';
 }catch(error){job.phase=token.cancelled?'cancelled':'error';job.message=String(error?.message||error)}
 finally{
  job.cancelled+=job.pending;job.pending=0;
  token.rejectAnalysis?.(abortError());token.worker?.terminate();token.worker=null;job.workers=0;
  if(ctx)await ctx.close().catch(()=>{});ctx=null;job.contexts=0;
  if(current===token)current=null;
  if(token.cancelled){job.phase='cancelled';job.message='Analisi interrotta: risultati precedenti conservati, risultati tardivi scartati.'}
  job.running=false;redraw(true);
 }
}
function chooseFolder(){
 if(job.running)return;
 if(!input){
  input=document.createElement('input');input.type='file';input.multiple=true;
  if('webkitdirectory' in input)input.webkitdirectory=true;
  input.accept='.wav,.mp3,.m4a,.aac,.flac,.aif,.aiff,.ogg,.opus';
  input.style.display='none';input.setAttribute('aria-label','Select authorized audio folder or multiple files');
  input.addEventListener('change',()=>{const files=Array.from(input.files||[]);input.value='';void analyzeFiles(files)});document.body.appendChild(input);
 }
 input.click();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-gp-library-pick]'))chooseFolder();if(e.target.closest('[data-gp-library-stop]'))stop();if(e.target.closest('[data-gp-library-review]'))openReview()});
window.GrooveprintAudioLibrary={job,panel,matchFile,trackList,planFiles,analyzeFiles,chooseFolder,stop};
})();
