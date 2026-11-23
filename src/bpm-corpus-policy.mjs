/**
 * V4 research corpus policy: prevent publisher BPMs and unlicensed/duplicate
 * audio from being mistaken for independently verified beat-grid ground truth.
 * This checks declarations and referential structure, not the truthfulness
 * of human annotations or the legal status of an external recording.
 */
import {isAbsolute,normalize,sep} from 'node:path';
const SPLITS=new Set(['development','validation','holdout']);
const METHODS=new Set(['independent-daw-beatgrid','expert-beat-annotation','human-consensus-beats']);
const HASH=/^[0-9a-f]{64}$/i;
const ID=/^[a-z0-9_-]{1,90}$/i;
const finite=x=>Number.isFinite(x);
export function auditBeatCorpus(manifest){
 const problems=[];
 const samples=manifest?.tracks;
 if(!Array.isArray(samples)||!samples.length)return {valid:false,problems:['tracks[] is missing or empty'],summary:null};
 const ids=new Set(),hashes=new Map(),groups=new Map(),splitCounts={development:0,validation:0,holdout:0};
 for(const [i,r] of samples.entries()){
  const id=typeof r?.id==='string'?r.id:'row-'+(i+1);
  const error=message=>problems.push(id+': '+message);
  if(!ID.test(id)||ids.has(id))error('invalid or duplicate opaque ID');
  ids.add(id);
  if(typeof r?.file!=='string'||!r.file||isAbsolute(r.file)||r.file.includes('\0')||
     normalize(r.file).split(sep).includes('..')||r.file.includes('\\'))error('audio file must be a relative non-traversal path');
  if(!SPLITS.has(r?.split))error('frozen development/validation/holdout split required');
  else splitCounts[r.split]++;
  if(typeof r?.recordingGroup!=='string'||!ID.test(r.recordingGroup))error('recordingGroup required for version/remix leakage checks');
  else{
   const prior=groups.get(r.recordingGroup);
   if(prior&&prior!==r.split)error('recordingGroup spans multiple splits');
   groups.set(r.recordingGroup,r.split);
  }
  if(typeof r?.sha256!=='string'||!HASH.test(r.sha256))error('audio SHA-256 required');
  else{
   const prior=hashes.get(r.sha256.toLowerCase());
   if(prior&&prior!==r.split)error('same audio SHA-256 appears in multiple splits');
   hashes.set(r.sha256.toLowerCase(),r.split);
  }
  if(!r?.rightToAnalyze||typeof r?.rightsEvidence!=='string'||r.rightsEvidence.length<8)
   error('rights-to-analyze declaration and evidence required');
  if(!METHODS.has(r?.verificationMethod))error('independent beat annotation method required (publisher labels excluded)');
  if(typeof r?.referenceProvenance!=='string'||r.referenceProvenance.length<8)
   error('independent reference provenance required');
  const times=r?.referenceBeatTimesSeconds;
  if(!Array.isArray(times)||times.length<8||times.some((x,j)=>!finite(x)||x<0||(j>0&&x<=times[j-1])))
   error('at least 8 monotonic nonnegative verified beat timestamps required');
  if(r?.groundTruthBpm!==null&&r?.groundTruthBpm!==undefined&&
     (!finite(r.groundTruthBpm)||r.groundTruthBpm<20||r.groundTruthBpm>300))
   error('ground truth BPM must be null or 20..300; variable tempo is allowed');
 }
 return {valid:problems.length===0,problems,summary:{tracks:samples.length,splitCounts,
  independentReferenceDeclared:problems.length===0,
  warning:'Declarations cannot establish legal rights or truly independent human verification; audit sources manually.'}};
}
