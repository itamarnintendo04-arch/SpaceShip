// /api/dev/callback: back from GitHub. Only an admin of the repository gets the (encrypted) sign-in cookie.
const { REPO, COOKIE, seal, cookies, setCookie, gh, origin } = require('../_dev');
const go = (res, to) => { res.statusCode = 302; res.setHeader('Location', to); res.end(); };
module.exports = async (req, res) => {
  const u = new URL(req.url, origin(req)), code = u.searchParams.get('code'), state = u.searchParams.get('state');
  if (!code || !state || state !== cookies(req).ss_dev_state) return go(res, '/dev?error=1');
  try {
    const t = await (await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: origin(req) + '/api/dev/callback' }) })).json();
    if (!t.access_token) return go(res, '/dev?error=1');
    const [me, repo] = await Promise.all([gh('/user', t.access_token).then(r => r.json()), gh('/repos/' + REPO, t.access_token).then(r => r.json())]);
    if (!(repo.permissions && repo.permissions.admin)) return go(res, '/dev?denied=' + encodeURIComponent(me.login || ''));
    setCookie(res, COOKIE, seal({ t: t.access_token, l: me.login, a: me.avatar_url, e: Date.now() + 7 * 864e5 }), 7 * 86400);
    go(res, '/dev');
  } catch (e) { go(res, '/dev?error=1'); }
};
