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
module.exports = { REPO, COOKIE, seal, open, cookies, setCookie, gh, admin, origin, configured };
