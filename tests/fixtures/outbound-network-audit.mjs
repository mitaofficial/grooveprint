/* Test process only: audit fetch/http(s) egress. Retired hosts are always blocked. */
import {appendFileSync} from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
function audit(input){
 let host='unknown';try{host=typeof input==='object'&&input.hostname?input.hostname:new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname}catch{}
 appendFileSync(process.env.GROOVEPRINT_TEST_NETWORK_AUDIT,JSON.stringify({host})+'\n');
 if(/(^|\.)(getsongbpm\.com|getsong\.co)$/i.test(host))throw Error('Retired network target blocked by test');
}
const fetchOriginal=globalThis.fetch;globalThis.fetch=(input,...args)=>{audit(input);return fetchOriginal(input,...args)};
for(const mod of [http,https])for(const key of ['request','get']){const original=mod[key];mod[key]=function(input,...args){audit(input);return original.call(this,input,...args)}}
syncBuiltinESMExports();
