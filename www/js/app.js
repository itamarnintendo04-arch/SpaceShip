// SpaceShip app: screens, profile, shop, friends, co-op lobby
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const { Game, Sfx, levelCfg, WORLDS, GALAXIES } = window.SSGame;
  let CUSTOM_PRICE = { coins: 1000, gems: 100, max: 20 };   // Workshop: building a ship (shop_settings on the server)
  let EXTRAS = { wheel_gems: 5, star_coins: [2000, 5000, 10000], star_gems: [10, 25, 50], pack_gems: 15, revive_coins: [50, 100, 200], revive_gems: [2, 4, 8],
    arena_fee: 300, arena_coins: 1500, arena_gems: 5, club_levels: [5000, 20000, 60000, 150000, 400000] };   // wheel, stars, stickers, revive, arena, club (server prices)
  let GEM_RATE = 10; // 1 diamond = 10 coins (the server's shop_settings can change it)
  // special items - bought with diamonds
  const GEM_ITEMS = [
    { id: 'plasma', icon: 'plasma', gems: 30 },
    { id: 'shield2', icon: 'shield', gems: 20 },
    { id: 'supermag', icon: 'magnet', gems: 15 },
    { id: 'goldheart', icon: 'heart', gems: 35, dkey: 'up_life_d' },
    { id: 'revive', icon: 'revive', gems: 45 },
    { id: 'drone', icon: 'drone', gems: 55 },
  ];
  const LEVELS = SS_CONFIG.LEVEL_COUNT;
  const Cap = window.Capacitor && window.Capacitor.Plugins || {};
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const PLATFORM = window.SS_PLATFORM || (NATIVE ? 'mobile' : 'web');
  const DESKTOP = PLATFORM === 'desktop' || (!NATIVE && matchMedia('(pointer: fine)').matches && innerWidth >= 900);

  const UPGRADES = [
    { id: 'weapon', icon: 'gun', base: 1, costs: [250, 600, 1200, 2500] },
    { id: 'shield', icon: 'shield', base: 0, costs: [150, 300, 600, 1000, 1600] },
    { id: 'magnet', icon: 'magnet', base: 0, costs: [200, 500, 1000] },
    { id: 'life', icon: 'heart', base: 0, costs: [800, 2000] },
    { id: 'rate', icon: 'bolt', base: 0, costs: [400, 900, 1800, 3500] },
    { id: 'power', icon: 'timer', base: 0, costs: [300, 800, 1600] },
    { id: 'luck', icon: 'clover', base: 0, costs: [500, 1200, 2500, 5000] },
    { id: 'sides', icon: 'wings', base: 0, costs: [2000, 4000, 8000, 12000], gems: [10, 20, 35, 50] },   // each level: one more pair of side shots   // side shots (ships don't have them without it)
  ];

  // ---------- state ----------
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const defData = () => ({ coins: 100, ships: ['falcon'], avatars: [], skin: 'falcon', up: { weapon: 1, shield: 0, magnet: 0, life: 0 }, levels: {}, best: 0, ts: 0, gems: 0, worlds: [], slevels: {}, items: [] });
  let user = store.get('ss_user', null);
  let settings = store.get('ss_settings', { orientation: DESKTOP ? 'landscape' : 'portrait', sound: true });
  let loadingGame = null, gameTrack = 'game';
  let friends = [], game = null, room = null, current = null, history = [];
  if (user) user.data = Object.assign(defData(), user.data || {});

  const save = () => {
    user.data.ts = Date.now(); store.set('ss_user', user); if (!user.offline) store.set('ss_user_' + user.id, user);
    if (!user.offline) { clearTimeout(save.t); save.t = setTimeout(() => Net.save(user, user.data, user.data.best).catch(e => console.warn('save', e)), 800); }
  };
  const saveSettings = () => store.set('ss_settings', settings);
  // language: English by default, the player can switch any time
  if (!settings.lang) settings.lang = 'en';
  I18N.set(settings.lang);
  const langLabel = () => Art.icon('globe') + (I18N.LANGS.find(l => l.id === I18N.lang) || I18N.LANGS[0]).name;
  function pickLanguage() {
    modal(`<h2>${Art.icon('globe')} ${t('language')}</h2><div class="lang-grid">${I18N.LANGS.map(l =>
      `<button class="btn ${l.id === I18N.lang ? 'primary' : ''}" data-lang="${l.id}" dir="${l.dir}">${l.name}</button>`).join('')}</div>
      <button class="btn ghost" id="lang-x">${t('close')}</button>`, m => {
      m.querySelector('#lang-x').onclick = closeModal;
      m.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
        settings.lang = b.dataset.lang; saveSettings(); I18N.set(settings.lang); I18N.apply(); closeModal();
        $('#r-lang').innerHTML = langLabel();
        const r = renders[current]; r && r();
      });
    });
  }
  // Login keys saved on this device (one per account) - tap one on the login screen to sign in again.
  const savedAccounts = () => store.get('ss_accounts', []).filter(a => a && a.id && a.secret);
  function rememberAccount(u) {
    if (!u || u.offline) return;
    const list = savedAccounts().filter(a => a.id !== u.id);
    list.unshift({ id: u.id, secret: u.secret, handle: u.handle, name: u.name, avatar: u.avatar });
    store.set('ss_accounts', list.slice(0, 6));
  }
  if (user && !user.offline) rememberAccount(user);
  Sfx.on = settings.sound;
  // music: on by default at 60%, change in Settings (1-100%)
  if (settings.music === undefined) settings.music = true;
  if (!settings.musicVol) settings.musicVol = 60;
  Music.setEnabled(settings.music); Music.setVolume(settings.musicVol);
  // browsers start audio only after a tap / key press
  const unlockAudio = () => Music.unlock();
  addEventListener('pointerdown', unlockAudio, true); addEventListener('keydown', unlockAudio, true);

  // ---------- helpers ----------
  const at = h => '\u2066@' + h + '\u2069';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = root => (root || document).querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = Art.icon(e.dataset.ic); });
  function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  function modal(html, onBind) { $('#modal-card').innerHTML = html; icons($('#modal-card')); $('#modal').classList.remove('hidden'); onBind && onBind($('#modal-card')); }
  function closeModal() { $('#modal').classList.add('hidden'); }
  // weapon line for the shop: fire rate, damage, side shots
  const gunHtml = s => { const g = s.gun || {}, sides = (user && user.data && user.data.up.sides) || 0;
    return `<div class="gun">⚡${Math.round((g.rate || 1) * 100)}% · 💥×${g.dmg || 1}${sides ? ' · ↔+' + sides * 2 : ''}${g.pierce ? ' · ➶' : ''}</div>`; };
  // big amounts in short form (1.2M, 1B, in the player's language) so the wallet always fits; the full number shows on hover
  const fmtN = n => { n = Number(n) || 0; if (Math.abs(n) < 1e6) return n.toLocaleString();
    try { return new Intl.NumberFormat(I18N.lang, { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch (e) { return (n / 1e6).toFixed(1) + 'M'; } };
  const coinHtml = n => `${Art.icon('coin')}<span title="${Number(n).toLocaleString()}">${fmtN(n)}</span>`;
  const gemHtml = n => `${Art.icon('gem')}<span title="${Number(n).toLocaleString()}">${fmtN(n)}</span>`;
  const walletHtml = D => `<span class="wal">${coinHtml(D.coins)}</span><span class="wal gemc">${gemHtml(D.gems || 0)}</span>`;
  const errText = e => {
    const m = (e && e.message) || '';
    if (m.includes('handle_taken')) return t('e_handle_taken');
    if (m.includes('bad_handle')) return t('e_bad_handle');
    if (m.includes('code_not_found')) return t('e_code_not_found');
    if (m.includes('party_full')) return t('e_party_full');
    if (m.includes('party_not_found')) return t('e_party_not_found');
    if (m.includes('not_enough_coins')) return t('not_enough_coins');
    if (m.includes('not_enough_gems')) return t('not_enough_gems');
    if (m.includes('already_owned')) return t('owned');
    if (m.includes('maxed')) return t('maxed');
    if (m.includes('not_for_sale')) return t('e_not_for_sale');
    if (m.includes('custom_limit')) return t('ws_limit');
    if (m.includes('wheel_used')) return t('wheel_tomorrow');
    if (m.includes('all_owned')) return t('rare_all');
    if (m.includes('bad_amount')) return t('e_bad_amount');
    if (m.includes('coupon_not_found')) return t('e_coupon_not_found');
    if (m.includes('coupon_used_up')) return t('e_coupon_used_up');
    if (m.includes('coupon_used')) return t('e_coupon_used');
    if (m.includes('coupon_expired')) return t('e_coupon_expired');
    if (m.includes('not_allowed')) return t('e_not_allowed');
    if (m.includes('too_many_parties') || m.includes('already_in_party')) return t('e_already_in_party');
    if (m.includes('party_invite_only')) return t('e_party_invite_only');
    if (m.includes('target_in_party')) return t('e_target_in_party');
    if (m.includes('self')) return t('e_self');
    if (m.includes('bad_login')) return t('e_bad_login');
    if (m.includes('bad_code') || m.includes('code_expired')) return t('e_bad_code');
    if (m.includes('bad_email')) return t('e_bad_email');
    if (m.includes('email_taken')) return t('e_email_taken');
    if (m.includes('email_set')) return t('e_email_set');
    if (m.includes('too_soon')) return t('e_too_soon');
    if (m.includes('smtp_not_configured')) return t('e_smtp');
    if (m.includes('smtp_auth') || m.includes('smtp_connect')) return t('e_send_failed');
    if (m.includes('send_failed')) return t('e_send_failed');
    if (m.includes('e_bad_password')) return t('e_bad_password');
    if (m.includes('e_pw_short')) return t('e_pw_short');
    if (m.includes('e_not_confirmed')) return t('e_not_confirmed');
    if (m.includes('oauth_not_configured')) return t('e_oauth_off');
    if (m.includes('oauth_denied')) return t('e_oauth_denied');
    if (m.includes('oauth_failed')) return t('e_oauth_failed');
    if (m.includes('google_used')) return t('e_google_used');
    if (m.includes('google_off')) return t('e_google_off');
    if (m.includes('already_linked')) return t('e_already_linked');
    if (m.includes('unauthorized')) return t('e_unauthorized');
    return t('e_offline');
  };
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast(t('copied')), () => toast(text)); }
  function share(text) { if (Cap.Share) return Cap.Share.share({ text }); if (navigator.share) return navigator.share({ text }).catch(() => {}); copy(text); }

  // ---------- navigation ----------
  function show(name, push = true) {
    if (current && push && current !== name) history.push(current);
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
    current = name;
    $('#bgfx').style.display = name === 'game' || name === 'loading' ? 'none' : '';
    if (name !== 'loading' && loadingGame) { loadingGame.destroy(); loadingGame = null; }
    Music.play(name === 'loading' ? 'loading' : name === 'game' ? gameTrack : 'menu');
    const r = renders[name]; r && r();
  }
  function back() {
    if (current === 'coop' && room) return leaveRoom();
    const prev = history.pop() || 'menu'; show(prev, false);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-go],[data-back],[data-act]'); if (!b) return;
    Sfx.init();
    if (b.dataset.go) show(b.dataset.go);
    else if (b.hasAttribute('data-back')) back();
    else if (b.dataset.act === 'endless') startGame({ mode: 'endless' });
  });

  // ---------- app design: the colours of the whole interface ----------
  const THEMES = {
    galaxy: { bg: ['#2a0f5c', '#0b0630', '#03010f'], g: ['#06b6d4', '#8b5cf6', '#ec4899'], base: '#05021a' },
    ocean: { bg: ['#0c2f66', '#06163a', '#010714'], g: ['#22d3ee', '#3b82f6', '#6366f1'], base: '#020a1c' },
    emerald: { bg: ['#0b4d36', '#04261b', '#010c08'], g: ['#a3e635', '#10b981', '#0d9488'], base: '#01140e' },
    sunset: { bg: ['#5c1f0c', '#2a0c06', '#0d0302'], g: ['#facc15', '#f97316', '#e11d48'], base: '#1a0805' },
    crimson: { bg: ['#5c0a24', '#2a0410', '#0d0105'], g: ['#fb7185', '#e11d48', '#9333ea'], base: '#16020a' },
    midnight: { bg: ['#1e293b', '#0b1120', '#020409'], g: ['#22d3ee', '#0ea5e9', '#475569'], base: '#05070c' },
  };
  const theme = () => THEMES[settings.theme] || THEMES.galaxy;
  function applyTheme() {
    const id = THEMES[settings.theme] ? settings.theme : 'galaxy';
    if (id === 'galaxy') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = id;
    const mt = document.querySelector('meta[name="theme-color"]'); if (mt) mt.content = theme().base;
  }
  applyTheme();
  // ---------- background stars on menus ----------
  (function bg() {
    const c = $('#bgfx'), x = c.getContext('2d'); let st = [];
    const rs = () => { c.width = innerWidth; c.height = innerHeight; st = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, z: Math.random() })); };
    rs(); addEventListener('resize', rs);
    const g = () => {
      if (c.style.display !== 'none') {
        const gr = x.createRadialGradient(c.width * 0.7, c.height * 0.2, 0, c.width * 0.7, c.height * 0.2, c.width);
        const tb = theme().bg; gr.addColorStop(0, tb[0]); gr.addColorStop(0.5, tb[1]); gr.addColorStop(1, tb[2]);
        x.fillStyle = gr; x.fillRect(0, 0, c.width, c.height);
        for (const s of st) { s.y += (0.2 + s.z * 1.2); if (s.y > c.height) { s.y = 0; s.x = Math.random() * c.width; } x.globalAlpha = 0.3 + s.z * 0.7; x.fillStyle = '#fff'; x.fillRect(s.x, s.y, 1 + s.z * 1.5, 1 + s.z * 1.5); }
        x.globalAlpha = 1;
        if (current === 'menu') drawMenuShip();
      }
      requestAnimationFrame(g);
    };
    g();
  })();
  function drawMenuShip() {
    const c = $('#m-ship'), x = c.getContext('2d');
    // room all around the ship: big stickers, gallery pictures and auras must not be cut at the canvas edge
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.translate(c.width / 2, c.height * 0.47);
    Art.drawShip(x, user ? user.data.skin : 'falcon', 52, performance.now() / 1000, 0.8);
  }

  // ---------- register ----------
  let regAvatar = 'rocket', checkT = null, handleOk = false, gPending = null; // gPending = { email }: signed in with Google, now picking a name
  function renderRegister() {
    const free = Art.AVATARS.filter(a => a.price === 0);
    $('#r-avatars').innerHTML = free.map(a => `<button data-av="${a.id}" class="${a.id === regAvatar ? 'on' : ''}">${Art.avatar(a.id)}</button>`).join('');
    if (user && user.offline && !$('#r-handle').value) { $('#r-name').value = user.name; $('#r-handle').value = user.handle; checkHandle(); }
    $('#r-cvbanner').classList.toggle('hidden', !gPending);
    if (gPending) $('#r-cvbanner').innerHTML = `${Art.icon('google')} ${t('g_connected')} <b dir="ltr">${esc(gPending.email)}</b><br>${t('cv_pick')}`;
    $('#r-google').classList.toggle('hidden', !!gPending || !GOOGLE_ON); $('#r-or').classList.toggle('hidden', !GOOGLE_ON && $('#r-offline').classList.contains('hidden'));
  }
  $('#r-avatars').addEventListener('click', e => { const b = e.target.closest('[data-av]'); if (!b) return; regAvatar = b.dataset.av; renderRegister(); });
  $('#r-handle').addEventListener('input', e => {
    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); if (v !== e.target.value) e.target.value = v;
    clearTimeout(checkT); checkT = setTimeout(checkHandle, 350);
  });
  async function checkHandle() {
    const h = $('#r-handle').value, st = $('#r-status'); handleOk = false;
    if (h.length < 3) { st.className = 'status'; st.textContent = h ? t('min3') : ''; return; }
    st.className = 'status'; st.textContent = t('checking');
    try {
      const ok = await Net.handleAvailable(h);
      if ($('#r-handle').value !== h) return;
      handleOk = ok; st.className = 'status ' + (ok ? 'ok' : 'err'); st.textContent = ok ? '✓ ' + t('h_free', { h: at(h) }) : '✗ ' + t('h_taken', { h: at(h) });
    } catch (e) { st.className = 'status err'; st.textContent = t('e_offline'); $('#r-offline').classList.remove('hidden'); }
  }
  $('#r-go').addEventListener('click', async () => {
    Sfx.init();
    const name = $('#r-name').value.trim(), h = $('#r-handle').value.trim(), st = $('#r-status');
    if (!name) { st.className = 'status err'; st.textContent = t('write_name'); return; }
    if (!/^[a-z0-9_.]{3,20}$/.test(h)) { st.className = 'status err'; st.textContent = errText({ message: 'bad_handle' }); return; }
    $('#r-go').disabled = true;
    try {
      const r = gPending ? await Net.googleRegister(h, name, regAvatar) : await Net.register(h, name, regAvatar);
      const gameEmail = gPending ? r.email || null : null;
      const data = user && user.offline ? user.data : defData();
      user = { id: r.id, secret: r.secret, handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code, data, google: gPending ? r.google || gPending.email : undefined, email: gameEmail, has_token: !!r.token && !gameEmail };
      if (gPending) Net.googleDone();
      gPending = null;
      save(); rememberAccount(user); afterLogin(); show('menu'); history = []; toast(t('welcome', { h: at(r.handle) }));
      if (!gameEmail) askEmail();
    } catch (e) {
      st.className = 'status err'; st.textContent = errText(e);
      if (!/taken|bad_/.test(e.message)) $('#r-offline').classList.remove('hidden');
    } finally { $('#r-go').disabled = false; }
  });
  // ---------- Sign in with Google ----------
  // still in testing: only the development version (SpaceShip Dev) shows Google; the public version shows no sign-in button here
  var GOOGLE_ON = !!window.SS_DEV;   // var: the sign-up screen may draw before this line runs
  // Opens a sign-in page and resolves with the URL it redirects back to.
  function openOAuth(url) {
    if (window.SSDesktop && window.SSDesktop.oauth) return window.SSDesktop.oauth(url, SS_CONFIG.OAUTH_APP_REDIRECT); // desktop: own window
    if (NATIVE && Cap.Browser && Cap.App) return new Promise((resolve, reject) => {          // phones: system browser + deep link
      let done = false;
      const h = Cap.App.addListener('appUrlOpen', ev => {
        if (!ev.url || !ev.url.startsWith(SS_CONFIG.OAUTH_APP_REDIRECT)) return;
        done = true; Promise.resolve(h).then(x => x && x.remove()); try { Cap.Browser.close(); } catch (e) {} resolve(ev.url);
      });
      Cap.Browser.addListener('browserFinished', () => setTimeout(() => { if (!done) { Promise.resolve(h).then(x => x && x.remove()); reject(new Error('oauth_cancelled')); } }, 800));
      Cap.Browser.open({ url, presentationStyle: 'popover' });
    });
    location.assign(url); return new Promise(() => {}); // web: full-page redirect, finished on return
  }
  const webRedirect = () => location.origin + location.pathname;
  // intent: 'login' (sign in / create a player) or 'link' (attach Google to the signed-in player)
  async function signInWithGoogle(intent) {
    Sfx.init();
    const redirect = window.SSDesktop || NATIVE ? SS_CONFIG.OAUTH_APP_REDIRECT : webRedirect();
    store.set('ss_g_intent', intent);
    toast(t('opening_google'));
    try {
      const back = await openOAuth(await Net.googleStart(redirect));
      if (back) { await Net.googleFinish(back); await googleAfter(intent); }
    } catch (e) { if (!String(e.message).includes('oauth_cancelled')) toast(errText(e), 3500); }
  }
  async function googleAfter(intent) {
    store.set('ss_g_intent', null);
    if (intent === 'link' && user && !user.offline) {
      const res = await Net.googleLink(user); Net.googleDone();
      user.google = res.google; store.set('ss_user', user); closeModal(); toast(t('g_linked'), 3000); return;
    }
    const res = await Net.googleLogin();
    closeModal();
    if (res && res.new) { gPending = { email: res.email }; show('register', false); $('#r-tabs [data-rt="new"]').click(); return; }
    Net.googleDone();
    finishLogin(res, { google: res.google });
  }
  $('#r-google').addEventListener('click', () => signInWithGoogle('login'));

  // ---------- existing account: saved login key, @ + token, or @ + email code ----------
  function finishLogin(r, extra) {
    user = Object.assign({ id: r.id, secret: r.secret, handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code,
      email: r.email || null, has_token: !!r.has_token, data: Object.assign(defData(), r.data || {}) }, extra || {});
    store.set('ss_user', user); rememberAccount(user); Net.stopPresence(); afterLogin();
    closeModal(); history = []; show('menu'); toast(t('welcome_sync', { h: at(r.handle) }));
  }
  $('#r-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-rt]'); if (!b) return;
    $$('#r-tabs .tab').forEach(t => t.classList.toggle('on', t === b));
    $('#r-new').classList.toggle('hidden', b.dataset.rt !== 'new'); $('#r-login').classList.toggle('hidden', b.dataset.rt !== 'login');
    if (b.dataset.rt === 'login') renderSaved();
  });
  function renderSaved() {
    const list = savedAccounts();
    $('#l-saved').innerHTML = list.length ? `<div class="lbl">${t('saved_keys')}</div><div class="saved-acc">${list.map(a =>
      `<button class="person" data-acc="${esc(a.id)}"><div class="avatar">${Art.avatar(a.avatar)}</div><div class="info"><b>${esc(a.name)}</b><small>@${esc(a.handle)}</small></div><span class="chip">${t('login')}</span></button>`).join('')}</div><div class="or"><span>${t('or')}</span></div>` : '';
  }
  $('#l-saved').addEventListener('click', async e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const a = savedAccounts().find(x => x.id === b.dataset.acc); const st = $('#l-status');
    st.className = 'status'; st.textContent = t('connecting');
    try { const r = await Net.login(a.id, a.secret); finishLogin(Object.assign(r, { secret: a.secret })); }
    catch (er) {
      st.className = 'status err'; st.textContent = errText(er);
      if (String(er.message).includes('unauthorized')) { store.set('ss_accounts', savedAccounts().filter(x => x.id !== a.id)); renderSaved(); }
    }
  });
  $('#l-go').addEventListener('click', () => { Sfx.init(); emailFlow('login'); });
  $('#l-key').addEventListener('click', () => { Sfx.init(); keyLogin(); });

  // Email with 6-digit codes (sent from SpaceShip's own email address).
  //   intent 'add'   — verify an email for the signed-in player
  //   intent 'login' — sign in on this device with an email that belongs to a player
  // If our email can't be sent, the player is asked to try again later (or to sign in with Google).
  function emailFlow(intent) {
    let email = '';
    const finish = r => { if (!r || r.error) throw new Error('bad_code'); finishLogin(r); };
    let failReason = '';
    // our email could not be sent: offer trying later or Google
    const sendFallback = async e => { failReason = String((e && e.message) || ''); step('later'); };
    const sendFailed = e => /send_failed|smtp_|offline|Failed to fetch|FunctionsFetchError/i.test(String(e && e.message));
    const step = (state, msg) => {
      const codeLen = 6;
      const codeInput = `<input id="ef-code" class="code-in" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="${codeLen}" dir="ltr" autocomplete="one-time-code" placeholder="${'0'.repeat(6)}">`;
      const body = {
        email: `<label>${t('email_label')}<input id="ef-email" type="email" dir="ltr" autocomplete="email" placeholder="you@gmail.com" value="${esc(email)}"></label>
          <button class="btn primary" id="ef-go">${t('next')}</button>`,
        code: `<p class="small">${t('email_6_sent', { e: `<b dir="ltr">${esc(email)}</b>` })}</p>${codeInput}
          <p class="muted small spam-hint">📬 ${t('check_spam')}</p>
          <button class="btn primary" id="ef-go">${intent === 'add' ? t('verify') : t('login')}</button>`,
        later: `<div style="font-size:40px">⏳</div><p>${/smtp_not_configured/.test(failReason) ? t('e_smtp') : t('cv_try_later')}</p>
          <button class="btn primary" id="ef-go">${t('try_again')}</button>
          ${GOOGLE_ON ? `<button class="btn google" id="ef-cv">${Art.icon('google')}${t('google_btn')}</button>` : ''}`,
        noplayer: `<p>${t('no_player_email')}</p><button class="btn primary" id="ef-go">${t('tab_new')}</button>
          ${GOOGLE_ON ? `<button class="btn google" id="ef-cv">${Art.icon('google')}${t('google_btn')}</button>` : ''}`,
      }[state];
      modal(`<div style="font-size:40px">✉️</div><h2>${intent === 'add' ? t('add_email') : t('login_email_title')}</h2>
        ${state === 'email' && intent === 'add' ? `<p class="muted small">${t('ask_email_body')}</p>` : ''}
        ${body}<div class="status ${msg && msg.ok ? 'ok' : 'err'}" id="ef-st">${msg ? esc(msg.text) : ''}</div>
        <button class="btn ghost" id="ef-x">${t('cancel')}</button>`, m => {
        m.querySelector('#ef-x').onclick = closeModal;
        const cvb = m.querySelector('#ef-cv'); if (cvb) cvb.onclick = () => { closeModal(); signInWithGoogle(intent === 'add' ? 'link' : 'login'); };
        const st = m.querySelector('#ef-st'), go = m.querySelector('#ef-go');
        const input = m.querySelector('input'); if (input) { input.focus(); input.onkeydown = e => { if (e.key === 'Enter') go.click(); }; }
        // code box: digits only (pasted spaces or dashes are dropped); our 6-digit code submits by itself
        const ci = m.querySelector('#ef-code');
        if (ci) ci.oninput = () => { const v = ci.value.replace(/\D/g, '').slice(0, codeLen); if (v !== ci.value) ci.value = v; if (state === 'code' && v.length === 6 && !go.disabled) go.click(); };
        go.onclick = async () => {
          go.disabled = true; st.className = 'status'; st.textContent = t('wait');
          try {
            if (state === 'email') {
              email = m.querySelector('#ef-email').value.trim().toLowerCase();
              if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('bad_email');
              if (intent === 'add') {
                try { await Net.emailSetStart(user, email, I18N.lang); step('code'); }
                catch (e) { if (sendFailed(e)) await sendFallback(e); else throw e; }
              } else {
                let r;
                try { r = await Net.emailLoginStartByEmail(email, I18N.lang); }
                catch (e) { if (sendFailed(e)) return sendFallback(e); throw e; }
                if (r && r.found) step('code'); else step('noplayer'); // not a SpaceShip email: new player, or CutVid
              }
            } else if (state === 'code') {
              const code = m.querySelector('#ef-code').value.replace(/\D/g, '');
              if (intent === 'add') {
                const em = await Net.emailSetConfirm(user, code);
                if (!em) throw new Error('bad_code');
                user.email = em; user.has_token = false; store.set('ss_user', user); closeModal(); toast(t('email_verified'), 3000);
                if (current === 'menu') renderMenu();
              } else finish(await Net.emailLoginConfirmByEmail(email, code));
            } else if (state === 'later') step('email');
            else if (state === 'noplayer') { closeModal(); $('#r-tabs [data-rt="new"]').click(); }
          } catch (e) { go.disabled = false; st.className = 'status err'; st.textContent = errText(e); }
        };
      });
    };
    step('email');
  }

  // Right after sign-up: offer to add an email (verified with a 6-digit code). No token any more.
  function askEmail() {
    if (!user || user.offline || user.email) return;
    modal(`<div style="font-size:44px">✉️</div><h2>${t('ask_email_title')}</h2><p class="muted">${t('ask_email_body')}</p>
      <button class="btn primary big" id="ae-yes">${t('add_email')}</button>
      <button class="btn ghost" id="ae-no">${t('not_now')}</button><p class="muted small">${t('no_email_note')}</p>`, m => {
      m.querySelector('#ae-yes').onclick = () => emailFlow('add');
      m.querySelector('#ae-no').onclick = closeModal;
    });
  }

  // The login token is shown in full only here. It signs in on other devices together with the @handle.
  // The login token is shown in full only here. It stays saved on this device until the player confirms they
  // copied it, so leaving the app (to paste it somewhere) and coming back shows the same window again.
  function showToken(token, first) {
    store.set('ss_pending_token', { token, first: !!first, id: user.id, handle: user.handle });
    let copied = false;
    modal(`<h2>${first ? t('token_first') : t('token_new')}</h2>
      <p class="muted small">${t('token_help', { h: `<b dir="ltr">@${esc(user.handle)}</b>` })}</p>
      <div class="token-box" id="t-val">${esc(token)}</div>
      <button class="btn gold big" id="t-copy">${Art.icon('copy')}${t('copy')}</button>
      <div class="row center"><button class="chip" id="t-share">${Art.icon('send')}${t('share')}</button><button class="chip" id="t-file">${t('save_file')}</button></div>
      <div class="warn">${t('token_warn')}${first ? '<br>' + t('token_warn_email') : ''}</div>
      <p class="muted small">${t('token_wait')}</p>
      <button class="btn primary" id="t-done" disabled>${t('continue')}</button>
      <div class="status" id="t-st"></div>`, m => {
      const text = `SpaceShip\n@${user.handle}\n${token}`;
      const ok = () => { copied = true; m.querySelector('#t-done').disabled = false; m.querySelector('#t-st').textContent = ''; };
      m.querySelector('#t-copy').onclick = () => { copy(token); ok(); };
      m.querySelector('#t-share').onclick = () => { share(text); ok(); };
      m.querySelector('#t-file').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' })); a.download = `SpaceShip-${user.handle}-token.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); ok(); };
      m.querySelector('#t-done').onclick = () => {
        if (!copied) { m.querySelector('#t-st').className = 'status err'; m.querySelector('#t-st').textContent = t('copy_first'); return; }
        store.set('ss_pending_token', null); closeModal(); setTimeout(askNotifications, 600);
      };
    });
  }
  const tokenShowing = () => !!document.querySelector('#modal:not(.hidden) #t-val');
  function resumePendingToken() {
    const p = store.get('ss_pending_token', null);
    if (p && user && user.id === p.id && !tokenShowing()) showToken(p.token, p.first);
  }

  $('#r-offline').addEventListener('click', () => {
    const name = $('#r-name').value.trim() || t('pilot'), h = $('#r-handle').value.trim() || 'pilot';
    user = user || { id: 'local-' + Math.random().toString(36).slice(2), handle: h, name, avatar: regAvatar, offline: true, data: defData() };
    Object.assign(user, { name, handle: h, avatar: regAvatar, offline: true }); save(); show('menu'); history = [];
  });

  // ---------- menu ----------
  function renderMenu() {
    $('#m-me').innerHTML = `<div class="avatar">${Art.avatar(user.avatar)}</div><div><b>${esc(user.name)}</b><small>@${esc(user.handle)}</small></div>`;
    $('#m-coins').innerHTML = walletHtml(user.data);
    updateWheelDot();
    loadGifts(); loadEvents();
    checkWorldShips();
    $('#t-orient').innerHTML = settings.orientation === 'landscape' ? Art.icon('rotateL') + t('mode_land') : Art.icon('rotate') + t('mode_port');
    $('#t-lang').innerHTML = langLabel();
    $('#t-notif').innerHTML = (settings.notify ? '🔔 ' + t('updates_on') : '🔕 ' + t('updates_off'));
    $('#t-notif').classList.toggle('hidden', !!user.offline);
    $('#t-sound').innerHTML = settings.sound ? Art.icon('sound') + t('sound') : Art.icon('mute') + t('muted');
    $('#m-offline').classList.toggle('hidden', !user.offline);
    $('#m-local2').classList.toggle('hidden', !DESKTOP); $('#m-desk').classList.toggle('hidden', !DESKTOP);
    updateOnlineBadge();
  }
  $('#m-me').addEventListener('click', () => editProfile());
  $('#m-local2').addEventListener('click', () => {
    const L = user.data.levels; let o = `<option value="endless">${t('endless')}</option>`;
    for (let n = 1; n <= LEVELS; n++) if (n === 1 || L[n - 1] > 0) o += `<option value="${n}">${t('level_n', { n })}${levelCfg(n).boss ? ' ' + t('boss_tag') : ''}</option>`;
    modal(`<h2>${t('two_players')}</h2>
      <div class="vs"><div class="slot"><div class="avatar">${Art.avatar(user.avatar)}</div><b>${esc(user.name)}</b><small>${t('wasd_pad1')}</small></div><div class="plus">+</div>
      <div class="slot"><div class="avatar">${Art.avatar('alien')}</div><b>${t('player2')}</b><small>${t('arrows_pad2')}</small></div></div>
      <select id="l2-lv">${o}</select><button class="btn primary big" id="l2-go">${t('start')}</button><button class="btn ghost" id="l2-x">${t('cancel')}</button>`, m => {
      m.querySelector('#l2-x').onclick = closeModal;
      m.querySelector('#l2-go').onclick = () => { const v = m.querySelector('#l2-lv').value; startGame(v === 'endless' ? { mode: 'endless', local2: true } : { mode: 'level', level: +v, local2: true }); };
    });
  });
  $('#t-orient').addEventListener('click', () => { settings.orientation = settings.orientation === 'landscape' ? 'portrait' : 'landscape'; saveSettings(); renderMenu(); toast(settings.orientation === 'landscape' ? t('toast_land') : t('toast_port')); });
  $('#t-sound').addEventListener('click', () => { settings.sound = Sfx.on = !settings.sound; saveSettings(); renderMenu(); });
  $('#t-lang').addEventListener('click', pickLanguage);
  $('#t-settings').addEventListener('click', () => { if (user) openSettings(); });
  $('#t-notif').addEventListener('click', () => setNotify(!settings.notify));
  $('#r-lang').addEventListener('click', pickLanguage);
  $('#m-reg').addEventListener('click', e => { e.preventDefault(); show('register'); });
  // ---------- several accounts on one device ----------
  function flushSave() {
    if (!user || user.offline) return;
    clearTimeout(save.t); store.set('ss_user_' + user.id, user);
    Net.save(user, user.data, user.data.best).catch(() => {});
  }
  async function switchAccount(id) {
    const a = savedAccounts().find(x => x.id === id); if (!a || (user && user.id === id)) return;
    flushSave(); Net.stopPresence(); if (room) leaveRoom(); friends = [];
    user = store.get('ss_user_' + id, null) || { id: a.id, secret: a.secret, handle: a.handle, name: a.name, avatar: a.avatar, data: defData() };
    user.secret = a.secret; user.data = Object.assign(defData(), user.data || {});
    store.set('ss_user', user); closeModal(); history = []; show('menu'); toast(t('welcome', { h: at(user.handle) }));
    try {
      const r = await Net.login(user.id, user.secret);
      Object.assign(user, { handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code, email: r.email || null, has_token: !!r.has_token });
      if (r.data && (r.data.ts || 0) > (user.data.ts || 0)) user.data = Object.assign(defData(), r.data);
      store.set('ss_user', user); store.set('ss_user_' + user.id, user); if (current === 'menu') renderMenu();
    } catch (e) { toast(errText(e)); }
    afterLogin();
  }
  function addAccount() {
    flushSave(); Net.stopPresence(); if (room) leaveRoom(); friends = [];
    user = null; store.set('ss_user', null); gPending = null; closeModal(); history = [];
    show('register', false); $('#r-tabs [data-rt="new"]').click();
  }

  // ---------- settings ----------
  // ---------- the app's own icon (home screen / taskbar / browser tab) ----------
  const APP_ICONS = ['classic', 'emerald', 'ocean', 'sunset', 'aqua', 'rose'];
  const nativeIconName = id => 'AppIcon' + id[0].toUpperCase() + id.slice(1);
  async function setAppIcon(id, quiet) {
    if (!APP_ICONS.includes(id)) id = 'classic';
    const prev = settings.appIcon || 'classic';
    settings.appIcon = id; saveSettings();
    const url = 'img/appicons/' + id + '.png';
    try {
      if (NATIVE && Cap.AppIcon) {   // phones: the home-screen icon (iPhone shows a short system notice)
        if (quiet) return;
        const others = APP_ICONS.filter(x => x !== 'classic' && x !== id).map(nativeIconName);
        if (id === 'classic') await Cap.AppIcon.reset({ suppressNotification: false, disable: APP_ICONS.filter(x => x !== 'classic').map(nativeIconName) });
        else await Cap.AppIcon.change({ name: nativeIconName(id), suppressNotification: false, disable: others });
      } else if (window.SSDesktop && window.SSDesktop.setIcon) {   // desktop: the window / taskbar / dock icon
        const r = await fetch(url), blob = await r.blob();
        const dataUrl = await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(blob); });
        window.SSDesktop.setIcon(dataUrl);
      } else {   // browser: the tab icon
        document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach(l => { l.href = url; });
      }
      if (!quiet) { Sfx.init(); Sfx.power(); toast(t('app_icon_set', { x: t('ai_' + id) })); }
    } catch (e) { console.warn('app icon', e); settings.appIcon = prev; saveSettings(); if (!quiet) toast(t('app_icon_fail')); }
  }
  if (settings.appIcon && settings.appIcon !== 'classic') setTimeout(() => setAppIcon(settings.appIcon, true), 300);   // desktop/browser re-apply on start
  function openSettings() {
    const accs = savedAccounts();
    modal(`<h2>${Art.icon('gear')} ${t('settings')}</h2>
      <div class="settings-chips">
        <button class="chip" id="s-lang">${langLabel()}</button>
        <button class="chip" id="s-sound">${settings.sound ? Art.icon('sound') + t('sound') : Art.icon('mute') + t('muted')}</button>
        <button class="chip" id="s-orient">${settings.orientation === 'landscape' ? Art.icon('rotateL') + t('mode_land') : Art.icon('rotate') + t('mode_port')}</button>
        ${user.offline ? '' : `<button class="chip" id="s-fnotif">${settings.friendNotif !== false ? '👥 ' + t('fnotif_on') : '👥 ' + t('fnotif_off')}</button>`}
        <button class="chip" id="s-anims">${settings.anims !== false ? '🎬 ' + t('anims_on') : '🎬 ' + t('anims_off')}</button>
        <button class="chip" id="s-music">${settings.music ? '🎵 ' + t('music_on') : '🔇 ' + t('music_off')}</button>
        ${user.offline ? '' : `<button class="chip" id="s-notif">${settings.notify ? '🔔 ' + t('updates_on') : '🔕 ' + t('updates_off')}</button>`}
      </div>
      <label class="vol ${settings.music ? '' : 'off'}">${t('music_vol')} <b id="s-vol-n">${settings.musicVol}%</b>
        <input id="s-vol" type="range" min="1" max="100" step="1" value="${settings.musicVol}" ${settings.music ? '' : 'disabled'}></label>
      ${user.offline ? '' : `<div class="sec"><h3>🔔 ${t('push_title')}</h3><p class="muted small">${t('push_note')}</p>
        <button class="btn small primary" id="s-push">🌐 ${t('push_btn')}</button><div class="row"><small class="muted" id="s-push-st"></small><button class="chip" id="s-push-test">${t('push_test')}</button></div></div>`}
      <div class="row wrap">${user.offline ? '' : `<button class="btn small" id="s-devices">📱 ${t('my_devices')}</button>`}<button class="btn small" id="s-support">🛟 ${t('support')}</button></div>
      ${window.Cutscene ? `<button class="btn small" id="s-watch">🎬 ${t('watch_intro')}</button>` : ''}
      <div class="sec look-ui"><h3>🖌️ ${t('ui_design')}</h3><p class="muted small">${t('ui_design_note')}</p>
        <div class="look-grid">${Object.keys(THEMES).map(id => `<button class="look-it ${(THEMES[settings.theme] ? settings.theme : 'galaxy') === id ? 'on' : ''}" data-theme-id="${id}"><span class="theme-sw" style="background:radial-gradient(circle at 70% 20%, ${THEMES[id].bg[0]}, ${THEMES[id].bg[2]})"><i style="background:linear-gradient(90deg, ${THEMES[id].g.join(', ')})"></i></span><small>${t('th_' + id)}</small></button>`).join('')}</div>
      </div>
      <div class="sec look"><h3>🎨 ${t('look')}</h3><p class="muted small">${t('app_icon_note')}</p>
        <div class="look-grid">${APP_ICONS.map(id => `<button class="look-it ${(settings.appIcon || 'classic') === id ? 'on' : ''}" data-appicon="${id}"><img src="img/appicons/${id}.png" alt="" class="appicon-img"><small>${t('ai_' + id)}</small></button>`).join('')}</div>
      </div>
      ${user.offline ? '' : `<div class="sec"><h3>${t('account')}</h3>${user.email
        ? `<div class="small">${t('email_is')} <b dir="ltr">${esc(user.email)}</b><br><span class="muted">${t('email_device_note')}</span></div>`
        : `<div class="small muted">${t('ask_email_body')}</div>
           <button class="btn small primary" id="s-email">✉️ ${t('add_email')}</button>`}
        <button class="btn small" id="s-key">🔑 ${t('save_key')}</button><div class="muted small">${t('save_key_note')}</div></div>`}
      <div class="sec"><h3>${t('accounts')}</h3>
        ${accs.map(a => `<div class="acc-row"><div class="avatar">${Art.avatar(a.avatar)}</div><div class="info"><b>${esc(a.name)}</b><br><small dir="ltr" style="color:var(--cyan)">@${esc(a.handle)}</small></div>
          ${user && a.id === user.id ? `<span class="chip">${t('current_acc')}</span>` : `<button class="btn small" data-switch="${esc(a.id)}">${t('switch_to')}</button>`}</div>`).join('')}
        <button class="btn small" id="s-add">${Art.icon('plus')}${t('add_account')}</button>
      </div>
      ${user.offline ? '' : `<button class="btn ghost" id="s-out">${t('sign_out')}</button>`}
      <button class="btn ghost" id="s-x">${t('close')}</button>`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#s-x', closeModal);
      on('#s-lang', () => { closeModal(); pickLanguage(); });
      on('#s-fnotif', () => { settings.friendNotif = settings.friendNotif === false; saveSettings(); syncPushPrefs(); openSettings(); });
      on('#s-push', () => { closeModal(); openSiteNotify(); });
      on('#s-push-test', async () => { const r = await Net.pushSend(user, 'test', IOS_KIND ? {} : { device: DEVICE }); toast(r && r.sent ? t('push_test_sent') : t('push_none'), 3500); });
      const ps = m.querySelector('#s-push-st');
      if (ps) Net.pushStatus(user, DEVICE, IOS_KIND).then(r => { ps.textContent = r && r.this_device ? t('push_this_on') : t('push_this_off'); }).catch(() => { ps.textContent = ''; });
      on('#s-anims', () => { settings.anims = settings.anims === false; settings.intro = settings.anims; saveSettings(); openSettings(); });
      on('#s-devices', devicesBox);
      on('#s-support', () => { closeModal(); openSupport(); });
      on('#s-watch', () => { closeModal(); Sfx.init(); Cutscene.intro(user.data.skin, t); });
      on('#s-music', () => { settings.music = !settings.music; saveSettings(); Music.setEnabled(settings.music); Music.unlock(); openSettings(); });
      const vol = m.querySelector('#s-vol');
      vol.oninput = () => { settings.musicVol = +vol.value; m.querySelector('#s-vol-n').textContent = vol.value + '%'; Music.setVolume(settings.musicVol); };
      vol.onchange = saveSettings;
      on('#s-sound', () => { settings.sound = Sfx.on = !settings.sound; saveSettings(); openSettings(); });
      on('#s-orient', () => { settings.orientation = settings.orientation === 'landscape' ? 'portrait' : 'landscape'; saveSettings(); openSettings(); });
      on('#s-notif', async () => { await setNotify(!settings.notify); openSettings(); });
      on('#s-email', () => emailFlow('add'));
      on('#s-add', addAccount);
      on('#s-out', signOut);
      on('#s-key', saveLoginKey);
      m.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => switchAccount(b.dataset.switch));
      m.querySelectorAll('[data-appicon]').forEach(b => b.onclick = async () => { await setAppIcon(b.dataset.appicon); openSettings(); });
      m.querySelectorAll('[data-theme-id]').forEach(b => b.onclick = () => {
        settings.theme = b.dataset.themeId; saveSettings(); applyTheme(); Sfx.init(); Sfx.click && Sfx.click();
        m.querySelectorAll('[data-theme-id]').forEach(x => x.classList.toggle('on', x === b)); toast(t('ui_design_set', { x: t('th_' + settings.theme) }));
      });
    });
  }
  // signing out removes the account from this device: its saved login key and its local data
  function signOut() {
    if (!confirm(t('confirm_signout_del'))) return;
    const id = user.id;
    flushSave(); Net.stopPresence();
    store.set('ss_accounts', savedAccounts().filter(a => a.id !== id));
    try { Object.keys(localStorage).filter(k => k.endsWith('_' + id) || k.includes(id)).forEach(k => localStorage.removeItem(k)); } catch (e) {}
    user = null; store.set('ss_user', null); closeModal(); friends = []; history = []; show('register', false);
    $('#r-tabs [data-rt="login"]').click();
  }

  // ---------- login key saved as a file on the device (or shared to Files / Notes on a phone) ----------
  const b64u = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64u = s => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));
  const makeKey = u => 'SSK1.' + b64u(JSON.stringify({ i: u.id, s: u.secret, h: u.handle }));
  function readKey(text) {
    const m = /SSK1\.([A-Za-z0-9_-]{20,})/.exec(String(text || '')); if (!m) return null;
    try { const k = JSON.parse(unb64u(m[1])); return k && k.i && k.s ? k : null; } catch (e) { return null; }
  }
  // Login key saved in the device's own password manager (Apple Passwords / iCloud Keychain, Google Password Manager,
  // the browser's saved passwords): username = @handle, password = the key. A file is still offered as a backup.
  const canStoreCred = () => !!(window.PasswordCredential && navigator.credentials && navigator.credentials.store);
  // .slk = SpaceShip Login Key: a small text file with a header and the key. The game reads the SSK1. key from it
  // (old .txt key files still work). On phones it is written as a real file and handed to the share sheet
  // (Save to Files / Drive / AirDrop); tapping a .slk file opens SpaceShip with the key filled in.
  const SLK_MIME = 'application/x-spaceship-login-key';
  const PW_DOMAIN = String(window.SS_DOMAIN || '').trim();
  // the device's own password manager: Google Password Manager (Credential Manager) on Android,
  // Apple Passwords (shared web credentials) on iPhone - iPhone needs the app linked to the website (Associated Domain)
  const OS = window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web';
  const nativePw = () => NATIVE && !!Cap.SavePassword && (OS === 'android' || (OS === 'ios' && !!PW_DOMAIN));
  function slkText() {
    return `SpaceShip Login Key (SLK)\nFormat: SLK/1\nAccount: @${user.handle}\nName: ${user.name}\nCreated: ${new Date().toISOString()}\n\n${t('key_file_note')}\n\n${makeKey(user)}\n`;
  }
  async function saveKeyFile() {
    const key = makeKey(user), name = `SpaceShip-${user.handle}.slk`, text = slkText();
    try {
      if (NATIVE && Cap.Filesystem && Cap.Share) {
        const w = await Cap.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
        await Cap.Share.share({ title: name, files: [w.uri] }); toast(t('key_saved'), 3500); return;
      }
      if (NATIVE && Cap.Share) { await Cap.Share.share({ title: name, text }); toast(t('key_saved'), 3500); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: SLK_MIME })); a.download = name;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast(t('key_saved'), 3500);
    } catch (e) { copy(key); }
  }
  function saveLoginKey() {
    if (!user || user.offline) return;
    const key = makeKey(user), handle = '@' + user.handle;
    // a real form: password managers offer "Save password?" when it is submitted
    modal(`<div style="font-size:40px">🔑</div><h2>${t('save_key')}</h2><p class="muted small">${t('pw_save_note')}</p>
      <form id="kp-form" class="col" action="#" method="post" autocomplete="on">
        <input name="username" id="kp-user" autocomplete="username" dir="ltr" value="${esc(handle)}" readonly>
        <input name="password" id="kp-pass" type="password" autocomplete="new-password" dir="ltr" value="${esc(key)}" readonly>
        <button class="btn primary" type="submit">🔐 ${t('pw_save_btn')}</button>
      </form>
      <button class="btn small" id="kp-file">📄 ${t('pw_save_file')}</button>
      <p class="muted small">${t('save_key_note')}</p>
      <button class="btn ghost" id="kp-x">${t('close')}</button>`, m => {
      m.querySelector('#kp-x').onclick = closeModal;
      m.querySelector('#kp-file').onclick = saveKeyFile;
      m.querySelector('#kp-form').onsubmit = async e => {
        e.preventDefault();
        let stored = false;
        if (nativePw()) {   // the phone's own "Save password?" sheet
          try { await Cap.SavePassword.promptDialog({ username: handle, password: key, url: PW_DOMAIN || undefined }); closeModal(); toast(t('pw_saved'), 4000); return; }
          catch (er) { console.warn('save password', er); if (/cancel/i.test(String(er && er.message))) return; toast(t('pw_native_fail'), 4500); return; }
        }
        if (canStoreCred()) {
          try { await navigator.credentials.store(new PasswordCredential({ id: handle, password: key, name: user.name })); stored = true; } catch (er) { console.warn('credential store', er); }
        }
        // let the browser / phone see the form "sent" so it offers to save it, then close
        setTimeout(() => { closeModal(); toast(stored ? t('pw_saved') : t('pw_offered'), 4000); }, 300);
      };
    });
  }
  function keyLogin(prefill) {
    modal(`<div style="font-size:40px">🔑</div><h2>${t('key_login')}</h2><p class="muted small">${t('pw_login_note')}</p>
      <form id="k-form" class="col" action="#" method="post" autocomplete="on">
        <input name="username" id="k-user" autocomplete="username" dir="ltr" placeholder="@handle" autocapitalize="off" spellcheck="false">
        <input name="password" id="k-in" type="password" autocomplete="current-password" dir="ltr" placeholder="SSK1.…" spellcheck="false">
        <div class="status" id="k-st"></div>
        <button class="btn primary" id="k-go" type="submit">${t('login')}</button>
      </form>
      ${nativePw() ? `<button class="btn small" id="k-saved" type="button">🔐 ${t('pw_use_saved')}</button>` : ''}
      <label class="btn small" style="cursor:pointer">📄 ${t('key_file_pick')}<input id="k-file" type="file" accept=".slk,.txt,text/plain,${SLK_MIME}" hidden></label>
      <button class="btn ghost" id="k-x">${t('cancel')}</button>`, m => {
      const st = m.querySelector('#k-st'), inp = m.querySelector('#k-in'), go = m.querySelector('#k-go'), form = m.querySelector('#k-form');
      m.querySelector('#k-x').onclick = closeModal;
      const submit = () => (form.requestSubmit ? form.requestSubmit() : go.click());
      m.querySelector('#k-file').onchange = async e => { const f = e.target.files[0]; if (f) { inp.value = (await f.text()).trim(); submit(); } };
      const ks = m.querySelector('#k-saved');
      if (ks) ks.onclick = async () => {
        try { const c = await Cap.SavePassword.readPassword(); if (c && c.password) { m.querySelector('#k-user').value = c.username || ''; inp.value = c.password; submit(); } }
        catch (er) { if (!/cancel/i.test(String(er && er.message))) { st.className = 'status err'; st.textContent = t('pw_none_saved'); } }
      };
      if (prefill) { const k0 = /SSK1\.[A-Za-z0-9_-]{20,}/.exec(prefill), h0 = /Account:\s*(@\S+)/.exec(prefill); if (h0) m.querySelector('#k-user').value = h0[1]; if (k0) { inp.value = k0[0]; setTimeout(submit, 300); } }
      // browsers that support it can hand over a saved key directly (the person picks it)
      if (window.PasswordCredential && navigator.credentials && navigator.credentials.get) {
        navigator.credentials.get({ password: true, mediation: 'optional' }).then(c => {
          if (c && c.password && readKey(c.password) && !inp.value) { m.querySelector('#k-user').value = c.id; inp.value = c.password; }
        }).catch(() => {});
      }
      form.onsubmit = async e => {
        e.preventDefault();
        // a secret token (SST-...) instead of a login key: remember it, and its ship is added to the account you sign in with
        // forgiving: spaces, invisible marks and any kind of dash copied along with the token are ignored
        const raw = inp.value.normalize('NFKC').replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\s]/g, '').replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D_]/g, '-');
        const tok = /^(SST-?[A-Za-z0-9-]{8,64})$/i.exec(raw);
        if (tok) {
          go.disabled = true;
          try {
            const ship = await Net.checkSecretToken(tok[1].toUpperCase()); go.disabled = false;
            if (!ship) { st.className = 'status err'; st.textContent = t('secret_token_bad'); return; }
            store.set('ss_secret_tok', tok[1].toUpperCase()); inp.value = '';
            st.className = 'status ok'; st.textContent = t('secret_token_ok', { x: /^w\d+$/.test(ship) ? worldName(ship) : t('ship_' + ship) }); Sfx.init(); Sfx.power();
          } catch (er) { go.disabled = false; st.className = 'status err'; st.textContent = errText(er); }
          return;
        }
        const k = readKey(inp.value);
        if (!k) { st.className = 'status err'; st.textContent = t('key_bad'); return; }
        go.disabled = true; st.className = 'status'; st.textContent = t('connecting');
        try { const r = await Net.login(k.i, k.s); closeModal(); finishLogin(Object.assign(r, { secret: k.s })); }
        catch (er) { go.disabled = false; st.className = 'status err'; st.textContent = String(er.message).includes('unauthorized') ? t('key_bad') : errText(er); }
      };
    });
  }

  function editProfile() {
    const owned = Art.AVATARS.filter(a => (a.price === 0 && !a.gems) || (user.data.avatars || []).includes(a.id));
    modal(`<h2>${t('profile')}</h2><div class="pf-av"><div class="avatar" style="width:80px;height:80px">${Art.avatar(user.avatar)}</div><button class="pf-pen" id="p-pen" title="${esc(t('change_icon'))}">✏️</button></div>
      <div class="look-grid pf-icons hidden" id="p-icons">${owned.map(a => `<button class="look-it ${user.avatar === a.id ? 'on' : ''}" data-pav="${a.id}"><div class="avatar">${Art.avatar(a.id)}</div></button>`).join('')}</div>
      <b dir="ltr" style="color:var(--cyan)">@${esc(user.handle)}</b>
      ${!user.offline && parties[0] ? `<button class="pf-club" id="p-club"><span class="club-logo">${Art.logo(parties[0].logo)}</span><span class="club-title"><b>${esc(parties[0].name)}</b><small>${rankTag(parties[0].my_role || 'member')} · ${t('members_n', { n: parties[0].count })}</small></span>${accessChip(parties[0])}</button>` : ''}
      <label>${t('name')}<input id="p-name" maxlength="24" value="${esc(user.name)}"></label>
      <p class="muted small">${t('handle_note')}</p>
      ${user.offline ? '' : `<div class="sec"><h3>${t('other_devices')}</h3>${user.email
        ? `<div class="small">${t('email_is')} <b dir="ltr">${esc(user.email)}</b><br><span class="muted">${t('email_device_note')}</span></div>`
        : `<div class="small muted">${t('ask_email_body')}</div>
           <button class="btn small primary" id="p-em-add">✉️ ${t('add_email')}</button>`}</div>`}
      ${user.offline || !GOOGLE_ON ? '' : user.google ? `<div class="cv-banner">${Art.icon('google')} ${t('linked_google')} <b dir="ltr">${esc(user.google)}</b></div>` : `<button class="btn google" id="p-cv">${Art.icon('google')}${t('link_google')}</button>`}
      <button class="btn primary" id="p-save">${t('save')}</button><button class="btn" id="p-accs">👥 ${t('accounts')}</button>${user.offline ? '' : `<button class="btn ghost" id="p-out">${t('sign_out')}</button>`}<button class="btn ghost" id="p-x">${t('close')}</button>`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#p-em-add', () => emailFlow('add'));
      on('#p-em-rm', async () => {
        if (!confirm(t('confirm_rm_email'))) return;
        try { const t = await Net.emailRemove(user); user.email = null; user.has_token = true; store.set('ss_user', user); showToken(t, false); } catch (e) { toast(errText(e)); }
      });
      on('#p-tok', async () => {
        if (!confirm(t('confirm_new_token'))) return;
        try { const t = await Net.regenToken(user); user.has_token = true; store.set('ss_user', user); showToken(t, false); } catch (e) { toast(errText(e)); }
      });
      on('#p-out', signOut);
      on('#p-accs', openSettings);
      on('#p-pen', () => m.querySelector('#p-icons').classList.toggle('hidden'));
      on('#p-club', () => { closeModal(); friendTab = 'parties'; show('friends'); });
      m.querySelectorAll('[data-pav]').forEach(b => b.onclick = () => {
        user.avatar = b.dataset.pav; save(); Sfx.init(); Sfx.coin();
        m.querySelector('.pf-av .avatar').innerHTML = Art.avatar(user.avatar);
        m.querySelectorAll('[data-pav]').forEach(x => x.classList.toggle('on', x === b)); renderMenu();
      });
      m.querySelector('#p-save').onclick = () => { const n = m.querySelector('#p-name').value.trim(); if (n) { user.name = n; save(); } closeModal(); renderMenu(); };
      m.querySelector('#p-x').onclick = closeModal;
      const cvb = m.querySelector('#p-cv'); if (cvb) cvb.onclick = () => { closeModal(); signInWithGoogle('link'); };
    });
  }

  // ---------- levels: 500 levels in chapters of 50, then the 20 secret worlds ----------
  const CHAPTER = 50;
  const bossLabel = () => t('hud_boss').replace(/[!！]/g, '');
  // 4 worlds of 500 levels, in order: a world opens when the last level of the one before it is done.
  // World 1 keeps its old keys (1..500) so saved progress stays; the others are saved as "2:15".
  const GALS = GALAXIES.length;
  const lvKey = (g, n) => g > 1 ? g + ':' + n : n;
  const starsOf = (D, g, n) => D.levels[lvKey(g, n)] || 0;
  const galOpen = (D, g) => g === 1 || starsOf(D, g - 1, LEVELS) > 0;
  const unlockedLevel = (D, n, g = 1) => galOpen(D, g) && (n === 1 || starsOf(D, g, n - 1) > 0);
  const topLevel = (D, g = 1) => { let n = 1; while (n < LEVELS && unlockedLevel(D, n + 1, g)) n++; return n; };
  const topGal = D => { let g = 1; while (g < GALS && galOpen(D, g + 1)) g++; return g; };
  const galDone = (D, g) => { let c = 0; for (let n = 1; n <= LEVELS; n++) if (starsOf(D, g, n)) c++; return c; };
  const galIcons = ['☄️', '❄️', '🌋', '🌀'];
  // Shared picker: the levels screen and the room lobby both use it. sel = what is chosen in a room.
  function levelPicker(D, chapter, sel, g = 1) {
    const chapters = Math.ceil(LEVELS / CHAPTER), top = topLevel(D, g);
    let html = `<div class="gal-tabs">${GALAXIES.map(G => {
      const k = G.n, open = galOpen(D, k);
      return `<button class="gal-tab g${k} ${k === g ? 'on' : ''} ${open ? '' : 'locked'}" data-gal="${k}" ${open ? '' : 'disabled'}>
        <span class="gal-ic">${open ? galIcons[k - 1] : Art.icon('lock')}</span><b>${t('gal_' + k)}</b>
        <small>${open ? galDone(D, k) + '/' + LEVELS : t('gal_locked_short', { n: LEVELS })}</small></button>`;
    }).join('')}</div>
    ${g < GALS && !galOpen(D, g + 1) ? `<div class="gal-next muted small">${Art.icon('lock')} ${t('gal_unlock_hint', { w: t('gal_' + (g + 1)), n: LEVELS })}</div>` : ''}
    <div class="chapters">${Array.from({ length: chapters }, (_, c) => {
      const a = c * CHAPTER + 1, b = Math.min(LEVELS, (c + 1) * CHAPTER), open = a <= top;
      return `<button class="chap ${c === chapter ? 'on' : ''} ${open ? '' : 'locked'}" data-chap="${c}" ${open ? '' : 'disabled'}>${open ? '' : Art.icon('lock')}${a}–${b}</button>`;
    }).join('')}</div><div class="lv-page">`;
    for (let n = chapter * CHAPTER + 1; n <= Math.min(LEVELS, (chapter + 1) * CHAPTER); n++) {
      const stars = starsOf(D, g, n), open = unlockedLevel(D, n, g), next = open && !stars;
      const chosen = sel && !sel.secret && sel.mode === 'level' && sel.level === n && (sel.world || 1) === g;
      html += `<button data-bl="${bossLabel()}" class="lv g${g} ${levelCfg(n, g).boss ? 'boss' : ''} ${open ? '' : 'locked'} ${next ? 'next' : ''} ${chosen ? 'chosen' : ''}" data-lv="${n}" data-g="${g}" ${open ? '' : 'disabled'}>
        ${open ? `<b>${n}</b><div class="stars">${[1, 2, 3].map(i => Art.icon(i <= stars ? 'star' : 'starOff')).join('')}</div>` : Art.icon('lock')}</button>`;
    }
    html += `</div>`;
    if (g !== 1) return html; // the secret worlds are found in world 1
    html += `<div class="sw-head">${Art.icon('secret')} ${t('secret_worlds')} <small>${D.worlds.length}/${WORLDS.length}</small></div>`;
    WORLDS.forEach((w, i) => {
      const wn = i + 1;
      if (!D.worlds.includes(w.id)) {
        html += `<div class="world locked-w"><div class="w-title">${Art.icon('lock')} ${t('secret_world_q')} <small class="muted">#${wn}</small></div></div>`;   // no hints: find them yourself
        return;
      }
      html += `<div class="world" style="--h:${w.hue}"><div class="w-title">${Art.icon('secret')} ${t(w.id + '_name')}</div><div class="w-levels">` +
        [1, 2, 3].map(k => {
          const key = wn + '-' + k, st = D.slevels[key] || 0, open = k === 1 || D.slevels[wn + '-' + (k - 1)] > 0;
          const chosen = sel && sel.secret && sel.secret.w === wn && sel.secret.k === k;
          return `<button data-bl="${bossLabel()}" class="lv sl ${open ? '' : 'locked'} ${k === 3 ? 'boss' : ''} ${chosen ? 'chosen' : ''}" data-sw="${wn}" data-sk="${k}" ${open ? '' : 'disabled'}>
            ${open ? `<b>${wn}-${k}</b><div class="stars">${[1, 2, 3].map(j => Art.icon(j <= st ? 'star' : 'starOff')).join('')}</div>
            <span class="gem-r">${st ? '✓' : gemHtml(w.gems[k - 1])}</span>` : Art.icon('lock')}</button>`;
        }).join('') + `</div></div>`;
    });
    return html;
  }
  // what a click in the picker means: {chap} to change page, or a game choice
  function pickerClick(e) {
    const gt = e.target.closest('[data-gal]'); if (gt && !gt.disabled) return { gal: +gt.dataset.gal };
    const c = e.target.closest('[data-chap]'); if (c && !c.disabled) return { chap: +c.dataset.chap };
    const s = e.target.closest('[data-sw]'); if (s && !s.disabled) return { pick: { mode: 'level', level: 1, secret: { w: +s.dataset.sw, k: +s.dataset.sk } } };
    const b = e.target.closest('[data-lv]'); if (b && !b.disabled) return { pick: { mode: 'level', level: +b.dataset.lv, world: +b.dataset.g || 1 } };
    return null;
  }
  let lvChapter = null, lvGal = null;
  function renderLevels() {
    $$('[data-coins]').forEach(e => e.innerHTML = walletHtml(user.data));
    if (lvGal === null) { lvGal = topGal(user.data); lvChapter = null; }
    if (lvChapter === null) lvChapter = Math.floor((topLevel(user.data, lvGal) - 1) / CHAPTER);
    $('#lv-grid').innerHTML = levelPicker(user.data, lvChapter, null, lvGal);
    $('#s-levels').dataset.world = lvGal;
  }
  $('#lv-grid').addEventListener('click', e => {
    const r = pickerClick(e); if (!r) return;
    if (r.gal != null) { lvGal = r.gal; lvChapter = null; renderLevels(); $('#lv-grid').scrollTop = 0; return; }
    if (r.chap != null) { lvChapter = r.chap; renderLevels(); $('#lv-grid').scrollTop = 0; return; }
    startGame(r.pick);
  });

  // ---------- shop ----------
  let shopTab = 'ships';
  $('#shop-tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; shopTab = t.dataset.tab; $$('#shop-tabs .tab').forEach(x => x.classList.toggle('on', x === t)); renderShop(); });
  // ---------- the shop runs from the server (tables shop_ships, shop_items, shop_settings) ----------
  // prices, ships (look + weapon), upgrades, powers and avatars come from the server; the last copy is kept for offline play
  function applyCatalog(cat) {
    if (!cat || !Array.isArray(cat.ships)) return;
    if (cat.gem_rate) GEM_RATE = +cat.gem_rate || GEM_RATE;
    if (cat.extras) Object.keys(EXTRAS).forEach(k => { if (cat.extras[k] != null) EXTRAS[k] = Array.isArray(cat.extras[k]) ? cat.extras[k].map(Number) : +cat.extras[k]; });
    if (cat.custom) CUSTOM_PRICE = { coins: +cat.custom.coins, gems: +cat.custom.gems, max: +cat.custom.max };
    const order = {};
    cat.ships.forEach(r => {
      order[r.id] = r.sort;
      let s = Art.SHIPS.find(x => x.id === r.id);
      if (!s) { s = { id: r.id }; Art.SHIPS.push(s); }
      Object.assign(s, { shape: r.shape, body: r.body, accent: r.accent, glow: r.glow, aura: r.aura || undefined, fx: r.fx || undefined,
        gun: { rate: +r.gun.rate, dmg: +r.gun.dmg, side: +r.gun.side, style: r.gun.style, pierce: !!r.gun.pierce },
        price: r.gems > 0 ? undefined : +r.price, gems: r.gems > 0 ? +r.gems : undefined,
        secret: !!r.secret || undefined, world: r.world || undefined, coupon: !!r.coupon || undefined, hidden: !r.active || undefined, invincible: !!r.invincible || undefined });
      if (Array.isArray(r.design) && r.design.length) s.design = r.design;   // the ship's design code from the server
      if (r.name && Object.keys(r.name).length) I18N.add('ship_' + r.id, r.name);
      if (r.description && Object.keys(r.description).length) I18N.add('shipd_' + r.id, r.description);
      if (!I18N.has('ship_' + r.id)) I18N.add('ship_' + r.id, { en: r.id[0].toUpperCase() + r.id.slice(1) });
    });
    Art.SHIPS.sort((a, b) => (order[a.id] ?? 1e6) - (order[b.id] ?? 1e6));
    (cat.items || []).forEach(r => {
      const g = r.gems && r.gems.length ? r.gems.map(Number) : null;
      if (r.kind === 'upgrade') { const u = UPGRADES.find(x => x.id === r.id); if (u) Object.assign(u, { costs: r.costs.map(Number), gems: g || undefined, hidden: !r.active || undefined }); }
      else if (r.kind === 'power') { const it = GEM_ITEMS.find(x => x.id === r.id); if (it) Object.assign(it, { gems: g ? g[0] : 0, hidden: !r.active || undefined }); }
      else if (r.kind === 'avatar') { const a = Art.AVATARS.find(x => x.id === r.id); if (a) Object.assign(a, { price: g ? 0 : +r.costs[0] || 0, gems: g ? g[0] : undefined, hidden: !r.active || undefined }); }
    });
  }
  applyCatalog(store.get('ss_shop', null));
  async function loadCatalog() {
    try { const cat = await Net.shopCatalog(); if (cat && cat.ships) { applyCatalog(cat); store.set('ss_shop', cat); if (current === 'shop') renderShop(); } }
    catch (e) { console.warn('shop catalog', e); }
  }
  setTimeout(loadCatalog, 600);
  // a purchase made on the server: it checks the price and the balance, and the result replaces the local numbers
  async function serverBuy(btn, kind, item, okMsg, conv) {
    const D = user.data; btn.disabled = true;
    try {
      await Net.save(user, D, D.best).catch(() => {});   // coins earned a moment ago reach the server first
      const r = conv ? await Net.shopConvert(user, conv) : await Net.shopBuy(user, kind, item);
      ['coins', 'gems', 'ships', 'up', 'items', 'avatars'].forEach(k => { if (r[k] != null) D[k] = r[k]; });
      if (kind === 'ship' && r.skin) D.skin = r.skin;
      if (kind === 'avatar' && r.avatar) user.avatar = r.avatar;
      Sfx.init(); Sfx.coin(); toast(okMsg); save(); renderShop(); checkSecretShip();
    } catch (e) { btn.disabled = false; toast(errText(e)); }
  }

  // ---------- secret ship: owning the whole shop unlocks Cosmos ----------
  const SECRET_SHIP = 'cosmos';
  function shopProgress(D) {
    const parts = [
      ...Art.SHIPS.filter(s => !s.secret && !s.hidden && (s.price > 0 || s.gems)).map(s => D.ships.includes(s.id)),
      ...UPGRADES.filter(u => !u.hidden).map(u => ((D.up[u.id] || u.base) - u.base) >= u.costs.length),
      ...Art.AVATARS.filter(a => !a.hidden && (a.price > 0 || a.gems)).map(a => (D.avatars || []).includes(a.id)),
      ...GEM_ITEMS.filter(it => !it.hidden).map(it => (D.items || []).includes(it.id)),
    ];
    return { have: parts.filter(Boolean).length, total: parts.length };
  }
  function checkSecretShip() {
    const D = user && user.data; if (!D || D.ships.includes(SECRET_SHIP)) return false;
    const p = shopProgress(D); if (p.have < p.total) return false;
    D.ships.push(SECRET_SHIP); D.skin = SECRET_SHIP; save(); shipAnim(SECRET_SHIP);
    Sfx.init(); Sfx.power();
    modal(`<div class="secret-reveal"><img src="${Art.shipPreview(SECRET_SHIP, 220)}" alt=""></div>
      <h2>${t('secret_ship_title')}</h2><p>${t('secret_unlocked', { x: `<b>${t('ship_' + SECRET_SHIP)}</b>` })}</p>
      <p class="muted small">${t('shipd_' + SECRET_SHIP)}</p>
      <button class="btn primary big" id="ss-ok">${t('use')}</button>`, m => { m.querySelector('#ss-ok').onclick = () => { closeModal(); if (current === 'shop') renderShop(); }; });
    return true;
  }
  // players who finished a world before world ships existed get them too
  function checkWorldShips() {
    const D = user && user.data; if (!D) return;
    const got = Art.SHIPS.filter(s => s.world && !D.ships.includes(s.id) && D.levels && D.levels[lvKey(s.world, LEVELS)]);
    if (!got.length) return;
    got.forEach(s => { D.ships.push(s.id); shipAnim(s.id); }); save();
    toast(got.map(s => t('secret_world_done', { w: t('gal_' + s.world), x: t('ship_' + s.id) })).join(' · '), 5000);
    if (current === 'shop') renderShop();
  }
  function worldCard(D, s) {
    const own = D.ships.includes(s.id), eq = D.skin === s.id;
    if (own) return `<div class="item special secret ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>✦ ${t('ship_' + s.id)}</b><small>${t('shipd_' + s.id)}</small>${gunHtml(s)}
      ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : `<button class="btn small" data-equip="${s.id}">${t('use')}</button>`}</div>`;
    const done = Object.keys(D.levels || {}).filter(k => s.world === 1 ? /^\d+$/.test(k) : k.startsWith(s.world + ':')).length;
    return `<div class="item special secret locked"><div class="pic mystery">${galIcons[s.world - 1]}</div><b>${t('secret_ship_title')}</b><small>${t('secret_world_hint', { w: t('gal_' + s.world) })}</small>
      <div class="sec-bar"><i style="width:${Math.min(100, Math.round(done / LEVELS * 100))}%"></i></div><small class="sec-n" dir="ltr">${Math.min(done, LEVELS)} / ${LEVELS}</small>
      <button class="btn small" disabled>🔒</button></div>`;
  }
  function secretCard(D) {
    const s = Art.SHIPS.find(x => x.id === SECRET_SHIP), own = D.ships.includes(s.id), eq = D.skin === s.id;
    if (own) return `<div class="item special secret ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>✦ ${t('ship_' + s.id)}</b><small>${t('shipd_' + s.id)}</small>${gunHtml(s)}
      ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : `<button class="btn small" data-equip="${s.id}">${t('use')}</button>`}</div>`;
    const p = shopProgress(D);
    return `<div class="item special secret locked"><div class="pic mystery">?</div><b>${t('secret_ship_title')}</b><small>${t('secret_ship_hint')}</small>
      <div class="sec-bar"><i style="width:${Math.round(p.have / p.total * 100)}%"></i></div><small class="sec-n" dir="ltr">${p.have} / ${p.total}</small>
      <button class="btn small" disabled>🔒</button></div>`;
  }
  function renderShop() {
    const D = user.data; if (!D.ships.includes(SECRET_SHIP)) setTimeout(checkSecretShip, 300);
    if (Art.SHIPS.some(x => x.world && !D.ships.includes(x.id))) setTimeout(checkWorldShips, 200); $$('[data-coins]').forEach(e => e.innerHTML = walletHtml(D));
    let html = '';
    if (shopTab === 'gems') {
      const g = D.gems || 0;
      html = `<div class="conv">
        <h3>${Art.icon('swap')} ${t('convert_title')}</h3>
        <div class="conv-rate">${gemHtml(1)} = ${coinHtml(GEM_RATE)} <span class="muted">· ${t('per_conv', { n: GEM_RATE })}</span></div>
        <div class="conv-have">${t('gems_have', { g: `<b>${g}</b>`, c: `<b>${(g * GEM_RATE).toLocaleString()}</b>` })}</div>
        <div class="row center conv-ctl"><button class="icon-btn" data-cv="-1" ${g ? '' : 'disabled'}>−</button>
          <input id="cv-n" type="number" min="1" max="${g}" value="${Math.min(1, g)}" ${g ? '' : 'disabled'}>
          <button class="icon-btn" data-cv="1" ${g ? '' : 'disabled'}>+</button><button class="chip" data-cv="max" ${g ? '' : 'disabled'}>${t('max')}</button></div>
        <div class="conv-out" id="cv-out">${g ? `${t('you_get')} ${coinHtml(GEM_RATE)}` : t('no_gems')}</div>
        <button class="btn gold" id="cv-go" ${g ? '' : 'disabled'}>${t('convert')}</button></div>`;
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_ships')}</div>` + Art.SHIPS.filter(s => s.gems && !s.secret && !s.hidden).map(s => {
        const own = D.ships.includes(s.id), eq = D.skin === s.id;
        return `<div class="item special ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b><small>${t('shipd_' + s.id)}</small>${gunHtml(s)}
          ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-equip="${s.id}">${t('use')}</button>` : `<button class="btn small gem" data-gship="${s.id}" ${g < s.gems ? 'disabled' : ''}>${gemHtml(s.gems)}</button>`}</div>`;
      }).join('');
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_powers')}</div>` + GEM_ITEMS.filter(it => !it.hidden).map(it => {
        const own = D.items.includes(it.id);
        return `<div class="item special"><div class="pic">${Art.icon(it.icon)}</div><b>${t('it_' + it.id)}</b><small>${t(it.dkey || 'it_' + it.id + '_d')}</small>
          ${own ? `<button class="btn small" disabled>${t('owned')}</button>` : `<button class="btn small gem" data-gitem="${it.id}" ${g < it.gems ? 'disabled' : ''}>${gemHtml(it.gems)}</button>`}</div>`;
      }).join('');
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_icons')}</div>` + Art.AVATARS.filter(a => a.gems && !a.hidden).map(a => {
        const own = D.avatars.includes(a.id), eq = user.avatar === a.id;
        return `<div class="item special ${eq ? 'eq' : ''}"><div class="pic avatar">${Art.avatar(a.id)}</div>
          ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-av-eq="${a.id}">${t('use')}</button>` : `<button class="btn small gem" data-gav="${a.id}" ${g < a.gems ? 'disabled' : ''}>${gemHtml(a.gems)}</button>`}</div>`;
      }).join('');
    }
    else if (shopTab === 'ships') html = Art.SHIPS.filter(s => !s.gems && !s.secret && (!s.hidden || user.data.ships.includes(s.id))).map(s => {
      const own = D.ships.includes(s.id), eq = D.skin === s.id;
      return `<div class="item ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b>${gunHtml(s)}
        ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-equip="${s.id}">${t('use')}</button>` : `<button class="btn small gold" data-buy-ship="${s.id}" ${D.coins < s.price ? 'disabled' : ''}>${coinHtml(s.price)}</button>`}</div>`;
    }).join('');
    else if (shopTab === 'up') html = UPGRADES.filter(u => !u.hidden).map(u => {
      const lvl = D.up[u.id] || u.base, i = lvl - u.base, max = i >= u.costs.length, cost = u.costs[i], gcost = u.gems ? u.gems[i] : 0;
      return `<div class="item"><div class="pic">${Art.icon(u.icon)}</div><b>${t('up_' + u.id)}</b><small>${t('up_' + u.id + '_d')}</small>
        <div class="pips">${u.costs.map((_, j) => `<i class="${j < i ? 'on' : ''}"></i>`).join('')}</div>
        ${max ? `<button class="btn small" disabled>${t('maxed')}</button>` : `<button class="btn small gold ${gcost ? 'dual' : ''}" data-up="${u.id}" ${D.coins < cost || (D.gems || 0) < gcost ? 'disabled' : ''}>${coinHtml(cost)}${gcost ? ` + ${gemHtml(gcost)}` : ''}</button>`}</div>`;
    }).join('');
    else html = Art.AVATARS.filter(a => !a.gems && (!a.hidden || a.price === 0)).map(a => {
      const own = a.price === 0 || D.avatars.includes(a.id), eq = user.avatar === a.id;
      return `<div class="item ${eq ? 'eq' : ''}"><div class="pic avatar">${Art.avatar(a.id)}</div>
        ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-av-eq="${a.id}">${t('use')}</button>` : `<button class="btn small gold" data-buy-av="${a.id}" ${D.coins < a.price ? 'disabled' : ''}>${coinHtml(a.price)}</button>`}</div>`;
    }).join('');
    $('#shop-list').innerHTML = html;
    const n = $('#cv-n');
    if (n) n.oninput = () => { const g = D.gems || 0; let v = Math.max(1, Math.min(g, Math.floor(+n.value || 1))); $('#cv-out').innerHTML = `${t('you_get')} ${coinHtml(v * GEM_RATE)}`; };
  }
  $('#shop-list').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return; const D = user.data;
    const pay = c => { if (D.coins < c) { toast(t('not_enough_coins')); return false; } D.coins -= c; Sfx.init(); Sfx.coin(); return true; };
    const payGems = c => { if ((D.gems || 0) < c) { toast(t('not_enough_gems')); return false; } D.gems -= c; Sfx.init(); Sfx.power(); return true; };
    if (b.dataset.cv) {
      const n = $('#cv-n'), g = D.gems || 0; let v = Math.floor(+n.value || 1);
      v = b.dataset.cv === 'max' ? g : v + +b.dataset.cv; v = Math.max(1, Math.min(g, v));
      n.value = v; $('#cv-out').innerHTML = `${t('you_get')} ${coinHtml(v * GEM_RATE)}`; return;
    }
    if (b.id === 'cv-go') {
      const g = D.gems || 0, v = Math.max(1, Math.min(g, Math.floor(+$('#cv-n').value || 1)));
      if (!g) return;
      if (!user.offline) return serverBuy(b, null, null, t('converted', { g: v, c: (v * GEM_RATE).toLocaleString() }), v);
      D.gems -= v; D.coins += v * GEM_RATE; Sfx.init(); Sfx.coin(); toast(t('converted', { g: v, c: (v * GEM_RATE).toLocaleString() }));
      save(); renderShop(); return;
    }
    if (!user.offline) {   // online: the server checks the price and the balance
      if (b.dataset.gship) return serverBuy(b, 'ship', b.dataset.gship, t('special_ship_t', { x: t('ship_' + b.dataset.gship) }));
      if (b.dataset.buyShip) return serverBuy(b, 'ship', b.dataset.buyShip, t('bought', { x: t('ship_' + b.dataset.buyShip) }));
      if (b.dataset.up) return serverBuy(b, 'upgrade', b.dataset.up, t('upgraded', { x: t('up_' + b.dataset.up) }));
      if (b.dataset.gitem) return serverBuy(b, 'power', b.dataset.gitem, t('item_yours', { x: t('it_' + b.dataset.gitem) }));
      if (b.dataset.gav) return serverBuy(b, 'avatar', b.dataset.gav, t('special_icon'));
      if (b.dataset.buyAv) return serverBuy(b, 'avatar', b.dataset.buyAv, t('new_icon'));
    }
    if (b.dataset.gship) { const s = Art.SHIPS.find(x => x.id === b.dataset.gship); if (!payGems(s.gems)) return; D.ships.push(s.id); D.skin = s.id; shipAnim(s.id); toast(t('special_ship_t', { x: t('ship_' + s.id) })); save(); renderShop(); return checkSecretShip(); }
    if (b.dataset.gitem) { const it = GEM_ITEMS.find(x => x.id === b.dataset.gitem); if (!payGems(it.gems)) return; D.items.push(it.id); toast(t('item_yours', { x: t('it_' + it.id) })); save(); renderShop(); return checkSecretShip(); }
    if (b.dataset.gav) { const a = Art.AVATARS.find(x => x.id === b.dataset.gav); if (!payGems(a.gems)) return; D.avatars.push(a.id); user.avatar = a.id; toast(t('special_icon')); save(); renderShop(); return checkSecretShip(); }
    if (b.dataset.equip) D.skin = b.dataset.equip;
    else if (b.dataset.buyShip) { const s = Art.SHIPS.find(x => x.id === b.dataset.buyShip); if (!pay(s.price)) return; D.ships.push(s.id); D.skin = s.id; shipAnim(s.id); toast(t('bought', { x: t('ship_' + s.id) })); }
    else if (b.dataset.up) {
      const u = UPGRADES.find(x => x.id === b.dataset.up), lvl = D.up[u.id] || u.base, gc = u.gems ? u.gems[lvl - u.base] || 0 : 0;
      if (gc && (D.gems || 0) < gc) { toast(t('not_enough_gems')); return; }   // check diamonds first so coins aren't taken for nothing
      if (!pay(u.costs[lvl - u.base])) return; if (gc) D.gems -= gc;
      D.up[u.id] = lvl + 1; toast(t('upgraded', { x: t('up_' + u.id) }));
    }
    else if (b.dataset.avEq) user.avatar = b.dataset.avEq;
    else if (b.dataset.buyAv) { const a = Art.AVATARS.find(x => x.id === b.dataset.buyAv); if (!pay(a.price)) return; D.avatars.push(a.id); user.avatar = a.id; toast(t('new_icon')); }
    save(); renderShop(); checkSecretShip();
  });

  // ---------- friends: search by @ or name, requests that need the other player's OK ----------
  let friendTab = 'friends', requests = { incoming: [], outgoing: [] }, parties = [], clubInvites = [], searchT = null;
  async function loadFriends() {
    if (!user || user.offline) return;
    try { friends = await Net.friends(user) || []; } catch (e) { console.warn(e); }
    try { requests = await Net.friendRequests(user) || { incoming: [], outgoing: [] }; } catch (e) { console.warn(e); }
    if (current === 'friends') { renderFriendsList(); if (friendTab === 'parties') renderParties(); }
    if (current === 'coop') renderCoopFriends();
    updateOnlineBadge();
  }
  function updateOnlineBadge() {
    const n = friends.filter(f => Net.isOnline(f.id)).length + (requests.incoming || []).length + parties.filter(p => unread(p)).length;
    const b = $('#m-online'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n);
  }
  function renderFriends() {
    $$('#f-tabs .tab').forEach(x => x.classList.toggle('on', x.dataset.ft === friendTab));
    $('#f-pane-friends').classList.toggle('hidden', friendTab !== 'friends'); $('#f-pane-parties').classList.toggle('hidden', friendTab !== 'parties');
    if (user.offline) { $('#f-list').innerHTML = `<div class="empty">${t('need_server_friends')}</div>`; $('#p-mine').innerHTML = ''; return; }
    renderFriendsList(); loadFriends();
    if (friendTab === 'parties') { renderParties(); loadParties(); searchParties(); }
  }
  $('#f-tabs').addEventListener('click', e => { const b = e.target.closest('[data-ft]'); if (!b) return; friendTab = b.dataset.ft; renderFriends(); });
  function personRow(f, actions) {
    const on = Net.isOnline(f.id);
    return `<div class="person" data-prof="${f.id}"><div class="avatar">${Art.avatar(f.avatar)}</div><div class="info"><b>${esc(f.name)}<span class="dot ${on ? 'on' : ''}"></span></b><small>@${esc(f.handle)}</small></div>${actions(f, on)}</div>`;
  }
  function renderFriendsList() {
    const inc = requests.incoming || [], out = requests.outgoing || [];
    $('#f-reqs').innerHTML = (inc.length ? `<div class="lbl pad">${t('friend_requests')} (${inc.length})</div><div class="list">${inc.map(f => personRow(f, () =>
        `<button class="btn small primary" data-acc="${f.id}">${t('accept')}</button><button class="btn small" data-dec="${f.id}">${t('decline')}</button>`)).join('')}</div>` : '')
      + (out.length ? `<div class="lbl pad">${t('sent_requests')}</div><div class="list">${out.map(f => personRow(f, () =>
        `<button class="btn small" data-cancel="${f.id}">${t('cancel')}</button>`)).join('')}</div>` : '');
    $('#f-list').innerHTML = friends.length ? friends.map(f => personRow(f, (f, on) => {
      const r = roomOf(f.id);
      return (r ? `<button class="btn small gold" data-askjoin="${f.id}">${t('ask_join')}</button>` : `<button class="btn small ${on ? 'primary' : ''}" data-invite="${f.id}" ${on ? '' : 'disabled'}>${t('invite')}</button>`)
        + `<button class="icon-btn" data-rm="${f.id}">${Art.icon('x')}</button>`;
    })).join('') : `<div class="empty">${t('no_friends')}</div>`;
  }
  function relButton(p) {
    if (p.rel === 'friend') return `<span class="chip">${t('friends_already')}</span>`;
    if (p.rel === 'sent') return `<button class="btn small" data-cancel="${p.id}">${t('requested')}</button>`;
    if (p.rel === 'incoming') return `<button class="btn small primary" data-acc="${p.id}">${t('accept')}</button>`;
    return `<button class="btn small primary" data-req="${p.id}">${Art.icon('plus')}${t('add')}</button>`;
  }
  async function runSearch() {
    const q = $('#f-search').value.trim(), box = $('#f-results');
    if (q.replace('@', '').length < 2) { box.innerHTML = ''; return; }
    try {
      const rows = await Net.searchPlayers(user, q);
      if ($('#f-search').value.trim() !== q) return;
      box.innerHTML = rows.length ? rows.map(p => personRow(p, () => relButton(p))).join('') : `<div class="empty small">${t('no_results')}</div>`;
    } catch (e) { box.innerHTML = `<div class="empty small">${esc(errText(e))}</div>`; }
  }
  $('#f-search').addEventListener('input', () => { clearTimeout(searchT); searchT = setTimeout(runSearch, 300); });
  // one click handler for the whole friends pane (search results, requests, friends)
  $('#f-pane-friends').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) { const pr = e.target.closest('[data-prof]'); if (pr) openProfile(pr.dataset.prof); return; }
    if (b.disabled || user.offline) return;
    const id = b.dataset.req || b.dataset.acc || b.dataset.dec || b.dataset.cancel || b.dataset.invite || b.dataset.rm || b.dataset.askjoin;
    if (!id) return;
    const who = [...friends, ...(requests.incoming || []), ...(requests.outgoing || [])].find(x => x.id === id) || { id, handle: (b.closest('.person') || {}).querySelector?.('small')?.textContent?.slice(1) || '' };
    try {
      if (b.dataset.req) await requestFriend(id, who.handle);
      else if (b.dataset.acc || b.dataset.dec) {
        const ok = !!b.dataset.acc;
        await Net.respondFriendRequest(user, id, ok);
        if (ok) { toast(t('friend_added', { h: at(who.handle) })); Net.sendTo(id, 'friend_accepted', { handle: user.handle }).catch(() => {}); }
      } else if (b.dataset.cancel) await Net.cancelFriendRequest(user, id);
      else if (b.dataset.invite) return inviteFriend(id);
      else if (b.dataset.askjoin) return askToJoin(id);
      else if (b.dataset.rm) {
        if (!confirm(t('confirm_rm_friend', { h: at(who.handle) }))) return;
        await Net.removeFriend(user, id);
      }
      await loadFriends(); runSearch();
    } catch (er) { toast(errText(er)); }
  });

  // ---------- parties = clubs: ranks, logo, chat with blocked words, members with live status ----------
  //   leader: everything · co-leader: name/description/logo, senior -> member, remove anyone but the leader
  //   senior: the logo · member: regular
  const RANKS = { leader: 4, coleader: 3, senior: 2, member: 1 };
  const rankOf = r => RANKS[r] || 1;
  const RANK_ICON = { leader: '👑', coleader: '⭐', senior: '🔷', member: '•' };
  const rankTag = r => `<span class="rank-tag r-${r || 'member'}">${RANK_ICON[r || 'member']} ${t('rank_' + (r || 'member'))}</span>`;
  // a player's live status: offline / online / in a room (mine or another one)
  function liveStatus(id) {
    if (id === user.id) return room ? { k: 'room', room: room.code } : { k: 'online' };
    if (!Net.isOnline(id)) return { k: 'off' };
    const r = roomOf(id); return r ? { k: 'room', room: r } : { k: 'online' };
  }
  const statusHtml = st => st.k === 'off' ? `<span class="st off">● ${t('st_offline')}</span>`
    : st.k === 'room' ? `<span class="st room">● ${room && room.code === st.room ? t('st_in_my_room') : t('st_in_room')}</span>`
    : `<span class="st on">● ${t('st_online')}</span>`;
  // which chat messages I have already read, per party
  const seenKey = () => 'ss_seen_' + user.id;
  const seenOf = pid => (store.get(seenKey(), {})[pid] || 0);
  const setSeen = (pid, id) => { const s = store.get(seenKey(), {}); if ((s[pid] || 0) < id) { s[pid] = id; store.set(seenKey(), s); } };
  const unread = p => (p.last_msg || 0) > seenOf(p.id);

  async function loadParties() {
    if (!user || user.offline) return;
    try { parties = await Net.myParties(user) || []; } catch (e) { console.warn(e); }
    try { clubInvites = await Net.partyInvites(user) || []; } catch (e) { clubInvites = []; }
    await loadClubLevel();
    if (current === 'friends' && friendTab === 'parties') renderParties();
    updateOnlineBadge();
  }
  // club access: public (in search, anyone joins) / invite (closed: invited players only) / link (open: anyone with the link)
  const ACCESS = { public: '🌐', invite: '🔒', link: '🔗' };
  const accessOf = p => p.access || (p.is_public ? 'public' : 'link');
  const clubLink = code => 'https://' + (window.SS_DOMAIN || 'spaceship-site.vercel.app') + '/club?code=' + encodeURIComponent(code);
  const accessChip = p => `<span class="chip">${ACCESS[accessOf(p)]} ${t('acc_' + accessOf(p))}</span>`;
  function renderParties() {
    $('#p-create').classList.toggle('hidden', parties.length > 0);   // one club per player
    $('#p-invites').innerHTML = clubInvites.length ? `<div class="lbl pad">${t('club_invites')}</div>` + clubInvites.map(p => `<div class="party small invite">
        <div class="party-head"><div class="club-logo">${Art.logo(p.logo)}</div><div class="club-title"><b>${esc(p.name)}</b>${p.from ? `<small>${t('invited_by', { h: '@' + esc(p.from.handle) })}</small>` : ''}</div>${accessChip(p)}</div>
        <div class="row"><button class="btn small primary" data-pjoin="${p.id}" ${parties.length ? 'disabled' : ''}>${t('join')}</button><button class="btn small ghost" data-pdecline="${p.id}">${t('decline')}</button></div>
        ${parties.length ? `<small class="muted">${t('e_already_in_party')}</small>` : ''}</div>`).join('') : '';
    $('#p-mine').innerHTML = parties.length ? parties.map(p => {
      const ms = p.members || [], my = p.my_role || (p.mine ? 'leader' : 'member'), r = rankOf(my);
      const sts = Object.fromEntries(ms.map(m => [m.id, liveStatus(m.id)]));
      const on = ms.filter(m => m.id !== user.id && sts[m.id].k !== 'off').length, inRoom = ms.filter(m => m.id !== user.id && sts[m.id].k === 'room').length;
      const order = [...ms].sort((a, b) => (sts[b.id].k !== 'off') - (sts[a.id].k !== 'off')); // online first, then by rank
      return `<div class="party club">
        <div class="party-head"><button class="club-logo" ${r >= 2 ? `data-plogo="${p.id}" title="${esc(t('change_logo'))}"` : 'disabled'}>${Art.logo(p.logo)}${r >= 2 ? `<span class="edit-dot">✎</span>` : ''}</button>
          <div class="club-title"><b>${esc(p.name)}</b><small>${t('your_rank')}: ${rankTag(my)}</small></div>
          ${accessChip(p)}</div>
        ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ''}
        <div class="party-meta"><span>${t('members_n', { n: p.count })} · <b class="on-n">${t('online_n', { n: on })}</b>${inRoom ? ' · ' + t('in_room_n', { n: inRoom }) : ''}</span>
          ${accessOf(p) === 'invite' ? `<span class="muted small">${t('acc_invite_hint')}</span>` : `<span class="code-chip" dir="ltr" data-pcopy="${esc(p.code)}">${esc(p.code)} ${Art.icon('copy')}</span>`}</div>
        <div class="club-members">${order.map(m => { const st = sts[m.id]; return `<button class="cm ${st.k}" data-pmem="${m.id}" data-party="${p.id}">
            <div class="avatar">${Art.avatar(m.avatar)}<span class="dot ${st.k !== 'off' ? 'on' : ''} ${st.k === 'room' ? 'room' : ''}"></span></div>
            <div class="info"><b>${esc(m.name)}${m.id === user.id ? ` <span class="muted">(${t('you')})</span>` : ''}</b><small dir="ltr">@${esc(m.handle)}</small></div>
            <div class="cm-side">${rankTag(m.role)}${statusHtml(st)}</div></button>`; }).join('')}</div>
        <div class="row wrap">
          <button class="btn small" data-pmute="${p.id}" title="${esc(t(isMuted(p.id) ? 'party_unmute' : 'party_mute'))}">${isMuted(p.id) ? '🔕 ' + t('party_muted') : '🔔 ' + t('party_updates')}</button>
          <button class="btn small gold" data-ptreasury="${p.id}">💰 ${t('treasury')} · ${t('club_level', { n: clubLevel })}</button>
          <button class="btn small chat-btn" data-pchat="${p.id}">💬 ${t('chat')}${unread(p) ? '<span class="badge-dot"></span>' : ''}</button>
          <button class="btn small primary" data-pplay="${p.id}" ${on ? '' : 'disabled'}>${t('play_together')}</button>
          ${accessOf(p) !== 'invite' ? `<button class="btn small" data-pshare="${esc(p.code)}">🔗 ${t('share_link')}</button>` : ''}
          ${r >= 3 ? `<button class="btn small" data-pedit="${p.id}">${t('edit')}</button>` : ''}
          ${r === 4 ? `<button class="btn small" data-pwords="${p.id}">🚫 ${t('blocked_words')}</button>` : ''}
          <button class="btn small ghost" data-pleave="${p.id}">${t('leave_party')}</button></div></div>`;
    }).join('') : '';
  }

  // a warning with CONFIRM / CANCEL (handing over the party, removing someone)
  function confirmBox(title, body, okText, onOk) {
    modal(`<div class="sheet warn"><div class="warn-ic">⚠️</div><h2>${title}</h2><p>${body}</p>
      <button class="btn danger-fill big" data-a="ok">${okText}</button><button class="btn ghost" data-a="no">${t('cancel_caps')}</button></div>`, c => {
      c.querySelector('[data-a=no]').onclick = closeModal;
      c.querySelector('[data-a=ok]').onclick = async () => { closeModal(); try { await onOk(); } catch (e) { toast(errText(e)); } };
    });
  }
  // the "play" button for another player: ask to join their room, or invite them to mine
  function playButton(id, st) {
    if (st.k === 'room' && !(room && room.code === st.room)) return `<button class="btn gold" data-a="ask">${Art.icon('play')} ${t('ask_join')}</button>`;
    if (st.k === 'room') return `<button class="btn" disabled>${t('st_in_my_room')}</button>`;
    return `<button class="btn primary" data-a="invite" ${st.k === 'online' ? '' : 'disabled'}>${Art.icon('play')} ${st.k === 'online' ? t('play_with') : t('st_offline')}</button>`;
  }
  async function requestFriend(id, handle) {
    const r = await Net.sendFriendRequest(user, id);
    if (r === 'friend') { toast(t('friend_added', { h: at(handle) })); Net.sendTo(id, 'friend_accepted', { handle: user.handle }).catch(() => {}); }
    else { toast(t('request_sent', { h: at(handle) })); Net.sendTo(id, 'friend_request', { handle: user.handle, name: user.name }).catch(() => {}); Net.pushSend(user, 'friend_request', { target: id, skip: Net.isOnline(id) ? [id] : [] }); }
    loadFriends();
  }
  // what you can do with a member, by your rank and theirs
  function memberSheet(pid, mid) {
    const p = parties.find(x => x.id === pid), m = p && (p.members || []).find(x => x.id === mid); if (!m) return;
    if (m.id === user.id) return openProfile(m.id);
    const my = p.my_role || 'member', their = m.role || 'member', st = liveStatus(m.id);
    const isFriend = m.friend || friends.some(f => f.id === m.id), out = (requests.outgoing || []).some(f => f.id === m.id);
    let manage = '';
    if (my === 'leader') manage = ['member', 'senior', 'coleader'].filter(r => r !== their).map(r => `<button class="btn small" data-a="role" data-r="${r}">${RANK_ICON[r]} ${t('set_rank', { r: t('rank_' + r) })}</button>`).join('')
      + `<button class="btn small gold" data-a="leader">👑 ${t('make_leader')}</button><button class="btn small danger" data-a="kick">${Art.icon('x')} ${t('kick')}</button>`;
    else if (my === 'coleader') manage = (their === 'senior' ? `<button class="btn small" data-a="role" data-r="member">⬇ ${t('demote_to', { r: t('rank_member') })}</button>` : '')
      + (their !== 'leader' ? `<button class="btn small danger" data-a="kick">${Art.icon('x')} ${t('kick')}</button>` : '');
    modal(`<div class="sheet">
      <div class="avatar" style="width:84px;height:84px;margin:0 auto">${Art.avatar(m.avatar)}</div>
      <h2>${esc(m.name)}</h2><div class="muted" dir="ltr">@${esc(m.handle)}</div>
      <div class="sheet-tags">${rankTag(their)}${statusHtml(st)}</div>
      <div class="muted small">${t('perm_' + their)}</div>
      ${playButton(m.id, st)}
      <button class="btn" data-a="profile">${Art.icon('friends')} ${t('view_profile')}</button>
      ${isFriend ? `<div class="chip center">${t('friends_already')}</div>` : out ? `<button class="btn" disabled>${t('requested')}</button>` : `<button class="btn" data-a="friend">${Art.icon('plus')} ${t('add_friend')}</button>`}
      ${manage ? `<div class="lbl">${t('manage_member')}</div><div class="row wrap">${manage}</div>` : ''}
      <button class="btn ghost" data-a="close">${t('close')}</button></div>`, c => {
      c.onclick = async e => {
        const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
        const a = b.dataset.a;
        try {
          if (a === 'close') return closeModal();
          if (a === 'profile') return openProfile(m.id);
          if (a === 'invite') { closeModal(); return inviteFriend(m.id, m); }
          if (a === 'ask') { closeModal(); return askToJoin(m.id, m); }
          if (a === 'friend') { await requestFriend(m.id, m.handle); closeModal(); return; }
          if (a === 'role') { await Net.setPartyRole(user, p.id, m.id, b.dataset.r); toast(t('rank_changed', { h: at(m.handle), r: t('rank_' + b.dataset.r) })); closeModal(); return loadParties(); }
          if (a === 'leader') return confirmBox(t('warn_title'), t('warn_leader_body', { h: at(m.handle), x: esc(p.name) }), t('confirm_caps'), async () => {
            await Net.setPartyRole(user, p.id, m.id, 'leader'); toast(t('rank_changed', { h: at(m.handle), r: t('rank_leader') })); loadParties();
          });
          if (a === 'kick') return confirmBox(t('kick'), t('confirm_kick', { h: at(m.handle) }), t('confirm_caps'), async () => {
            await Net.kickPartyMember(user, p.id, m.id); toast(t('kicked', { h: at(m.handle) })); loadParties();
          });
        } catch (er) { toast(errText(er)); }
      };
    });
  }
  // any player's profile: ship, progress, shared clubs, and what you can do together
  async function openProfile(id) {
    if (!user || user.offline) return;
    modal(`<div class="empty">${t('loading')}</div>`);
    let p; try { p = await Net.playerProfile(user, id); } catch (e) { closeModal(); return toast(errText(e)); }
    await ensureCustom([p.skin]);
    const me = p.rel === 'me', st = liveStatus(p.id);
    const stat = (n, k, ic) => `<div class="pf-stat">${ic}<b>${Number(n || 0).toLocaleString()}</b><small>${t(k)}</small></div>`;
    modal(`<div class="sheet profile">
      <div class="pf-top"><div class="avatar">${Art.avatar(p.avatar)}</div><img class="pf-ship" src="${Art.shipPreview(p.skin, 140)}" alt=""></div>
      <h2>${esc(p.name)}</h2><div class="muted" dir="ltr">@${esc(p.handle)}</div>
      <div class="sheet-tags">${me ? '' : statusHtml(st)}<span class="chip">${t('ship_' + p.skin)}</span></div>
      <div class="pf-stats">${stat(p.levels, 'p_levels', Art.icon('star'))}${stat(p.worlds, 'p_worlds', Art.icon('secret'))}${stat(p.ships, 'p_ships', Art.icon('rocket'))}${stat(p.best, 'p_best', Art.icon('trophy'))}</div>
      ${p.club ? `<div class="lbl">${t('p_club')}</div><button class="pf-club" data-a="club"><span class="club-logo">${Art.logo(p.club.logo)}</span>
          <span class="club-title"><b>${esc(p.club.name)}</b><small>${rankTag(p.club.role)} · ${t('members_n', { n: p.club.count })}</small></span>${accessChip(p.club)}</button>
          ${p.club.member ? '' : p.club.can_join ? `<button class="btn primary" data-a="cjoin">${t('join_club', { x: esc(p.club.name) })}</button>` : `<small class="muted">${t(p.my_club ? 'e_already_in_party' : 'acc_' + accessOf(p.club) + '_no')}</small>`}` : ''}
      ${!me && !p.in_club && parties.length ? `<button class="btn" data-a="cinvite">✉️ ${t('invite_club', { x: esc(parties[0].name) })}</button>` : ''}
      <div class="muted small">${t('p_joined', { d: new Date(p.joined).toLocaleDateString() })}</div>
      ${me ? '' : playButton(p.id, st)}
      ${!me && p.rel === 'friend' ? `<button class="btn gold" data-a="poke">⏰ ${t('poke_btn')}</button>` : ''}
      ${me ? '' : p.rel === 'friend' ? `<div class="chip center">${t('friends_already')}</div>` : p.rel === 'sent' ? `<button class="btn" disabled>${t('requested')}</button>`
        : p.rel === 'incoming' ? `<button class="btn primary" data-a="accept">${t('accept')}</button>` : `<button class="btn" data-a="friend">${Art.icon('plus')} ${t('add_friend')}</button>`}
      <button class="btn ghost" data-a="close">${t('close')}</button></div>`, c => {
      c.onclick = async e => {
        let b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
        try {
          if (b.dataset.a === 'close') return closeModal();
          if (b.dataset.a === 'invite') { closeModal(); return inviteFriend(p.id, p); }
          if (b.dataset.a === 'club') { if (p.club.member) { closeModal(); friendTab = 'parties'; return show('friends'); } if (p.club.can_join) b = c.querySelector('[data-a=cjoin]') || b; else return; }
          if (b.dataset.a === 'cjoin') { const r = await Net.joinParty(user, p.club.id, null); toast(t('joined_party', { x: r.name })); Sfx.init(); Sfx.power && Sfx.power(); loadParties(); return openProfile(p.id); }
          if (b.dataset.a === 'cinvite') { await Net.inviteToParty(user, p.id); toast(t('club_invite_sent', { h: '@' + p.handle })); Net.sendTo(p.id, 'club_invite', { handle: user.handle, club: parties[0].name }).catch(() => {}); b.disabled = true; return; }
          if (b.dataset.a === 'ask') { closeModal(); return askToJoin(p.id, p); }
          if (b.dataset.a === 'friend') { await requestFriend(p.id, p.handle); return openProfile(p.id); }
          if (b.dataset.a === 'poke') { b.disabled = true; return pokeFriend(p.id); }
          if (b.dataset.a === 'accept') { await Net.respondFriendRequest(user, p.id, true); toast(t('friend_added', { h: at(p.handle) })); Net.sendTo(p.id, 'friend_accepted', { handle: user.handle }).catch(() => {}); loadFriends(); return openProfile(p.id); }
        } catch (er) { toast(errText(er)); }
      };
    });
  }

  // logos
  const logoGrid = sel => `<div class="logo-grid">${Art.LOGOS.map(L => `<button class="logo-opt ${L.id === sel ? 'on' : ''}" data-logo="${L.id}">${Art.logo(L.id)}</button>`).join('')}</div>`;
  function bindLogoGrid(c, onPick) {
    c.querySelector('.logo-grid').onclick = e => { const b = e.target.closest('[data-logo]'); if (!b) return;
      c.querySelectorAll('.logo-opt').forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.logo); };
  }
  function logoPicker(p) {
    let sel = p.logo || 'l1';
    modal(`<h2>${t('party_logo')}</h2>${logoGrid(sel)}<div class="status" id="lg-st"></div>
      <button class="btn primary" id="lg-go">${t('save')}</button><button class="btn ghost" id="lg-x">${t('cancel')}</button>`, c => {
      bindLogoGrid(c, v => sel = v);
      c.querySelector('#lg-x').onclick = closeModal;
      c.querySelector('#lg-go').onclick = async () => {
        try { await Net.setPartyLogo(user, p.id, sel); toast(t('logo_saved')); closeModal(); loadParties(); }
        catch (e) { c.querySelector('#lg-st').className = 'status err'; c.querySelector('#lg-st').textContent = errText(e); }
      };
    });
  }
  // blocked words: only the leader. They show as # for every letter in the chat.
  function blockedWords(p) {
    const words = p.banned || [];
    modal(`<h2>🚫 ${t('blocked_words')}</h2><p class="muted small">${t('blocked_hint')}</p>
      <textarea id="bw-in" rows="6" placeholder="${esc(t('blocked_ph'))}">${esc(words.join('\n'))}</textarea>
      <div class="muted small" id="bw-prev"></div><div class="status" id="bw-st"></div>
      <button class="btn primary" id="bw-go">${t('save')}</button><button class="btn ghost" id="bw-x">${t('cancel')}</button>`, c => {
      const list = () => [...new Set(c.querySelector('#bw-in').value.split(/[\n,]+/).map(w => w.trim()).filter(w => w && !w.includes('#')))];
      const prev = () => { const l = list(); c.querySelector('#bw-prev').innerHTML = l.length ? t('blocked_n', { n: l.length }) + ' · ' + l.slice(0, 6).map(w => `<span dir="auto">${esc(w)}</span> → <b>${'#'.repeat([...w].length)}</b>`).join(' · ') : ''; };
      c.querySelector('#bw-in').oninput = prev; prev();
      c.querySelector('#bw-x').onclick = closeModal;
      c.querySelector('#bw-go').onclick = async () => {
        try { await Net.setPartyBannedWords(user, p.id, list().slice(0, 100)); toast(t('blocked_saved')); closeModal(); loadParties(); }
        catch (e) { c.querySelector('#bw-st').className = 'status err'; c.querySelector('#bw-st').textContent = errText(e); }
      };
    });
  }

  // ---------- party chat ----------
  let chat = null; // { pid, last, timer }
  function openChat(pid) {
    const p = parties.find(x => x.id === pid); if (!p) return;
    if (chat) clearInterval(chat.timer);
    chat = { pid, last: 0, timer: null, busy: false };
    modal(`<div class="chat"><div class="chat-head"><div class="club-logo sm">${Art.logo(p.logo)}</div><b>${esc(p.name)}</b>
        <span class="muted small">${t('online_n', { n: (p.members || []).filter(m => m.id !== user.id && Net.isOnline(m.id)).length })}</span>
        <button class="icon-btn" id="ch-x">${Art.icon('x')}</button></div>
      <div class="chat-list" id="ch-list"><div class="empty small">${t('loading')}</div></div>
      <form class="chat-form" id="ch-form"><input id="ch-in" maxlength="300" autocomplete="off" placeholder="${esc(t('chat_ph'))}"><button class="btn primary small" id="ch-send">${Art.icon('send')}</button></form></div>`, c => {
      c.querySelector('#ch-x').onclick = closeChat;
      c.querySelector('#ch-form').onsubmit = async e => {
        e.preventDefault();
        const inp = c.querySelector('#ch-in'), body = inp.value.trim(); if (!body) return;
        inp.value = '';
        try {
          await Net.sendPartyMessage(user, pid, body);
          await loadChat();
          for (const m of p.members || []) if (m.id !== user.id && Net.isOnline(m.id)) Net.sendTo(m.id, 'party_msg', { party: pid, name: p.name, h: user.handle }).catch(() => {});
          Net.pushSend(user, 'party_msg', { party: pid, skip: (p.members || []).map(m => m.id).filter(id => Net.isOnline(id)) });
        } catch (er) { inp.value = body; toast(errText(er)); }
      };
      setTimeout(() => c.querySelector('#ch-in').focus(), 50);
    });
    loadChat();
    chat.timer = setInterval(loadChat, 4000);
  }
  function closeChat() { if (chat) clearInterval(chat.timer); chat = null; closeModal(); renderParties(); }
  async function loadChat() {
    const box = $('#ch-list');
    if (!chat || !box) { if (chat) clearInterval(chat.timer); chat = null; return; } // the chat was closed or replaced
    if (chat.busy) return; chat.busy = true;
    const pid = chat.pid;
    try {
      const rows = await Net.partyMessages(user, pid, chat.last);
      if (!chat || chat.pid !== pid) return;
      if (!chat.last) box.innerHTML = '';
      if (!rows.length && !chat.last) box.innerHTML = `<div class="empty small">${t('no_msgs')}</div>`;
      if (rows.length) {
        const empty = box.querySelector('.empty'); if (empty) empty.remove();
        const near = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        box.insertAdjacentHTML('beforeend', rows.map(msgHtml).join(''));
        chat.last = rows[rows.length - 1].id; setSeen(pid, chat.last);
        const p = parties.find(x => x.id === pid); if (p) p.last_msg = chat.last;
        if (near || rows.some(r => r.from && r.from.id === user.id)) box.scrollTop = box.scrollHeight;
      }
    } catch (e) { console.warn(e); } finally { if (chat) chat.busy = false; }
  }
  function msgHtml(m) {
    const mine = m.from && m.from.id === user.id, time = new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `<div class="msg ${mine ? 'me' : ''}">${mine ? '' : `<div class="avatar">${Art.avatar(m.from ? m.from.avatar : 'alien')}</div>`}
      <div class="bubble">${mine ? '' : `<b>${esc(m.from ? m.from.name : t('deleted_player'))}</b>`}<span dir="auto">${esc(m.body)}</span><small>${time}</small></div></div>`;
  }
  // ---------- notifications from the website ----------
  // the game opens the site's /notify page in the real browser with a one-time code; the browser asks for permission
  // and subscribes; from then on the site sends the notifications, even when the game is closed
  const SITE_HOST = () => window.SS_DOMAIN || 'spaceship-site.vercel.app';
  // this device's own id: each device turns its own notifications on
  const DEVICE = (() => { let d = store.get('ss_device_id', null); if (!d) { d = 'app-' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); store.set('ss_device_id', d); } return d; })();
  // ---------- my devices ----------
  // a readable default name: the phone's own name / model, or the browser and system
  async function deviceInfo() {
    let name = '', platform = NATIVE ? (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) : PLATFORM === 'desktop' ? 'desktop' : 'web', model = '';
    try {
      if (NATIVE && Cap.Device) { const i = await Cap.Device.getInfo(); model = [i.manufacturer, i.model].filter(Boolean).join(' '); name = i.name && !/^(iphone|ipad|localhost)$/i.test(i.name) ? i.name : (i.platform === 'ios' ? (/ipad/i.test(i.model) ? 'iPad' : 'iPhone') : model || 'Android'); }
    } catch (e) { /* no device plugin */ }
    if (!name) {
      const ua = navigator.userAgent, os = /Windows/.test(ua) ? 'Windows' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Device';
      const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
      name = PLATFORM === 'desktop' ? os + ' PC'.replace(/^ /, '') : br ? br + ' · ' + os : os;
      if (PLATFORM === 'desktop' && os === 'Mac') name = 'Mac';
      model = model || os;
    }
    return { id: DEVICE, name: name.slice(0, 40), platform, model: model.slice(0, 60), version: String(window.SS_VERSION || 'dev') };
  }
  async function registerDevice() { if (!user || user.offline) return; try { await Net.deviceSeen(user, await deviceInfo()); } catch (e) { console.warn('device', e); } }
  function devicesBox() {
    modal(`<h2>📱 ${t('my_devices')}</h2><p class="muted small">${t('devices_note')}</p><div id="dv-list" class="list"><div class="empty">${t('loading')}</div></div>
      <button class="btn ghost" id="dv-x">${t('close')}</button>`, async m => {
      m.querySelector('#dv-x').onclick = closeModal;
      const list = m.querySelector('#dv-list');
      const draw = async () => {
        let ds = []; try { ds = await Net.myDevices(user) || []; } catch (e) { list.innerHTML = `<div class="empty">${esc(errText(e))}</div>`; return; }
        const ic = p => p === 'ios' ? '📱' : p === 'android' ? '🤖' : p === 'desktop' ? '💻' : '🌐';
        list.innerHTML = ds.map(d => `<div class="dev-row ${d.id === DEVICE ? 'me' : ''}"><span class="dev-ic">${ic(d.platform)}</span>
          <div class="dev-info"><b>${esc(d.name)}</b>${d.id === DEVICE ? ` <span class="chip">${t('this_device')}</span>` : ''}
            <small class="muted">${esc(d.model || '')}${d.version ? ' · v' + esc(d.version) : ''} · ${t('last_seen', { d: new Date(d.last).toLocaleDateString() })}${d.notifications ? ' · 🔔' : ''}</small></div>
          <button class="icon-btn" data-dren="${esc(d.id)}" title="${esc(t('rename'))}">✏️</button>
          ${d.id === DEVICE ? '' : `<button class="icon-btn" data-drm="${esc(d.id)}" title="${esc(t('remove'))}">🗑️</button>`}</div>`).join('') || `<div class="empty">—</div>`;
        list.querySelectorAll('[data-dren]').forEach(b => b.onclick = () => {
          const d = ds.find(x => x.id === b.dataset.dren), row = b.closest('.dev-row');
          row.innerHTML = `<input class="dev-name" maxlength="40" value="${esc(d.name)}"><button class="btn small primary">${t('save')}</button>`;
          const inp = row.querySelector('input'); inp.focus(); inp.select();
          const go = async () => { const v = inp.value.trim(); if (!v) return; try { await Net.deviceRename(user, d.id, v); if (d.id === DEVICE) myDeviceName = v; toast(t('device_renamed')); } catch (e) { toast(errText(e)); } draw(); };
          row.querySelector('button').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
        });
        list.querySelectorAll('[data-drm]').forEach(b => b.onclick = async () => { try { await Net.deviceRemove(user, b.dataset.drm); } catch (e) { toast(errText(e)); } draw(); });
      };
      draw();
    });
  }
  async function openSupport() {
    const d = await deviceInfo().catch(() => ({ name: '' }));
    let name = d.name; try { const mine = (await Net.myDevices(user)).find(x => x.id === DEVICE); if (mine) name = mine.name; } catch (e) {}
    openExternal('https://' + SITE_HOST() + '/support?h=' + encodeURIComponent(user && !user.offline ? user.handle : '') + '&d=' + encodeURIComponent(name || '') + '&lang=' + I18N.lang);
  }
  // on iPhone the notifications arrive through the "SpaceShip Alerts" Home Screen app, a separate browser on the same phone
  const IOS_KIND = NATIVE && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios' ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : null;
  function openExternal(u) { if (NATIVE) window.open(u, '_system'); else window.open(u, '_blank'); }
  async function openSiteNotify() {
    if (!user || user.offline) return;
    // SpaceShip Alerts opens only from here (it proves the game is on this device), with a link for every account saved on it:
    // the player picks there which accounts get notifications (the signed-in one comes first)
    const accs = [user, ...savedAccounts().filter(a => a.id !== user.id)].slice(0, 6);
    const toks = (await Promise.all(accs.map(a => Net.pushLinkToken(a, DEVICE).catch(() => null)))).filter(Boolean);
    if (!toks.length) return toast(t('need_server'));
    openExternal('https://' + SITE_HOST() + '/notify?t=' + toks.map(encodeURIComponent).join(',') + '&d=' + encodeURIComponent(DEVICE) + '&lang=' + I18N.lang);
  }
  // the site needs the same choices as the app: Friend notifications and muted parties
  function syncPushPrefs() {
    if (!user || user.offline) return;
    const muted = Object.keys(store.get('ss_mute_' + user.id, {}));
    Net.pushSetPrefs(user, settings.friendNotif !== false, muted).catch(() => {});
  }
  const offlineIds = ids => ids.filter(id => id !== user.id && !Net.isOnline(id));
  // party updates (chat messages, calls to play) can be muted per party; stored on this device
  const muteKey = () => 'ss_mute_' + user.id;
  const isMuted = pid => !!(pid && store.get(muteKey(), {})[pid]);
  const setMuted = (pid, on) => { const s = store.get(muteKey(), {}); if (on) s[pid] = 1; else delete s[pid]; store.set(muteKey(), s); };
  function onPartyMsg(p) {
    if (!p || !p.party) return;
    if (chat && chat.pid === p.party && $('#ch-list')) { loadChat(); return; }
    const party = parties.find(x => x.id === p.party);
    if (party) party.last_msg = (party.last_msg || 0) + 1e9; // unread until the chat is opened
    if (!isMuted(p.party)) notify(p.name || 'SpaceShip', t('n_party_msg', { h: '@' + (p.h || '') }));
    if (current === 'friends' && friendTab === 'parties') renderParties();
    updateOnlineBadge();
  }

  let partyT = null;
  async function searchParties() {
    const q = $('#p-search').value.trim(), box = $('#p-results');
    try {
      const rows = (await Net.searchParties(user, q)).filter(p => !p.member);
      box.innerHTML = rows.length ? rows.map(p => `<div class="party small">
          <div class="party-head"><b>${esc(p.name)}</b><span class="chip">${ACCESS[accessOf(p)]} ${t('members_n', { n: p.count })}</span></div>
          ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ''}
          <button class="btn small primary" data-pjoin="${p.id}" data-pcode="${esc(p.code || q)}" ${p.count >= 10 || parties.length ? 'disabled' : ''}>${t('join')}</button></div>`).join('')
        : (q ? `<div class="empty small">${t('no_results')}</div>` : '');
    } catch (e) { box.innerHTML = `<div class="empty small">${esc(errText(e))}</div>`; }
  }
  $('#p-search').addEventListener('input', () => { clearTimeout(partyT); partyT = setTimeout(searchParties, 300); });
  function partyForm(p) {
    let logo = p ? p.logo || 'l1' : Art.LOGOS[Math.random() * Art.LOGOS.length | 0].id;
    modal(`<h2>${p ? t('edit') : t('create_party')}</h2>
      <label>${t('party_name')}<input id="pf-name" maxlength="30" value="${esc(p ? p.name : '')}"></label>
      <label>${t('party_desc')}<textarea id="pf-desc" maxlength="200" rows="3">${esc(p ? p.description : '')}</textarea></label>
      <div class="lbl">${t('party_logo')}</div>${logoGrid(logo)}
      <div class="lbl">${t('access_lbl')}</div>
      <div class="seg acc-seg" id="pf-vis">${['public', 'invite', 'link'].map(a => `<button data-v="${a}" class="${(p ? accessOf(p) : 'public') === a ? 'on' : ''}">${ACCESS[a]} ${t('acc_' + a)}</button>`).join('')}</div>
      <p class="muted small" id="pf-hint">${t('acc_' + (p ? accessOf(p) : 'public') + '_d')}</p>
      <div class="status" id="pf-st"></div>
      <button class="btn primary" id="pf-go">${p ? t('save') : t('create_party')}</button><button class="btn ghost" id="pf-x">${t('cancel')}</button>`, m => {
      let acc = p ? accessOf(p) : 'public';
      bindLogoGrid(m, v => logo = v);
      m.querySelector('#pf-x').onclick = closeModal;
      m.querySelector('#pf-vis').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; acc = b.dataset.v;
        m.querySelectorAll('#pf-vis button').forEach(x => x.classList.toggle('on', x === b)); m.querySelector('#pf-hint').textContent = t('acc_' + acc + '_d'); };
      m.querySelector('#pf-go').onclick = async () => {
        const name = m.querySelector('#pf-name').value.trim(), desc = m.querySelector('#pf-desc').value.trim();
        if (!name) { m.querySelector('#pf-st').className = 'status err'; m.querySelector('#pf-st').textContent = t('write_name'); return; }
        try {
          if (p) await Net.updateParty(user, p.id, name, desc, acc, logo); else { await Net.createParty(user, name, desc, acc, logo); toast(t('party_created')); }
          closeModal(); loadParties();
        } catch (e) { m.querySelector('#pf-st').className = 'status err'; m.querySelector('#pf-st').textContent = errText(e); }
      };
    });
  }
  $('#p-create').addEventListener('click', () => { if (!user.offline) partyForm(null); });
  $('#f-pane-parties').addEventListener('click', async e => {
    const mem = e.target.closest('[data-pmem]'); if (mem) return memberSheet(mem.dataset.party, mem.dataset.pmem);
    const b = e.target.closest('[data-pjoin],[data-pleave],[data-pedit],[data-pplay],[data-pcopy],[data-pchat],[data-pwords],[data-plogo],[data-pdecline],[data-pshare],[data-pmute],[data-ptreasury]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.pmute) { const on = !isMuted(b.dataset.pmute); setMuted(b.dataset.pmute, on); syncPushPrefs(); toast(t(on ? 'party_muted_t' : 'party_unmuted_t')); return renderParties(); }
      if (b.dataset.pshare) return share(t('club_share_text', { x: parties[0] ? parties[0].name : '' }) + '\n' + clubLink(b.dataset.pshare));
      if (b.dataset.pdecline) { await Net.declinePartyInvite(user, b.dataset.pdecline); return loadParties(); }
      if (b.dataset.ptreasury) return treasuryBox(b.dataset.ptreasury);
      if (b.dataset.pchat) return openChat(b.dataset.pchat);
      if (b.dataset.pwords) return blockedWords(parties.find(x => x.id === b.dataset.pwords));
      if (b.dataset.plogo) return logoPicker(parties.find(x => x.id === b.dataset.plogo));
      if (b.dataset.pcopy) return copy(b.dataset.pcopy);
      if (b.dataset.pjoin) { const p = await Net.joinParty(user, b.dataset.pjoin, b.dataset.pcode); toast(t('joined_party', { x: p.name })); $('#p-search').value = ''; $('#p-results').innerHTML = ''; Sfx.init(); Sfx.power && Sfx.power(); }
      if (b.dataset.pedit) return partyForm(parties.find(x => x.id === b.dataset.pedit));
      if (b.dataset.pleave) { const p = parties.find(x => x.id === b.dataset.pleave);
        return confirmBox(t('leave_party'), t('confirm_leave_party', { x: esc(p.name) }), t('confirm_caps'), async () => { await Net.leaveParty(user, p.id); loadParties(); }); }
      if (b.dataset.pplay) { // a room for the party: invite every member who is online
        const p = parties.find(x => x.id === b.dataset.pplay);
        if (!room || room.role !== 'host') openRoom(roomCode(), 'host');
        for (const m of p.members || []) if (m.id !== user.id && Net.isOnline(m.id) && !roomOf(m.id))
          Net.sendInvite(m.id, { code: room.code, from: { handle: user.handle, name: user.name, avatar: user.avatar }, party: p.name, pid: p.id, bonus: 1 }).catch(() => {});
        Net.pushSend(user, 'party_call', { party: p.id, skip: (p.members || []).map(m => m.id).filter(id => Net.isOnline(id)) });
        toast(t('invite_sent', { h: p.name }));
        return;
      }
      loadParties();
    } catch (er) { toast(errText(er)); }
  });

  // ---------- leaderboard ----------
  async function renderBoard() {
    $('#b-list').innerHTML = `<div class="empty">${t('loading')}</div>`;
    try {
      const rows = await Net.leaderboard();
      $('#b-list').innerHTML = rows.length ? rows.map((r, i) => `<div class="person ${r.id === user.id ? 'me-row' : ''}" data-prof="${r.id}"><div class="rank">${i + 1}</div><div class="avatar">${Art.avatar(r.avatar)}</div><div class="info"><b>${esc(r.name)}</b><small>@${esc(r.handle)}</small></div><b style="color:var(--gold)">${r.best.toLocaleString()}</b></div>`).join('') : `<div class="empty">${t('no_records')}</div>`;
    } catch (e) { $('#b-list').innerHTML = `<div class="empty">${t('e_offline')}<br>${t('your_best', { n: user.data.best.toLocaleString() })}</div>`; }
  }

  $('#b-list').addEventListener('click', e => { const pr = e.target.closest('[data-prof]'); if (pr && !user.offline) openProfile(pr.dataset.prof); });

  // ---------- rooms: up to 10 players, everyone presses Ready, the host picks the level inside the game ----------
  const myStats = () => {
    const D = user.data, has = id => (D.items || []).includes(id);
    return { weapon: D.up.weapon, shield: D.up.shield + (has('shield2') ? 2 : 0), magnet: D.up.magnet + (has('supermag') ? 5 : 0),
      life: D.up.life + (has('goldheart') ? 1 : 0), plasma: has('plasma'),
      rate: D.up.rate || 0, power: D.up.power || 0, luck: D.up.luck || 0, revive: has('revive'), drone: has('drone'),
      sides: D.up.sides || 0, dbl: !!(D.levels && D.levels[5]), stars: ((D.stars || {})[D.skin]) || 0 };   // dbl: two shots ahead once the first boss (level 5) is beaten
  };
  const meInfo = () => ({ id: user.id, handle: user.handle, name: user.name, avatar: user.avatar, skin: user.data.skin, stats: myStats() });
  const roomCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  const ROOM_MAX = 10;
  let roomChapter = null, roomGal = null;
  const roomMembers = () => room ? [...room.members].sort((a, b) => (b.role === 'host') - (a.role === 'host') || String(a.joined).localeCompare(String(b.joined))) : [];
  const roomHost = () => roomMembers().find(m => m.role === 'host');
  const pickLabel = p => !p ? '' : p.mode === 'endless' ? t('endless') : p.secret ? '✦ ' + t(WORLDS[p.secret.w - 1].id + '_name') + ' ' + p.secret.k + '/3'
    : ((p.world || 1) > 1 ? galIcons[p.world - 1] + ' ' + t('gal_' + p.world) + ' · ' : '') + t('level_n', { n: p.level });
  // which room a friend is in (from the lobby presence), so they can be asked to let us in
  const roomOf = id => { const m = Net.presenceOf(id); return m && m.room ? m.room : null; };

  function renderCoop() {
    $('#c-start').classList.toggle('hidden', !!room); $('#c-lobby').classList.toggle('hidden', !room);
    if (room) renderLobby(); else { renderCoopFriends(); loadFriends(); }
  }
  function renderCoopFriends() {
    const on = friends.filter(f => Net.isOnline(f.id));
    $('#c-friends').innerHTML = user.offline ? `<div class="empty">${t('need_server')}</div>` : on.length ? on.map(f => personRow(f, () =>
      roomOf(f.id) ? `<button class="btn small gold" data-askjoin="${f.id}">${t('ask_join')}</button>` : `<button class="btn small primary" data-invite="${f.id}">${t('invite')}</button>`)).join('')
      : `<div class="empty small">${t('no_online_friends')}</div>`;
  }
  $('#c-friends').addEventListener('click', e => {
    const b = e.target.closest('[data-invite]'); if (b) inviteFriend(b.dataset.invite);
    const a = e.target.closest('[data-askjoin]'); if (a) askToJoin(a.dataset.askjoin);
  });
  function renderLobby() {
    $('#c-roomcode').textContent = room.code;
    const ms = roomMembers(), me = ms.find(m => m.id === user.id) || {}, isHost = room.role === 'host';
    $('#c-count').textContent = t('room_players', { n: ms.length });
    $('#c-players').innerHTML = ms.map(m => `<div class="rp ${m.ready ? 'ready' : ''}">
        <div class="avatar">${Art.avatar(m.avatar)}</div><b>${esc(m.name)}</b><small dir="ltr">@${esc(m.handle)}</small>
        <span class="rp-tag">${m.role === 'host' ? '👑 ' + t('host_tag') : ''}</span>
        <span class="rp-ready">${m.ready ? '✓ ' + t('ready') : t('not_ready')}</span></div>`).join('');
    $('#c-ready').textContent = me.ready ? '✓ ' + t('ready') : t('im_ready');
    $('#c-ready').classList.toggle('primary', !me.ready);
    const host = roomHost(), pick = isHost ? room.pick : host && host.pick;
    $('#c-chosen').innerHTML = `<span class="muted">${t('chosen_level')}:</span> <b>${esc(pickLabel(pick) || '—')}</b>`;
    $('#c-hostctl').classList.toggle('hidden', !isHost);
    $('#c-wait').classList.toggle('hidden', isHost);
    if (isHost) {
      if (roomGal === null) roomGal = (room.pick && !room.pick.secret && room.pick.world) || topGal(user.data);
      if (roomChapter === null) roomChapter = Math.floor(((room.pick && !room.pick.secret && (room.pick.world || 1) === roomGal && room.pick.level) || topLevel(user.data, roomGal)) - 1) / CHAPTER | 0;
      $('#c-pick').innerHTML = `<button class="btn small ${room.pick && room.pick.mode === 'endless' ? 'primary' : ''}" data-endless>${Art.icon('infinity')}${t('endless')}</button>` + levelPicker(user.data, roomChapter, room.pick, roomGal);
      const allReady = ms.length >= 2 && ms.every(m => m.ready);
      $('#c-go').disabled = !allReady || !room.pick;
      $('#c-need').classList.toggle('hidden', allReady);
    }
    // everyone ready (2 or more): the game starts by itself after a short countdown
    const everyone = ms.length >= 2 && ms.every(m => m.ready);
    $('#c-auto').classList.toggle('hidden', !everyone);
    if (everyone) $('#c-auto').textContent = t('all_ready_starting');
    autoStart(isHost && everyone && !!room.pick);
    icons($('#c-lobby'));
  }
  let autoT = null;
  function autoStart(on) {
    if (!on || game || current !== 'coop') { clearTimeout(autoT); autoT = null; return; }
    if (autoT) return;
    autoT = setTimeout(() => { autoT = null; const ms = roomMembers();
      if (room && room.role === 'host' && !game && current === 'coop' && ms.length >= 2 && ms.every(m => m.ready)) startRoomGame(); }, 3000);
  }
  $('#c-ready').addEventListener('click', () => { if (!room) return; const me = room.members.find(m => m.id === user.id); room.setMeta({ ready: !(me && me.ready) }); Sfx.init(); });
  $('#c-pick').addEventListener('click', e => {
    if (!room || room.role !== 'host') return;
    if (e.target.closest('[data-endless]')) { setPick({ mode: 'endless', level: 1 }); return; }
    const r = pickerClick(e); if (!r) return;
    if (r.gal != null) { roomGal = r.gal; roomChapter = null; renderLobby(); return; }
    if (r.chap != null) { roomChapter = r.chap; renderLobby(); return; }
    setPick(r.pick);
  });
  function setPick(p) { room.pick = p; room.setMeta({ pick: p }); renderLobby(); }
  function nextPick(p) { // the level after the one just played, in order
    if (!p || p.mode === 'endless') return p;
    if (p.secret) return p.secret.k < 3 ? { mode: 'level', level: 1, secret: { w: p.secret.w, k: p.secret.k + 1 } } : p;
    const w = p.world || 1;
    if (p.level < LEVELS) return { mode: 'level', level: p.level + 1, world: w };
    return w < GALS ? { mode: 'level', level: 1, world: w + 1 } : p;
  }

  function openRoom(code, role) {
    if (user.offline) return toast(t('need_server'));
    if (room) leaveRoom(true);
    let foundHost = false, joinedAt = Date.now(), hostGoneT = null;
    const leftT = {};   // someone who vanished from the room: wait a moment, they may only be updating their info or reconnecting
    const hostHere = () => room && room.members.some(m => m.role === 'host');
    // the host is really gone only if it stays missing for a few seconds (a presence update shows it leaving and coming back)
    const checkHost = () => {
      if (role !== 'guest' || !room || hostGoneT) return;
      hostGoneT = setTimeout(() => {
        hostGoneT = null; if (!room || room.code !== code || hostHere()) return;
        if (game) endGameAbrupt(t('host_left')); else { toast(t('host_left')); leaveRoom(); }
      }, 6000);
    };
    room = Net.room(code, role, Object.assign(meInfo(), { ready: false, joined: joinedAt }), {
      onSync: members => {
        const others = members.filter(m => m.id !== user.id), host = members.find(m => m.role === 'host');
        if (role === 'guest') {
          if (host) { foundHost = true; clearTimeout(hostGoneT); hostGoneT = null; }
          if (others.length >= ROOM_MAX && !members.some(m => m.id === user.id && m.joined === joinedAt)) { toast(t('room_full')); leaveRoom(); return; }
          if (foundHost && !host) checkHost();
        }
        Object.keys(leftT).forEach(id => { if (members.some(m => m.id === id)) { clearTimeout(leftT[id]); delete leftT[id]; } });
        if (current === 'coop') renderLobby();
      },
      onJoin: m => { if (m.id === user.id) return; if (leftT[m.id]) { clearTimeout(leftT[m.id]); delete leftT[m.id]; return; } Sfx.init(); Sfx.power(); toast(t('in_room', { h: at(m.handle) })); },
      onLeave: id => {
        if (!room) return;
        if (role === 'guest' && !hostHere()) return checkHost();
        clearTimeout(leftT[id]);
        leftT[id] = setTimeout(() => {
          delete leftT[id]; if (!room || room.members.some(m => m.id === id)) return;
          if (game) game.dropPlayer(id); else toast(t('friend_left_room'));
          if (current === 'coop') renderLobby();
        }, 5000);
      },
      onMessage: (ev, p) => {
        if (ev === 'start' && role === 'guest') startGame({ mode: p.mode, level: p.level, world: p.world || 1, secret: p.secret, H: p.H, coop: { room, role: 'guest' }, roster: p.roster });
        else if (ev === 'end' && role === 'guest' && game) { const r = p; setTimeout(() => game && onGameEnd(r), 200); }
        else if (ev === 'bye' && p && p.id) {   // a player pressed Leave: no need to wait
          if (p.host && role === 'guest') { clearTimeout(hostGoneT); hostGoneT = null; if (game) endGameAbrupt(t('host_left')); else { toast(t('host_left')); leaveRoom(); } }
          else if (game) game.dropPlayer(p.id); else { toast(t('friend_left_room')); if (current === 'coop') renderLobby(); }
        }
        else if (game) game.onNet(ev, p);
      },
      onError: () => toast(t('room_conn')),
    });
    if (role === 'host') { const g = topGal(user.data); room.pick = { mode: 'level', level: topLevel(user.data, g), world: g }; room.setMeta({ pick: room.pick }); }
    roomChapter = null; roomGal = null;
    Net.setLobbyMeta({ room: code });
    if (role === 'guest') setTimeout(() => { if (room && room.code === code && !foundHost) { toast(t('room_not_found')); leaveRoom(); } }, 8000);
    if (current !== 'coop') show('coop'); else renderCoop();
  }
  function leaveRoom(quiet) {
    if (room) { room.send('bye', { id: user.id, host: room.role === 'host' }); room.leave(); }
    room = null; Net.setLobbyMeta({ room: null });
    if (!quiet && current === 'coop') renderCoop();
  }
  // the host starts the chosen level for everybody in the room
  function startRoomGame(pick) {
    if (!room || room.role !== 'host') return;
    const p = pick || room.pick; if (!p) return;
    room.pick = p; room.setMeta({ pick: p });
    const roster = roomMembers().map(m => ({ id: m.id, handle: m.handle, name: m.name, avatar: m.avatar, skin: m.skin, stats: m.stats }));
    startGame({ mode: p.mode, level: p.level, world: p.world || 1, secret: p.secret, coop: { room, role: 'host' }, roster });
  }
  $('#c-create').addEventListener('click', () => openRoom(roomCode(), 'host'));
  $('#c-join').addEventListener('click', () => { const c = $('#c-code').value.trim().toUpperCase(); if (c.length !== 5) { $('#c-status').className = 'status err'; $('#c-status').textContent = t('room5'); return; } openRoom(c, 'guest'); });
  $('#c-copy').addEventListener('click', () => share(t('share_room', { code: room.code })));
  $('#c-leave').addEventListener('click', () => leaveRoom());
  $('#c-go').addEventListener('click', () => startRoomGame());
  async function inviteFriend(fid, who) {
    const f = friends.find(x => x.id === fid) || who; if (!f) return;
    if (!room || room.role !== 'host') openRoom(roomCode(), 'host');
    try { await Net.sendInvite(fid, { code: room.code, from: { handle: user.handle, name: user.name, avatar: user.avatar } }); toast(t('invite_sent', { h: at(f.handle) })); }
    catch (e) { toast(t('invite_fail')); }
  }
  // ask a friend who is in a room to let us in
  async function askToJoin(fid, who) {
    const f = friends.find(x => x.id === fid) || who;
    try { await Net.sendTo(fid, 'join_request', { from: { id: user.id, handle: user.handle, name: user.name, avatar: user.avatar } }); toast(t('join_req_sent', { h: at(f ? f.handle : '') })); }
    catch (e) { toast(t('invite_fail')); }
  }
  function onJoinRequest(p) {
    if (!p || !p.from) return;
    if (!room) { Net.sendTo(p.from.id, 'join_reply', { ok: false }).catch(() => {}); return; }
    notify('SpaceShip', t('join_req_title', { h: '@' + p.from.handle }));
    if (game) return; // answered after the game; the request is shown again by the friend if needed
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>${t('join_req_title', { h: at(p.from.handle) })}</h2>
      <button class="btn primary big" id="jr-yes">${t('accept')}</button><button class="btn ghost" id="jr-no">${t('decline')}</button>`, m => {
      m.querySelector('#jr-yes').onclick = () => { closeModal(); Net.sendTo(p.from.id, 'join_reply', { ok: true, code: room ? room.code : null }).catch(() => {}); };
      m.querySelector('#jr-no').onclick = () => { closeModal(); Net.sendTo(p.from.id, 'join_reply', { ok: false }).catch(() => {}); };
    });
  }
  function onJoinReply(p) {
    if (p && p.ok && p.code) openRoom(String(p.code).toUpperCase().slice(0, 5), 'guest');
    else toast(t('join_declined'));
  }
  // a friend's poke: "Wake up! Let's play!" (Settings: Friend notifications on/off)
  function onPoke(p) {
    if (!p || !p.from || settings.friendNotif === false) return;
    notify(t('poke_title'), t('poke_body', { h: '@' + p.from.handle }));
    if (game) return;
    Sfx.init(); Sfx.power();
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>⏰ ${t('poke_title')}</h2>
      <p>${t('poke_body', { h: `<b dir="ltr">@${esc(p.from.handle)}</b>` })}</p>
      <button class="btn primary big" id="pk-yes">${Art.icon('play')} ${t('play_with')}</button><button class="btn ghost" id="pk-no">${t('not_now')}</button>`, m => {
      m.querySelector('#pk-no').onclick = closeModal;
      m.querySelector('#pk-yes').onclick = () => { closeModal(); inviteFriend(p.from.id, p.from); };
    });
  }
  const pokedAt = {};
  async function pokeFriend(id) {
    if (pokedAt[id] && Date.now() - pokedAt[id] < 60000) return toast(t('poke_wait'));
    pokedAt[id] = Date.now();
    const live = Net.isOnline(id);
    if (live) Net.sendTo(id, 'poke', { from: { id: user.id, handle: user.handle, name: user.name, avatar: user.avatar } }).catch(() => {});
    const r = await Net.pushSend(user, 'poke', { target: id, skip: live ? [id] : [] });
    toast(live || (r && r.sent) ? t('poke_sent') : t('poke_offline'));
  }
  // ---------- one account, many devices, one game at a time ----------
  // signed in on several devices is fine; starting a game here stops the game on the account's other devices
  let myDeviceName = '';
  async function claimPlay() {
    if (!user || user.offline) return;
    if (!myDeviceName) { try { const mine = (await Net.myDevices(user)).find(x => x.id === DEVICE); myDeviceName = mine ? mine.name : (await deviceInfo()).name; } catch (e) { myDeviceName = (await deviceInfo().catch(() => ({ name: '' }))).name; } }
    Net.sendTo(user.id, 'playing', { device: DEVICE, name: myDeviceName, at: Date.now() }).catch(() => {});
  }
  function onPlaying(p) {
    if (!p || p.device === DEVICE) return;
    if (!game || game.over) return;
    const last = { mode: game.mode, level: game.level, world: game.galN, secret: game.secret };
    if (game.coop) leaveRoom(true);
    stopGame(); show('menu', false); history = [];
    Sfx.init(); Sfx.hit && Sfx.hit();
    modal(`<div style="font-size:44px">🎮</div><h2>${t('moved_title')}</h2><p class="muted">${t('moved_body', { x: `<b>${esc(p.name || '?')}</b>` })}</p>
      <button class="btn primary big" id="mv-here">${Art.icon('play')} ${t('play_here')}</button><button class="btn ghost" id="mv-x">${t('close')}</button>`, m => {
      m.querySelector('#mv-x').onclick = closeModal;
      m.querySelector('#mv-here').onclick = () => { closeModal(); startGame(Object.assign({ _cs: 1 }, last.mode === 'endless' ? { mode: 'endless' } : last)); };
    });
  }
  function onInvite(p) {
    if (game || !p || !p.code) return;
    const call = !!(p.pid && p.bonus);   // the party calls everyone to play, with a bonus for joining
    if (call && isMuted(p.pid)) return;
    notify(call ? p.party : t('game_invite'), call ? t('n_party_call', { h: '@' + p.from.handle }) + ' 🎁' : t('n_invite', { h: '@' + p.from.handle }));
    Sfx.init(); Sfx.power();
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>${t('game_invite')}</h2>
      <p><b>${esc(p.from.name)}</b> <span dir="ltr" style="color:var(--cyan)">@${esc(p.from.handle)}</span> ${t('invites_you')}${p.party ? ` · <b>${esc(p.party)}</b>` : ''}</p>
      ${call ? `<div class="call-bonus">🎁 ${t('call_bonus')}</div>` : ''}
      <button class="btn primary big" id="i-yes">${t('join')}</button><button class="btn ghost" id="i-no">${t('not_now')}</button>`, m => {
      m.querySelector('#i-yes').onclick = () => { closeModal(); openRoom(String(p.code).toUpperCase().slice(0, 5), 'guest');
        if (call) Net.claimCallBonus(user).then(r => { grant(r); toast(t('call_bonus_got'), 3500); }).catch(() => {}); };
      m.querySelector('#i-no').onclick = closeModal;
    });
  }

  // ---------- game ----------
  function lockOrientation(o) {
    try { if (Cap.ScreenOrientation) return Cap.ScreenOrientation.lock({ orientation: o }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock(o).catch(() => {}); } catch (e) {}
  }
  function unlockOrientation() { try { if (Cap.ScreenOrientation) Cap.ScreenOrientation.unlock(); else if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} }
  // the cutscenes: the opening before the first game of each launch, a hyperspace jump when the world changes
  let introDone = false;
  const WARP_COL = ['#94a3b8', '#38bdf8', '#fb923c', '#c084fc'];
  const shipAnim = id => { if (window.Cutscene && id && settings.anims !== false) Cutscene.ship(id, t, t('ship_' + id)); };
  function startGame(o) {
    if (!o.coop && !o._cs && window.Cutscene && user) {
      const wk = o.mode === 'level' ? (o.secret ? 's' + o.secret.w : 'g' + (o.world || 1)) : null;
      const lk = 'ss_lastw_' + user.id, last = store.get(lk, null);
      if (wk) store.set(lk, wk);
      const go = () => startGame(Object.assign({}, o, { _cs: 1 }));
      // the opening plays once: the first time the player enters the first level (remembered in the account, so not again on another device)
      const D0 = user.data, firstLevel = o.mode === 'level' && !o.secret && (o.world || 1) === 1 && o.level === 1;
      if (!D0.introSeen && Object.keys(D0.levels || {}).length) { D0.introSeen = true; save(); }   // players who already played skip it
      if (firstLevel && !D0.introSeen && settings.intro !== false) { D0.introSeen = true; save(); introDone = true; Sfx.init(); closeModal(); return Cutscene.intro(D0.skin, t).then(go); }
      introDone = true;
      if (wk && last && last !== wk && settings.anims !== false) {
        Sfx.init(); closeModal();
        const info = o.secret ? { name: t(WORLDS[o.secret.w - 1].id + '_name'), sub: t('cs_secret_world'), color: '#f0abfc' }
          : { name: t('gal_' + (o.world || 1)), sub: t('cs_world_n', { n: o.world || 1 }), color: WARP_COL[(o.world || 1) - 1] };
        return Cutscene.warp(user.data.skin, t, info).then(go);
      }
    }
    Sfx.init(); closeModal();
    if (o.coop && o.coop.room) { clearTimeout(autoT); autoT = null; o.coop.room.setMeta({ ready: false }); }
    if (game) game.destroy();
    gameTrack = o.secret ? 'game' : GALAXIES[(o.world || 1) - 1].music; // every world has its own music
    show('game', false);
    lockOrientation(settings.orientation);
    const wantLand = settings.orientation === 'landscape';
    const hint = () => $('#g-rotate').classList.toggle('hidden', !wantLand || innerWidth > innerHeight);
    hint(); setTimeout(hint, 600);
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--st')) || 0;
    const start = () => {
      claimPlay(o);
      game = new Game($('#game'), {
        mode: o.mode, level: o.level, world: o.world || 1, secret: o.secret || null, orientation: settings.orientation, H: o.H, safeTop: safeTop + 4,
        me: meInfo(), roster: o.roster, coop: o.coop, hd: DESKTOP, local2: !!o.local2,
        p2: o.local2 ? { id: 'p2', handle: 'player2', name: t('player2'), skin: user.data.skin === 'viper' ? 'falcon' : 'viper', stats: myStats() } : null,
        onEnd: r => onGameEnd(r), onPauseKey: () => pause(), onRevive: g => askRevive(g),
      });
      if (o.coop && o.coop.role === 'host') { room.send('start', { mode: o.mode, level: o.level, world: o.world || 1, secret: o.secret || null, H: game.H, roster: o.roster }); }
      $('#g-pause').innerHTML = Art.icon(o.coop ? 'x' : 'pause');
    };
    setTimeout(start, Cap.ScreenOrientation ? 350 : 50);
  }
  function stopGame() { if (game) { game.destroy(); game = null; } unlockOrientation(); }
  function pause() {
    if (!game || game.over) return;
    if (game.coop) {
      modal(`<h2>${t('quit_q')}</h2><p class="muted">${t('friend_continues')}</p><button class="btn primary" id="q-no">${t('keep_playing')}</button><button class="btn ghost" id="q-yes">${t('quit')}</button>`, m => {
        m.querySelector('#q-no').onclick = closeModal;
        m.querySelector('#q-yes').onclick = () => { closeModal(); leaveRoom(); stopGame(); show('menu', false); history = []; };
      });
      return;
    }
    game.paused = true;
    modal(`<h2>${t('paused')}</h2><button class="btn primary big" id="p-res">${t('resume')}</button>${game.arena ? '' : `<button class="btn" id="p-restart">${t('restart')}</button>`}<button class="btn ghost" id="p-quit">${t('to_menu')}</button>`, m => {
      m.querySelector('#p-res').onclick = () => { closeModal(); game.paused = false; game.last = performance.now(); };
      if (m.querySelector('#p-restart')) m.querySelector('#p-restart').onclick = () => { const g = game; startGame({ mode: g.mode, level: g.level, world: g.galN, secret: g.secret, local2: g.local2, _cs: 1 }); };
      m.querySelector('#p-quit').onclick = () => { closeModal(); stopGame(); show(game ? 'menu' : 'levels', false); };
    });
  }
  $('#g-pause').addEventListener('click', pause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && game && !game.coop && !game.paused && !game.over) pause(); });
  if (Cap.App) Cap.App.addListener('backButton', () => {
    if (!$('#modal').classList.contains('hidden')) { if (game && game.paused) { closeModal(); game.paused = false; game.last = performance.now(); } else closeModal(); return; }
    if (current === 'game') return pause();
    if (current === 'menu' || current === 'register') return Cap.App.exitApp();
    back();
  });

  function endGameAbrupt(msg) {
    if (!game) return;
    const r = game.result || { win: false, stars: 0, coins: game.coins, collected: game.coins, bonus: 0, score: game.score, level: game.level, world: game.galN, mode: game.mode };
    toast(msg); onGameEnd(r);
  }
  function onGameEnd(r) {
    if (!game) return;
    const coop = game.coop, local2 = game.local2, D = user.data;
    stopGame();
    // the luck upgrade adds 10% per level to the coins of every game
    const luck = Math.round(r.coins * 0.1 * (D.up.luck || 0));
    r = Object.assign({}, r, { coins: r.coins + luck, bonus: r.bonus + luck });
    // the club treasury level: +2% coins per level for every member
    const clubCoins = Math.round(r.coins * 0.02 * clubLevel);
    r = Object.assign({}, r, { coins: r.coins + clubCoins, bonus: r.bonus + clubCoins });
    // Boss arena: the prize for beating the mothership
    const arenaWin = r.mode === 'arena' && r.win;
    if (arenaWin) { D.coins += EXTRAS.arena_coins; D.gems = (D.gems || 0) + EXTRAS.arena_gems; }
    // live events from the server: coin multiplier and extra diamonds for a won level
    const boost = eventBoost(), evCoins = Math.round(r.coins * (boost.mult - 1)), evGems = r.win && r.mode === 'level' ? boost.gems : 0;
    r = Object.assign({}, r, { coins: r.coins + evCoins, bonus: r.bonus + evCoins });
    D.coins += r.coins; D.gems = (D.gems || 0) + evGems;
    let newBest = false, unlocked = false, gemsWon = 0, newGal = 0, dblNow = false;
    const wld = r.world || 1;
    D.gems = D.gems || 0; D.worlds = D.worlds || []; D.slevels = D.slevels || {}; D.items = D.items || [];
    const sec = r.secret, skey = sec ? sec.w + '-' + sec.k : null;
    if (r.mode === 'endless' && r.score > D.best) { D.best = r.score; newBest = true; }
    if (sec && r.win) {
      if (!D.slevels[skey]) gemsWon = WORLDS[sec.w - 1].gems[sec.k - 1];   // diamonds for the first clear
      D.slevels[skey] = Math.max(D.slevels[skey] || 0, r.stars);
    } else if (r.mode === 'level' && r.win) {
      const k = lvKey(wld, r.level);
      unlocked = !D.levels[k] && r.level < LEVELS;
      if (wld === 1 && r.level === 5 && !D.levels[5]) dblNow = true;
      newGal = !D.levels[k] && r.level === LEVELS && wld < GALS ? wld + 1 : 0; // finished a world: the next one opens
      D.levels[k] = Math.max(D.levels[k] || 0, r.stars);
    }
    // finishing a world (winning its level 500) gives that world's own secret ship
    let gotSecret = null;
    const wShip = r.mode === 'level' && r.win && !sec && r.level === LEVELS ? Art.SHIPS.find(s => s.world === wld) : null;
    if (wShip && !D.ships.includes(wShip.id)) { D.ships.push(wShip.id); D.skin = wShip.id; gotSecret = wShip.id; setTimeout(() => shipAnim(wShip.id), 900); }
    D.gems += gemsWon;
    if (newGal) setTimeout(() => loadGifts(true), 800);   // the new world's gift appears in Codes & gifts
    const newWorlds = (r.found || []).filter(id => !D.worlds.includes(id));
    D.worlds.push(...newWorlds);
    save();
    // in a room the next level is chosen for the host right away (levels are played in order)
    const roomNext = coop && room && room.role === 'host' && r.win && r.mode === 'level' ? nextPick(room.pick) : null;
    if (roomNext && (roomNext.secret || unlockedLevel(D, roomNext.level, roomNext.world || 1))) { room.pick = roomNext; room.setMeta({ pick: roomNext }); }
    const title = r.mode === 'endless' ? (newBest ? t('new_best') : t('game_over')) : r.win ? (r.mode === 'arena' ? t('arena_won') : t('victory')) : t('ship_hit');
    const stars = r.mode === 'level' && r.win ? `<div class="big-stars">${[1, 2, 3].map(i => Art.icon(i <= r.stars ? 'star' : 'starOff')).join('')}</div>` : '';
    const hasNext = sec ? r.win && sec.k < 3 : r.mode === 'level' && r.win && (r.level < LEVELS || wld < GALS);
    const worldsHtml = newWorlds.map(id => { const w = WORLDS.find(x => x.id === id); return `<div class="found">${Art.icon('secret')} ${t('found_world')} <b>${t(w.id + '_name')}</b><br><small>${t('waits_levels')}</small></div>`; }).join('');
    let buttons;
    if (coop) buttons = (room && room.role === 'host' && roomNext ? `<button class="btn primary big" id="e-rnext">${t('next_level')}: ${esc(pickLabel(room.pick))}</button>` : '')
      + `<button class="btn ${room && room.role === 'host' && roomNext ? '' : 'primary big'}" id="e-lobby">${t('back_room')}</button><button class="btn ghost" id="e-menu">${t('menu')}</button>`;
    else buttons = `${hasNext ? `<button class="btn primary big" id="e-next">${t('next_level')}</button>` : ''}
      <button class="btn ${hasNext ? '' : 'primary big'}" id="e-retry">${r.win && r.mode === 'level' ? t('play_again') : t('try_again')}</button>
      <button class="btn" id="e-shop">${Art.icon('shop')}${t('shop')}</button><button class="btn ghost" id="e-menu">${t('menu')}</button>`;
    modal(`<h2>${title}</h2>${stars}
      ${sec ? `<div class="muted">✦ ${t(WORLDS[sec.w - 1].id + '_name')} ${sec.k}/3</div>` : r.mode === 'level' ? `<div class="muted">${wld > 1 ? galIcons[wld - 1] + ' ' + t('gal_' + wld) + ' · ' : ''}${t('level_n', { n: r.level })}${unlocked ? ' · ' + t('level_unlocked', { n: r.level + 1 }) : ''}</div>` : ''}
      ${newGal ? `<div class="found gal-open">${galIcons[newGal - 1]} ${t('gal_opened', { w: t('gal_' + newGal) })}<br><small>🎁 ${t('world_gift_wait')}</small></div>` : ''}
      ${gotSecret ? `<div class="found secret-found"><img src="${Art.shipPreview(gotSecret, 120)}" alt=""><div><b>${t('secret_ship_title')}</b><br>${t('secret_world_done', { w: t('gal_' + wld), x: `<b>${t('ship_' + gotSecret)}</b>` })}</div></div>` : ''}
      ${dblNow ? `<div class="found">${Art.icon('gun')} ${t('dbl_unlocked')}</div>` : ''}
      ${gemsWon ? `<div class="reward gems">+${gemsWon} ${Art.icon('gem')}</div>` : ''}${worldsHtml}
      ${arenaWin ? `<div class="found arena-won">🏆 ${t('arena_prize')}: +${costHtml(EXTRAS.arena_coins, EXTRAS.arena_gems)}</div>` : r.mode === 'arena' ? `<div class="muted">☠️ ${t('arena_lost')}</div>` : ''}
      ${clubCoins ? `<div class="ev-won">💰 ${t('club_bonus_got', { n: clubCoins })}</div>` : ''}
      <div class="muted">${t('score')} <b style="color:#fff">${r.score.toLocaleString()}</b></div>
      <div class="reward">+${r.coins} ${Art.icon('coin')}</div>
      ${evCoins || evGems ? `<div class="ev-won">${Art.icon('gift')} ${t('ev_bonus')}: ${evCoins ? `+${evCoins} ${Art.icon('coin')}` : ''} ${evGems ? `+${evGems} ${Art.icon('gem')}` : ''}</div>` : ''}
      <div class="muted small">${t('collected_bonus', { a: r.collected, b: r.bonus })}</div>${buttons}`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#e-next', () => startGame(sec ? { mode: 'level', level: 1, secret: { w: sec.w, k: sec.k + 1 } }
        : r.level < LEVELS ? { mode: 'level', level: r.level + 1, world: wld, local2 } : { mode: 'level', level: 1, world: wld + 1, local2 }));
      on('#e-retry', () => r.mode === 'arena' ? arenaBox() : startGame({ mode: r.mode, level: r.level, world: wld, local2, secret: sec }));
      on('#e-shop', () => { closeModal(); history = ['menu']; show('shop', false); });
      on('#e-menu', () => { closeModal(); if (coop) leaveRoom(); history = []; show('menu', false); });
      on('#e-rnext', () => { closeModal(); startRoomGame(room.pick); });
      on('#e-lobby', () => { closeModal(); if (!room) { show('menu', false); return; } history = ['menu']; show('coop', false); });
    });
  }

  // ---------- real-time updates (system notifications) ----------
  const LN = Cap.LocalNotifications;
  let notifId = 1, presenceSince = 0;
  const lastOnline = {};
  async function notifPermission() {
    try {
      if (NATIVE && LN) { const r = await LN.requestPermissions(); return r.display === 'granted'; }
      if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
    } catch (e) {}
    return false;
  }
  // Shows a system notification when the app is in the background, a toast when it is on screen.
  function notify(title, body) {
    const away = document.hidden || (document.hasFocus && !document.hasFocus());
    if (!away || !settings.notify) { toast(body ? title + ' — ' + body : title, 3500); return; }
    try {
      if (NATIVE && LN) LN.schedule({ notifications: [{ id: notifId++, title, body }] });
      else if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, { body, icon: 'icon.png', tag: 'ss-' + notifId++ });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch (e) {}
  }
  async function setNotify(on) {
    if (on && !(await notifPermission())) { settings.notify = false; saveSettings(); toast(t('notif_blocked'), 3500); }
    else { settings.notify = on; saveSettings(); }
    if (current === 'menu') renderMenu();
  }
  function askNotifications() {
    if (settings.notifAsked || !user || user.offline || game) return;
    if (!$('#modal').classList.contains('hidden') || store.get('ss_pending_token', null) || current !== 'menu') return setTimeout(askNotifications, 2500);
    settings.notifAsked = true; saveSettings();
    modal(`<div style="font-size:44px">🔔</div><h2>${t('notif_title')}</h2><p class="muted">${t('notif_body')}</p>
      <button class="btn primary big" id="n-yes">${t('allow')}</button><button class="btn ghost" id="n-no">${t('not_now')}</button>`, m => {
      m.querySelector('#n-yes').onclick = () => { closeModal(); setNotify(true); openSiteNotify(); };
      m.querySelector('#n-no').onclick = () => { closeModal(); setNotify(false); };
    });
  }
  const realtime = {
    onClubInvite: p => { if (!p) return; notify('SpaceShip', t('n_club_invite', { h: '@' + p.handle, x: p.club || '' })); loadParties(); },
    onFriendAdded: p => { if (!p) return; notify('SpaceShip', t('n_friend_added', { h: '@' + p.handle })); loadFriends(); },
    onFriendRequest: p => { if (!p) return; notify('SpaceShip', t('n_friend_request', { h: '@' + p.handle })); loadFriends(); },
    onFriendAccepted: p => { if (!p) return; notify('SpaceShip', t('n_friend_accepted', { h: '@' + p.handle })); loadFriends(); },
    onJoin: (id, pres) => {
      // ignore the burst of "joins" right after connecting; at most one per friend every 10 minutes
      if (Date.now() - presenceSince < 6000 || !friends.some(f => f.id === id)) return;
      if (lastOnline[id] && Date.now() - lastOnline[id] < 600000) return;
      lastOnline[id] = Date.now();
      const f = friends.find(x => x.id === id);
      notify('SpaceShip', t('n_online', { h: '@' + ((pres && pres.h) || f.handle) }));
    },
    onNews: p => { if (p && (p.title || p.body)) notify(p.title || 'SpaceShip', p.body || ''); },
  };

  // ---------- live events and app updates, both run from the server (Supabase: game_events, app_config) ----------
  const APP_VERSION = window.SS_VERSION || 'dev';
  const IS_APP = NATIVE || PLATFORM === 'desktop';   // the web copy is always the newest, so it is never asked to update
  const verCmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };
  const outdated = v => !!v && IS_APP && /^\d/.test(APP_VERSION) && verCmp(APP_VERSION, v) < 0;
  let events = [], eventsAt = 0, appCfg = {};
  const canJoin = e => !outdated(e.min_version);
  const runningEvents = () => { const now = Date.now(); return events.filter(e => Date.parse(e.starts_at) <= now && Date.parse(e.ends_at) > now && canJoin(e)); };
  const eventBoost = () => { const ev = runningEvents(); return { mult: ev.reduce((m, e) => Math.max(m, +e.coins_mult || 1), 1), gems: ev.reduce((s, e) => s + (e.gems_per_win | 0), 0) }; };
  const timeLeft = ms => { const m = Math.max(1, Math.round(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor(m % 1440 / 60);
    return d ? t('tl_dh', { d, h }) : h ? t('tl_hm', { h, m: m % 60 }) : t('tl_m', { m }); };
  async function loadEvents(force) {
    if (!force && Date.now() - eventsAt < 120000) { renderEvents(); return checkUpdate(); }
    try { const info = await Net.appInfo() || {}; appCfg = info; events = info.events || []; eventsAt = Date.now(); } catch (e) { console.warn('app info', e); }
    if (events.some(e => e.min_version === 'latest')) {
      const v = await latestVersion();
      events.forEach(e => { if (e.min_version === 'latest') e.min_version = v; });   // unknown (offline): nobody is asked
    }
    renderEvents(); checkUpdate();
  }
  let liveSeen = null;   // events already live, to announce the ones that start while the game is open
  function announceStarts() {
    const live = runningEvents().map(e => e.id);
    if (liveSeen) live.filter(id => !liveSeen.includes(id)).forEach(id => { const e = events.find(x => x.id === id); notify(t('ev_started', { x: e.title }), e.body || ''); });
    liveSeen = live;
  }
  setInterval(() => { if (events.length) { announceStarts(); if (current === 'menu') renderEvents(); } }, 30000);
  function renderEvents() {
    const box = $('#m-events'); if (!box) return;
    announceStarts();
    const now = Date.now();
    box.innerHTML = events.filter(e => Date.parse(e.ends_at) > now).map(e => {
      const live = Date.parse(e.starts_at) <= now, c = /^#[0-9a-f]{6}$/i.test(e.color) ? e.color : '#8b5cf6';
      const perks = [+e.coins_mult > 1 ? `<span class="ev-perk">${Art.icon('coin')} ${t('ev_coins', { n: +e.coins_mult })}</span>` : '',
        e.gems_per_win > 0 ? `<span class="ev-perk">${Art.icon('gem')} ${t('ev_gems', { n: e.gems_per_win })}</span>` : ''].join('');
      return `<div class="ev-card" style="--ev:${c}"><div class="ev-top"><span class="ev-tag">${live ? t('ev_live') : t('ev_soon')}</span>
        <small>${live ? t('ev_ends', { t: timeLeft(Date.parse(e.ends_at) - now) }) : t('ev_starts', { t: timeLeft(Date.parse(e.starts_at) - now) })}</small></div>
        <b>${esc(e.title)}</b>${e.body ? `<p>${esc(e.body)}</p>` : ''}${perks ? `<div class="ev-perks">${perks}</div>` : ''}
        ${canJoin(e) ? '' : `<div class="ev-need">${t('upd_ver', { a: esc(APP_VERSION), b: esc(e.min_version) })}</div>
        <button class="btn small primary ev-upd" data-upd="${e.id}">${Art.icon('download')} ${t('upd_join')}</button>`}</div>`;
    }).join('');
  }
  $('#m-events').addEventListener('click', e => { const b = e.target.closest('[data-upd]'); if (b) updateBox(events.find(x => String(x.id) === b.dataset.upd)); });

  let latestV = null;
  async function latestVersion() {
    if (latestV) return latestV;
    try { const d = await (await fetch('https://api.github.com/repos/itamarnintendo04-arch/SpaceShip/releases/latest')).json();
      const n = /(\d+)$/.exec(d.tag_name || ''); if (n) latestV = '1.1.' + n[1]; } catch (e) { console.warn('latest version', e); }
    return latestV;
  }
  // the app asks for an update only for a big event that needs a newer version (game_events.min_version), once per event
  function checkUpdate() {
    if (!IS_APP || current === 'game' || current === 'loading' || !$('#modal').classList.contains('hidden')) return;
    const big = events.find(e => !canJoin(e) && Date.parse(e.ends_at) > Date.now());
    if (big && !store.get('ss_upd_ev_' + big.id, false)) { store.set('ss_upd_ev_' + big.id, true); updateBox(big); }
  }
  function updateBox(ev) {
    if (!ev) return;
    modal(`<div class="upd-art">${Art.icon('download')}</div>
      <h3>${t('upd_title_ev')}</h3>
      <p>${t('upd_event', { x: esc(ev.title) })}</p>
      ${appCfg.update_message ? `<p class="muted">${esc(appCfg.update_message)}</p>` : ''}
      <p class="muted small">${t('upd_ver', { a: esc(APP_VERSION), b: esc(ev.min_version) })}</p>
      <button class="btn primary big" id="up-go">${Art.icon('download')} ${t('upd_btn')}</button>
      <button class="btn ghost" id="up-x">${t('upd_later')}</button>`, m => {
      m.querySelector('#up-go').onclick = async () => { const b = m.querySelector('#up-go'); b.disabled = true; openUrl(await updateUrl()); b.disabled = false; };
      const x = m.querySelector('#up-x'); if (x) x.onclick = closeModal;
    });
  }
  // the right download for this device: from the website (signed iPhone link included), else the latest GitHub release
  const deviceKind = () => NATIVE ? (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'android'
    : /Win/i.test(navigator.userAgent) ? 'windows' : /Mac/i.test(navigator.userAgent) ? 'mac' : 'linux';
  async function updateUrl() {
    const kind = deviceKind(), site = String(appCfg.site_url || '').replace(/\/+$/, '');
    const pick = c => { const f = (c && c.files) || {}; return kind === 'ios' ? c.ios || (f.ios && f.ios.url) : f[kind] && f[kind].url; };
    if (site) {
      try { const u = pick(await (await fetch(site + '/api/config')).json()); if (u) return u; } catch (e) { console.warn('update link', e); }
      return site + '/#download';
    }
    const GH = 'https://github.com/itamarnintendo04-arch/SpaceShip/releases/latest';
    try {
      const d = await (await fetch('https://api.github.com/repos/itamarnintendo04-arch/SpaceShip/releases/latest')).json();
      const re = { android: /\.apk$/i, ios: /\.ipa$/i, windows: /setup.*\.exe$/i, mac: /\.dmg$/i, linux: /\.appimage$/i }[kind];
      const a = (d.assets || []).find(x => re && re.test(x.name)); if (a) return a.browser_download_url;
    } catch (e) { console.warn('update link', e); }
    return GH;
  }
  function openUrl(u) { if (NATIVE && Cap.Browser) Cap.Browser.open({ url: u }); else window.open(u, '_blank'); }
  setInterval(() => { if (current === 'menu') loadEvents(); }, 60000);

  // ---------- coupon codes and free gifts (rows in the Supabase "coupons" table) ----------
  let gifts = [], giftsAt = 0;
  async function unlockWorldGifts() {
    const D = user && user.data; if (!D || user.offline) return false;
    let any = false;
    for (let g = 2; g <= GALS; g++) {
      const flag = 'ss_wgift_' + user.id + '_' + g;
      if (!galOpen(D, g) || store.get(flag, false)) continue;
      try { await Net.unlockWorldGift(user, g); store.set(flag, true); any = true; } catch (e) { console.warn('world gift', e); }
    }
    return any;
  }
  async function loadGifts(force) {
    if (!user || user.offline || (!force && Date.now() - giftsAt < 60000)) return;
    await unlockWorldGifts();
    try { gifts = await Net.freeGifts(user) || []; giftsAt = Date.now(); } catch (e) { console.warn('gifts', e); }
    $('#m-gift-dot').classList.toggle('hidden', !gifts.length);
    const g = $('#cp-gifts'); if (g) g.innerHTML = giftList();
    welcomeGift();
  }
  const worldName = id => { const w = WORLDS.find(x => x.id === id); return w ? t(w.id + '_name') : id; };
  const rewardHtml = r => (r.world ? `<span class="rw rw-world">${Art.icon('secret')} ${worldName(r.world)}</span>` : '') + (r.ship ? `<span class="rw rw-ship"><img src="${Art.shipPreview(r.ship, 120)}" alt="">${t('ship_' + r.ship)}</span>` : '')
    + (r.coins ? `<span class="rw">${coinHtml(r.coins)}</span>` : '') + (r.gems ? `<span class="rw gemc">${gemHtml(r.gems)}</span>` : '');
  const worldOfGift = g => { const m = /^WORLD([2-4])$/i.exec(g.code || ''); return m ? +m[1] : 0; };
  const giftNote = g => worldOfGift(g) ? `${galIcons[worldOfGift(g) - 1]} ${t('world_gift', { w: t('gal_' + worldOfGift(g)) })}` : g.note ? esc(g.note) : '';
  const giftList = () => gifts.length ? gifts.map(g => `<div class="gift-row ${worldOfGift(g) ? 'world-gift' : ''}"><div class="gift-ic">${Art.icon('gift')}</div><div class="gift-txt"><div>${rewardHtml(g)}</div>${giftNote(g) ? `<small>${giftNote(g)}</small>` : ''}</div>
      <button class="btn small primary" data-claim="${esc(g.code)}">${t('claim')}</button></div>`).join('') : `<p class="muted center">${t('no_gifts')}</p>`;
  function grant(r) {
    const D = user.data; D.coins += Number(r.coins) || 0; D.gems = (D.gems || 0) + (Number(r.gems) || 0);
    const giveShip = () => { if (r.ship && Art.SHIPS.some(s => s.id === r.ship) && !D.ships.includes(r.ship)) { D.ships.push(r.ship); D.skin = r.ship; save(); shipAnim(r.ship); if (current === 'menu') renderMenu(); return true; } };
    // a ship added on the server after the app loaded its ship list: load the list again, then give it
    if (r.ship && !Art.SHIPS.some(s => s.id === r.ship)) loadCatalog().then(giveShip); else giveShip();
    D.worlds = D.worlds || []; if (r.world && WORLDS.some(w => w.id === r.world) && !D.worlds.includes(r.world)) D.worlds.push(r.world);
    Sfx.init(); Sfx.coin(); save();
    document.querySelectorAll('[data-coins]').forEach(e => { e.innerHTML = walletHtml(D); });
    if (current === 'menu') $('#m-coins').innerHTML = walletHtml(D);
    if (current === 'shop') renderShop();
  }
  // a gift link from the website: it opens the app with a code, the code is redeemed for the signed-in player
  function giftFromUrl(url) {
    try {
      const u = new URL(url), code = (u.searchParams.get('code') || u.searchParams.get('gift') || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return;
      if (!url.startsWith('com.spaceship.game://gift') && !u.searchParams.get('gift') && !(u.protocol === 'https:' && /^\/gift\b/.test(u.pathname))) return;
      store.set('ss_pending_gift', code); setTimeout(claimLinkGift, 1500);
    } catch (e) { /* not a gift link */ }
  }
  async function claimLinkGift() {
    const code = store.get('ss_pending_gift', null); if (!code || !user || user.offline) return;
    store.set('ss_pending_gift', null);
    try { const r = await Net.redeemCoupon(user, code); gifts = gifts.filter(g => g.code.toUpperCase() !== String(r.code).toUpperCase()); grant(r); setTimeout(() => celebrate(r, t('link_gift_title')), 600); }
    catch (e) { toast(errText(e), 3500); }
  }
  async function clubFromUrl(url) {
    try {
      const u = new URL(url), code = (u.searchParams.get('code') || u.searchParams.get('club') || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
      store.set('ss_pending_club', code); setTimeout(claimClubLink, 1500);
    } catch (e) { /* not a club link */ }
  }
  async function claimClubLink() {
    const code = store.get('ss_pending_club', null); if (!code || !user || user.offline) return;
    store.set('ss_pending_club', null);
    try { const r = await Net.joinParty(user, null, code); toast(t('joined_party', { x: r.name }), 3500); Sfx.init(); Sfx.power && Sfx.power(); friendTab = 'parties'; show('friends'); loadParties(); }
    catch (e) { toast(errText(e), 4000); }
  }
  function openFromNotification(url) {
    let go = '', party = '';
    try { const u = new URL(url); go = u.searchParams.get('go') || ''; party = u.searchParams.get('party') || ''; } catch (e) {}
    const run = () => {
      if (!user || user.offline || current === 'register') return setTimeout(run, 800);
      if (game) return;
      if (go === 'friends' || go === 'parties' || go === 'chat') { friendTab = go === 'friends' ? 'friends' : 'parties'; show('friends'); }
      if (go === 'chat' && party) setTimeout(() => { if (parties.some(p => p.id === party)) openChat(party); }, 900);
    };
    setTimeout(run, 600);
  }
  async function openKeyFileUrl(url) {
    try {
      const r = await Cap.Filesystem.readFile({ path: url, encoding: 'utf8' }), text = String(r && r.data || '');
      if (!/SSK1\./.test(text)) return toast(t('key_bad'), 3500);
      setTimeout(() => keyLogin(text), 400);
    } catch (e) { console.warn('slk open', e); toast(t('key_bad'), 3500); }
  }
  const onOpenUrl = url => {
    if (!url) return;
    if (url.startsWith('com.spaceship.game://gift') || /^https:\/\/[^/]+\/gift\b/.test(url)) giftFromUrl(url);
    else if (url.startsWith('com.spaceship.game://club') || /^https:\/\/[^/]+\/club\b/.test(url)) clubFromUrl(url);
    else if (url.startsWith('com.spaceship.game://open') || /^https:\/\/[^/]+\/open\b/.test(url)) openFromNotification(url);
    else if (/^(file|content):/i.test(url) && Cap.Filesystem) openKeyFileUrl(url);
  };
  if (Cap.App) {
    Cap.App.addListener('appUrlOpen', ev => onOpenUrl(ev && ev.url));
    if (Cap.App.getLaunchUrl) Cap.App.getLaunchUrl().then(r => onOpenUrl(r && r.url)).catch(() => {});
  }
  if (/[?&]club=/.test(location.search)) { clubFromUrl(location.href); try { window.history.replaceState(null, '', location.pathname); } catch (e) {} }
  if (/[?&]gift=/.test(location.search)) { giftFromUrl(location.href); try { window.history.replaceState(null, '', location.pathname); } catch (e) {} }
  // a secret token typed in the login-key sign-in: its ship goes to the account that signs in
  async function claimSecretToken() {
    const tok = store.get('ss_secret_tok', null); if (!tok || !user || user.offline) return;
    try {
      const r = await Net.claimSecretToken(user, tok); store.set('ss_secret_tok', null);
      if (r && (r.ship || r.world)) {
        const D = user.data; D.worlds = D.worlds || [];
        if (r.ship && !D.ships.includes(r.ship)) { D.ships.push(r.ship); D.skin = r.ship; shipAnim(r.ship); }
        if (r.world && !D.worlds.includes(r.world)) D.worlds.push(r.world);
        save(); setTimeout(() => celebrate({ code: '🔑', ship: r.ship, world: r.world }, t('secret_token_title')), 900);
      }
    } catch (e) { console.warn('secret token', e); if (/not_found|used/.test(String(e.message))) store.set('ss_secret_tok', null); }
  }
  // the first time a player plays: a gift window with the WELCOME reward (it also stays in Codes & gifts)
  function welcomeGift() {
    const w = gifts.find(g => g.code.toUpperCase() === 'WELCOME'), flag = 'ss_welcome_' + (user && user.id);
    if (!w || store.get(flag, false) || current !== 'menu' || !$('#modal').classList.contains('hidden')) return;
    store.set(flag, true);
    Sfx.init(); Sfx.power();
    modal(`<div class="welcome-gift">${Art.icon('gift')}</div><h2>${t('welcome_gift_title')}</h2><p>${t('welcome_gift_body')}</p>
      <div class="welcome-rw">${rewardHtml(w)}</div>${w.note ? `<p class="muted small">${esc(w.note)}</p>` : ''}
      <div class="status" id="wg-st"></div>
      <button class="btn primary big" id="wg-go">${t('claim')}</button><button class="btn ghost" id="wg-x">${t('upd_later')}</button>`, m => {
      m.querySelector('#wg-x').onclick = closeModal;
      const go = m.querySelector('#wg-go'), st = m.querySelector('#wg-st');
      go.onclick = async () => {
        go.disabled = true;
        try { const r = await Net.redeemCoupon(user, w.code); gifts = gifts.filter(g => g !== w); grant(r); $('#m-gift-dot').classList.toggle('hidden', !gifts.length); celebrate(r); }
        catch (e) { go.disabled = false; st.className = 'status err'; st.textContent = errText(e); }
      };
    });
  }
  // celebration window after a code or gift is redeemed
  function celebrate(r, title) {
    Sfx.init(); Sfx.coin(); setTimeout(() => Sfx.power(), 180);
    const colors = ['#f43f5e', '#fde047', '#22d3ee', '#a855f7', '#4ade80', '#fb923c'];
    const confetti = Array.from({ length: 36 }, (_, i) => `<i style="left:${(i * 37) % 100}%;background:${colors[i % colors.length]};animation-delay:${(i % 9) * 0.07}s;--dx:${((i * 53) % 120) - 60}px;--rot:${(i * 97) % 720}deg"></i>`).join('');
    const welcome = String(r.code || '').toUpperCase() === 'WELCOME', wg = worldOfGift(r);
    modal(`<div class="confetti">${confetti}</div>
      <div class="cele-ic">${Art.icon('gift')}</div>
      <h2>${title ? esc(title) : welcome ? t('welcome_gift_title') : wg ? `${galIcons[wg - 1]} ${t('world_gift', { w: t('gal_' + wg) })}` : t('coupon_win_title')}</h2>
      ${welcome || wg ? '' : `<div class="cele-code" dir="ltr">${esc(r.code)}</div>`}
      <p>${t('coupon_win_body')}</p>
      <div class="welcome-rw cele-rw">${rewardHtml(r)}</div>
      <button class="btn primary big" id="ce-ok">${t('coupon_win_ok')}</button>`, m => { m.querySelector('#ce-ok').onclick = closeModal; });
  }
  function couponBox() {
    if (!user || user.offline) return toast(t('coupon_offline'));
    modal(`<h3 class="row center gap">${Art.icon('gift')} ${t('coupons')}</h3>
      <p class="muted">${t('coupon_sub')}</p>
      <div class="row coupon-in"><input id="cp-in" maxlength="32" dir="ltr" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="SPACE100"><button class="btn primary" id="cp-go">${t('redeem')}</button></div>
      <div id="cp-st" class="status"></div>
      <div class="sh-sec">${Art.icon('gift')} ${t('free_gifts')}</div>
      <div id="cp-gifts" class="gift-list">${giftList()}</div>
      <button class="btn ghost" id="cp-x">${t('close')}</button>`, m => {
      const inp = m.querySelector('#cp-in'), st = m.querySelector('#cp-st'), go = m.querySelector('#cp-go');
      m.querySelector('#cp-x').onclick = closeModal;
      const redeem = async (code, btn) => {
        if (!code) return;
        btn.disabled = true; st.className = 'status'; st.textContent = '';
        try {
          const r = await Net.redeemCoupon(user, code);
          gifts = gifts.filter(g => g.code.toUpperCase() !== String(r.code).toUpperCase());
          grant(r); $('#m-gift-dot').classList.toggle('hidden', !gifts.length);
          return celebrate(r);
        } catch (e) { st.className = 'status err'; st.textContent = errText(e); }
        btn.disabled = false;
        m.querySelector('#cp-gifts').innerHTML = giftList(); $('#m-gift-dot').classList.toggle('hidden', !gifts.length);
      };
      go.onclick = () => redeem(inp.value.trim(), go);
      inp.onkeydown = e => { if (e.key === 'Enter') go.click(); };
      m.querySelector('#cp-gifts').onclick = e => { const b = e.target.closest('[data-claim]'); if (b) redeem(b.dataset.claim, b); };
    });
    loadGifts(true);
  }
  $('#m-gift').addEventListener('click', () => { Sfx.init(); couponBox(); });
  // Choose: every ship you own (secret ones too) - picked from the main menu, not the shop
  function chooseShip() {
    const D = user.data;
    const draw = () => Art.SHIPS.filter(s => (D.ships || []).includes(s.id)).map(s =>
      `<button class="look-it ${s.secret ? 'secret' : ''} ${D.skin === s.id ? 'on' : ''}" data-pick="${s.id}"><img src="${Art.shipPreview(s.id, 120)}" alt=""><small>${s.secret ? '✦ ' : ''}${esc(t('ship_' + s.id))}</small>${starsOfShip(s.id) ? `<i class="mini-stars">${'★'.repeat(starsOfShip(s.id))}</i>` : ''}</button>`).join('');
    modal(`<h2>🚀 ${t('choose_tab')}</h2><p class="muted small">${t('choose_note')}</p><div class="look-grid choose-grid" id="ch-grid">${draw()}</div>
      <div id="ch-star">${starPanel(D.skin)}</div>
      <button class="btn ghost" id="ch-x">${t('close')}</button>`, m => {
      m.querySelector('#ch-x').onclick = closeModal;
      const bindStar = () => { const b = m.querySelector('#st-up'); if (b) b.onclick = async () => {
        const r = await payServer(b, () => Net.shipStar(user, D.skin)); if (!r) return;
        Sfx.init(); Sfx.power && Sfx.power(); toast(t('stars_got', { x: t('ship_' + D.skin), n: starsOfShip(D.skin) }));
        m.querySelector('#ch-grid').innerHTML = draw(); m.querySelector('#ch-star').innerHTML = starPanel(D.skin); icons(m); bindStar(); }; };
      bindStar();
      m.querySelector('#ch-grid').onclick = e => {
        const b = e.target.closest('[data-pick]'); if (!b || D.skin === b.dataset.pick) return;
        D.skin = b.dataset.pick; save(); Sfx.init(); Sfx.power && Sfx.power(); renderMenu();
        m.querySelectorAll('[data-pick]').forEach(x => x.classList.toggle('on', x === b)); toast(t('ship_' + D.skin));
        m.querySelector('#ch-star').innerHTML = starPanel(D.skin); icons(m); bindStar();
      };
    });
  }
  $('#m-choose').addEventListener('click', chooseShip);

  // ---------- Workshop: build your own ship (1,000 coins + 100 diamonds on the server; repainting is free) ----------
  const customCache = store.get('ss_custom', {});   // id -> { name, spec }: built ships seen so far (yours and friends')
  Object.entries(customCache).forEach(([id, r]) => { Art.addCustom(id, r.spec, r.name); I18N.add('ship_' + id, { en: r.name }); });
  function registerCustom(rows) {
    (rows || []).forEach(r => { if (!r || !r.id) return; Art.addCustom(r.id, r.spec, r.name); I18N.add('ship_' + r.id, { en: r.name }); customCache[r.id] = { name: r.name, spec: r.spec }; });
    store.set('ss_custom', customCache);
  }
  // ships other players built are fetched the first time they are drawn
  const customWanted = new Set(); let customT = null;
  function ensureCustom(ids) {
    const need = ids.filter(id => id && id.startsWith('c-') && !customCache[id]);
    if (!need.length) return Promise.resolve();
    return Net.customGet(need).then(registerCustom).catch(() => {});
  }
  Art.onUnknown = id => {
    if (customWanted.has(id)) return; customWanted.add(id);
    clearTimeout(customT); customT = setTimeout(() => { const ids = [...customWanted].filter(x => !customCache[x]); if (ids.length) ensureCustom(ids).then(() => { if (current === 'menu') renderMenu(); }); }, 250);
  };
  async function loadMyCustom() {
    if (!user || user.offline) return;
    try { const r = await Net.customMine(user); CUSTOM_PRICE = { coins: +r.coins, gems: +r.gems, max: +r.max }; registerCustom(r.ships); if (current === 'menu') renderMenu(); } catch (e) { console.warn('workshop', e); }
  }
  const randHex = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
  const newSpec = () => ({ shape: 'arrow', body: '#e0f2fe', accent: '#7c3aed', glow: '#22d3ee', aura: 'pulse', fx: null, gun: 'laser', mirror: true, stickers: [{ k: 'star', x: 0, y: 18, s: 14, r: 0, c: '#fde047' }] });

  function shrinkImage(file, max) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type)) return rej(new Error('type'));
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); URL.revokeObjectURL(url);
        let d = c.toDataURL('image/webp', 0.8); if (!/^data:image\/webp/.test(d)) d = c.toDataURL('image/png');
        if (d.length > 80000) d = c.toDataURL('image/jpeg', 0.7);
        d.length > 80000 ? rej(new Error('big')) : res(d);
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad')); };
      im.src = url;
    });
  }
  function workshop() {
    if (!user || user.offline) return toast(t('ws_online'));
    const D = user.data;
    const mine = () => Art.SHIPS.filter(s => s.custom && (D.ships || []).includes(s.id));
    const can = D.coins >= CUSTOM_PRICE.coins && (D.gems || 0) >= CUSTOM_PRICE.gems;
    const list = mine().map(s => `<div class="ws-card ${D.skin === s.id ? 'on' : ''}"><img src="${Art.shipPreview(s.id, 120)}" alt=""><b>${esc(s.name || '')}</b>
        <div class="row center"><button class="btn small" data-ws-edit="${s.id}">${Art.icon('wrench')}${t('ws_edit')}</button>${D.skin === s.id ? `<button class="btn small" disabled>${t('in_use')}</button>` : `<button class="btn small primary" data-ws-use="${s.id}">${t('use')}</button>`}</div></div>`).join('');
    modal(`<h2>${Art.icon('wrench')} ${t('workshop')}</h2><p class="muted small">${t('ws_intro')}</p>
      <div class="ws-list">${list}<button class="ws-card ws-new" id="ws-new" ${mine().length >= CUSTOM_PRICE.max ? 'disabled' : ''}><span class="ws-plus">+</span><b>${t('ws_new')}</b>
        <span class="ws-price">${coinHtml(CUSTOM_PRICE.coins)} + ${gemHtml(CUSTOM_PRICE.gems)}</span>${can ? '' : `<small class="muted">${t('ws_need', { c: CUSTOM_PRICE.coins.toLocaleString(), g: CUSTOM_PRICE.gems })}</small>`}</button></div>
      <button class="btn" id="ws-rare">✨ ${t('rare_title')} <span class="muted">${ownedRare().length}/${Art.RARE_STICKERS.length}</span></button>
      <button class="btn ghost" id="ws-x">${t('close')}</button>`, m => {
      m.querySelector('#ws-x').onclick = closeModal;
      m.querySelector('#ws-rare').onclick = stickerShop;
      m.querySelector('#ws-new').onclick = () => editor(null);
      m.querySelector('.ws-list').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.wsEdit) editor(b.dataset.wsEdit);
        if (b.dataset.wsUse) { D.skin = b.dataset.wsUse; save(); renderMenu(); Sfx.init(); Sfx.power && Sfx.power(); workshop(); }
      });
    });
  }

  // the editor: a live preview, tap the ship to place the chosen sticker
  function editor(id) {
    const D = user.data, orig = id && Art.SHIPS.find(s => s.id === id);
    const spec = JSON.parse(JSON.stringify(orig ? orig.spec : newSpec()));
    let name = orig ? orig.name : t('ws_default_name'), sel = spec.stickers.length ? 0 : -1, tab = 'shape', raf = 0;
    const PY = 280, PS = 118;   // where the ship sits in the preview, and its half size (the shots fly above it)
    const PREV = '__ws';
    const chips = (arr, cur, attr, label) => arr.map(v => `<button class="chip ${cur === v ? 'on' : ''}" data-${attr}="${v ?? ''}">${label(v)}</button>`).join('');
    const shapeImgs = {}; Art.CUSTOM_SHAPES.forEach(sh => { Art.addCustom(PREV, Object.assign({}, spec, { shape: sh, stickers: [], aura: null, fx: null })); shapeImgs[sh] = Art.shipPreview(PREV, 64); });
    const stIcon = k => k === 'text' ? '<b>Aa</b>' : `<img src="${stickerImg(k)}" alt="">`;
    function stickerImg(k) {
      const c = document.createElement('canvas'); c.width = c.height = 40; const x = c.getContext('2d'); x.translate(20, 20);
      Art.addCustom('__st', { shape: 'arrow', stickers: [{ k, x: 0, y: 0, s: 34, r: 0, c: '#ffffff' }] }); const s = Art.SHIPS.find(q => q.id === '__st');
      Art.drawDesign(x, s.design, 50); return c.toDataURL();
    }
    const paneHtml = () => {
      if (tab === 'shape') return `<div class="ws-shapes">${Art.CUSTOM_SHAPES.map(sh => `<button class="look-it ${spec.shape === sh ? 'on' : ''}" data-shape="${sh}"><img src="${shapeImgs[sh]}" alt=""></button>`).join('')}</div>`;
      if (tab === 'colors') return `<div class="ws-colors">${['body', 'accent', 'glow'].map(k => `<label class="ws-col"><input type="color" data-col="${k}" value="${spec[k]}"><span>${t('ws_' + k)}</span></label>`).join('')}
        <button class="chip" id="ws-rand">🎲 ${t('ws_random')}</button></div>`;
      if (tab === 'fx') return `<div class="lbl">${t('ws_effect')}</div><div class="row wrap">${chips([null, ...Art.CUSTOM_FX], spec.fx, 'fx', v => v ? t('ws_fx_' + v) : t('ws_none'))}</div>
        <div class="lbl">${t('ws_aura')}</div><div class="row wrap">${chips([null, ...Art.CUSTOM_AURAS], spec.aura, 'aura', v => v ? t('ws_au_' + v) : t('ws_none'))}</div>`;
      if (tab === 'gun') return `<div class="row wrap">${chips(Art.CUSTOM_GUNS, spec.gun, 'gun', v => t('ws_gun_' + v))}</div><p class="muted small">${t('ws_gun_note')}</p>`;
      const st = spec.stickers[sel];
      return `<div class="ws-stk">${Art.STICKER_KINDS.map(k => `<button class="look-it" data-add="${k}" ${spec.stickers.length >= 10 ? 'disabled' : ''}>${stIcon(k)}</button>`).join('')}</div>
        <div class="lbl">✨ ${t('rare_title')}</div><div class="ws-stk rare-row">${Art.RARE_STICKERS.map(k => ownedRare().includes(k)
          ? `<button class="look-it rare-on" data-add="${k}" ${spec.stickers.length >= 10 ? 'disabled' : ''}>${stIcon(k)}</button>`
          : `<button class="look-it locked" disabled title="${esc(t('rare_locked'))}">🔒</button>`).join('')}</div>
        <div class="row wrap center"><button class="btn small" id="ws-gal" ${spec.stickers.length >= 10 || spec.stickers.filter(q => q.k === 'img').length >= 2 ? 'disabled' : ''}>📷 ${t('ws_gallery')}</button>
          <input type="file" id="ws-file" accept="image/*" hidden></div>
        <label class="ws-check"><input type="checkbox" id="ws-mirror" ${spec.mirror ? 'checked' : ''}> ${t('ws_mirror')}</label>
        ${spec.stickers.length ? `<div class="row wrap ws-mine">${spec.stickers.map((s, i) => `<span class="chip st-chip ${i === sel ? 'on' : ''}"><button data-sel="${i}">${i + 1}. ${s.k === 'text' ? esc(s.t || 'Aa') : s.k === 'img' ? '📷' : t('ws_st_' + s.k)}</button><button class="st-x" data-rm="${i}" aria-label="${esc(t('ws_remove'))}">✕</button></span>`).join('')}</div>` : ''}
        ${st ? `<div class="ws-edit">
          ${st.k === 'text' ? `<input class="input" id="ws-txt" maxlength="4" value="${esc(st.t || '')}" placeholder="${t('ws_text')}">` : ''}
          <div class="ws-size"><span>${t('ws_size')}</span><div class="ws-size-row" dir="ltr"><button class="icon-btn" data-sz="-4">−</button><input type="range" min="4" max="50" data-p="s" value="${st.s}"><button class="icon-btn" data-sz="4">+</button></div></div>
          <div class="row center ws-nudge" dir="ltr"><button class="icon-btn" data-mv="-1,0">◀</button><button class="icon-btn" data-mv="0,-1">▲</button><button class="icon-btn" data-mv="0,1">▼</button><button class="icon-btn" data-mv="1,0">▶</button></div>
          <div class="ws-size"><span>${t('ws_rotate')}</span><div class="ws-size-row" dir="ltr"><button class="icon-btn" data-rot="-15">↺</button><input type="range" min="-180" max="180" data-p="r" value="${st.r}"><button class="icon-btn" data-rot="15">↻</button></div></div>
          <div class="row">${st.k === 'img' ? '' : `<input type="color" data-p="c" value="${st.c}">`}<span class="muted small">${t('ws_drag_hint')}</span><button class="btn small danger" id="ws-del">${Art.icon('x')}${t('ws_remove')}</button></div></div>` : `<p class="muted small">${t('ws_add_hint')}</p>`}`;
    };
    const refresh = () => Art.addCustom(PREV, spec, name);
    const can = () => D.coins >= CUSTOM_PRICE.coins && (D.gems || 0) >= CUSTOM_PRICE.gems;
    modal(`<h2>${Art.icon('wrench')} ${orig ? t('ws_edit') : t('ws_new')}</h2>
      <canvas id="ws-cv" class="ws-cv" width="440" height="440"></canvas>
      <input class="input" id="ws-name" maxlength="20" value="${esc(name)}" placeholder="${t('ws_name')}">
      <div class="look-tabs ws-tabs">${['shape', 'colors', 'fx', 'gun', 'stickers'].map(k => `<button class="chip ${k === tab ? 'on' : ''}" data-tab="${k}">${t('ws_tab_' + k)}</button>`).join('')}</div>
      <div id="ws-pane" class="ws-pane"></div>
      ${orig ? `<button class="btn primary big" id="ws-go">${t('ws_save')}</button>`
        : `<button class="btn gold big dual" id="ws-go" ${can() ? '' : 'disabled'}>${t('ws_build')} · ${coinHtml(CUSTOM_PRICE.coins)} + ${gemHtml(CUSTOM_PRICE.gems)}</button>
           ${can() ? '' : `<p class="muted small">${t('ws_need', { c: CUSTOM_PRICE.coins.toLocaleString(), g: CUSTOM_PRICE.gems })}</p>`}`}
      <button class="btn ghost" id="ws-back">${t('ws_back')}</button>`, m => {
      const cv = m.querySelector('#ws-cv'), cx = cv.getContext('2d'), pane = m.querySelector('#ws-pane');
      refresh();
      const loop = () => {
        if (!document.body.contains(cv)) return cancelAnimationFrame(raf);
        const now = performance.now() / 1000, k = Art.SHIPS.find(q => q.id === PREV);
        cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, 440, 440); cx.translate(220, PY);
        // the shots, as they look in the game (three streams, like a built ship fires)
        if (k && window.SSGame && SSGame.drawShot) { cx.save(); cx.scale(2.4, 2.4); cx.globalCompositeOperation = 'lighter';
          for (let i = 0; i < 4; i++) { const a = (now * 1.6 + i / 4) % 1, y = -PS / 2.4 - 6 - a * 95;
            for (const [dx, va] of [[0, 0], [-12, -0.3], [12, 0.3]]) { const yy = dx ? y + 6 : y; SSGame.drawShot(cx, { x: dx + Math.sin(va) * a * 60, y: yy, vx: Math.sin(va) * 820, vy: -Math.cos(va) * 820 }, k, now, true); } }
          cx.restore(); }
        Art.drawShip(cx, PREV, PS, now, 0.8); raf = requestAnimationFrame(loop);
      };
      loop();
      const draw = () => { pane.innerHTML = paneHtml(); icons(pane); };
      draw();
      m.querySelector('.ws-tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; m.querySelectorAll('.ws-tabs .chip').forEach(x => x.classList.toggle('on', x === b)); draw(); };
      m.querySelector('#ws-name').oninput = e => { name = e.target.value; };
      // tap the preview to move the chosen sticker there (ship units -50..50 = 140px half size)
      // on the preview: tap a sticker to pick it, drag it to move it, pinch (or the mouse wheel) to make it bigger or smaller
      const toShip = e => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width * 440 - 220) / PS * 50, y: ((e.clientY - r.top) / r.height * 440 - PY) / PS * 50 }; };
      const lim = v => Math.round(Math.max(-45, Math.min(45, v)));
      const syncSliders = () => { const st = spec.stickers[sel]; if (!st) return; const sz = pane.querySelector('[data-p="s"]'), ro = pane.querySelector('[data-p="r"]'); if (sz) sz.value = st.s; if (ro) ro.value = st.r || 0; };
      const ptrs = new Map(); let grab = null, pinch = null;
      const goStickers = () => { if (tab !== 'stickers') { tab = 'stickers'; m.querySelectorAll('.ws-tabs .chip').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); draw(); } };
      cv.addEventListener('pointerdown', e => {
        e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
        ptrs.set(e.pointerId, toShip(e));
        if (ptrs.size === 2) {   // a second finger: pinch to resize the chosen sticker
          const st = spec.stickers[sel]; if (!st) return;
          const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s: st.s, a: Math.atan2(b.y - a.y, b.x - a.x), r: st.r || 0 }; grab = null; return;
        }
        const q = toShip(e);
        // the sticker under the finger (the mirrored copy counts too); otherwise the chosen one jumps here
        let hit = -1, best = 1e9;
        spec.stickers.forEach((st, i) => { for (const sx of spec.mirror ? [st.x, -st.x] : [st.x]) { const d = Math.hypot(q.x - sx, q.y - st.y); if (d < Math.max(8, st.s * 0.6) && d < best) { best = d; hit = i; } } });
        if (hit >= 0) { if (hit !== sel) { sel = hit; goStickers(); draw(); } const st = spec.stickers[sel]; const mx = spec.mirror && Math.abs(q.x + st.x) < Math.abs(q.x - st.x) ? -1 : 1; grab = { dx: q.x - st.x * mx, dy: q.y - st.y, mx }; return; }
        const st = spec.stickers[sel]; if (!st) { goStickers(); return; }
        st.x = lim(q.x); st.y = lim(q.y); grab = { dx: 0, dy: 0, mx: 1 }; refresh();
      });
      cv.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, toShip(e));
        const st = spec.stickers[sel]; if (!st) return;
        if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; st.s = Math.round(Math.max(4, Math.min(50, pinch.s * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)));
          // turning the two fingers turns the sticker
          let r = pinch.r + (Math.atan2(b.y - a.y, b.x - a.x) - pinch.a) * 180 / Math.PI; r = ((r + 540) % 360) - 180; st.r = Math.round(r); syncSliders(); refresh(); return; }
        if (grab) { const q = toShip(e); st.x = lim((q.x - grab.dx) * grab.mx); st.y = lim(q.y - grab.dy); refresh(); }
      });
      const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) grab = null; };
      cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      cv.addEventListener('wheel', e => { const st = spec.stickers[sel]; if (!st) return; e.preventDefault(); st.s = Math.max(4, Math.min(50, st.s + (e.deltaY < 0 ? 2 : -2))); syncSliders(); refresh(); }, { passive: false });
      // a picture from the gallery becomes a sticker (made small on the phone first: up to 128 px)
      pane.addEventListener('change', async e => {
        if (e.target.id !== 'ws-file' || !e.target.files || !e.target.files[0]) return;
        try {
          const d = await shrinkImage(e.target.files[0], 128);
          spec.stickers.push({ k: 'img', d, x: 0, y: 0, s: 30, r: 0, c: '#ffffff' }); sel = spec.stickers.length - 1; refresh(); draw();
        } catch (err) { toast(t('ws_img_bad')); }
      });
      pane.addEventListener('input', e => {
        const el = e.target, st = spec.stickers[sel];
        if (el.dataset.col) spec[el.dataset.col] = el.value;
        else if (el.id === 'ws-mirror') spec.mirror = el.checked;
        else if (el.id === 'ws-txt' && st) st.t = el.value.replace(/[<>&"\\]/g, '').slice(0, 4);
        if (el.id === 'ws-txt') { const ch = pane.querySelector(`[data-sel="${sel}"]`); if (ch) ch.textContent = `${sel + 1}. ${st.t || 'Aa'}`; }
        else if (el.dataset.p && st) st[el.dataset.p] = el.type === 'range' ? +el.value : el.value;
        refresh();
      });
      pane.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || b.disabled) return;
        if (b.dataset.shape) spec.shape = b.dataset.shape;
        else if (b.id === 'ws-rand') { spec.body = randHex(); spec.accent = randHex(); spec.glow = randHex(); }
        else if ('fx' in b.dataset) spec.fx = b.dataset.fx || null;
        else if ('aura' in b.dataset) spec.aura = b.dataset.aura || null;
        else if (b.dataset.gun) spec.gun = b.dataset.gun;
        else if (b.dataset.add) { spec.stickers.push({ k: b.dataset.add, x: 0, y: 0, s: b.dataset.add === 'stripe' ? 24 : 14, r: 0, c: '#ffffff', t: b.dataset.add === 'text' ? 'GG' : undefined }); sel = spec.stickers.length - 1; }
        else if (b.dataset.sel) sel = +b.dataset.sel;
        else if (b.id === 'ws-del') { spec.stickers.splice(sel, 1); sel = Math.min(sel, spec.stickers.length - 1); }
        else if (b.dataset.sz && spec.stickers[sel]) { const st = spec.stickers[sel]; st.s = Math.max(4, Math.min(50, st.s + +b.dataset.sz)); syncSliders(); refresh(); return; }
        else if (b.dataset.rot && spec.stickers[sel]) { const st = spec.stickers[sel]; st.r = ((st.r + +b.dataset.rot + 540) % 360) - 180; syncSliders(); refresh(); return; }
        else if (b.dataset.mv && spec.stickers[sel]) { const st = spec.stickers[sel], [dx, dy] = b.dataset.mv.split(',').map(Number); st.x = lim(st.x + dx * 3); st.y = lim(st.y + dy * 3); refresh(); return; }
        else if (b.dataset.rm) { const i = +b.dataset.rm; spec.stickers.splice(i, 1); if (sel >= i) sel = Math.max(spec.stickers.length ? 0 : -1, sel - 1); }
        else if (b.id === 'ws-gal') { pane.querySelector('#ws-file').click(); return; }
        else return;
        refresh(); draw();
      });
      m.querySelector('#ws-back').onclick = () => { cancelAnimationFrame(raf); workshop(); };
      m.querySelector('#ws-go').onclick = async e => {
        const btn = e.currentTarget; btn.disabled = true;
        try {
          if (orig) {
            const r = await Net.customUpdate(user, orig.id, name, spec); registerCustom([r]);
            toast(t('ws_saved')); cancelAnimationFrame(raf); renderMenu(); return workshop();
          }
          await Net.save(user, D, D.best).catch(() => {});   // coins earned a moment ago reach the server first
          const r = await Net.customCreate(user, name, spec);
          ['coins', 'gems', 'ships'].forEach(k => { if (r[k] != null) D[k] = r[k]; }); D.skin = r.skin;
          registerCustom([r.ship]); save(); renderMenu(); cancelAnimationFrame(raf); closeModal();
          Sfx.init(); Sfx.coin(); toast(t('ws_built', { x: r.ship.name })); shipAnim(r.ship.id);
        } catch (err) { btn.disabled = false; toast(errText(err)); }
      };
    });
  }
  $('#m-workshop').addEventListener('click', () => { Sfx.init(); workshop(); });

  // ---------- more ways to use coins and diamonds (prices: shop_catalog().extras on the server) ----------
  // a server answer replaces the local numbers it carries
  function applyServer(r) { const D = user.data; ['coins', 'gems', 'stickers', 'stars', 'wheel_day', 'ships', 'skin'].forEach(k => { if (r && r[k] != null) D[k] = r[k]; }); save(); if (current === 'menu') renderMenu(); }
  async function payServer(btn, fn) {
    if (!user || user.offline) { toast(t('ws_online')); return null; }
    if (btn) btn.disabled = true;
    try { await Net.save(user, user.data, user.data.best).catch(() => {}); const r = await fn(); applyServer(r); return r; }
    catch (e) { toast(errText(e)); if (btn) btn.disabled = false; return null; }
  }
  const costHtml = (c, g) => [c ? coinHtml(c) : '', g ? gemHtml(g) : ''].filter(Boolean).join(' + ');

  // ----- Daily wheel: a free spin every day, more spins for diamonds -----
  const WHEEL = [{ c: 50, col: '#1e3a8a' }, { c: 100, col: '#6d28d9' }, { c: 250, col: '#be185d' }, { c: 500, col: '#b45309' }, { g: 1, col: '#0e7490' }, { g: 3, col: '#047857' }, { g: 10, col: '#7c2d12' }, { s: 1, col: '#4c1d95' }];
  function utcDay() { return new Date().toISOString().slice(0, 10); }
  function wheelFree() { return !!(user && !user.offline && user.data && user.data.wheel_day !== utcDay()); }
  function drawWheel(cv, rot) {
    const x = cv.getContext('2d'), R = cv.width / 2, n = WHEEL.length, a = Math.PI * 2 / n;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height); x.translate(R, R); x.rotate(rot);
    WHEEL.forEach((s, i) => {
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R - 6, -Math.PI / 2 + i * a - a / 2, -Math.PI / 2 + i * a + a / 2); x.closePath();
      x.fillStyle = s.col; x.fill(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; x.stroke();
      x.save(); x.rotate(i * a); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff'; x.font = `900 ${R * 0.13}px system-ui, sans-serif`;
      const ty = -R * 0.62;
      if (s.s) { x.fillStyle = '#fde047'; x.fillText('★?', 0, ty); }
      else {
        x.fillText(String(s.c || s.g), 0, ty);
        if (s.c) { x.fillStyle = '#facc15'; x.beginPath(); x.arc(0, ty + R * 0.16, R * 0.05, 0, 7); x.fill(); }
        else { x.fillStyle = '#67e8f9'; x.beginPath(); x.moveTo(0, ty + R * 0.1); x.lineTo(R * 0.05, ty + R * 0.16); x.lineTo(0, ty + R * 0.23); x.lineTo(-R * 0.05, ty + R * 0.16); x.closePath(); x.fill(); }
      }
      x.restore();
    });
    x.beginPath(); x.arc(0, 0, R * 0.12, 0, 7); x.fillStyle = '#fde047'; x.fill(); x.strokeStyle = '#a16207'; x.lineWidth = 3; x.stroke();
    x.setTransform(1, 0, 0, 1, 0, 0); x.translate(R, 0);   // the pointer at the top
    x.beginPath(); x.moveTo(-R * 0.08, 2); x.lineTo(R * 0.08, 2); x.lineTo(0, R * 0.16); x.closePath(); x.fillStyle = '#f8fafc'; x.fill(); x.strokeStyle = '#0f172a'; x.lineWidth = 2; x.stroke();
  }
  function prizeText(p) {
    if (!p) return '';
    if (p.sticker) return t('rare_got', { x: t('ws_st_' + p.sticker) });
    return '+' + (p.coins ? coinHtml(p.coins) : gemHtml(p.gems));
  }
  function wheelBox() {
    if (!user || user.offline) return toast(t('ws_online'));
    let rot = 0, busy = false;
    const btnHtml = () => wheelFree() ? `<button class="btn gold big" id="wh-go">🎡 ${t('wheel_free')}</button>`
      : `<button class="btn primary big dual" id="wh-go" ${(user.data.gems || 0) < EXTRAS.wheel_gems ? 'disabled' : ''}>${t('wheel_again')} · ${gemHtml(EXTRAS.wheel_gems)}</button><p class="muted small">${t('wheel_tomorrow')}</p>`;
    modal(`<h2>🎡 ${t('wheel')}</h2><p class="muted small">${t('wheel_sub')}</p><canvas id="wh-cv" class="wh-cv" width="560" height="560"></canvas>
      <div id="wh-out" class="wh-out"></div><div id="wh-btn">${btnHtml()}</div><button class="btn ghost" id="wh-x">${t('close')}</button>`, m => {
      const cv = m.querySelector('#wh-cv'); drawWheel(cv, rot);
      m.querySelector('#wh-x').onclick = () => { if (!busy) closeModal(); };
      const bind = () => { const b = m.querySelector('#wh-go'); if (b) b.onclick = spin; };
      async function spin(e) {
        if (busy) return; busy = true; const b = e.currentTarget; b.disabled = true; m.querySelector('#wh-out').innerHTML = '';
        const paid = !wheelFree();
        try {
          await Net.save(user, user.data, user.data.best).catch(() => {});
          const r = await Net.wheelSpin(user, paid);
          Sfx.init(); const n = WHEEL.length, a = Math.PI * 2 / n;
          const from = rot, to = Math.ceil(rot / (Math.PI * 2)) * Math.PI * 2 + Math.PI * 2 * 5 - r.slot * a + (Math.random() - 0.5) * a * 0.6;
          const t0 = performance.now(), dur = 3600; let lastTick = 0;
          await new Promise(res => { const step = now => { const k = Math.min(1, (now - t0) / dur), e2 = 1 - Math.pow(1 - k, 4); rot = from + (to - from) * e2; drawWheel(cv, rot);
            const tick = Math.floor(rot / a); if (tick !== lastTick) { lastTick = tick; Sfx.coin && settings.sound && k < 0.9 && Sfx.coin(); }
            if (k < 1 && document.body.contains(cv)) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
          applyServer(r); Sfx.power && Sfx.power();
          m.querySelector('#wh-out').innerHTML = `<div class="reward">${prizeText(r.prize)}</div>`;
        } catch (err) { toast(errText(err)); }
        busy = false; m.querySelector('#wh-btn').innerHTML = btnHtml(); icons(m); bind(); updateWheelDot();
      }
      bind();
    });
  }
  function updateWheelDot() { const d = $('#m-wheel-dot'); if (d) d.classList.toggle('hidden', !wheelFree()); }
  $('#m-wheel').addEventListener('click', () => { Sfx.init(); wheelBox(); });

  // ----- Ship stars: up to 3 per ship (+6% damage each, gold stars circle the ship) -----
  const starsOfShip = id => Math.min(3, ((user.data.stars || {})[id]) || 0);
  const starRow = n => [1, 2, 3].map(i => `<span class="st ${i <= n ? 'on' : ''}">★</span>`).join('');
  function starPanel(id) {
    const n = starsOfShip(id), D = user.data;
    if (n >= 3) return `<div class="star-panel"><b>${esc(t('ship_' + id))}</b><div class="stars-big">${starRow(3)}</div><span class="muted small">${t('stars_max')}</span></div>`;
    const c = EXTRAS.star_coins[n], g = EXTRAS.star_gems[n], ok = D.coins >= c && (D.gems || 0) >= g;
    return `<div class="star-panel"><b>${esc(t('ship_' + id))}</b><div class="stars-big">${starRow(n)}</div><span class="muted small">${t('stars_sub')}</span>
      <button class="btn gold dual" id="st-up" ${ok && !user.offline ? '' : 'disabled'}>★ ${t('stars_up')} · ${costHtml(c, g)}</button></div>`;
  }

  // ----- Rare stickers for the Workshop: a pack gives one you don't have yet -----
  const ownedRare = () => user.data.stickers || [];
  function stickerShop() {
    const D = user.data, all = Art.RARE_STICKERS, own = ownedRare(), left = all.filter(k => !own.includes(k));
    modal(`<h2>✨ ${t('rare_title')}</h2><p class="muted small">${t('rare_sub')}</p>
      <div class="rare-grid">${all.map(k => `<div class="rare ${own.includes(k) ? 'on' : ''}"><img src="${rareImg(k)}" alt=""><small>${own.includes(k) ? esc(t('ws_st_' + k)) : '🔒'}</small></div>`).join('')}</div>
      <div id="rs-out"></div>
      ${left.length ? `<button class="btn gold big dual" id="rs-go" ${(D.gems || 0) < EXTRAS.pack_gems ? 'disabled' : ''}>🎁 ${t('rare_open')} · ${gemHtml(EXTRAS.pack_gems)}</button>` : `<p class="muted">${t('rare_all')}</p>`}
      <button class="btn ghost" id="rs-x">${t('ws_back')}</button>`, m => {
      m.querySelector('#rs-x').onclick = () => workshop();
      const go = m.querySelector('#rs-go');
      if (go) go.onclick = async () => {
        const r = await payServer(go, () => Net.stickerPack(user)); if (!r) return;
        Sfx.init(); Sfx.power && Sfx.power(); stickerShop();
        $('#rs-out').innerHTML = `<div class="rare-new"><img src="${rareImg(r.sticker)}" alt=""><b>${t('rare_got', { x: t('ws_st_' + r.sticker) })}</b></div>`;
      };
    });
  }
  function rareImg(k) {
    const c = document.createElement('canvas'); c.width = c.height = 80; const x = c.getContext('2d'); x.translate(40, 40);
    Art.addCustom('__st', { shape: 'arrow', stickers: [{ k, x: 0, y: 0, s: 34, r: 0, c: '#fde047' }] });
    Art.drawDesign(x, Art.SHIPS.find(q => q.id === '__st').design, 100); return c.toDataURL();
  }

  // ----- Club treasury: members give coins, the club levels up, everyone earns more -----
  let clubLevel = store.get('ss_club_lv', 0);
  async function loadClubLevel() {
    if (!user || user.offline || !parties[0]) { clubLevel = 0; store.set('ss_club_lv', 0); return; }
    try { const r = await Net.clubTreasury(user, parties[0].id); clubLevel = r.level || 0; store.set('ss_club_lv', clubLevel); } catch (e) {}
  }
  async function treasuryBox(party) {
    const p = parties.find(x => x.id === party); if (!p) return;
    modal(`<div class="empty">${t('loading')}</div>`);
    let r; try { r = await Net.clubTreasury(user, party); } catch (e) { closeModal(); return toast(errText(e)); }
    clubLevel = r.level || 0; store.set('ss_club_lv', clubLevel);
    const max = (r.levels || []).length, prev = r.level ? r.levels[r.level - 1] : 0;
    const pct = r.next ? Math.round((r.treasury - prev) / (r.next - prev) * 100) : 100;
    modal(`<h2>💰 ${t('treasury')}</h2><div class="muted">${esc(p.name)}</div>
      <div class="tr-level"><span class="tr-badge">${t('club_level', { n: r.level })}</span><span class="muted small">${t('club_bonus', { n: r.level * 2 })}</span></div>
      <div class="sec-bar"><i style="width:${pct}%"></i></div>
      <div class="muted small" dir="ltr">${coinHtml(r.treasury)}${r.next ? ' / ' + Number(r.next).toLocaleString() : ' · ' + t('club_max')}</div>
      <p class="muted small">${t('treasury_sub', { m: max, n: max * 2 })}</p>
      <div class="lbl">${t('donate')}</div>
      <div class="row wrap center">${[100, 500, 1000, 5000].map(v => `<button class="chip" data-amt="${v}" ${user.data.coins < v ? 'disabled' : ''}>${coinHtml(v)}</button>`).join('')}</div>
      <div class="row center"><input class="input" id="tr-n" type="number" min="10" step="10" value="${Math.min(500, Math.max(10, Math.floor(user.data.coins / 10) * 10))}" style="max-width:140px"><button class="btn gold" id="tr-go">${t('donate')}</button></div>
      <div class="muted small">${t('donated_you', { n: Number(r.mine).toLocaleString() })}</div>
      ${r.top && r.top.length ? `<div class="lbl">${t('top_donors')}</div><div class="list tr-top">${r.top.map((d, i) => `<div class="person"><b class="tr-rank">${i + 1}</b><div class="avatar">${Art.avatar(d.avatar)}</div><div class="info"><b>${esc(d.name)}</b><small dir="ltr">@${esc(d.handle)}</small></div><span class="wal">${coinHtml(d.total)}</span></div>`).join('')}</div>` : ''}
      <button class="btn ghost" id="tr-x">${t('close')}</button>`, m => {
      m.querySelector('#tr-x').onclick = () => { closeModal(); renderParties(); };
      m.querySelectorAll('[data-amt]').forEach(b => b.onclick = () => { m.querySelector('#tr-n').value = b.dataset.amt; });
      m.querySelector('#tr-go').onclick = async e => {
        const v = Math.floor(+m.querySelector('#tr-n').value || 0); if (v < 10) return toast(t('e_bad_amount'));
        const res = await payServer(e.currentTarget, () => Net.clubDonate(user, party, v)); if (!res) return;
        Sfx.init(); Sfx.coin(); toast(t('donated', { n: v.toLocaleString() })); treasuryBox(party);
      };
    });
  }

  // ----- Paid revive: when the ship falls, keep going for coins or diamonds -----
  function askRevive(g) {
    const n = g.revives, D = user.data;
    if (n >= EXTRAS.revive_coins.length) return g.noRevive();
    const c = EXTRAS.revive_coins[n], gm = EXTRAS.revive_gems[n];
    let left = 8, timer = null;
    const end = yes => { clearInterval(timer); closeModal(); yes ? g.revive() : g.noRevive(); };
    modal(`<div class="rv"><div class="rv-ring"><span id="rv-n">${left}</span></div><h2>${t('revive_q')}</h2><p class="muted small">${t('revive_sub')}</p>
      <button class="btn gold big" id="rv-c" ${D.coins < c ? 'disabled' : ''}>${coinHtml(c)}</button>
      <button class="btn primary big" id="rv-g" ${(D.gems || 0) < gm ? 'disabled' : ''}>${gemHtml(gm)}</button>
      <button class="btn ghost" id="rv-no">${t('revive_no')}</button></div>`, m => {
      timer = setInterval(() => { left--; const e = m.querySelector('#rv-n'); if (e) e.textContent = left; if (left <= 0) end(false); }, 1000);
      m.querySelector('#rv-c').onclick = () => { if (D.coins < c) return; D.coins -= c; save(); Sfx.init(); Sfx.coin(); end(true); };
      m.querySelector('#rv-g').onclick = () => { if ((D.gems || 0) < gm) return; D.gems -= gm; save(); Sfx.init(); Sfx.power && Sfx.power(); end(true); };
      m.querySelector('#rv-no').onclick = () => end(false);
    });
  }

  // ----- Boss arena: pay to fight a mothership three times as strong, win a big prize -----
  function arenaSetup() {
    const D = user.data; let w = 1; for (let g = GALS; g >= 1; g--) if (galOpen(D, g)) { w = g; break; }
    return { world: w, level: Math.max(10, Math.min(160, topLevel(D, w) + 5)) };
  }
  function arenaBox() {
    const D = user.data, a = arenaSetup(), fee = EXTRAS.arena_fee;
    modal(`<div class="arena"><div class="arena-ic">☠️</div><h2>${t('arena')}</h2><p class="muted">${t('arena_sub')}</p>
      <div class="arena-info"><span>${t('arena_boss', { n: a.level })}</span><span>${galIcons[a.world - 1]} ${t('gal_' + a.world)}</span></div>
      <div class="arena-prize">🏆 ${t('arena_prize')}: ${costHtml(EXTRAS.arena_coins, EXTRAS.arena_gems)}</div>
      <button class="btn gold big dual" id="ar-go" ${D.coins < fee ? 'disabled' : ''}>⚔️ ${t('arena_enter')} · ${coinHtml(fee)}</button>
      ${D.coins < fee ? `<p class="muted small">${t('not_enough_coins')}</p>` : ''}
      <button class="btn ghost" id="ar-x">${t('close')}</button></div>`, m => {
      m.querySelector('#ar-x').onclick = closeModal;
      m.querySelector('#ar-go').onclick = () => {
        if (D.coins < fee) return toast(t('not_enough_coins'));
        D.coins -= fee; save(); Sfx.init(); Sfx.coin(); closeModal();
        startGame({ mode: 'arena', level: a.level, world: a.world, _cs: 1 });
      };
    });
  }
  $('#m-arena').addEventListener('click', () => { Sfx.init(); arenaBox(); });

  // ---------- boot ----------
  async function afterLogin() {
    if (!user || user.offline) return;
    presenceSince = Date.now();
    setTimeout(askNotifications, 1500);
    Net.startPresence(user, { onInvite, onPoke, onPlaying, onJoinRequest, onJoinReply, onPartyMsg, ...realtime, onOnline: () => { updateOnlineBadge(); if (current === 'friends') { renderFriendsList(); if (friendTab === 'parties') renderParties(); } if (current === 'coop' && !room) renderCoopFriends(); } });
    loadFriends(); loadParties(); loadGifts(true);
    loadMyCustom();
    claimSecretToken(); setTimeout(claimLinkGift, 1200); setTimeout(claimClubLink, 1400); setTimeout(syncPushPrefs, 2000); setTimeout(registerDevice, 2500);
  }
  const renders = { register: renderRegister, menu: renderMenu, levels: renderLevels, shop: renderShop, friends: renderFriends, board: renderBoard, coop: renderCoop };
  icons(); I18N.apply(); $('#r-lang').innerHTML = langLabel();
  setTimeout(() => loadEvents(true), 1200);
  // web: returning from Google's sign-in page (?code=…)
  if (!NATIVE && !window.SSDesktop && /[?&](code|error)=/.test(location.search) && store.get('ss_g_intent', null)) {
    const back = location.href; window.history.replaceState(null, '', location.pathname);
    const intent = store.get('ss_g_intent', 'login');
    Net.googleFinish(back).then(() => googleAfter(intent)).catch(e => { store.set('ss_g_intent', null); if (!String(e.message).includes('oauth_cancelled')) toast(errText(e), 3500); });
  }
  // ---------- loading screen: a mini level to play while the game connects to the server ----------
  function bootLoading() {
    const enter = () => { if (!user) show('register'); else { show('menu'); if (!user.offline) afterLogin(); } resumePendingToken(); };
    if (/[?&]skipintro\b/.test(location.search)) return enter();
    show('loading', false);
    let ready = false;
    const fill = p => { $('#ld-fill').style.width = p + '%'; };
    $('#ld-text').textContent = t('ld_hint'); fill(10);
    // development version (SpaceShip Dev): the 9:16 picture with a random tip instead of the mini level
    const art = !!window.SS_DEV;
    $('#s-loading').classList.toggle('ld-pic', art); $('#ld-art').classList.toggle('hidden', !art);
    if (art) { const n = 1 + Math.floor(Math.random() * 9); $('#ld-tip-t').textContent = '💡 ' + t('ld_tip_t'); $('#ld-tip').textContent = t('ld_tip' + n); $('#ld-text').textContent = ''; }
    if (!art) setTimeout(() => {
      if (current !== 'loading') return;
      const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--st')) || 0;
      loadingGame = new Game($('#ld-canvas'), {
        mode: 'endless', mini: true, orientation: settings.orientation, safeTop: safeTop + 4, hd: DESKTOP,
        me: { id: 'mini', handle: '', name: '', skin: user ? user.data.skin : 'falcon', stats: user ? myStats() : {} }, onEnd: () => {},
      });
    }, 30);
    const tasks = [new Promise(r => setTimeout(r, 2200))];
    if (user && !user.offline) tasks.push(Net.login(user.id, user.secret).then(r => {
      Object.assign(user, { handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code, email: r.email || null, has_token: !!r.has_token });
      if (r.data && (r.data.ts || 0) > (user.data.ts || 0)) user.data = Object.assign(defData(), r.data);
      store.set('ss_user', user); rememberAccount(user);
    }).catch(e => { console.warn('login', e); if (String(e.message).includes('unauthorized')) { user.offline = true; store.set('ss_user', user); } }).finally(() => fill(85)));
    setTimeout(() => fill(45), 600);
    Promise.all(tasks).then(() => {
      fill(100); ready = true;
      $('#ld-text').textContent = t('ld_ready'); $('#ld-go').classList.remove('hidden');
    });
    const go = () => { if (!ready || current !== 'loading') return; removeEventListener('keydown', key); enter(); };
    const key = e => { if (e.key === 'Enter') go(); };
    $('#ld-go').onclick = go; addEventListener('keydown', key);
  }
  bootLoading();

  // automatic sync: pull newer progress from the server whenever the app comes back to the front
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Music.suspend(); else Music.resume();
    if (!document.hidden) resumePendingToken();
    if (document.hidden || !user || user.offline || game) return;
    Net.login(user.id, user.secret).then(r => {
      Object.assign(user, { handle: r.handle, name: r.name, avatar: r.avatar, email: r.email || null, has_token: !!r.has_token });
      if (r.data && (r.data.ts || 0) > (user.data.ts || 0)) user.data = Object.assign(defData(), r.data);
      store.set('ss_user', user); const fn = renders[current]; fn && current !== 'register' && fn();
    }).catch(() => {});
  });
  window.SSApp = { get user() { return user; }, get game() { return game; }, startGame, show, openProfile };
})();
