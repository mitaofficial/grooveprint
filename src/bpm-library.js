/* GROOVEPRINT Local Audio Library v3: one folder selection, batch analysis.
 * No audio bytes leave the browser. An experimental estimate is never VERIFIED.
 */
(function(){
'use strict';
const job={running:false,total:0,processed:0,matched:0,estimated:0,review:0,errors:0,unmatched:0,phase:'idle',message:''};
let input=null;
const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
 .replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g,'')
 .replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[^a-z0-9]+/gi,' ').toLowerCase().trim().replace(/\s+/g,' ');
function trackList(releases){
 const result=[];
 for(const r of releases||[])for(const [index,t] of (r.tracks||[]).entries())
  if(t&&String(t.title||'').trim())result.push({record:r,track:t,index,
   title:norm(t.title),artist:norm(t.artist||r.artist)});
 return result;
}
function matchFile(file,tracks){
 const basename=String(file?.name||'').replace(/\.[^.]+$/,'');
 const name=norm(basename);
 if(!name)return {status:'unmatched'};
 const candidates=[];
 for(const item of tracks){
  const exact=name===item.artist+' '+item.title || name===item.title+' '+item.artist;
  const titleOnly=name===item.title;
  // Title-only matching only when unique among ALL releases.
  if(exact)candidates.push({item,grade:2});
  else if(titleOnly)candidates.push({item,grade:1});
 }
 const topGrade=Math.max(0,...candidates.map(x=>x.grade));
 const best=candidates.filter(x=>x.grade===topGrade);
 if(best.length!==1)return {status:best.length>1?'ambiguous':'unmatched',candidates:best.length};
 if(topGrade===1&&tracks.filter(t=>t.title===name).length!==1)return {status:'ambiguous'};
 return {status:'matched',...best[0].item};
}
function fileAllowed(file){
 const name=String(file.name||'');
 return /\.(wav|mp3|m4a|aac|flac|aiff?|ogg|opus)$/i.test(name) && file.size>0 && file.size<=160*1024*1024;
}
function needsBpm(track){const bpm=track.bpm;return bpm===null||bpm===undefined||bpm===''||!Number.isFinite(Number(bpm))||Number(bpm)<=0}
function panel(){
 const stateLabel=job.running?'ANALISI LOCALE':job.phase==='complete'?'SCANSIONE COMPLETATA':'LIBRERIA AUDIO LOCALE';
 return '<section class="gp-local-audio" style="margin:12px 0;border-top:1px solid #465239;padding-top:12px">'+
 '<div class="flex between" style="flex-wrap:wrap;gap:8px"><b>'+esc(stateLabel)+'</b>'+
 '<button type="button" class="small quiet" data-gp-library-pick="1" '+(job.running?'disabled':'')+'>♫ CONNECT AUDIO LIBRARY</button></div>'+
 '<p class="footnote">Seleziona una cartella audio una sola volta: GROOVEPRINT abbina i nomi esatti e stima i BPM in batch sul tuo dispositivo. Nessun file viene caricato sui nostri server. L’analisi richiede la scheda aperta e usa soltanto file di cui possiedi i diritti d’uso.</p>'+
 (job.running||job.phase==='complete'?'<p class="footnote">'+job.processed+'/'+job.total+' file · '+job.estimated+' stime · '+job.review+' da verificare · '+job.unmatched+' non associati · '+job.errors+' errori</p>':'')+
 (job.message?'<p class="footnote">'+esc(job.message)+'</p>':'')+'</section>';
}
function redraw(){if(typeof renderApp==='function')renderApp()}
async function analyzeFiles(files){
 if(job.running)return;
 const list=Array.from(files||[]).slice(0,1500).filter(fileAllowed);
 Object.assign(job,{running:true,total:list.length,processed:0,matched:0,estimated:0,review:0,errors:0,unmatched:0,phase:'analyzing',message:''});
 redraw();
 try{
  if(!list.length){job.message='Nessun file audio supportato nella cartella.';return}
  const {estimateLocalTempo}=await import('/assets/bpm-tempo.mjs');
  const targets=trackList(state.releases);
  const ctx=new (window.AudioContext||window.webkitAudioContext)();
  try{
   for(const file of list){
    const match=matchFile(file,targets);
    if(match.status!=='matched'){job.unmatched++;job.processed++;continue}
    job.matched++;
    // Existing user-verified and catalog BPM remain unchanged. No silent overwrite.
    if(!needsBpm(match.track)){job.processed++;continue}
    try{
     const audio=await ctx.decodeAudioData(await file.arrayBuffer());
     const result=estimateLocalTempo(audio);
     if(!state.releases.includes(match.record)||match.record.tracks[match.index]!==match.track||!needsBpm(match.track)){
      job.processed++;continue;
     }
     if(result.status==='estimated'){
      match.track.bpmCandidates=result.bpmCandidates;
      match.track.bpmCheckedAt=new Date().toISOString();
      match.track.bpmReason=String(result.reason||'local-estimate');
      if(result.requiresReview){match.track.bpm=null;match.track.bpmStatus='review';match.track.source='local-dsp';job.review++}
      else{match.track.bpm=result.bpm;match.track.bpmStatus='estimated';match.track.source='local-dsp';job.estimated++}
     }else{
      match.track.bpmStatus='unavailable';match.track.bpmReason=String(result.reason||'no-beat-detected');
      job.review++;
     }
     storeLater();
    }catch{job.errors++}
    job.processed++;
    if(job.processed%3===0)redraw();
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }finally{await ctx.close().catch(()=>{})}
  job.phase='complete';
  job.message='Analisi locale terminata. Le stime non sono BPM verificati; controlla gli eventuali valori ambigui.';
 }catch(error){job.phase='error';job.message='Errore nel motore audio: '+String(error?.message||error)}
 finally{job.running=false;storeLater();redraw()}
}
function chooseFolder(){
 if(job.running)return;
 if(!input){
  input=document.createElement('input');input.type='file';input.multiple=true;
  input.setAttribute('webkitdirectory','');input.setAttribute('directory','');
  input.style.display='none';input.setAttribute('aria-label','Select your authorized music library folder');
  input.addEventListener('change',()=>{const files=Array.from(input.files||[]);input.value='';void analyzeFiles(files)});
  document.body.appendChild(input);
 }
 input.click();
}
document.addEventListener('click',e=>{if(e.target.closest('[data-gp-library-pick]'))chooseFolder()});
window.GrooveprintAudioLibrary={job,panel,matchFile,trackList,analyzeFiles,chooseFolder};
})();
