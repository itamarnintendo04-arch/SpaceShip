// "support-mail": emails the game's owner about a new support request from the website (/support).
// Called by the support_tickets insert trigger with { id }. It only ever mails about a request that exists
// and was not mailed yet, to the address in app_config.support_email, through the same Gmail as the email codes.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async req => {
  try {
    const { id } = await req.json();
    const { data: t } = await db.from('support_view').select('*').eq('id', id).maybeSingle();
    const { data: raw } = await db.from('support_tickets').select('mailed_at').eq('id', id).maybeSingle();
    if (!t || !raw || raw.mailed_at) return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    const { data: cfg } = await db.from('app_config').select('support_email').eq('id', 1).single();
    const to = cfg?.support_email; if (!to) return new Response(JSON.stringify({ skipped: 'no_support_email' }), { status: 200 });
    const user = (Deno.env.get('GMAIL_USER') || '').trim(), pass = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
    if (!user || !pass) throw new Error('smtp_not_configured');
    const host = (Deno.env.get('SMTP_HOST') || 'smtp.gmail.com').trim(), port = Number(Deno.env.get('SMTP_PORT') || 465);
    const tr = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10000 });
    const row = (k: string, v: unknown) => v ? `<tr><td style="padding:6px 10px;color:#a5b4fc;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 10px;color:#eef2ff">${esc(v)}</td></tr>` : '';
    const html = `<div style="font-family:Segoe UI,Arial,sans-serif;background:#05021a;padding:20px"><div style="max-width:560px;margin:auto;background:#0b0825;border:1px solid #2e2870;border-radius:16px;overflow:hidden">
      <div style="padding:16px 20px;background:linear-gradient(135deg,#0891b2,#4c1d95,#be185d);color:#fff;font-size:20px;font-weight:800">🛟 SpaceShip support #${t.id}</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${row('Topic', t.topic)}${row('Player', t.handle ? '@' + t.handle + (t.player ? ' (' + t.player + ')' : '') : '')}${row('Email', t.email)}${row('Device', t.device_name)}${row('Account devices', t.account_devices)}${row('Sent', new Date(t.created_at).toUTCString())}</table>
      <div style="margin:10px 20px 20px;padding:14px;border-radius:12px;background:#140f35;color:#eef2ff;white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(t.message)}</div>
      <div style="padding:0 20px 18px;color:#8b8fc7;font-size:12px">Supabase → Table Editor → support_view / support_tickets</div></div></div>`;
    await tr.sendMail({ from: `SpaceShip support <${user}>`, to, replyTo: t.email || undefined, subject: `SpaceShip support #${t.id}: ${t.topic}${t.handle ? ' · @' + t.handle : ''}`, html,
      text: `Support #${t.id} (${t.topic})\nPlayer: ${t.handle ? '@' + t.handle : '-'}\nEmail: ${t.email || '-'}\nDevice: ${t.device_name || '-'}\nAccount devices: ${t.account_devices || '-'}\n\n${t.message}` });
    await db.from('support_tickets').update({ mailed_at: new Date().toISOString() }).eq('id', id);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error('support-mail', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e).slice(0, 200) }), { status: 500 });
  }
});
