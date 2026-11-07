import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
test('runtime contains no retired provider integration, host, configuration key or fixed credit',()=>{
 const files=['index.html',...['src','server'].flatMap(dir=>readdirSync(dir).filter(x=>/\.(mjs|js)$/.test(x)).map(x=>join(dir,x)))];
 for(const file of files)assert.equal(/getsongbpm|getsong\.co|GETSONGBPM_API_KEY|gsb-public-credit/i.test(readFileSync(file,'utf8')),false,'retired integration in '+file);
});
