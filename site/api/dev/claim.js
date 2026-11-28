// /api/dev/claim: registers the website's /dev key with the database, once (see supabase/dev_coupons.sql).
// Safe to open by anyone: it can only register the key the website itself holds, and only while the database allows it.
const { configured, devKey } = require('../_dev');
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
  if (!configured()) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'not_configured' })); }
  const r = await fetch('https://unpzeskbzovolyqsqzna.supabase.co/rest/v1/rpc/dev_key_claim', { method: 'POST',
    headers: { apikey: 'sb_publishable_iuaATuSyhRd65ZjNdx3Opg_w1KxQdQc', Authorization: 'Bearer sb_publishable_iuaATuSyhRd65ZjNdx3Opg_w1KxQdQc', 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: devKey() }) });
  const d = await r.json().catch(() => null);
  res.statusCode = r.ok ? 200 : 400;
  res.end(JSON.stringify(r.ok ? { ok: true } : { error: (d && d.message) || 'failed' }));
};
