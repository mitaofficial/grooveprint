/**
 * Open-data BPM evidence adapter. AcousticBrainz records use MusicBrainz Recording MBIDs.
 * The AcousticBrainz archive is CC0 (no new submissions since 2022).
 * This module does not search MusicBrainz (public web service has separate commercial terms).
 */
export const MBID_PATTERN=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validRecordingMbid(input){
 const value=String(input||'').trim().toLowerCase();
 return MBID_PATTERN.test(value)?value:null;
}
export function parseAcousticBrainzLowLevel(payload,mbid){
 const id=validRecordingMbid(mbid);
 const empty={status:'unavailable',bpm:null,source:'AcousticBrainz',reason:'not-found'};
 if(!id||!payload||typeof payload!=='object')return {...empty,reason:!id?'invalid-mbid':'invalid-response'};
 const document=payload.rhythm?payload:
     payload[id]?.['0']||payload[id]?.[0]||payload[id]||null;
 const tempo=document?.rhythm?.bpm;
 const bpm=tempo===null||tempo===undefined||tempo===''?NaN:Number(tempo);
 if(!Number.isFinite(bpm)||bpm<40||bpm>300)return {...empty,reason:'no-valid-rhythm-bpm'};
 const referenceUrl='https://acousticbrainz.org/api/v1/'+id+'/low-level';
 return {status:'catalog',bpm:Math.round(bpm*100)/100,
  source:'AcousticBrainz',provider:'AcousticBrainz',referenceUrl,
  recordingMbid:id,match:'recording-mbid',verified:false,
  reason:'archived-algorithm-estimate',audioAnalyzed:false};
}
export async function lookupAcousticBrainz(mbid,{fetchImpl=fetch,timeoutMs=10000}={}){
 const id=validRecordingMbid(mbid);
 if(!id)return {status:'review',bpm:null,source:'AcousticBrainz',reason:'invalid-recording-mbid'};
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try {
  const response=await fetchImpl('https://acousticbrainz.org/api/v1/'+id+'/low-level',{
    signal:controller.signal,
    headers:{Accept:'application/json','User-Agent':'GROOVEPRINT/3.0 (https://grooveprint-web-production.up.railway.app/credits)'}
  });
  if(response.status===404)return {status:'unavailable',bpm:null,source:'AcousticBrainz',reason:'not-in-archive'};
  if(!response.ok)return {status:'error',bpm:null,source:'AcousticBrainz',reason:'http-'+response.status};
  const data=await response.json();
  return parseAcousticBrainzLowLevel(data,id);
 }catch {
  return {status:'error',bpm:null,source:'AcousticBrainz',reason:'network-or-invalid-json'};
 }finally{clearTimeout(timer)}
}
