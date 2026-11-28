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

  // Sign in with Google: Supabase Auth of this project (PKCE). Its own client keeps the short Google session apart from the game's.
  let ga = null;
  const gauth = () => ga || (ga = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, { auth: { flowType: 'pkce', persistSession: true, storageKey: 'ss-google', autoRefreshToken: false, detectSessionInUrl: false } }));
  const grpc = async (name, args) => { const { data, error } = await gauth().rpc(name, args || {}); if (error) throw new Error(error.message || 'offline'); return data; };

  let lobbyMeta = { room: null }, lobbySubscribed = false;
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
    // friends: search + requests (the other player has to accept)
    searchPlayers: (u, q) => rpc('search_players', { p_id: u.id, p_secret: u.secret, p_q: q }),
    sendFriendRequest: (u, to) => rpc('send_friend_request', { p_id: u.id, p_secret: u.secret, p_to: to }),
    friendRequests: u => rpc('list_friend_requests', { p_id: u.id, p_secret: u.secret }),
    respondFriendRequest: (u, from, accept) => rpc('respond_friend_request', { p_id: u.id, p_secret: u.secret, p_from: from, p_accept: accept }),
    cancelFriendRequest: (u, to) => rpc('cancel_friend_request', { p_id: u.id, p_secret: u.secret, p_to: to }),
    // parties (up to 10 players)
    myParties: u => rpc('my_parties', { p_id: u.id, p_secret: u.secret }),
    createParty: (u, name, desc, access, logo) => rpc('create_party', { p_id: u.id, p_secret: u.secret, p_name: name, p_desc: desc, p_public: access === 'public', p_logo: logo || 'l1', p_access: access }),
    updateParty: (u, id, name, desc, access, logo) => rpc('update_party', { p_id: u.id, p_secret: u.secret, p_party: id, p_name: name, p_desc: desc, p_public: access === 'public', p_logo: logo || null, p_access: access }),
    // notifications from the website (Web Push): the game asks the site, the site sends them
    pushLinkToken: (u, device) => rpc('push_link_token', { p_id: u.id, p_secret: u.secret, p_device: device || null }),
    pushStatus: (u, device, os) => rpc('push_status', { p_id: u.id, p_secret: u.secret, p_device: device || null, p_os: os || null }),
    pushSetPrefs: (u, friends, muted) => rpc('push_set_prefs', { p_id: u.id, p_secret: u.secret, p_friends: friends, p_muted: muted }),
    pushOff: u => rpc('push_unsubscribe_all', { p_id: u.id, p_secret: u.secret }),
    async pushSend(u, kind, o = {}) {
      const body = JSON.stringify(Object.assign({ id: u.id, secret: u.secret, kind }, o));
      const site = 'https://' + (window.SS_DOMAIN || 'spaceship-site.vercel.app') + '/api/push/send';
      for (const url of [site, C.SUPABASE_URL + '/functions/v1/push/send']) {
        try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); return await r.json(); } catch (e) { /* try the next way */ }
      }
      return null;
    },
    // the player's devices (names they can change; support sees them to help recover an account)
    deviceSeen: (u, d) => rpc('device_seen', { p_id: u.id, p_secret: u.secret, p_device: d.id, p_name: d.name, p_platform: d.platform, p_model: d.model, p_version: d.version }),
    myDevices: u => rpc('my_devices', { p_id: u.id, p_secret: u.secret }),
    deviceRename: (u, id, name) => rpc('device_rename', { p_id: u.id, p_secret: u.secret, p_device: id, p_name: name }),
    deviceRemove: (u, id) => rpc('device_remove', { p_id: u.id, p_secret: u.secret, p_device: id }),
    claimCallBonus: u => rpc('claim_call_bonus', { p_id: u.id, p_secret: u.secret }),
    inviteToParty: (u, target) => rpc('invite_to_party', { p_id: u.id, p_secret: u.secret, p_target: target }),
    partyInvites: u => rpc('my_party_invites', { p_id: u.id, p_secret: u.secret }),
    declinePartyInvite: (u, party) => rpc('decline_party_invite', { p_id: u.id, p_secret: u.secret, p_party: party }),
    setPartyLogo: (u, party, logo) => rpc('set_party_logo', { p_id: u.id, p_secret: u.secret, p_party: party, p_logo: logo }),
    setPartyBannedWords: (u, party, words) => rpc('set_party_banned_words', { p_id: u.id, p_secret: u.secret, p_party: party, p_words: words }),
    partyMessages: (u, party, after) => rpc('party_messages', { p_id: u.id, p_secret: u.secret, p_party: party, p_after: after || 0 }),
    activeEvents: () => rpc('active_events'),
    shopCatalog: () => rpc('shop_catalog'),
    checkSecretToken: (token) => rpc('check_secret_token', { p_token: token }),
    claimSecretToken: (u, token) => rpc('claim_secret_token', { p_id: u.id, p_secret: u.secret, p_token: token }),
    shopBuy: (u, kind, item) => rpc('shop_buy', { p_id: u.id, p_secret: u.secret, p_kind: kind, p_item: item }),
    customCreate: (u, name, spec) => rpc('custom_ship_create', { p_id: u.id, p_secret: u.secret, p_name: name, p_spec: spec }),
    customUpdate: (u, ship, name, spec) => rpc('custom_ship_update', { p_id: u.id, p_secret: u.secret, p_ship: ship, p_name: name, p_spec: spec }),
    customMine: u => rpc('custom_ships_mine', { p_id: u.id, p_secret: u.secret }),
    customGet: ids => rpc('custom_ships_get', { p_ids: ids }),
    wheelSpin: (u, paid) => rpc('wheel_spin', { p_id: u.id, p_secret: u.secret, p_paid: !!paid }),
    shipStar: (u, ship) => rpc('ship_star', { p_id: u.id, p_secret: u.secret, p_ship: ship }),
    stickerPack: u => rpc('sticker_pack', { p_id: u.id, p_secret: u.secret }),
    clubTreasury: (u, party) => rpc('club_treasury', { p_id: u.id, p_secret: u.secret, p_party: party }),
    clubDonate: (u, party, coins) => rpc('club_donate', { p_id: u.id, p_secret: u.secret, p_party: party, p_coins: coins }),
    shopConvert: (u, gems) => rpc('shop_convert', { p_id: u.id, p_secret: u.secret, p_gems: gems }),
    appInfo: () => rpc('app_info'),
    redeemCoupon: (u, code) => rpc('redeem_coupon', { p_id: u.id, p_secret: u.secret, p_code: code }),
    freeGifts: (u) => rpc('free_gifts', { p_id: u.id, p_secret: u.secret }),
    unlockWorldGift: (u, world) => rpc('unlock_world_gift', { p_id: u.id, p_secret: u.secret, p_world: world }),
    sendPartyMessage: (u, party, body) => rpc('send_party_message', { p_id: u.id, p_secret: u.secret, p_party: party, p_body: body }),
    searchParties: (u, q) => rpc('search_parties', { p_id: u.id, p_secret: u.secret, p_q: q || '' }),
    joinParty: (u, id, code) => rpc('join_party', { p_id: u.id, p_secret: u.secret, p_party: id || null, p_code: code || null }),
    leaveParty: (u, id) => rpc('leave_party', { p_id: u.id, p_secret: u.secret, p_party: id }),
    setPartyRole: (u, party, target, role) => rpc('set_party_role', { p_id: u.id, p_secret: u.secret, p_party: party, p_target: target, p_role: role }),
    kickPartyMember: (u, party, target) => rpc('kick_party_member', { p_id: u.id, p_secret: u.secret, p_party: party, p_target: target }),
    playerProfile: (u, target) => rpc('player_profile', { p_id: u.id, p_secret: u.secret, p_target: target }),
    // ---- sign in on another device ----
    loginToken: (handle, token) => rpc('login_token', { p_handle: handle, p_token: token }),
    regenToken: u => rpc('regen_token', { p_id: u.id, p_secret: u.secret }),
    emailSetStart: (u, email, lang) => fn('ss-email', { action: 'set_start', id: u.id, secret: u.secret, email, lang }),
    emailSetConfirm: (u, code) => rpc('email_set_confirm', { p_id: u.id, p_secret: u.secret, p_code: code }),
    emailRemove: u => rpc('email_remove', { p_id: u.id, p_secret: u.secret }),
    emailLoginStartByEmail: (email, lang) => fn('ss-email', { action: 'login_start_email', email, lang }),
    emailLoginConfirmByEmail: (email, code) => rpc('email_login_confirm_by_email', { p_email: email, p_code: code }),
    emailLoginStart: (handle, email, lang) => fn('ss-email', { action: 'login_start', handle, email, lang }),
    emailLoginConfirm: (handle, code) => rpc('email_login_confirm', { p_handle: handle, p_code: code }),
    leaderboard: () => rpc('leaderboard'),
    isOnline: id => online.has(id),
    // what a player shares in the lobby (e.g. the room they are in), and setting my own
    presenceOf: id => { if (!lobby) return null; const v = lobby.presenceState()[id]; return v ? v[v.length - 1] : null; },
    setLobbyMeta(m) { Object.assign(lobbyMeta, m); if (lobby && lobbySubscribed) lobby.track(lobbyMeta); },

    // ---- Sign in with Google ----
    // the Google sign-in page address (the app opens it and gets the user back on `redirect` with ?code=)
    async googleStart(redirect) {
      const { data, error } = await gauth().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      if (error || !data || !data.url) throw new Error(/provider is not enabled|unsupported provider/i.test(error && error.message || '') ? 'google_off' : 'oauth_failed');
      return data.url;
    },
    // back from Google: exchange the code for a session (kept only until the game has its own player session)
    async googleFinish(backUrl) {
      const q = new URL(backUrl).searchParams;
      if (q.get('error')) throw new Error(/access_denied/.test(q.get('error')) ? 'oauth_cancelled' : 'oauth_failed');
      const code = q.get('code'); if (!code) throw new Error('oauth_failed');
      const { error } = await gauth().auth.exchangeCodeForSession(code);
      if (error) throw new Error('oauth_failed');
    },
    googleLogin: () => grpc('google_login'),
    googleRegister: (h, n, a) => grpc('google_register', { p_handle: h, p_name: n, p_avatar: a }),
    googleLink: u => grpc('google_link', { p_id: u.id, p_secret: u.secret }),
    googleDone: () => gauth().auth.signOut({ scope: 'local' }).catch(() => {}),

    // Presence in a global lobby + a personal inbox channel for invites
    startPresence(user, { onInvite, onOnline, onFriendAdded, onFriendRequest, onFriendAccepted, onJoin, onNews, onJoinRequest, onJoinReply, onPartyMsg, onClubInvite, onPoke, onPlaying }) {
      if (!sb || lobby) return;
      lobby = sb.channel('ss-lobby', { config: { presence: { key: user.id } } });
      lobby.on('presence', { event: 'join' }, ({ key, newPresences }) => { if (key !== user.id && onJoin) onJoin(key, newPresences && newPresences[0]); });
      lobby.on('broadcast', { event: 'news' }, ({ payload }) => onNews && onNews(payload)); // announcements to every player
      lobby.on('presence', { event: 'sync' }, () => {
        online = new Set(Object.keys(lobby.presenceState()));
        onOnline && onOnline(online);
      });
      lobbyMeta.h = user.handle;
      lobby.subscribe(st => { if (st === 'SUBSCRIBED') { lobbySubscribed = true; lobby.track(lobbyMeta); } });
      inbox = sb.channel('ss-user-' + user.id, { config: { broadcast: { self: false } } });
      inbox.on('broadcast', { event: 'invite' }, ({ payload }) => onInvite && onInvite(payload));
      inbox.on('broadcast', { event: 'friend_added' }, ({ payload }) => onFriendAdded && onFriendAdded(payload));
      inbox.on('broadcast', { event: 'friend_request' }, ({ payload }) => onFriendRequest && onFriendRequest(payload));
      inbox.on('broadcast', { event: 'friend_accepted' }, ({ payload }) => onFriendAccepted && onFriendAccepted(payload));
      inbox.on('broadcast', { event: 'join_request' }, ({ payload }) => onJoinRequest && onJoinRequest(payload));
      inbox.on('broadcast', { event: 'join_reply' }, ({ payload }) => onJoinReply && onJoinReply(payload));
      inbox.on('broadcast', { event: 'party_msg' }, ({ payload }) => onPartyMsg && onPartyMsg(payload));
      inbox.on('broadcast', { event: 'club_invite' }, ({ payload }) => onClubInvite && onClubInvite(payload));
      inbox.on('broadcast', { event: 'poke' }, ({ payload }) => onPoke && onPoke(payload));
      // the same account started a game on another device
      inbox.on('broadcast', { event: 'playing' }, ({ payload }) => onPlaying && onPlaying(payload));
      inbox.subscribe();
    },
    stopPresence() { if (lobby) sb.removeChannel(lobby); if (inbox) sb.removeChannel(inbox); lobby = inbox = null; lobbySubscribed = false; },

    sendInvite(friendId, payload) { return Net.sendTo(friendId, 'invite', payload); },
    sendTo(friendId, event, payload) {
      return new Promise((resolve, reject) => {
        if (!sb) return reject(new Error('offline'));
        const ch = sb.channel('ss-user-' + friendId, { config: { broadcast: { self: false, ack: true } } });
        const to = setTimeout(() => { sb.removeChannel(ch); reject(new Error('timeout')); }, 8000);
        ch.subscribe(async st => {
          if (st !== 'SUBSCRIBED') return;
          await ch.send({ type: 'broadcast', event, payload });
          clearTimeout(to); setTimeout(() => sb.removeChannel(ch), 500); resolve();
        });
      });
    },

    // Co-op room for up to 10 players. role: 'host' | 'guest'. Every member shares its info (name, ship,
    // ready, the host's chosen level) through presence; game messages go over broadcast.
    room(code, role, me, handlers) {
      if (!sb) throw new Error('offline');
      const ch = sb.channel('ss-room-' + code, { config: { broadcast: { self: false }, presence: { key: me.id } } });
      const meta = Object.assign({ role }, me);
      let subscribed = false;
      const room = {
        code, role, members: [], closed: false,
        send(event, payload) { if (!room.closed) ch.send({ type: 'broadcast', event, payload }); },
        setMeta(m) { Object.assign(meta, m); if (subscribed) ch.track(meta); },
        leave() { if (room.closed) return; room.closed = true; try { ch.untrack(); } catch (e) {} sb.removeChannel(ch); },
      };
      for (const ev of ['start', 'in', 'st', 'fx', 'end', 'bye']) ch.on('broadcast', { event: ev }, ({ payload }) => handlers.onMessage && handlers.onMessage(ev, payload));
      ch.on('presence', { event: 'sync' }, () => {
        room.members = Object.values(ch.presenceState()).map(v => v[v.length - 1]);
        handlers.onSync && handlers.onSync(room.members);
      });
      ch.on('presence', { event: 'join' }, ({ key, newPresences }) => { if (key !== me.id && handlers.onJoin) handlers.onJoin((newPresences && newPresences[0]) || { id: key }); });
      ch.on('presence', { event: 'leave' }, ({ key }) => {
        if (key === me.id) return;
        // presence keeps the list in step, so read it after the leave has been applied
        setTimeout(() => { room.members = Object.values(ch.presenceState()).map(v => v[v.length - 1]); handlers.onLeave && handlers.onLeave(key); }, 0);
      });
      ch.subscribe(st => {
        if (st === 'SUBSCRIBED') { subscribed = true; ch.track(meta); handlers.onReady && handlers.onReady(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') handlers.onError && handlers.onError(st);
      });
      return room;
    },
  };
  window.Net = Net;
})();
