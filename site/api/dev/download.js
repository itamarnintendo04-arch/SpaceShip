// /api/dev/download?id=…: a file of a draft release (GitHub gives a short-lived link; the admin's browser is sent there)
const { REPO, admin, gh } = require('../_dev');
module.exports = async (req, res) => {
  const s = await admin(req);
  if (!s) { res.statusCode = 302; res.setHeader('Location', '/dev'); return res.end(); }
  const id = String(new URL(req.url, 'http://x').searchParams.get('id') || '');
  if (!/^\d+$/.test(id)) { res.statusCode = 400; return res.end('bad id'); }
  const r = await gh(`/repos/${REPO}/releases/assets/${id}`, s.t, { headers: { Accept: 'application/octet-stream' }, redirect: 'manual' });
  const to = r.headers.get('location');
  if (!to) { res.statusCode = 404; return res.end('not found'); }
  res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.end();
};
