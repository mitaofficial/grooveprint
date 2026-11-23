/** Beat This! small0 ONNX inference, with the reference minimal postprocessor.
 * Chunk/edge/peak operations adapted from CPJKU/beat_this (MIT, see model LICENCE).
 * Runtime is injected: no network, decoder, worker or reference-label ownership.
 */
export function inferenceChunks(features){
 const {data,frames,bins}=features,starts=[];
 for(let start=-6;start<frames-6;start+=1488)starts.push(start);
 if(frames>1488)starts[starts.length-1]=frames-1494;
 return starts.map(start=>{
  const count=Math.min(start+1500,frames)-Math.max(start,0)+Math.max(0,-start)+Math.max(0,Math.min(6,start+1500-frames));
  const values=new Float32Array(count*bins);
  const from=Math.max(0,start),to=Math.min(start+1500,frames),left=Math.max(0,-start);
  values.set(data.subarray(from*bins,to*bins),left*bins);
  return {start,frames:count,data:values};
 });
}
function peakTimes(logits){
 const peaks=[];
 for(let i=0;i<logits.length;i++){
  if(!(logits[i]>0))continue;
  let maximum=true;
  for(let j=Math.max(0,i-3);j<=Math.min(logits.length-1,i+3);j++)if(logits[j]>logits[i]){maximum=false;break}
  if(maximum)peaks.push(i);
 }
 const unique=[];
 for(let i=0;i<peaks.length;){
  let mean=peaks[i++],count=1;
  while(i<peaks.length&&peaks[i]-mean<=1){count++;mean+=(peaks[i++]-mean)/count}
  unique.push(mean/50);
 }
 return unique;
}
export function logitsToBeats(beat,downbeat){
 const beats=peakTimes(beat),downs=peakTimes(downbeat);
 const snapped=downs.map(t=>{
  if(!beats.length)return t;
  let closest=beats[0];for(const b of beats)if(Math.abs(b-t)<Math.abs(closest-t))closest=b;
  return closest;
 });
 return {beats,downbeats:[...new Set(snapped)]};
}
export async function inferMusicalBeats(features,{session,Tensor,onProgress=()=>{}}){
 const beat=new Float32Array(features.frames).fill(-1000),downbeat=new Float32Array(features.frames).fill(-1000);
 const chunks=inferenceChunks(features);
 // Keep-first aggregation, matching the reference implementation. Process one
 // chunk at a time to avoid retaining attention tensors for all chunks.
 for(let n=chunks.length-1;n>=0;n--){
  const chunk=chunks[n],tensor=new Tensor('float32',chunk.data,[1,chunk.frames,features.bins]);
  const output=await session.run({spectrogram:tensor});
  const end=chunk.frames-6;
  for(let i=6;i<end;i++){
   const position=chunk.start+i;if(position>=0&&position<features.frames){beat[position]=output.beat.data[i];downbeat[position]=output.downbeat.data[i]}
  }
  for(const value of Object.values(output))value.dispose?.();tensor.dispose?.();
  onProgress({completed:chunks.length-n,total:chunks.length});
 }
 return {...logitsToBeats(beat,downbeat),beatLogits:beat,downbeatLogits:downbeat};
}

/** Bounded contextual windows: <=768 frames/model call, 6 border frames
 * discarded exactly as in the reference. Scalar evidence uses disjoint windows;
 * context is retained around each to avoid cutting beats at artificial edges.
 */
export async function inferMusicalBeatWindows(features,windows,{session,Tensor,onProgress=()=>{}}){
 const cache=new Map(),allBeats=[],allDowns=[],contexts=[];
 for(let n=0;n<windows.length;n++){
  const window=windows[n],count=Math.min(768,features.frames+12);
  const latest=features.frames-(count-6);
  const start=features.frames<=756?-6:Math.max(-6,Math.min(latest,Math.round((window.startSeconds+window.endSeconds)*25-count/2)));
  let predicted=cache.get(start);
  if(!predicted){
   const values=new Float32Array(count*features.bins);
   const from=Math.max(0,start),to=Math.min(features.frames,start+count),left=Math.max(0,-start);
   values.set(features.data.subarray(from*features.bins,to*features.bins),left*features.bins);
   const tensor=new Tensor('float32',values,[1,count,features.bins]);
   const output=await session.run({spectrogram:tensor});
   predicted=logitsToBeats(output.beat.data.slice(6,count-6),output.downbeat.data.slice(6,count-6));
   for(const key of ['beats','downbeats'])predicted[key]=predicted[key].map(t=>t+(start+6)/50);
   for(const value of Object.values(output))value.dispose?.();tensor.dispose?.();
   cache.set(start,predicted);
  }
  allBeats.push(...predicted.beats.filter(t=>t>=window.startSeconds&&t<window.endSeconds));
  allDowns.push(...predicted.downbeats.filter(t=>t>=window.startSeconds&&t<window.endSeconds));
  contexts.push({startSeconds:Math.max(0,start/50),endSeconds:Math.min(features.frames/50,(start+count)/50)});
  onProgress({completed:n+1,total:windows.length});
 }
 return {beats:[...new Set(allBeats)].sort((a,b)=>a-b),downbeats:[...new Set(allDowns)].sort((a,b)=>a-b),contexts,modelCalls:cache.size};
}
