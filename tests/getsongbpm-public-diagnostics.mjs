/**
 * Read-only public web diagnostics for GetSongBPM form.
 * Does NOT submit the registration form, send emails or use API secrets.
 */
const sites = [
  "https://getsongbpm.com/api",
  "https://grooveprint-web-production.up.railway.app/",
  "https://grooveprint-web-production.up.railway.app/credits"
];
const timeout=20000;
async function get(url){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(timeout),redirect:"follow",headers:{"User-Agent":"GROOVEPRINT-Diagnostics/1.0 (read-only site validation)","Accept":"text/html,application/javascript,*/*;q=0.8"}});
    return {status:r.status,url:r.url,type:r.headers.get("content-type"),body:await r.text()};
  }catch(e){return {error:String(e?.message||e)}}
}
for (const url of sites) {
 const r=await get(url);
 console.log("PUBLIC CHECK",JSON.stringify({url,status:r.status,finalURL:r.url,contentType:r.type,bytes:r.body?.length,error:r.error,
 backlink:typeof r.body==="string"?/href\s*=\s*["']https:\/\/getsongbpm\.com\/?["']/i.test(r.body):null}));
 if(url.endsWith("/api") && r.body){
  const html=r.body;
  console.log("FORMS",[...html.matchAll(/<form\b([^>]*)>/gi)].map(m=>m[1].slice(0,400)));
  console.log("INPUTS",[...html.matchAll(/<input\b([^>]*)>/gi)].map(m=>{
    const a=m[1],v=k=>a.match(new RegExp("\\b"+k+"\\s*=\\s*[\"']([^\"']*)[\"']","i"))?.[1]||"";
    return {id:v("id"),name:v("name"),type:v("type"),required:/\brequired\b/i.test(a)};
  }));
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>new URL(m[1],url).toString());
  const firstParty=scripts.filter(x=>new URL(x).hostname==="getsongbpm.com" && (/\.js(?:[?]|$)/i.test(x)||x.includes("/min/")));
  console.log("FIRST PARTY JS URLS",firstParty);
  for(const u of firstParty.slice(0,10)){
   const sr=await get(u);
   console.log("SCRIPT",JSON.stringify({url:u,status:sr.status,bytes:sr.body?.length,error:sr.error}));
   if(!sr.body)continue;
   for(const word of ["ajax/forms","getKey","getApiKey","api_key","get-api-key", "backlink"]){
    const idx=sr.body.toLowerCase().indexOf(word.toLowerCase());
    if(idx>=0){let str=sr.body.slice(Math.max(0,idx-270),Math.min(sr.body.length,idx+510));str=str.replace(/[a-zA-Z0-9_-]{70,}/g,"[long-token-redacted]");console.log("SCRIPT MATCH",JSON.stringify({url:u,keyword:word,excerpt:str}));}
   }
  }
 }
}
