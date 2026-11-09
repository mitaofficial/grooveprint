// Build a downloadable local app, not a deployment or a substitute catalog service.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
if(args.length&&!(args.length===2&&args[0]==='--out'))throw Error('Usage: node scripts/build-local-preview.mjs [--out FILE.html]');
const out=resolve(args[1]||resolve(root,'.private/local-preview/GROOVEPRINT-BPM.html'));
const read=p=>readFile(resolve(root,p),'utf8');
const strip=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
const original='const estimateLocalTempo=(()=>{'+strip(await read('src/bpm-tempo.mjs'))+';return estimateLocalTempo})();\n';
const experiment='const estimateExperiment=(()=>{'+strip(await read('src/bpm-tempo-experiment.mjs'))+';return estimateLocalTempo})();\n';
const adapter=strip(await read('src/bpm-engine.mjs'));
const decision=strip(await read('src/bpm-decision.mjs'));
const v3=strip(await read('src/bpm-compare-v3.mjs'));
const workers={v1:original+adapter+strip(await read('src/bpm-worker.mjs')),compare:original+experiment+adapter+decision+v3+strip(await read('src/bpm-worker-dev.mjs'))};
let source='unknown';try{source=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim())source+=' (working changes)'}catch{}
const literal=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const boot="if(location.protocol==='file:'){window.GrooveprintBPMDevelopment=true;window.GrooveprintPortableWorkers=Object.freeze(Object.fromEntries(Object.entries("+literal(workers)+").map(([k,v])=>[k,URL.createObjectURL(new Blob([v],{type:'text/javascript'}))])));window.GrooveprintExampleCSV="+literal(await read('examples/grooveprint-demo.csv'))+";}";
let html=await read('index.html');
html=html.replace('<script>',`<!-- Local build from ${source} -->\n<script>${boot}</script>\n<script>`);
for(const file of ['bpm-evidence.js','collection-enrichment.js','bpm-library.js','bpm-auto.js']){
 const tag=`<script src="/assets/${file}"></script>`;if(!html.includes(tag))throw Error('Missing source asset '+file);
 const code=(await read('src/'+file)).replace(/<\/script/gi,'<\\/script');html=html.replace(tag,()=>'<script>\n'+code+'\n</script>');
}
await mkdir(dirname(out),{recursive:true});await writeFile(out,html);
console.log(JSON.stringify({file:out,source,mode:'local-file',defaultEngine:'v1',comparison:'explicit opt-in; never auto-assigns',requiresNodeToOpen:false}));
