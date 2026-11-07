/* Original synthetic collection, no user data. Same scenario can target a baseline worktree. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,firefox,webkit} from 'playwright';
const args=process.argv.slice(2),arg=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const project=resolve(arg('--project','.')),label=arg('--label','working'),browserName=process.env.GROOVEPRINT_BROWSER||'chromium';
if(!/^[a-z0-9-]+$/i.test(label))throw Error('Use an opaque benchmark label');
const port=await new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})});
const temp=await mkdtemp(join(tmpdir(),'gp-ui-')),base='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['server/app.mjs'],{cwd:project,env:{...process.env,PORT:String(port),PUBLIC_ORIGIN:base,NODE_ENV:'test',SQLITE_PATH:join(temp,'db.sqlite'),SESSION_ENCRYPTION_KEY:'b'.repeat(64),DISCOGS_CONSUMER_KEY:'test',DISCOGS_CONSUMER_SECRET:'test'},stdio:'ignore'});
let browser;
try{
 for(let n=0;n<100;n++){try{if((await fetch(base+'/health')).ok)break}catch{}await delay(100)}
 browser=await {chromium,firefox,webkit}[browserName].launch({headless:true,args:browserName==='chromium'?['--no-sandbox']:[],executablePath:browserName==='chromium'?process.env.GROOVEPRINT_CHROMIUM_PATH||undefined:undefined});
 const page=await browser.newPage({viewport:{width:1365,height:900}});page.on('pageerror',error=>{throw error});
 await page.route('**/api/discogs/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({configured:false,connected:false,csrf:'test'})}));
 await page.goto(base);await page.waitForFunction(()=>restoreReady&&window.GrooveprintAudioLibrary);
 const data=await page.evaluate(async()=>{
  const sizes=[50,250,500,1000,3000],measures=[];
  for(const size of sizes){
   const csv='Artist,Title,Label,Catalog,Year,Format,Release ID\n'+Array.from({length:size},(_,i)=>'Fixture Artist '+i+',Synthetic Release '+i+',Test Label,GP-'+i+',2001,Vinyl,'+(400000+i)).join('\n');
   const raw={parseMs:[],stateMs:[],filterMs:[],renderMs:[],nextFrameMs:[]};
   for(let repeat=0;repeat<5;repeat++){
    let t=performance.now();const parsed=parseDelimited(csv,',');const {mapped}=convertRows(parsed,getMapped(parsed.rows[0]));raw.parseMs.push(performance.now()-t);
    t=performance.now();for(const r of mapped)r.tracks=[{position:'A1',title:'First Tool',bpm:138,bpmStatus:'manual'},{position:'B1',title:'Dub Tool',bpm:null}];
    state.releases=mapped;state.selected=mapped.map(r=>r.id);state.active=mapped[0].id;state.step=1;state.search='';state.formatFilter='All';state.statusFilter='All';state.folderFilter='All';raw.stateMs.push(performance.now()-t);
    t=performance.now();filtered();raw.filterMs.push(performance.now()-t);
    t=performance.now();renderApp();raw.renderMs.push(performance.now()-t);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));raw.nextFrameMs.push(performance.now()-t);
   }
   let beats=0,last=performance.now(),maxGap=0;const beat=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;beats++},0);
   await new Promise(resolve=>setTimeout(resolve,0));
   const pdfStart=performance.now(),pdf=typeof buildPdfAsync==='function'?await buildPdfAsync():buildPdf(),pdfMs=performance.now()-pdfStart;
   await new Promise(resolve=>setTimeout(resolve,0));clearInterval(beat);
   const pdfText=new TextDecoder('latin1').decode(await pdf.arrayBuffer()),pdfPages=Number(pdfText.match(/\/Type \/Pages \/Count (\d+)/)?.[1]);
   measures.push({size,repetitions:5,raw:Object.fromEntries(Object.entries(raw).map(([k,a])=>[k,a.map(x=>Number(x.toFixed(2)))])),rows:document.querySelectorAll('.rel-item').length,pdfMs:Number(pdfMs.toFixed(2)),pdfPath:typeof buildPdfAsync==='function'?'progressive':'synchronous',heartbeatTicks:beats,maxHeartbeatGapMs:Number(maxGap.toFixed(2)),pdfBytes:pdf.size,pdfPages});
  }
  return measures;
 });
 for(const row of data){assert.equal(row.rows,Math.min(row.size,1500));assert.equal(row.pdfPages,Math.ceil(row.size/8))}
 const gitHead=execFileSync('git',['rev-parse','HEAD'],{cwd:project,encoding:'utf8'}).trim();
 const report={label,gitHead,browser:browserName,browserVersion:browser.version(),node:process.version,viewport:[1365,900],syntheticSeed:'ordered-fixtures-v1',timingScope:'parse+normalize, state assignment, filter, JS render, two animation frames (paint proxy), synchronous PDF separately',data};
 const out=resolve('.private/benchmarks/ui-'+label+'-'+browserName+'.json');await mkdir(resolve('.private/benchmarks'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{await browser?.close();server.kill();await delay(100);await rm(temp,{recursive:true,force:true})}
