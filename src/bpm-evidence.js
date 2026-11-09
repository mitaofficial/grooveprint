/* Shared write barrier for asynchronous BPM evidence. No provider data is persisted here. */
(function(){
'use strict';
const missing=t=>t.bpm===null||t.bpm===undefined||t.bpm===''||!Number.isFinite(Number(t.bpm))||Number(t.bpm)<=0;
const protectedValue=t=>['manual','verified','tap'].includes(t.bpmStatus)||['tap','user-verified'].includes(t.source)||t.bpmUserEdited===true;
const fields=['position','title','artist','duration','recordingMbid','trackSource','bpm','bpmStatus','source','bpmRevision','bpmUserEdited'];
function capture(record,track){return {record,track,recordId:record.id,releaseId:record.releaseId,instanceId:record.discogsInstanceId,artist:record.artist,albumTitle:record.title,values:fields.map(k=>track[k])}}
function canApply(ticket,releases,{replaceExisting=false}={}){
 if(!ticket||!releases.includes(ticket.record)||!ticket.record.tracks?.includes(ticket.track))return false;
 const {record,track}=ticket;
 if(record.id!==ticket.recordId||record.releaseId!==ticket.releaseId||record.discogsInstanceId!==ticket.instanceId||record.artist!==ticket.artist||record.title!==ticket.albumTitle)return false;
 if(!fields.every((k,i)=>Object.is(track[k],ticket.values[i])))return false;
 return replaceExisting||(!protectedValue(track)&&missing(track));
}
function userEdit(track){delete track.bpmComparisonCandidates;track.bpmRevision=(Number.isSafeInteger(track.bpmRevision)?track.bpmRevision:0)+1;track.bpmUserEdited=true;}
function refreshFields(){
 if(typeof state==='undefined')return;
 const record=state.releases.find(r=>r.id===state.active);if(!record)return;
 for(const input of document.querySelectorAll?.('[data-track]')||[]){
  const [index,key]=String(input.dataset.track||'').split(':'),track=record.tracks?.[Number(index)];
  if(track&&key==='bpm'&&document.activeElement!==input)input.value=track.bpm??'';
 }
 for(const el of document.querySelectorAll?.('[data-gp-bpm-hint]')||[]){const track=record.tracks?.[Number(el.dataset.gpBpmHint)];if(track&&typeof gpBpmHint==='function')el.textContent=gpBpmHint(track)}
}
window.GrooveprintBPMEvidence={missing,protectedValue,capture,canApply,userEdit,refreshFields};
})();
