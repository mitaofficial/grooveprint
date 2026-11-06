/* Read-only ONE request to the public CC0 AcousticBrainz low-level endpoint.
 * A 200 with JSON containing rhythm.bpm is a confirmed live provider response.
 * Any other status means availability is unverified; not a release blocker.
 */
const known='6df2d3b5-25e1-4d4c-a196-0404990a93ec';
const url='https://acousticbrainz.org/api/v1/'+known+'/low-level';
try{
 const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json','User-Agent':'GROOVEPRINT/3.0-alpha (https://grooveprint-web-production.up.railway.app/credits)'}});
 let bpm=null,reason='';
 if(response.ok)try{const result=await response.json();bpm=result?.rhythm?.bpm??null}catch{reason='invalid-json'}
 console.log(JSON.stringify({provider:'AcousticBrainz',probe:'public-archived-mbid',status:response.status,
  contentType:response.headers.get('content-type'),bpm:Number.isFinite(Number(bpm))?Number(bpm):null,reason}));
}catch(error){console.log(JSON.stringify({provider:'AcousticBrainz',status:'network-error',reason:String(error?.name||error)}))}
