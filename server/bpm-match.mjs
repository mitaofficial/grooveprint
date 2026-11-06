/**
 * GROOVEPRINT BPM evidence matching.
 * Only exact artist + exact track version can be auto-assigned as catalog BPM.
 * A catalog BPM is NEVER audio-verified.
 */
export function normalizeArtist(value) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+\([1-9]\d{0,3}\)(?=\s|$|[,;&])/g, '')
    .replace(/[^a-z0-9]+/gi, ' ').toLowerCase().trim().replace(/\s+/g,' ');
}
export function normalizeTitle(value) {
  // Retain "remix", "dub", "edit", "live", "remaster", and their qualifiers.
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/gi,' ').toLowerCase().trim().replace(/\s+/g,' ');
}
export function validTempo(value) {
  const n = Number(value);
  return value !== '' && value !== null && value !== undefined && Number.isFinite(n) && n>=40 && n<=300 ? n : null;
}
export function resolveEvidence({artist,title}, providerData={}) {
  const base = {status:'unavailable',bpm:null,source:'GetSongBPM',match:'none',candidates:[]};
  const actualArtist=normalizeArtist(artist), actualTitle=normalizeTitle(title);
  if(!actualArtist||!actualTitle||['various artists','various','unknown','v a'].includes(actualArtist))
    return {...base,status:'review',reason:'missing-track-artist'};
  const entries = Array.isArray(providerData.candidates) ? providerData.candidates : [];
  const candidates = entries.map(entry=>{
    const bpm=validTempo(entry.bpm ?? entry.tempo);
    const artists=Array.isArray(entry.artists) ? entry.artists
      : Array.isArray(entry.artist) ? entry.artist
      : [entry.artist];
    const matchesArtist=artists.some(v=>normalizeArtist(typeof v==='object'&&v?v.name:v)===actualArtist)
      ||normalizeArtist(typeof entry.artist==='string'?entry.artist:'')===actualArtist;
    const matchesTitle=normalizeTitle(entry.title)===actualTitle;
    const match=matchesArtist&&matchesTitle?'exact':matchesTitle?'title-only':'unverified';
    return {title:String(entry.title||'').slice(0,160),artist:typeof entry.artist==='string'?entry.artist:artists.map(v=>v?.name||v||'').join(', ').slice(0,180),bpm,match,url:/^https:\/\/(?:www\.)?getsongbpm\.com\//.test(String(entry.url||''))?entry.url:'https://getsongbpm.com/'};
  }).filter(x=>x.bpm!==null).slice(0,15);
  const exact = candidates.filter(x=>x.match==='exact');
  const tempos = [...new Set(exact.map(x=>x.bpm))];
  if(tempos.length===1) return {status:'catalog',bpm:tempos[0],source:'GetSongBPM',match:'exact',candidates:exact.slice(0,8),referenceUrl:exact[0].url,verified:false};
  if(candidates.length) return {status:'review',bpm:null,source:'GetSongBPM',match:tempos.length>1?'conflicting-exact':'unverified',candidates:candidates.slice(0,8),reason:tempos.length>1?'conflicting-tempo':'no-exact-match'};
  return {...base,reason:'not-found'};
}
export function makeTrackTasks(releases) {
  const tasks=[];
  for(const release of releases||[]){
    for(const [index,track] of (release.tracks||[]).entries()){
      if(track.bpm !== null && track.bpm !== undefined && track.bpm !== '' && validTempo(track.bpm)!==null) continue;
      const artist=String(track.artist||release.artist||'').trim();
      const title=String(track.title||'').trim();
      if(!title)continue;
      tasks.push({id:String(release.id||'')+':'+index,releaseId:String(release.id||''),index,artist,title,position:String(track.position||''),trackRef:track});
    }
  }
  return tasks;
}
