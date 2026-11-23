/** Offline reference acquisition only. Never imported by the audio detector. */
export function midiClock(bytes){
 const u16=i=>bytes.readUInt16BE(i),u32=i=>bytes.readUInt32BE(i);
 if(bytes.length<14||bytes.length>4*1024*1024||bytes.toString('ascii',0,4)!=='MThd')throw Error('Invalid MIDI');
 const ppq=u16(12);if(!ppq||ppq&0x8000)throw Error('Unsupported SMPTE MIDI clock');
 let pos=8+u32(4),lastTick=0;const changes=[];
 for(let track=0;track<u16(10);track++){
  if(bytes.toString('ascii',pos,pos+4)!=='MTrk')throw Error('Invalid MIDI track');
  const end=pos+8+u32(pos+4);pos+=8;let running=0,tick=0;
  if(end>bytes.length)throw Error('MIDI overflow');
  const vlq=()=>{let n=0,b,count=0;do{if(pos>=end||count++>=4)throw Error('Invalid MIDI VLQ');b=bytes[pos++];n=(n<<7)|(b&127)}while(b&128);return n};
  while(pos<end){
   tick+=vlq();lastTick=Math.max(lastTick,tick);let status=bytes[pos++];
   if(status<128){if(!running)throw Error('Missing MIDI running status');pos--;status=running}
   else if(status<240)running=status;
   if(status===255){
    const type=bytes[pos++],length=vlq();
    if(type===81&&length===3){const microseconds=bytes.readUIntBE(pos,3);if(!microseconds)throw Error('Invalid MIDI tempo');changes.push({tick,microseconds,track})}
    pos+=length;
   }else if(status===240||status===247){const length=vlq();pos+=length;running=0}
   else if(status>=128&&status<240)pos+=((status&240)===192||(status&240)===208)?1:2;
   else throw Error('Unsupported MIDI event');
   if(pos>end)throw Error('MIDI event overflow');
  }
 }
 changes.sort((a,b)=>a.tick-b.tick);const unique=[];
 for(const change of changes){
  const prior=unique.at(-1);
  if(prior?.tick===change.tick){
   if(prior.track===change.track){unique[unique.length-1]=change;continue} // sequential same-track updates: last takes effect
   if(prior.microseconds!==change.microseconds)throw Error('Conflicting simultaneous MIDI clocks in different tracks');continue;
  }
  unique.push(change);
 }
 if(!unique.length||unique[0].tick>0)unique.unshift({tick:0,microseconds:500000,defaultClock:true});
 let priorTick=0,seconds=0,tempo=500000;const tempoMap=[];
 for(const change of unique){seconds+=(change.tick-priorTick)*tempo/ppq/1000000;tempoMap.push({...change,seconds,bpm:60000000/change.microseconds});priorTick=change.tick;tempo=change.microseconds}
 const durationSeconds=seconds+(lastTick-priorTick)*tempo/ppq/1000000;
 const beatTimes=[];let part=0;
 for(let tick=0;tick<=lastTick;tick+=ppq){while(part+1<tempoMap.length&&tempoMap[part+1].tick<=tick)part++;
  const change=tempoMap[part];beatTimes.push(change.seconds+(tick-change.tick)*change.microseconds/ppq/1000000);
 }
 return {ppq,durationSeconds,tempoMap,beatTimes,
  explicitClock:changes.length>0,reference:'MIDI quarter-note rendering clock; musical tactus equivalence not manually verified'};
}
