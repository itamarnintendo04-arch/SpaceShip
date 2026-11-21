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

  let cv = null;
  const cutvid = () => cv || (cv = window.supabase.createClient(C.CUTVID_URL, C.CUTVID_KEY, { auth: { persistSession: false, detectSessionInUrl: true, flowType: 'implicit' } }));

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
    leaderboard: () => rpc('leaderboard'),
    isOnline: id => online.has(id),

    // ---- CutVid account ----
    async cutvidSignIn(email, password) {
      const { data, error } = await cutvid().auth.signInWithPassword({ email, password });
      if (error) throw new Error('cutvid_auth');
      return data.session.access_token;
    },
    cutvidGoogle() { return cutvid().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }); },
    async cutvidSessionFromUrl() {
      if (!/access_token=/.test(location.hash)) return null;
      const { data } = await cutvid().auth.getSession();
      history.replaceState(null, '', location.pathname);
      return data.session ? data.session.access_token : null;
    },
    async cutvidCall(body) {
      if (!sb) throw new Error('offline');
      const { data, error } = await sb.functions.invoke('cutvid-auth', { body });
      if (error) { let m = error.message; try { const j = await error.context.json(); m = j.error || m; } catch (e) {} throw new Error(m); }
      return data;
    },

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
