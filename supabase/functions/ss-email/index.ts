// Sends SpaceShip email codes through Google (Gmail) SMTP.
// Secrets (Edge Functions -> Secrets): GMAIL_USER (the Gmail address), GMAIL_APP_PASSWORD (a Google "App password").
//   set_start   {id, secret, email}  -> code to confirm a new email on the account
//   login_start {handle, email}      -> code to sign in with @handle + email
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
  en: { dir: 'ltr', valid: 'The code is valid for 10 minutes. If you did not ask for it, you can ignore this email.',
    setSub: 'SpaceShip — verify your email', setIntro: 'Code to verify the email on your SpaceShip account:',
    loginSub: 'SpaceShip — sign-in code', loginIntro: (n: string) => `Hi ${n}! Your SpaceShip sign-in code:` },
  he: { dir: 'rtl', valid: 'הקוד תקף ל-10 דקות. אם לא ביקשת אותו — אפשר להתעלם מהמייל.',
    setSub: 'SpaceShip — אימות אימייל', setIntro: 'קוד לאימות האימייל בחשבון ה-SpaceShip שלך:',
    loginSub: 'SpaceShip — קוד כניסה', loginIntro: (n: string) => `שלום ${n}! קוד הכניסה שלך ל-SpaceShip:` },
};

function mail(to: string, L: typeof TXT.en, title: string, intro: string, code: string) {
  const user = Deno.env.get('GMAIL_USER'), pass = Deno.env.get('GMAIL_APP_PASSWORD');
  if (!user || !pass) throw new Error('smtp_not_configured');
  // Port 465 (implicit TLS): Supabase Edge Functions block outbound 25 and 587.
  const t = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass } });
  const html = `<div dir="${L.dir}" style="font-family:Arial,sans-serif;background:#05021a;color:#eef2ff;padding:28px;border-radius:16px;max-width:460px;margin:auto;text-align:center">
    <h1 style="margin:0 0 6px;font-size:26px;color:#a78bfa">SpaceShip</h1>
    <p style="color:#c7d2fe">${esc(intro)}</p>
    <div style="font-size:38px;letter-spacing:10px;font-weight:bold;background:#140f3a;border-radius:12px;padding:14px;margin:18px 0;color:#22d3ee;direction:ltr">${code}</div>
    <p style="color:#a5b4fc;font-size:13px">${esc(L.valid)}</p></div>`;
  return t.sendMail({ from: `SpaceShip <${user}>`, to, subject: title, html, text: `${intro}\n\n${code}\n\n${L.valid}` });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const b = await req.json();
    const L = b.lang === 'he' ? TXT.he : TXT.en;
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (b.action === 'set_start') {
      const { data, error } = await db.rpc('email_set_start', { p_id: b.id, p_secret: b.secret, p_email: b.email });
      if (error) return json({ error: error.message }, 400);
      await mail(String(b.email).trim(), L, L.setSub, L.setIntro, data);
      return json({ ok: true });
    }
    if (b.action === 'login_start') {
      const { data, error } = await db.rpc('email_login_start', { p_handle: b.handle, p_email: b.email });
      if (error) return json({ error: error.message }, 400);
      // Same answer whether or not @handle and email match, so nobody can probe which emails are used.
      if (data) await mail(data.email, L, L.loginSub, L.loginIntro(data.name), data.code);
      return json({ ok: true });
    }
    return json({ error: 'bad_action' }, 400);
  } catch (e) {
    const m = String((e as Error).message || e);
    return json({ error: m.includes('smtp_not_configured') ? 'smtp_not_configured' : 'send_failed' }, 500);
  }
});
