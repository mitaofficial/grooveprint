import {createHash,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const sid = () => randomBytes(32).toString('base64url');
export class SessionStore {
  constructor(filename,secretKey) {
    if(secretKey?.length!==32) throw new Error('SESSION_ENCRYPTION_KEY must contain 32 bytes (64 hex digits).');
    this.key=secretKey;
    if(filename!==':memory:') mkdirSync(dirname(filename),{recursive:true});
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY,csrf TEXT NOT NULL,username TEXT,credentials TEXT,created_at INTEGER,expires_at INTEGER);
      CREATE TABLE IF NOT EXISTS oauth_pending (id TEXT PRIMARY KEY,session_id TEXT NOT NULL,token TEXT NOT NULL,token_secret TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS oauth_pending_session ON oauth_pending(session_id);`);
  }
  encrypt(data) {const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);const body=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);return [iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),body.toString('base64url')].join('.');}
  decrypt(raw) {if(!raw)return null;const [iv,tag,body]=raw.split('.').map(x=>Buffer.from(x,'base64url'));const decipher=createDecipheriv('aes-256-gcm',this.key,iv);decipher.setAuthTag(tag);return JSON.parse(Buffer.concat([decipher.update(body),decipher.final()]).toString('utf8'));}
  purgeExpired(now=Date.now()){this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);this.db.prepare('DELETE FROM oauth_pending WHERE expires_at <= ?').run(now);}
  create() {this.purgeExpired();const id=sid(),csrf=sid(),now=Date.now();this.db.prepare('INSERT INTO sessions (id,csrf,created_at,expires_at) VALUES (?,?,?,?)').run(hash(id),csrf,now,now+7*86400000);return{id,csrf};}
  get(raw) {if(!raw||raw.length>160)return null;this.purgeExpired();const row=this.db.prepare('SELECT * FROM sessions WHERE id = ? AND expires_at > ?').get(hash(raw),Date.now());return row?{id:raw,dbid:row.id,csrf:row.csrf,username:row.username,credentials:this.decrypt(row.credentials)}:null;}
  authorize(session,username,tokenPair){this.db.prepare('UPDATE sessions SET username=?, credentials=? WHERE id=?').run(username,this.encrypt(tokenPair),session.dbid);}
  disconnect(session){this.db.prepare('UPDATE sessions SET username=NULL,credentials=NULL WHERE id=?').run(session.dbid);this.db.prepare('DELETE FROM oauth_pending WHERE session_id=?').run(session.dbid);}
  pendingSet(session,token,secret){this.db.prepare('DELETE FROM oauth_pending WHERE session_id=?').run(session.dbid);this.db.prepare('INSERT INTO oauth_pending VALUES (?,?,?,?,?)').run(hash(token),session.dbid,token,this.encrypt({secret}),Date.now()+10*60000);}
  pendingTake(session,token){const id=hash(token);const row=this.db.prepare('SELECT * FROM oauth_pending WHERE id=? AND session_id=? AND expires_at>?').get(id,session.dbid,Date.now());this.db.prepare('DELETE FROM oauth_pending WHERE id=?').run(id);if(!row)return null;return{token:row.token,secret:this.decrypt(row.token_secret).secret};}
  close(){this.db.close();}
}
