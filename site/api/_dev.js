// Shared helpers for the /dev page (SpaceShip Dev downloads, admins of the GitHub repository only).
// Needs two Vercel env vars from a GitHub OAuth App: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET.
// The sign-in cookie is encrypted (AES-256-GCM) with a key derived from GITHUB_CLIENT_SECRET.
const crypto = require('crypto');
const REPO = 'itamarnintendo04-arch/SpaceShip';
const COOKIE = 'ss_dev';
const key = () => crypto.createHash('sha256').update('ss-dev-session:' + (process.env.GITHUB_CLIENT_SECRET || '')).digest();
const b64u = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function seal(obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return b64u(Buffer.concat([iv, c.getAuthTag(), enc]));
}
function open(s) {
  try {
    const b = unb64u(s), d = crypto.createDecipheriv('aes-256-gcm', key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const o = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'));
    return o && o.e > Date.now() ? o : null;
  } catch (e) { return null; }
}
const cookies = req => Object.fromEntries(String(req.headers.cookie || '').split(/;\s*/).filter(Boolean).map(p => { const i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; }));
const setCookie = (res, name, val, maxAge) => res.setHeader('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`);
const gh = (path, token, opts = {}) => fetch('https://api.github.com' + path, Object.assign({}, opts, {
  headers: Object.assign({ 'User-Agent': 'spaceship-site', Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token }, opts.headers || {}) }));
// the signed-in admin, or null (checks the repository permission with GitHub every time)
async function admin(req) {
  const s = open(cookies(req)[COOKIE] || ''); if (!s) return null;
  const r = await gh('/repos/' + REPO, s.t); if (!r.ok) return null;
  const d = await r.json(); return d.permissions && d.permissions.admin ? s : null;
}
const origin = req => 'https://' + (req.headers['x-forwarded-host'] || req.headers.host);
const configured = () => !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
// the game's database, for the coupon maker: functions that only work with the /dev key
const SB_URL = 'https://unpzeskbzovolyqsqzna.supabase.co', SB_KEY = 'sb_publishable_iuaATuSyhRd65ZjNdx3Opg_w1KxQdQc';
const devKey = () => process.env.SS_DEV_KEY || crypto.createHmac('sha256', process.env.GITHUB_CLIENT_SECRET || '').update('ss-dev-db-key').digest('base64url');
async function rpc(fn, args) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ p_key: devKey() }, args || {})) });
  const d = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error((d && d.message) || 'db_error'); e.status = r.status; throw e; }
  return d;
}
const readBody = req => new Promise(ok => { if (req.body !== undefined) return ok(typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body);
  let b = ''; req.on('data', c => { b += c; if (b.length > 200000) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(b || '{}')); } catch (e) { ok({}); } }); });
module.exports = { REPO, COOKIE, seal, open, cookies, setCookie, gh, admin, origin, configured, rpc, devKey, readBody };
