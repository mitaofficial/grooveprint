import test from 'node:test';
import assert from 'node:assert/strict';
import {findMetricalCounterevidence} from '../src/bpm-metrical-counterevidence.mjs';
function pulse(bpm){const sr=12000,a=new Float32Array(sr*36),period=60*sr/bpm;for(let i=0;i<a.length;i++){const d=i-Math.floor(i/period)*period;a[i]=Math.exp(-d/(sr*.004))*Math.sin(2*Math.PI*110*i/sr)}return a}
test('coherent 3:2 counterpulse vetoes a stable but incompatible neural tactus',()=>{
 const pcm=pulse(100),decision={status:'supported',suggestedBpm:150,windows:[{startSeconds:0,endSeconds:12,strong:true},{startSeconds:24,endSeconds:36,strong:true}]};
 const result=findMetricalCounterevidence(12000,[pcm],decision);
 assert.ok(result);assert.equal(result.relation,'three-to-two');assert.ok(Math.abs(result.bpm-100)<1);
 decision.suggestedBpm=100;assert.equal(findMetricalCounterevidence(12000,[pcm],decision),null,'same pulse is not independent validation or a veto');
});
