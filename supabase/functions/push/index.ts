// "push": the SpaceShip website's notification sender (served at https://<site>/api/push/*).
//   GET  /push/key        the site's public VAPID key (the key pair is made here on first use and kept in push_vapid)
//   POST /push/subscribe  { token, subscription, lang, ua } - a browser that allowed notifications on /notify
//   POST /push/send       { id, secret, kind, target?, party?, skip? } - the game asks the site to notify players
//                          kind: poke | friend_request | party_msg | party_call | test
// Players' choices are respected: Friend notifications off (push_prefs.friends) and muted parties (push_prefs.muted).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { TEXTS } from './texts.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SITE = 'https://spaceship-site.vercel.app';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
// only real browser push services (the site never posts anywhere else)
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/, /^android\.googleapis\.com$/];

let keys: { public_key: string; private_key: string } | null = null;
async function vapid() {
  if (keys) return keys;
  let { data } = await sb.from('push_vapid').select('public_key, private_key').eq('id', 1).maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await sb.from('push_vapid').upsert({ id: 1, public_key: k.publicKey, private_key: k.privateKey }, { onConflict: 'id', ignoreDuplicates: true });
    ({ data } = await sb.from('push_vapid').select('public_key, private_key').eq('id', 1).single());
  }
  keys = data!;
  return keys;
}
const tx = (lang: string, key: string, vars: Record<string, string> = {}) => {
  let s = (TEXTS[lang] && TEXTS[lang][key]) || TEXTS.en[key] || key;
  for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
  return s;
};

async function recent(sender: string, kind: string, target: string, seconds: number) {
  const { data } = await sb.from('push_log').select('id').eq('sender', sender).eq('kind', kind).eq('target', target)
    .gte('at', new Date(Date.now() - seconds * 1000).toISOString()).limit(1);
  return !!(data && data.length);
}

async function deliver(profileIds: string[], make: (lang: string) => { title: string; body: string; url: string; tag: string }) {
  if (!profileIds.length) return { sent: 0, failed: 0 };
  const k = await vapid();
  const { data: subs } = await sb.from('push_subscriptions').select('endpoint, p256dh, auth, lang, profile_id').in('profile_id', profileIds);
  let sent = 0, failed = 0;
  await Promise.all((subs || []).map(async s => {
    const msg = make(s.lang || 'en');
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg),
        { vapidDetails: { subject: SITE, publicKey: k.public_key, privateKey: k.private_key }, TTL: 6 * 3600, urgency: 'high' });
      sent++; sb.from('push_subscriptions').update({ last_ok: new Date().toISOString() }).eq('endpoint', s.endpoint).then(() => {});
    } catch (e) {
      failed++;
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_subscriptions').delete().eq('endpoint', s.endpoint);   // the browser unsubscribed
      else console.warn('push failed', code, String(e).slice(0, 200));
    }
  }));
  return { sent, failed };
}

async function prefsOf(ids: string[]) {
  const { data } = await sb.from('push_prefs').select('profile_id, friends, muted').in('profile_id', ids);
  return new Map((data || []).map(p => [p.profile_id, p]));
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  try {
    if (path.endsWith('/key')) return json({ key: (await vapid()).public_key });

    if (path.endsWith('/subscribe') && req.method === 'POST') {
      const { token, subscription, lang, ua } = await req.json();
      const ep = String(subscription?.endpoint || ''), p256dh = subscription?.keys?.p256dh, auth = subscription?.keys?.auth;
      let host = ''; try { const u = new URL(ep); if (u.protocol === 'https:') host = u.hostname; } catch (_) { /* bad url */ }
      if (!host || !PUSH_HOSTS.some(r => r.test(host)) || !p256dh || !auth) return json({ error: 'bad_subscription' }, 400);
      const { data: tok } = await sb.from('push_link_tokens').select('profile_id, expires_at').eq('token', String(token || '')).maybeSingle();
      if (!tok || new Date(tok.expires_at) < new Date()) return json({ error: 'link_expired' }, 403);
      await sb.from('push_subscriptions').upsert({ endpoint: ep, profile_id: tok.profile_id, p256dh, auth, lang: String(lang || 'en').slice(0, 5), ua: String(ua || '').slice(0, 200) }, { onConflict: 'endpoint' });
      const r = await deliver([tok.profile_id], l => ({ title: tx(l, 'test_title'), body: tx(l, 'test_body'), url: SITE + '/open', tag: 'ss-test' }));
      return json({ ok: true, ...r });
    }

    if (path.endsWith('/send') && req.method === 'POST') {
      const b = await req.json();
      const id = String(b.id || ''), kind = String(b.kind || '');
      const { error: authErr } = await sb.rpc('ss_auth', { p_id: id, p_secret: String(b.secret || '') });
      if (authErr) return json({ error: 'unauthorized' }, 401);
      const { data: me } = await sb.from('profiles').select('handle, name').eq('id', id).single();
      const h = '@' + (me?.handle || '');
      const skip = new Set<string>(Array.isArray(b.skip) ? b.skip.map(String) : []);
      const log = (target: string) => sb.from('push_log').insert({ sender: id, kind, target });

      if (kind === 'test') return json(await deliver([id], l => ({ title: tx(l, 'test_title'), body: tx(l, 'test_body'), url: SITE + '/open', tag: 'ss-test' })));

      if (kind === 'poke' || kind === 'friend_request') {
        const target = String(b.target || '');
        if (!target || target === id || skip.has(target)) return json({ sent: 0 });
        if (kind === 'poke') {
          const { data: fr } = await sb.from('friends').select('a').eq('a', id).eq('b', target).limit(1);
          if (!fr || !fr.length) return json({ error: 'not_friends' }, 403);
        }
        if (await recent(id, kind, target, kind === 'poke' ? 55 : 3600)) return json({ error: 'too_soon' }, 429);
        const pr = (await prefsOf([target])).get(target);
        if (pr && pr.friends === false) return json({ sent: 0, off: true });
        await log(target);
        return json(await deliver([target], l => kind === 'poke'
          ? { title: tx(l, 'poke_title'), body: tx(l, 'poke_body', { h }), url: SITE + '/open?go=friends', tag: 'ss-poke-' + id }
          : { title: 'SpaceShip', body: tx(l, 'n_friend_request', { h }), url: SITE + '/open?go=friends', tag: 'ss-fr-' + id }));
      }

      if (kind === 'party_msg' || kind === 'party_call') {
        const party = String(b.party || '');
        const { data: mem } = await sb.from('party_members').select('profile_id').eq('party_id', party);
        const ids = (mem || []).map(m => m.profile_id);
        if (!ids.includes(id)) return json({ error: 'not_allowed' }, 403);
        if (await recent(id, kind, party, kind === 'party_call' ? 110 : 15)) return json({ sent: 0, throttled: true });
        const { data: p } = await sb.from('parties').select('name').eq('id', party).single();
        const prefs = await prefsOf(ids);
        const to = ids.filter(x => x !== id && !skip.has(x) && !((prefs.get(x)?.muted || []) as string[]).includes(party));
        await log(party);
        return json(await deliver(to, l => kind === 'party_call'
          ? { title: p?.name || 'SpaceShip', body: tx(l, 'n_party_call', { h }) + ' 🎁', url: SITE + '/open?go=parties', tag: 'ss-call-' + party }
          : { title: p?.name || 'SpaceShip', body: tx(l, 'n_party_msg', { h }), url: SITE + '/open?go=chat&party=' + party, tag: 'ss-chat-' + party }));
      }
      return json({ error: 'bad_kind' }, 400);
    }
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('push', e);
    return json({ error: 'server_error' }, 500);
  }
});
