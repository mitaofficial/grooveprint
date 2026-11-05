import {createHmac, randomBytes} from 'node:crypto';
const enc = value => encodeURIComponent(String(value ?? '')).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function oauthAuthorization({method='GET', url, consumerKey, consumerSecret, token, tokenSecret='', callback, verifier, nonce=randomBytes(16).toString('hex'), timestamp=Math.floor(Date.now()/1000)}) {
  const params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_version: '1.0',
  };
  if(token) params.oauth_token = token;
  if(callback) params.oauth_callback = callback;
  if(verifier) params.oauth_verifier = verifier;
  const u = new URL(url);
  const ordered = [...Object.entries(params), ...u.searchParams.entries()]
    .map(([k,v]) => [enc(k),enc(v)])
    .sort((a,b)=>a[0].localeCompare(b[0],'en') || a[1].localeCompare(b[1],'en'));
  const normalized = ordered.map(([k,v])=>`${k}=${v}`).join('&');
  const base = [method.toUpperCase(),enc(u.origin+u.pathname),enc(normalized)].join('&');
  const key = `${enc(consumerSecret)}&${enc(tokenSecret)}`;
  const signature = createHmac('sha1',key).update(base).digest('base64');
  return 'OAuth ' + Object.entries({...params, oauth_signature:signature})
    .map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ');
}
export function parseTokenBody(raw) {
  const params = new URLSearchParams(raw);
  const token=params.get('oauth_token'),secret=params.get('oauth_token_secret');
  if(!token || !secret) throw new Error('Discogs did not return an OAuth token pair');
  return {token, secret, callbackConfirmed:params.get('oauth_callback_confirmed')};
}
