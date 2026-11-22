// Networking: Supabase RPC (accounts, friends) + Realtime (presence, invites, co-op rooms)
(function () {
  const C = window.SS_CONFIG;
  let sb = null;
  try { sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 40 } } }); }
  catch (e) { console.warn('supabase init failed', e); }

  async function rpc(name, args) {
    if (!sb) throw new Error('offline');
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw new Error(error.message || 'error');
    return data;
  }

  async function fn(name, body) {
    if (!sb) throw new Error('offline');
    const { data, error } = await sb.functions.invoke(name, { body });
    if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
    return data;
  }

  let lobby = null, inbox = null, online = new Set();

  const Net = {
    get available() { return !!sb; },
    handleAvailable: h => rpc('handle_available', { p_handle: h }),
    register: (h, n, a) => rpc('register', { p_handle: h, p_name: n, p_avatar: a }),
    login: (id, s) => rpc('login', { p_id: id, p_secret: s }),
    save: (u, data, best) => rpc('save_progress', { p_id: u.id, p_secret: u.secret, p_data: data, p_best: best | 0, p_name: u.name, p_avatar: u.avatar }),
    addFriend: (u, code) => rpc('add_friend', { p_id: u.id, p_secret: u.secret, p_code: code }),
    removeFriend: (u, fid) => rpc('remove_friend', { p_id: u.id, p_secret: u.secret, p_friend: fid }),
    friends: u => rpc('list_friends', { p_id: u.id, p_secret: u.secret }),
    // ---- sign in on another device ----
    loginToken: (handle, token) => rpc('login_token', { p_handle: handle, p_token: token }),
    regenToken: u => rpc('regen_token', { p_id: u.id, p_secret: u.secret }),
    emailSetStart: (u, email, lang) => fn('ss-email', { action: 'set_start', id: u.id, secret: u.secret, email, lang }),
    emailSetConfirm: (u, code) => rpc('email_set_confirm', { p_id: u.id, p_secret: u.secret, p_code: code }),
    emailRemove: u => rpc('email_remove', { p_id: u.id, p_secret: u.secret }),
    emailLoginStart: (handle, email, lang) => fn('ss-email', { action: 'login_start', handle, email, lang }),
    emailLoginConfirm: (handle, code) => rpc('email_login_confirm', { p_handle: handle, p_code: code }),
    leaderboard: () => rpc('leaderboard'),
    isOnline: id => online.has(id),

    // ---- Sign in with CutVid (OAuth 2.1 + PKCE against the CutVid Supabase project) ----
    // Returns the CutVid access token. `openAuth(url, redirect)` opens the CutVid sign-in page and
    // resolves with the URL CutVid redirected back to (or null for a full-page web redirect).
    async cutvidOAuth(openAuth, redirect) {
      if (!C.CUTVID_OAUTH_CLIENT_ID) throw new Error('oauth_not_configured');
      const b64 = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
      const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const state = b64(crypto.getRandomValues(new Uint8Array(16)));
      try { sessionStorage.setItem('ss_oauth', JSON.stringify({ verifier, state, redirect })); localStorage.setItem('ss_oauth', JSON.stringify({ verifier, state, redirect })); } catch (e) {}
      const url = C.CUTVID_URL + '/auth/v1/oauth/authorize?' + new URLSearchParams({
        response_type: 'code', client_id: C.CUTVID_OAUTH_CLIENT_ID, redirect_uri: redirect,
        code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'email profile',
      });
      const back = await openAuth(url);
      return back ? Net.cutvidOAuthFinish(back) : null;
    },
    // Finish: take the redirect URL (…?code=&state=), exchange the code for a CutVid access token.
    async cutvidOAuthFinish(backUrl) {
      const q = new URL(backUrl).searchParams;
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem('ss_oauth') || localStorage.getItem('ss_oauth') || 'null'); } catch (e) {}
      try { sessionStorage.removeItem('ss_oauth'); localStorage.removeItem('ss_oauth'); } catch (e) {}
      if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'oauth_denied' : 'oauth_failed');
      if (!saved || !q.get('code') || q.get('state') !== saved.state) throw new Error('oauth_failed');
      const r = await fetch(C.CUTVID_URL + '/auth/v1/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', apikey: C.CUTVID_KEY },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: saved.redirect, client_id: C.CUTVID_OAUTH_CLIENT_ID, code_verifier: saved.verifier }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw new Error('oauth_failed');
      return j.access_token;
    },
    cutvidCall: body => fn('cutvid-auth', body),

    // Presence in a global lobby + a personal inbox channel for invites
    startPresence(user, { onInvite, onOnline }) {
      if (!sb || lobby) return;
      lobby = sb.channel('ss-lobby', { config: { presence: { key: user.id } } });
      lobby.on('presence', { event: 'sync' }, () => {
        online = new Set(Object.keys(lobby.presenceState()));
        onOnline && onOnline(online);
      });
      lobby.subscribe(st => { if (st === 'SUBSCRIBED') lobby.track({ h: user.handle }); });
      inbox = sb.channel('ss-user-' + user.id, { config: { broadcast: { self: false } } });
      inbox.on('broadcast', { event: 'invite' }, ({ payload }) => onInvite && onInvite(payload));
      inbox.subscribe();
    },
    stopPresence() { if (lobby) sb.removeChannel(lobby); if (inbox) sb.removeChannel(inbox); lobby = inbox = null; },

    sendInvite(friendId, payload) {
      return new Promise((resolve, reject) => {
        if (!sb) return reject(new Error('offline'));
        const ch = sb.channel('ss-user-' + friendId, { config: { broadcast: { self: false, ack: true } } });
        const to = setTimeout(() => { sb.removeChannel(ch); reject(new Error('timeout')); }, 8000);
        ch.subscribe(async st => {
          if (st !== 'SUBSCRIBED') return;
          await ch.send({ type: 'broadcast', event: 'invite', payload });
          clearTimeout(to); setTimeout(() => sb.removeChannel(ch), 500); resolve();
        });
      });
    },

    // Co-op room. role: 'host' | 'guest'
    room(code, role, me, handlers) {
      if (!sb) throw new Error('offline');
      const ch = sb.channel('ss-room-' + code, { config: { broadcast: { self: false }, presence: { key: me.id } } });
      const room = {
        code, role, peer: null, closed: false,
        send(event, payload) { if (!room.closed) ch.send({ type: 'broadcast', event, payload }); },
        leave() { if (room.closed) return; room.closed = true; try { ch.untrack(); } catch (e) {} sb.removeChannel(ch); },
      };
      for (const ev of ['hello', 'start', 'in', 'st', 'fx', 'end', 'bye']) ch.on('broadcast', { event: ev }, ({ payload }) => handlers.onMessage && handlers.onMessage(ev, payload));
      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState();
        const others = Object.entries(state).filter(([k]) => k !== me.id).map(([, v]) => v[0]);
        const peer = others[0] || null;
        if (peer && !room.peer) { room.peer = peer; handlers.onPeer && handlers.onPeer(peer, others.length); }
        else if (!peer && room.peer) { room.peer = null; handlers.onPeerLeft && handlers.onPeerLeft(); }
        handlers.onSync && handlers.onSync(others);
      });
      ch.subscribe(st => {
        if (st === 'SUBSCRIBED') { ch.track({ role, id: me.id, handle: me.handle, name: me.name, avatar: me.avatar }); handlers.onReady && handlers.onReady(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') handlers.onError && handlers.onError(st);
      });
      return room;
    },
  };
  window.Net = Net;
})();
