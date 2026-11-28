// /api/dev/login: off to GitHub to sign in (scope public_repo: needed to see the repository's draft releases)
const crypto = require('crypto');
const { setCookie, origin, configured } = require('../_dev');
module.exports = (req, res) => {
  if (!configured()) { res.statusCode = 302; res.setHeader('Location', '/dev?setup=1'); return res.end(); }
  const state = crypto.randomBytes(16).toString('hex');
  setCookie(res, 'ss_dev_state', state, 600);
  const q = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: origin(req) + '/api/dev/callback', scope: 'public_repo', state, allow_signup: 'false' });
  res.statusCode = 302; res.setHeader('Location', 'https://github.com/login/oauth/authorize?' + q); res.end();
};
