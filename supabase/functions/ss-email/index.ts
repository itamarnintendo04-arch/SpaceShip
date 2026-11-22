// Sends SpaceShip email codes through Google (Gmail) SMTP.
// Secrets (Edge Functions -> Secrets): GMAIL_USER (the sending address), GMAIL_APP_PASSWORD (a Google "App password").
// Optional for a non-Gmail mailbox: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465).
//   smtp_check {}                    -> checks the mail settings without sending anything
//   set_start   {id, secret, email}  -> code to confirm a new email on the account
//   login_start {handle, email}      -> code to sign in with @handle + email
//   login_start_email {email}        -> code to sign in with just the email ({found:false} if no player has it)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6.9.16';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Email texts: Hebrew for Hebrew players, English for everyone else.
const TXT = {
  en: { dir: 'ltr', align: 'left', valid: 'The code is valid for 10 minutes.', ignore: 'If you did not ask for this code, you can safely ignore this email.',
    never: 'Never share this code with anyone — SpaceShip will never ask you for it.', yourCode: 'Your code', tag: 'Fly. Shoot. Win.',
    footer: 'You got this email because someone entered this address in SpaceShip.',
    setSub: 'SpaceShip — verify your email', setHead: 'Verify your email', setIntro: 'Enter this code in SpaceShip to add this email to your account:',
    loginSub: 'SpaceShip — sign-in code', loginHead: 'Sign in to SpaceShip', loginIntro: (n: string) => `Hi ${n}! Enter this code in SpaceShip to sign in:` },
  he: { dir: 'rtl', align: 'right', valid: 'הקוד תקף ל-10 דקות.', ignore: 'אם לא ביקשת את הקוד — אפשר פשוט להתעלם מהמייל.',
    never: 'לעולם אל תשתפו את הקוד עם אף אחד — SpaceShip אף פעם לא תבקש אותו.', yourCode: 'הקוד שלך', tag: 'טסים. יורים. מנצחים.',
    footer: 'קיבלת את המייל כי מישהו הזין את הכתובת הזו ב-SpaceShip.',
    setSub: 'SpaceShip — אימות אימייל', setHead: 'אימות האימייל', setIntro: 'הזינו את הקוד הזה ב-SpaceShip כדי להוסיף את האימייל לחשבון:',
    loginSub: 'SpaceShip — קוד כניסה', loginHead: 'כניסה ל-SpaceShip', loginIntro: (n: string) => `שלום ${n}! הזינו את הקוד הזה ב-SpaceShip כדי להיכנס:` },
};

// A designed email that works in Gmail, Outlook and phone mail apps: tables, inline styles, no images or scripts.
function template(L: typeof TXT.en, head: string, intro: string, code: string) {
  const digits = String(code).split('').map((d) =>
    `<td style="padding:0 4px"><div style="width:44px;height:58px;line-height:58px;border-radius:12px;background:#0f0b2e;border:2px solid #3b2f8f;font-family:'Courier New',monospace;font-size:32px;font-weight:bold;color:#67e8f9;text-align:center;text-shadow:0 0 12px rgba(34,211,238,.6)">${esc(d)}</div></td>`).join('');
  return `<!doctype html><html dir="${L.dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(head)}</title></head>
<body style="margin:0;padding:0;background:#030014">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(L.yourCode)}: ${esc(code)} · ${esc(L.valid)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#030014;background-image:radial-gradient(circle at 20% 10%,#1e1b4b 0,transparent 45%),radial-gradient(circle at 85% 80%,#3b0764 0,transparent 40%)">
<tr><td align="center" style="padding:32px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;border-radius:24px;overflow:hidden;background:#0b0825;border:1px solid #2e2870;font-family:'Segoe UI',Arial,Helvetica,sans-serif">
    <tr><td align="center" style="padding:30px 24px 22px;background:#1e1b4b;background-image:linear-gradient(135deg,#0891b2 0%,#4c1d95 55%,#be185d 100%)">
      <div style="font-size:44px;line-height:1">🚀</div>
      <div style="margin-top:8px;font-size:30px;font-weight:900;letter-spacing:1px;color:#ffffff">SpaceShip</div>
      <div style="margin-top:4px;font-size:13px;font-weight:bold;letter-spacing:2px;color:#e0f2fe;opacity:.9">${esc(L.tag)}</div>
      <div style="margin-top:10px;font-size:12px;letter-spacing:6px;color:#fde68a">✦ · ✧ · ✦ · ✧ · ✦</div>
    </td></tr>
    <tr><td dir="${L.dir}" style="padding:28px 28px 8px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#f5f3ff">${esc(head)}</div>
      <div style="margin-top:10px;font-size:15px;line-height:1.6;color:#c7d2fe">${esc(intro)}</div>
    </td></tr>
    <tr><td align="center" style="padding:18px 16px 6px">
      <div style="font-size:11px;font-weight:bold;letter-spacing:3px;color:#a78bfa;text-transform:uppercase;margin-bottom:10px">${esc(L.yourCode)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" dir="ltr"><tr>${digits}</tr></table>
      <div style="margin-top:14px;display:inline-block;padding:6px 14px;border-radius:999px;background:#1f1a4d;color:#fde047;font-size:13px;font-weight:bold">⏱ ${esc(L.valid)}</div>
    </td></tr>
    <tr><td dir="${L.dir}" style="padding:22px 28px 6px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#140f35;border-radius:14px;border:1px solid #2e2870">
        <tr><td dir="${L.dir}" style="padding:12px 14px;font-size:13px;line-height:1.6;color:#fda4af;text-align:${L.align}">🔒 ${esc(L.never)}</td></tr>
      </table>
    </td></tr>
    <tr><td dir="${L.dir}" style="padding:14px 28px 26px;font-size:12px;line-height:1.6;color:#8b8fc7;text-align:center">${esc(L.ignore)}<br>${esc(L.footer)}</td></tr>
    <tr><td align="center" style="padding:14px;background:#07051a;border-top:1px solid #1f1a4d;font-size:11px;color:#6366a8;letter-spacing:1px">☄️ ❄️ 🌋 🌀 &nbsp; SpaceShip &copy; ${new Date().getFullYear()}</td></tr>
  </table>
</td></tr></table></body></html>`;
}

