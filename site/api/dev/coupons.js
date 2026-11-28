// /api/dev/coupons: the coupon maker for the signed-in admin.
//   GET           -> every coupon (with its players) and the players to choose from
//   POST {..}     -> create a coupon: code, coins, gems, ships[], design, design_name, note, max_uses, access, players[]
//   PATCH {..}    -> change only who can use it: code, access, players[]
const { admin, configured, rpc, readBody } = require('../_dev');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  const send = (st, o) => { res.statusCode = st; res.end(JSON.stringify(o)); };
  if (!configured()) return send(503, { error: 'not_configured' });
  // writes must come from the /dev page itself (a form on another site cannot set this header)
  if (req.method !== 'GET' && req.headers['x-ss-dev'] !== '1') return send(403, { error: 'bad_request' });
  if (!(await admin(req))) return send(401, { error: 'sign_in' });
  try {
    if (req.method === 'GET') return send(200, await rpc('dev_coupons'));
    const b = await readBody(req);
    if (req.method === 'POST') return send(200, await rpc('dev_coupon_create', { p: b }));
    if (req.method === 'PATCH') return send(200, await rpc('dev_coupon_update', { p_code: String(b.code || ''), p_access: String(b.access || ''),
      p_players: Array.isArray(b.players) ? b.players.map(String).slice(0, 500) : [] }));
    return send(405, { error: 'method' });
  } catch (e) { return send(e.status === 400 || /_|:/.test(e.message) ? 400 : 500, { error: String(e.message).slice(0, 120) }); }
};
