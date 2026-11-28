// /api/dev/files: the SpaceShip Dev builds (draft releases dev-N) for the signed-in admin
const { REPO, admin, gh, configured } = require('../_dev');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  if (!configured()) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'not_configured' })); }
  const s = await admin(req);
  if (!s) { res.statusCode = 401; return res.end(JSON.stringify({ error: 'sign_in' })); }
  const r = await gh(`/repos/${REPO}/releases?per_page=50`, s.t);
  const list = r.ok ? await r.json() : [];
  const builds = list.filter(d => /^dev-\d+$/.test(d.tag_name || '')).map(d => ({
    tag: d.tag_name, name: d.name, at: d.created_at,
    files: (d.assets || []).map(a => ({ id: a.id, name: a.name, size: a.size })),
  })).sort((a, b) => +b.tag.slice(4) - +a.tag.slice(4));
  res.end(JSON.stringify({ user: { login: s.l, avatar: s.a }, builds }));
};
