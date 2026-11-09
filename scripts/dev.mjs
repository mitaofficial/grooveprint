// A self-contained local preview; production still starts server/app.mjs directly.
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';

if(process.env.NODE_ENV==='production')throw Error('Use npm start for production; npm run dev is local-only.');
const [major,minor]=process.versions.node.split('.').map(Number);
if(major<22||(major===22&&minor<13))throw Error('GROOVEPRINT needs Node.js 22.13 or later.');
const port=Number(process.env.PORT||4173);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer between 1 and 65535.');
process.env.PORT=String(port);
process.env.NODE_ENV='development';
process.env.PUBLIC_ORIGIN ||= 'http://127.0.0.1:'+port;
// Never open a configured production database or persist preview credentials.
process.env.SQLITE_PATH=':memory:';
process.env.SESSION_ENCRYPTION_KEY=randomBytes(32).toString('hex');
try{process.env.GROOVEPRINT_DEV_SHA=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:3000,stdio:['ignore','pipe','ignore']}).trim()}catch{process.env.GROOVEPRINT_DEV_SHA='unavailable'}
console.log('Local: '+new URL(process.env.PUBLIC_ORIGIN).origin);
console.log('GROOVEPRINT development HEAD: '+process.env.GROOVEPRINT_DEV_SHA);
console.log('Development sessions are in memory and reset on restart. Projects stay in your browser; export JSON backups.');
await import('../server/app.mjs');
