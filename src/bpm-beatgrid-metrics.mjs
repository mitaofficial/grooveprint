/**
 * Research-only evaluation of estimated vs independently annotated beat
 * timestamps. No tempo metadata enters the detector. No hardcoded genre prior.
 * References must be checked and rights-tracked by the corpus manifest.
 */
export const BEAT_EVALUATION_VERSION='gp-beat-evaluation-v1';
function validate(input,label){
 if(!Array.isArray(input))throw new TypeError(label+' must be an array');
 if(input.some(x=>!Number.isFinite(x)||x<0))throw new TypeError(label+' must contain finite nonnegative seconds');
 const sorted=input.slice().sort((a,b)=>a-b);
 if(sorted.some((x,i)=>i>0&&x<=sorted[i-1]))throw new TypeError(label+' has duplicate beat timestamps');
 return sorted;
}
export function beatFMeasure(predicted,reference,{toleranceSeconds=.07}={}){
 if(!Number.isFinite(toleranceSeconds)||toleranceSeconds<=0||toleranceSeconds>.5)
  throw new RangeError('Tolerance seconds must be within (0, 0.5]');
 const est=validate(predicted,'predicted beats'),ref=validate(reference,'reference beats');
 // Deterministic one-to-one monotonic matching. A dense double-time grid
 // cannot claim every reference beat twice.
 let i=0,j=0,correct=0,absTiming=0;
 while(i<est.length&&j<ref.length){
  const diff=est[i]-ref[j];
  if(Math.abs(diff)<=toleranceSeconds){
   correct++;absTiming+=Math.abs(diff);i++;j++;
  }else if(diff<0)i++;else j++;
 }
 const precision=est.length?correct/est.length:0,recall=ref.length?correct/ref.length:0;
 const fMeasure=precision+recall?2*precision*recall/(precision+recall):0;
 return {evaluation:BEAT_EVALUATION_VERSION,toleranceSeconds,
  referenceBeats:ref.length,estimatedBeats:est.length,matchedBeats:correct,
  precision,recall,fMeasure,meanAbsoluteTimingErrorSeconds:correct?absTiming/correct:null,
  note:'Beat F-measure only, not evidence that the metrical BPM level is correct'};
}