function transport() {
  const user = (Deno.env.get('GMAIL_USER') || '').trim(), pass = (Deno.env.get('GMAIL_APP_PASSWORD') || '').replace(/\s+/g, '');
  if (!user || !pass) throw new Error('smtp_not_configured');
  const host = (Deno.env.get('SMTP_HOST') || 'smtp.gmail.com').trim(), port = Number(Deno.env.get('SMTP_PORT') || 465);
  // Port 465 (implicit TLS): Supabase Edge Functions block outbound 25 and 587.
  return { user, t: nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass }, connectionTimeout: 10000 }) };
}
// Turns a mail error into a short reason the game can show.
function reason(e: unknown) {
  const err = e as { message?: string; code?: string; responseCode?: number };
  const m = String(err?.message || e);
  if (m.includes('smtp_not_configured')) return 'smtp_not_configured';
  if (err?.code === 'EAUTH' || err?.responseCode === 535 || /auth|credentials|password/i.test(m)) return 'smtp_auth';
  if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection|timeout/i.test(m)) return 'smtp_connect';
  return 'send_failed';
}

function mail(to: string, L: typeof TXT.en, title: string, head: string, intro: string, code: string) {
  const { user, t } = transport();
  return t.sendMail({ from: `SpaceShip <${user}>`, to, subject: `${title}: ${code}`, html: template(L, head, intro, code),
    text: `${head}\n\n${intro}\n\n${code}\n\n${L.valid}\n${L.never}\n\n${L.ignore}` });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    if (b.action === 'smtp_check') {
      try { const { user, t } = transport(); await t.verify(); return json({ ok: true, from: user.replace(/^(.).*(@.*)$/, '$1***$2') }); }
      catch (e) {
        console.error('smtp_check', e);
        // names only (never values) of the secrets this function can see, to spot a misnamed secret
        const names = Object.keys(Deno.env.toObject()).filter((k) => !/^(SUPABASE_|SB_|DENO_|PATH$|HOME$|HOSTNAME$|LANG$|TZ$|PWD$|SHLVL$|_$)/.test(k));
        return json({ ok: false, error: reason(e), detail: String((e as Error).message || e).slice(0, 200), secret_names: names });
      }
    }
    const L = b.lang === 'he' ? TXT.he : TXT.en;
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (b.action === 'set_start') {
      const { data, error } = await db.rpc('email_set_start', { p_id: b.id, p_secret: b.secret, p_email: b.email });
      if (error) return json({ error: error.message }, 400);
      await mail(String(b.email).trim(), L, L.setSub, L.setHead, L.setIntro, data);
      return json({ ok: true });
    }
    if (b.action === 'login_start') {
      const { data, error } = await db.rpc('email_login_start', { p_handle: b.handle, p_email: b.email });
      if (error) return json({ error: error.message }, 400);
      // Same answer whether or not @handle and email match, so nobody can probe which emails are used.
      if (data) await mail(data.email, L, L.loginSub, L.loginHead, L.loginIntro(data.name), data.code);
      return json({ ok: true });
    }
    if (b.action === 'login_start_email') {
      // sign in with just the email; found:false lets the game offer CutVid or a new player instead
      const { data, error } = await db.rpc('email_login_start_by_email', { p_email: b.email });
      if (error) return json({ error: error.message }, 400);
      if (!data) return json({ ok: true, found: false });
      await mail(data.email, L, L.loginSub, L.loginHead, L.loginIntro(data.name), data.code);
      return json({ ok: true, found: true });
    }
    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    console.error('ss-email failed', e);
    return json({ error: reason(e) }, 500);
  }
});
