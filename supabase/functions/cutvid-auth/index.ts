// Sign in to SpaceShip with a CutVid account.
// The client signs in to CutVid (Supabase Auth on the CutVid project) and sends its access token here.
// We verify the token against CutVid, then log in / register / link the SpaceShip profile.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CUTVID_URL = 'https://btrwboxwbinqewgvlcal.supabase.co';
const CUTVID_KEY = 'sb_publishable_g2aYTfsQhep44Ta1VIIJfQ_GQnA5ODh';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { action, token, handle, name, avatar, id, secret } = await req.json();
    if (!token) return json({ error: 'cutvid_unauthorized' }, 401);
    const r = await fetch(CUTVID_URL + '/auth/v1/user', { headers: { apikey: CUTVID_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return json({ error: 'cutvid_unauthorized' }, 401);
    const u = await r.json();
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let res;
    if (action === 'login') res = await db.rpc('cutvid_login', { p_cutvid: u.id });
    else if (action === 'register') res = await db.rpc('cutvid_register', { p_cutvid: u.id, p_handle: handle, p_name: name, p_avatar: avatar });
    else if (action === 'link') res = await db.rpc('cutvid_link', { p_cutvid: u.id, p_id: id, p_secret: secret });
    else return json({ error: 'bad_action' }, 400);
    if (res.error) return json({ error: res.error.message }, 400);
    // The game email becomes the CutVid email (only when CutVid has verified it).
    let gameEmail: string | null = null;
    if (res.data && u.email && (u.email_confirmed_at || u.confirmed_at)) {
      const r2 = await db.rpc('cutvid_set_email', { p_cutvid: u.id, p_email: u.email });
      if (!r2.error) gameEmail = r2.data;
    }
    return json({ profile: res.data, email: u.email, game_email: gameEmail });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
