// SpaceShip app: screens, profile, shop, friends, co-op lobby
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const { Game, Sfx, levelCfg, WORLDS, GALAXIES } = window.SSGame;
  const GEM_RATE = 10; // 1 diamond = 10 coins
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
  const gunHtml = s => { const g = s.gun || {}; return `<div class="gun">⚡${Math.round((g.rate || 1) * 100)}% · 💥×${g.dmg || 1}${g.side ? ' · ↔+' + g.side * 2 : ''}${g.pierce ? ' · ➶' : ''}</div>`; };
  const coinHtml = n => `${Art.icon('coin')}<span>${Number(n).toLocaleString()}</span>`;
  const gemHtml = n => `${Art.icon('gem')}<span>${Number(n).toLocaleString()}</span>`;
  const walletHtml = D => `<span class="wal">${coinHtml(D.coins)}</span><span class="wal gemc">${gemHtml(D.gems || 0)}</span>`;
  const errText = e => {
    const m = (e && e.message) || '';
    if (m.includes('handle_taken')) return t('e_handle_taken');
    if (m.includes('bad_handle')) return t('e_bad_handle');
    if (m.includes('code_not_found')) return t('e_code_not_found');
    if (m.includes('party_full')) return t('e_party_full');
    if (m.includes('party_not_found')) return t('e_party_not_found');
    if (m.includes('not_allowed')) return t('e_not_allowed');
    if (m.includes('too_many_parties')) return t('e_too_many_parties');
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
    if (m.includes('cutvid_unauthorized')) return t('e_cutvid_expired');
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

  // ---------- background stars on menus ----------
  (function bg() {
    const c = $('#bgfx'), x = c.getContext('2d'); let st = [];
    const rs = () => { c.width = innerWidth; c.height = innerHeight; st = Array.from({ length: 140 }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, z: Math.random() })); };
    rs(); addEventListener('resize', rs);
    const g = () => {
      if (c.style.display !== 'none') {
        const gr = x.createRadialGradient(c.width * 0.7, c.height * 0.2, 0, c.width * 0.7, c.height * 0.2, c.width);
        gr.addColorStop(0, '#2a0f5c'); gr.addColorStop(0.5, '#0b0630'); gr.addColorStop(1, '#03010f');
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
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 200, 200); x.translate(100, 95);
    Art.drawShip(x, user ? user.data.skin : 'falcon', 55, performance.now() / 1000, 0.8);
  }

  // ---------- register ----------
  let regAvatar = 'rocket', checkT = null, handleOk = false, cvPending = null; // cvPending = {token, email}
  function renderRegister() {
    const free = Art.AVATARS.filter(a => a.price === 0);
    $('#r-avatars').innerHTML = free.map(a => `<button data-av="${a.id}" class="${a.id === regAvatar ? 'on' : ''}">${Art.avatar(a.id)}</button>`).join('');
    if (user && user.offline && !$('#r-handle').value) { $('#r-name').value = user.name; $('#r-handle').value = user.handle; checkHandle(); }
    $('#r-cvbanner').classList.toggle('hidden', !cvPending);
    if (cvPending) $('#r-cvbanner').innerHTML = `${Art.icon('cutvid')} ${t('cv_connected')} <b dir="ltr">${esc(cvPending.email)}</b><br>${t('cv_pick')}`;
    $('#r-cutvid').classList.toggle('hidden', !!cvPending);
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
      const cres = cvPending ? await Net.cutvidCall({ action: 'register', token: cvPending.token, handle: h, name, avatar: regAvatar }) : null;
      const r = cres ? cres.profile : await Net.register(h, name, regAvatar);
      const gameEmail = cres && cres.game_email;
      const data = user && user.offline ? user.data : defData();
      user = { id: r.id, secret: r.secret, handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code, data, cutvid: cvPending ? cvPending.email : undefined, email: gameEmail || null, has_token: !!r.token && !gameEmail };
      cvPending = null;
      save(); rememberAccount(user); afterLogin(); show('menu'); history = []; toast(t('welcome', { h: at(r.handle) }));
      if (!gameEmail) askEmail();
    } catch (e) {
      st.className = 'status err'; st.textContent = errText(e);
      if (!/taken|bad_/.test(e.message)) $('#r-offline').classList.remove('hidden');
    } finally { $('#r-go').disabled = false; }
  });
  // ---------- CutVid sign-in ----------
  // Opens CutVid's sign-in page and resolves with the URL it redirects back to.
  function openCutvid(url) {
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
  async function signInWithCutvid(intent) {
    Sfx.init();
    const redirect = window.SSDesktop || NATIVE ? SS_CONFIG.OAUTH_APP_REDIRECT : webRedirect();
    store.set('ss_cv_intent', intent);
    toast(t('opening_cutvid'));
    try {
      const token = await Net.cutvidOAuth(openCutvid, redirect);
      if (token) await (intent === 'link' ? cutvidLink(token, '') : cutvidLogin(token, ''));
    } catch (e) { if (!String(e.message).includes('oauth_cancelled')) toast(errText(e), 3500); }
  }
  async function cutvidLogin(token, email) {
    const res = await Net.cutvidCall({ action: 'login', token });
    closeModal();
    if (res.profile) {
      const r = res.profile;
      finishLogin(r, res.game_email ? { cutvid: res.email || email, email: res.game_email, has_token: false } : { cutvid: res.email || email });
    } else { cvPending = { token, email: res.email || email }; show('register', false); $('#r-tabs [data-rt="new"]').click(); }
  }
  async function cutvidLink(token, email) {
    const res = await Net.cutvidCall({ action: 'link', token, id: user.id, secret: user.secret });
    user.cutvid = res.email || email;
    if (res.game_email) { user.email = res.game_email; user.has_token = false; }
    store.set('ss_user', user); closeModal(); toast(t('cv_linked'), 3000);
  }
  // intent: 'login' (sign in / create player) or 'link' (attach CutVid to the signed-in player)
  function cutvidModal(intent, email) {
    modal(`<div style="width:56px;height:56px;margin:0 auto">${Art.icon('cutvid', 'av')}</div><h2>${t('cutvid_btn')}</h2>
      <p class="muted small">${t('cv_login_note')}</p>
      <label>${t('email_label')}<input id="cv-email" type="email" dir="ltr" autocomplete="email" value="${esc(email || '')}"></label>
      <label>${t('password')}<input id="cv-pass" type="password" dir="ltr" autocomplete="current-password"></label>
      <div class="status" id="cv-st"></div>
      <button class="btn primary" id="cv-go">${t('login')}</button>
      <button class="btn ghost" id="cv-x">${t('cancel')}</button>`, m => {
      const st = m.querySelector('#cv-st'), go = m.querySelector('#cv-go');
      m.querySelector('#cv-x').onclick = closeModal;
      m.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go.click(); });
      (email ? m.querySelector('#cv-pass') : m.querySelector('#cv-email')).focus();
      go.onclick = async () => {
        const em = m.querySelector('#cv-email').value.trim().toLowerCase(), pw = m.querySelector('#cv-pass').value;
        if (!/^\S+@\S+\.\S+$/.test(em)) { st.className = 'status err'; st.textContent = errText({ message: 'bad_email' }); return; }
        go.disabled = true; st.className = 'status'; st.textContent = t('connecting');
        try {
          const tok = await Net.cvPassword(em, pw);
          if (intent === 'link') await cutvidLink(tok, em); else await cutvidLogin(tok, em);
        } catch (e) { go.disabled = false; st.className = 'status err'; st.textContent = errText(e); }
      };
    });
  }
  $('#r-cutvid').addEventListener('click', () => { Sfx.init(); cutvidModal('login'); });

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

  // Email with 6-digit codes (sent from SpaceShip's own email address).
  //   intent 'add'   — verify an email for the signed-in player
  //   intent 'login' — sign in on this device with an email that belongs to a player
  // If our email can't be sent: a CutVid account gets a code from CutVid instead (or CutVid's sign-in page if CutVid
  // can't send either); anyone else is asked to try again later.
  function emailFlow(intent) {
    let email = '';
    const finish = r => { if (!r || r.error) throw new Error('bad_code'); finishLogin(r); };
    let failReason = '';
    // our email could not be sent: offer CutVid sign-in (email + password, no email needed) or trying later
    const cutvidFallback = async e => { failReason = String((e && e.message) || ''); step('later'); };
    const sendFailed = e => /send_failed|smtp_|offline|Failed to fetch|FunctionsFetchError/i.test(String(e && e.message));
    const step = (state, msg) => {
      const codeInput = `<input id="ef-code" inputmode="numeric" maxlength="8" dir="ltr" autocomplete="one-time-code" placeholder="123456" style="text-align:center;font-size:24px;letter-spacing:6px">`;
      const body = {
        email: `<label>${t('email_label')}<input id="ef-email" type="email" dir="ltr" autocomplete="email" placeholder="you@gmail.com" value="${esc(email)}"></label>
          <button class="btn primary" id="ef-go">${t('next')}</button>`,
        code: `<p class="small">${t('email_6_sent', { e: `<b dir="ltr">${esc(email)}</b>` })}</p>${codeInput}
          <button class="btn primary" id="ef-go">${intent === 'add' ? t('verify') : t('login')}</button>`,
        cvcode: `<p class="small">${Art.icon('cutvid')} ${t('cv_code_sent', { e: `<b dir="ltr">${esc(email)}</b>` })}</p>${codeInput}
          <button class="btn primary" id="ef-go">${intent === 'add' ? t('verify') : t('login')}</button>`,
        later: `<div style="font-size:40px">⏳</div><p>${/smtp_not_configured/.test(failReason) ? t('e_smtp') : t('cv_try_later')}</p>
          <button class="btn primary" id="ef-go">${t('try_again')}</button>
          <button class="btn cutvid" id="ef-cv">${Art.icon('cutvid')}${t('cutvid_btn')}</button>`,
        noplayer: `<p>${t('no_player_email')}</p><button class="btn primary" id="ef-go">${t('tab_new')}</button>
          <button class="btn cutvid" id="ef-cv">${Art.icon('cutvid')}${t('cutvid_btn')}</button>`,
      }[state];
      modal(`<div style="font-size:40px">✉️</div><h2>${intent === 'add' ? t('add_email') : t('login_email_title')}</h2>
        ${state === 'email' && intent === 'add' ? `<p class="muted small">${t('ask_email_body')}</p>` : ''}
        ${body}<div class="status ${msg && msg.ok ? 'ok' : 'err'}" id="ef-st">${msg ? esc(msg.text) : ''}</div>
        <button class="btn ghost" id="ef-x">${t('cancel')}</button>`, m => {
        m.querySelector('#ef-x').onclick = closeModal;
        const cvb = m.querySelector('#ef-cv'); if (cvb) cvb.onclick = () => cutvidModal(intent === 'add' ? 'link' : 'login', email);
        const st = m.querySelector('#ef-st'), go = m.querySelector('#ef-go');
        const input = m.querySelector('input'); if (input) { input.focus(); input.onkeydown = e => { if (e.key === 'Enter') go.click(); }; }
        go.onclick = async () => {
          go.disabled = true; st.className = 'status'; st.textContent = t('wait');
          try {
            if (state === 'email') {
              email = m.querySelector('#ef-email').value.trim().toLowerCase();
              if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('bad_email');
              if (intent === 'add') {
                try { await Net.emailSetStart(user, email, I18N.lang); step('code'); }
                catch (e) { if (sendFailed(e)) await cutvidFallback(e); else throw e; }
              } else {
                let r;
                try { r = await Net.emailLoginStartByEmail(email, I18N.lang); }
                catch (e) { if (sendFailed(e)) return cutvidFallback(e); throw e; }
                if (r && r.found) step('code'); else step('noplayer'); // not a SpaceShip email: new player, or CutVid
              }
            } else if (state === 'code') {
              const code = m.querySelector('#ef-code').value.trim();
              if (intent === 'add') {
                const em = await Net.emailSetConfirm(user, code);
                if (!em) throw new Error('bad_code');
                user.email = em; user.has_token = false; store.set('ss_user', user); closeModal(); toast(t('email_verified'), 3000);
                if (current === 'menu') renderMenu();
              } else finish(await Net.emailLoginConfirmByEmail(email, code));
            } else if (state === 'cvcode') {
              const tok = await Net.cvVerifyCode(email, m.querySelector('#ef-code').value);
              if (intent === 'add') await cutvidLink(tok, email); else await cutvidLogin(tok, email);
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
    user = null; store.set('ss_user', null); cvPending = null; closeModal(); history = [];
    show('register', false); $('#r-tabs [data-rt="new"]').click();
  }

  // ---------- settings ----------
  function openSettings() {
    const accs = savedAccounts();
    modal(`<h2>${Art.icon('gear')} ${t('settings')}</h2>
      <div class="settings-chips">
        <button class="chip" id="s-lang">${langLabel()}</button>
        <button class="chip" id="s-sound">${settings.sound ? Art.icon('sound') + t('sound') : Art.icon('mute') + t('muted')}</button>
        <button class="chip" id="s-orient">${settings.orientation === 'landscape' ? Art.icon('rotateL') + t('mode_land') : Art.icon('rotate') + t('mode_port')}</button>
        <button class="chip" id="s-music">${settings.music ? '🎵 ' + t('music_on') : '🔇 ' + t('music_off')}</button>
        ${user.offline ? '' : `<button class="chip" id="s-notif">${settings.notify ? '🔔 ' + t('updates_on') : '🔕 ' + t('updates_off')}</button>`}
      </div>
      <label class="vol ${settings.music ? '' : 'off'}">${t('music_vol')} <b id="s-vol-n">${settings.musicVol}%</b>
        <input id="s-vol" type="range" min="1" max="100" step="1" value="${settings.musicVol}" ${settings.music ? '' : 'disabled'}></label>
      ${user.offline ? '' : `<div class="sec"><h3>${t('account')}</h3>${user.email
        ? `<div class="small">${t('email_is')} <b dir="ltr">${esc(user.email)}</b><br><span class="muted">${t('email_device_note')}</span></div>`
        : `<div class="small muted">${t('ask_email_body')}</div>
           <button class="btn small primary" id="s-email">✉️ ${t('add_email')}</button>`}</div>`}
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
      m.querySelectorAll('[data-switch]').forEach(b => b.onclick = () => switchAccount(b.dataset.switch));
    });
  }
  function signOut() {
    if (!confirm(t('confirm_signout'))) return;
    flushSave(); Net.stopPresence(); user = null; store.set('ss_user', null); closeModal(); friends = []; history = []; show('register', false);
    $('#r-tabs [data-rt="login"]').click();
  }

  function editProfile() {
    modal(`<h2>${t('profile')}</h2><div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(user.avatar)}</div>
      <b dir="ltr" style="color:var(--cyan)">@${esc(user.handle)}</b>
      <label>${t('name')}<input id="p-name" maxlength="24" value="${esc(user.name)}"></label>
      <p class="muted small">${t('handle_note')}</p>
      ${user.offline ? '' : `<div class="sec"><h3>${t('other_devices')}</h3>${user.email
        ? `<div class="small">${t('email_is')} <b dir="ltr">${esc(user.email)}</b><br><span class="muted">${t('email_device_note')}</span></div>`
        : `<div class="small muted">${t('ask_email_body')}</div>
           <button class="btn small primary" id="p-em-add">✉️ ${t('add_email')}</button>`}</div>`}
      ${user.offline ? '' : user.cutvid ? `<div class="cv-banner">${Art.icon('cutvid')} ${t('linked_cutvid')} <b dir="ltr">${esc(user.cutvid)}</b></div>` : `<button class="btn cutvid" id="p-cv">${Art.icon('cutvid')}${t('link_cutvid')}</button>`}
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
      m.querySelector('#p-save').onclick = () => { const n = m.querySelector('#p-name').value.trim(); if (n) { user.name = n; save(); } closeModal(); renderMenu(); };
      m.querySelector('#p-x').onclick = closeModal;
      const cvb = m.querySelector('#p-cv'); if (cvb) cvb.onclick = () => cutvidModal('link');
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
      const wn = i + 1, hint = t('h_' + w.trig.type, { l: w.trig.level, n: w.trig.n });
      if (!D.worlds.includes(w.id)) {
        html += `<div class="world locked-w"><div class="w-title">${Art.icon('lock')} ${t('secret_world_q')} <small class="muted">#${wn}</small></div><div class="w-hint">${t('hint')} ${hint}</div></div>`;
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
  function renderShop() {
    const D = user.data; $$('[data-coins]').forEach(e => e.innerHTML = walletHtml(D));
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
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_ships')}</div>` + Art.SHIPS.filter(s => s.gems).map(s => {
        const own = D.ships.includes(s.id), eq = D.skin === s.id;
        return `<div class="item special ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b><small>${t('shipd_' + s.id)}</small>${gunHtml(s)}
          ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-equip="${s.id}">${t('use')}</button>` : `<button class="btn small gem" data-gship="${s.id}" ${g < s.gems ? 'disabled' : ''}>${gemHtml(s.gems)}</button>`}</div>`;
      }).join('');
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_powers')}</div>` + GEM_ITEMS.map(it => {
        const own = D.items.includes(it.id);
        return `<div class="item special"><div class="pic">${Art.icon(it.icon)}</div><b>${t('it_' + it.id)}</b><small>${t(it.dkey || 'it_' + it.id + '_d')}</small>
          ${own ? `<button class="btn small" disabled>${t('owned')}</button>` : `<button class="btn small gem" data-gitem="${it.id}" ${g < it.gems ? 'disabled' : ''}>${gemHtml(it.gems)}</button>`}</div>`;
      }).join('');
      html += `<div class="sh-sec">${Art.icon('gem')} ${t('special_icons')}</div>` + Art.AVATARS.filter(a => a.gems).map(a => {
        const own = D.avatars.includes(a.id), eq = user.avatar === a.id;
        return `<div class="item special ${eq ? 'eq' : ''}"><div class="pic avatar">${Art.avatar(a.id)}</div>
          ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-av-eq="${a.id}">${t('use')}</button>` : `<button class="btn small gem" data-gav="${a.id}" ${g < a.gems ? 'disabled' : ''}>${gemHtml(a.gems)}</button>`}</div>`;
      }).join('');
    }
    else if (shopTab === 'ships') html = Art.SHIPS.filter(s => !s.gems).map(s => {
      const own = D.ships.includes(s.id), eq = D.skin === s.id;
      return `<div class="item ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b>${gunHtml(s)}
        ${eq ? `<button class="btn small" disabled>${t('in_use')}</button>` : own ? `<button class="btn small" data-equip="${s.id}">${t('use')}</button>` : `<button class="btn small gold" data-buy-ship="${s.id}" ${D.coins < s.price ? 'disabled' : ''}>${coinHtml(s.price)}</button>`}</div>`;
    }).join('');
    else if (shopTab === 'up') html = UPGRADES.map(u => {
      const lvl = D.up[u.id] || u.base, i = lvl - u.base, max = i >= u.costs.length, cost = u.costs[i];
      return `<div class="item"><div class="pic">${Art.icon(u.icon)}</div><b>${t('up_' + u.id)}</b><small>${t('up_' + u.id + '_d')}</small>
        <div class="pips">${u.costs.map((_, j) => `<i class="${j < i ? 'on' : ''}"></i>`).join('')}</div>
        ${max ? `<button class="btn small" disabled>${t('maxed')}</button>` : `<button class="btn small gold" data-up="${u.id}" ${D.coins < cost ? 'disabled' : ''}>${coinHtml(cost)}</button>`}</div>`;
    }).join('');
    else html = Art.AVATARS.filter(a => !a.gems).map(a => {
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
      D.gems -= v; D.coins += v * GEM_RATE; Sfx.init(); Sfx.coin(); toast(t('converted', { g: v, c: (v * GEM_RATE).toLocaleString() }));
      save(); renderShop(); return;
    }
    if (b.dataset.gship) { const s = Art.SHIPS.find(x => x.id === b.dataset.gship); if (!payGems(s.gems)) return; D.ships.push(s.id); D.skin = s.id; toast(t('special_ship_t', { x: t('ship_' + s.id) })); save(); return renderShop(); }
    if (b.dataset.gitem) { const it = GEM_ITEMS.find(x => x.id === b.dataset.gitem); if (!payGems(it.gems)) return; D.items.push(it.id); toast(t('item_yours', { x: t('it_' + it.id) })); save(); return renderShop(); }
    if (b.dataset.gav) { const a = Art.AVATARS.find(x => x.id === b.dataset.gav); if (!payGems(a.gems)) return; D.avatars.push(a.id); user.avatar = a.id; toast(t('special_icon')); save(); return renderShop(); }
    if (b.dataset.equip) D.skin = b.dataset.equip;
    else if (b.dataset.buyShip) { const s = Art.SHIPS.find(x => x.id === b.dataset.buyShip); if (!pay(s.price)) return; D.ships.push(s.id); D.skin = s.id; toast(t('bought', { x: t('ship_' + s.id) })); }
    else if (b.dataset.up) { const u = UPGRADES.find(x => x.id === b.dataset.up), lvl = D.up[u.id] || u.base; if (!pay(u.costs[lvl - u.base])) return; D.up[u.id] = lvl + 1; toast(t('upgraded', { x: t('up_' + u.id) })); }
    else if (b.dataset.avEq) user.avatar = b.dataset.avEq;
    else if (b.dataset.buyAv) { const a = Art.AVATARS.find(x => x.id === b.dataset.buyAv); if (!pay(a.price)) return; D.avatars.push(a.id); user.avatar = a.id; toast(t('new_icon')); }
    save(); renderShop();
  });

  // ---------- friends: search by @ or name, requests that need the other player's OK ----------
  let friendTab = 'friends', requests = { incoming: [], outgoing: [] }, parties = [], searchT = null;
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
    if (current === 'friends' && friendTab === 'parties') renderParties();
    updateOnlineBadge();
  }
  function renderParties() {
    $('#p-mine').innerHTML = parties.length ? parties.map(p => {
      const ms = p.members || [], my = p.my_role || (p.mine ? 'leader' : 'member'), r = rankOf(my);
      const sts = Object.fromEntries(ms.map(m => [m.id, liveStatus(m.id)]));
      const on = ms.filter(m => m.id !== user.id && sts[m.id].k !== 'off').length, inRoom = ms.filter(m => m.id !== user.id && sts[m.id].k === 'room').length;
      const order = [...ms].sort((a, b) => (sts[b.id].k !== 'off') - (sts[a.id].k !== 'off')); // online first, then by rank
      return `<div class="party club">
        <div class="party-head"><button class="club-logo" ${r >= 2 ? `data-plogo="${p.id}" title="${esc(t('change_logo'))}"` : 'disabled'}>${Art.logo(p.logo)}${r >= 2 ? `<span class="edit-dot">✎</span>` : ''}</button>
          <div class="club-title"><b>${esc(p.name)}</b><small>${t('your_rank')}: ${rankTag(my)}</small></div>
          <span class="chip">${p.is_public ? '🌐 ' + t('public_tag') : '🔒 ' + t('private_tag')}</span></div>
        ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ''}
        <div class="party-meta"><span>${t('members_n', { n: p.count })} · <b class="on-n">${t('online_n', { n: on })}</b>${inRoom ? ' · ' + t('in_room_n', { n: inRoom }) : ''}</span>
          <span class="code-chip" dir="ltr" data-pcopy="${esc(p.code)}">${esc(p.code)} ${Art.icon('copy')}</span></div>
        <div class="club-members">${order.map(m => { const st = sts[m.id]; return `<button class="cm ${st.k}" data-pmem="${m.id}" data-party="${p.id}">
            <div class="avatar">${Art.avatar(m.avatar)}<span class="dot ${st.k !== 'off' ? 'on' : ''} ${st.k === 'room' ? 'room' : ''}"></span></div>
            <div class="info"><b>${esc(m.name)}${m.id === user.id ? ` <span class="muted">(${t('you')})</span>` : ''}</b><small dir="ltr">@${esc(m.handle)}</small></div>
            <div class="cm-side">${rankTag(m.role)}${statusHtml(st)}</div></button>`; }).join('')}</div>
        <div class="row wrap">
          <button class="btn small chat-btn" data-pchat="${p.id}">💬 ${t('chat')}${unread(p) ? '<span class="badge-dot"></span>' : ''}</button>
          <button class="btn small primary" data-pplay="${p.id}" ${on ? '' : 'disabled'}>${t('play_together')}</button>
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
    else { toast(t('request_sent', { h: at(handle) })); Net.sendTo(id, 'friend_request', { handle: user.handle, name: user.name }).catch(() => {}); }
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
    const me = p.rel === 'me', st = liveStatus(p.id);
    const stat = (n, k, ic) => `<div class="pf-stat">${ic}<b>${Number(n || 0).toLocaleString()}</b><small>${t(k)}</small></div>`;
    modal(`<div class="sheet profile">
      <div class="pf-top"><div class="avatar">${Art.avatar(p.avatar)}</div><img class="pf-ship" src="${Art.shipPreview(p.skin, 140)}" alt=""></div>
      <h2>${esc(p.name)}</h2><div class="muted" dir="ltr">@${esc(p.handle)}</div>
      <div class="sheet-tags">${me ? '' : statusHtml(st)}<span class="chip">${t('ship_' + p.skin)}</span></div>
      <div class="pf-stats">${stat(p.levels, 'p_levels', Art.icon('star'))}${stat(p.worlds, 'p_worlds', Art.icon('secret'))}${stat(p.ships, 'p_ships', Art.icon('rocket'))}${stat(p.best, 'p_best', Art.icon('trophy'))}</div>
      ${(p.parties || []).length ? `<div class="lbl">${t('p_parties')}</div><div class="pf-parties">${p.parties.map(x => `<span class="chip">${esc(x.name)} · ${rankTag(x.role)}</span>`).join('')}</div>` : ''}
      <div class="muted small">${t('p_joined', { d: new Date(p.joined).toLocaleDateString() })}</div>
      ${me ? '' : playButton(p.id, st)}
      ${me ? '' : p.rel === 'friend' ? `<div class="chip center">${t('friends_already')}</div>` : p.rel === 'sent' ? `<button class="btn" disabled>${t('requested')}</button>`
        : p.rel === 'incoming' ? `<button class="btn primary" data-a="accept">${t('accept')}</button>` : `<button class="btn" data-a="friend">${Art.icon('plus')} ${t('add_friend')}</button>`}
      <button class="btn ghost" data-a="close">${t('close')}</button></div>`, c => {
      c.onclick = async e => {
        const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
        try {
          if (b.dataset.a === 'close') return closeModal();
          if (b.dataset.a === 'invite') { closeModal(); return inviteFriend(p.id, p); }
          if (b.dataset.a === 'ask') { closeModal(); return askToJoin(p.id, p); }
          if (b.dataset.a === 'friend') { await requestFriend(p.id, p.handle); return openProfile(p.id); }
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
  function onPartyMsg(p) {
    if (!p || !p.party) return;
    if (chat && chat.pid === p.party && $('#ch-list')) { loadChat(); return; }
    const party = parties.find(x => x.id === p.party);
    if (party) party.last_msg = (party.last_msg || 0) + 1e9; // unread until the chat is opened
    notify(p.name || 'SpaceShip', t('n_party_msg', { h: '@' + (p.h || '') }));
    if (current === 'friends' && friendTab === 'parties') renderParties();
    updateOnlineBadge();
  }

  let partyT = null;
  async function searchParties() {
    const q = $('#p-search').value.trim(), box = $('#p-results');
    try {
      const rows = (await Net.searchParties(user, q)).filter(p => !p.member);
      box.innerHTML = rows.length ? rows.map(p => `<div class="party small">
          <div class="party-head"><b>${esc(p.name)}</b><span class="chip">${p.is_public ? '🌐' : '🔒'} ${t('members_n', { n: p.count })}</span></div>
          ${p.description ? `<p class="muted small">${esc(p.description)}</p>` : ''}
          <button class="btn small primary" data-pjoin="${p.id}" data-pcode="${esc(p.code || q)}" ${p.count >= 10 ? 'disabled' : ''}>${t('join')}</button></div>`).join('')
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
      <div class="seg" id="pf-vis"><button data-v="1" class="${!p || p.is_public ? 'on' : ''}">🌐 ${t('public_tag')}</button><button data-v="0" class="${p && !p.is_public ? 'on' : ''}">🔒 ${t('private_tag')}</button></div>
      <p class="muted small" id="pf-hint">${!p || p.is_public ? t('public_party') : t('private_party')}</p>
      <div class="status" id="pf-st"></div>
      <button class="btn primary" id="pf-go">${p ? t('save') : t('create_party')}</button><button class="btn ghost" id="pf-x">${t('cancel')}</button>`, m => {
      let pub = !p || p.is_public;
      bindLogoGrid(m, v => logo = v);
      m.querySelector('#pf-x').onclick = closeModal;
      m.querySelector('#pf-vis').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; pub = b.dataset.v === '1';
        m.querySelectorAll('#pf-vis button').forEach(x => x.classList.toggle('on', x === b)); m.querySelector('#pf-hint').textContent = pub ? t('public_party') : t('private_party'); };
      m.querySelector('#pf-go').onclick = async () => {
        const name = m.querySelector('#pf-name').value.trim(), desc = m.querySelector('#pf-desc').value.trim();
        if (!name) { m.querySelector('#pf-st').className = 'status err'; m.querySelector('#pf-st').textContent = t('write_name'); return; }
        try {
          if (p) await Net.updateParty(user, p.id, name, desc, pub, logo); else { await Net.createParty(user, name, desc, pub, logo); toast(t('party_created')); }
          closeModal(); loadParties();
        } catch (e) { m.querySelector('#pf-st').className = 'status err'; m.querySelector('#pf-st').textContent = errText(e); }
      };
    });
  }
  $('#p-create').addEventListener('click', () => { if (!user.offline) partyForm(null); });
  $('#f-pane-parties').addEventListener('click', async e => {
    const mem = e.target.closest('[data-pmem]'); if (mem) return memberSheet(mem.dataset.party, mem.dataset.pmem);
    const b = e.target.closest('[data-pjoin],[data-pleave],[data-pedit],[data-pplay],[data-pcopy],[data-pchat],[data-pwords],[data-plogo]'); if (!b || b.disabled) return;
    try {
      if (b.dataset.pchat) return openChat(b.dataset.pchat);
      if (b.dataset.pwords) return blockedWords(parties.find(x => x.id === b.dataset.pwords));
      if (b.dataset.plogo) return logoPicker(parties.find(x => x.id === b.dataset.plogo));
      if (b.dataset.pcopy) return copy(b.dataset.pcopy);
      if (b.dataset.pjoin) { const p = await Net.joinParty(user, b.dataset.pjoin, b.dataset.pcode); toast(t('joined_party', { x: p.name })); $('#p-search').value = ''; $('#p-results').innerHTML = ''; }
      if (b.dataset.pedit) return partyForm(parties.find(x => x.id === b.dataset.pedit));
      if (b.dataset.pleave) { const p = parties.find(x => x.id === b.dataset.pleave);
        return confirmBox(t('leave_party'), t('confirm_leave_party', { x: esc(p.name) }), t('confirm_caps'), async () => { await Net.leaveParty(user, p.id); loadParties(); }); }
      if (b.dataset.pplay) { // a room for the party: invite every member who is online
        const p = parties.find(x => x.id === b.dataset.pplay);
        if (!room || room.role !== 'host') openRoom(roomCode(), 'host');
        for (const m of p.members || []) if (m.id !== user.id && Net.isOnline(m.id) && !roomOf(m.id))
          Net.sendInvite(m.id, { code: room.code, from: { handle: user.handle, name: user.name, avatar: user.avatar }, party: p.name }).catch(() => {});
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
      rate: D.up.rate || 0, power: D.up.power || 0, luck: D.up.luck || 0, revive: has('revive'), drone: has('drone') };
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
    icons($('#c-lobby'));
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
    let foundHost = false, joinedAt = Date.now();
    room = Net.room(code, role, Object.assign(meInfo(), { ready: false, joined: joinedAt }), {
      onSync: members => {
        const others = members.filter(m => m.id !== user.id), host = members.find(m => m.role === 'host');
        if (role === 'guest') {
          if (host) foundHost = true;
          if (others.length >= ROOM_MAX && !members.some(m => m.id === user.id && m.joined === joinedAt)) { toast(t('room_full')); leaveRoom(); return; }
          if (foundHost && !host && !game) { toast(t('host_left')); leaveRoom(); return; }
        }
        if (current === 'coop') renderLobby();
      },
      onJoin: m => { if (m.id !== user.id) { Sfx.init(); Sfx.power(); toast(t('in_room', { h: at(m.handle) })); } },
      onLeave: id => {
        if (!room) return;
        const wasHost = role === 'guest' && !room.members.some(m => m.role === 'host');
        if (game) { if (wasHost) endGameAbrupt(t('host_left')); else game.dropPlayer(id); }
        else if (wasHost) { toast(t('host_left')); leaveRoom(); return; }
        else toast(t('friend_left_room'));
        if (current === 'coop') renderLobby();
      },
      onMessage: (ev, p) => {
        if (ev === 'start' && role === 'guest') startGame({ mode: p.mode, level: p.level, world: p.world || 1, secret: p.secret, H: p.H, coop: { room, role: 'guest' }, roster: p.roster });
        else if (ev === 'end' && role === 'guest' && game) { const r = p; setTimeout(() => game && onGameEnd(r), 200); }
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
    if (room) { room.send('bye', {}); room.leave(); }
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
  function onInvite(p) {
    if (game || !p || !p.code) return;
    notify(t('game_invite'), t('n_invite', { h: '@' + p.from.handle }));
    Sfx.init(); Sfx.power();
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>${t('game_invite')}</h2>
      <p><b>${esc(p.from.name)}</b> <span dir="ltr" style="color:var(--cyan)">@${esc(p.from.handle)}</span> ${t('invites_you')}${p.party ? ` · <b>${esc(p.party)}</b>` : ''}</p>
      <button class="btn primary big" id="i-yes">${t('join')}</button><button class="btn ghost" id="i-no">${t('not_now')}</button>`, m => {
      m.querySelector('#i-yes').onclick = () => { closeModal(); openRoom(String(p.code).toUpperCase().slice(0, 5), 'guest'); };
      m.querySelector('#i-no').onclick = closeModal;
    });
  }

  // ---------- game ----------
  function lockOrientation(o) {
    try { if (Cap.ScreenOrientation) return Cap.ScreenOrientation.lock({ orientation: o }); if (screen.orientation && screen.orientation.lock) screen.orientation.lock(o).catch(() => {}); } catch (e) {}
  }
  function unlockOrientation() { try { if (Cap.ScreenOrientation) Cap.ScreenOrientation.unlock(); else if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {} }
  function startGame(o) {
    Sfx.init(); closeModal();
    if (game) game.destroy();
    gameTrack = o.secret ? 'game' : GALAXIES[(o.world || 1) - 1].music; // every world has its own music
    show('game', false);
    lockOrientation(settings.orientation);
    const wantLand = settings.orientation === 'landscape';
    const hint = () => $('#g-rotate').classList.toggle('hidden', !wantLand || innerWidth > innerHeight);
    hint(); setTimeout(hint, 600);
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--st')) || 0;
    const start = () => {
      game = new Game($('#game'), {
        mode: o.mode, level: o.level, world: o.world || 1, secret: o.secret || null, orientation: settings.orientation, H: o.H, safeTop: safeTop + 4,
        me: meInfo(), roster: o.roster, coop: o.coop, hd: DESKTOP, local2: !!o.local2,
        p2: o.local2 ? { id: 'p2', handle: 'player2', name: t('player2'), skin: user.data.skin === 'viper' ? 'falcon' : 'viper', stats: myStats() } : null,
        onEnd: r => onGameEnd(r), onPauseKey: () => pause(),
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
    modal(`<h2>${t('paused')}</h2><button class="btn primary big" id="p-res">${t('resume')}</button><button class="btn" id="p-restart">${t('restart')}</button><button class="btn ghost" id="p-quit">${t('to_menu')}</button>`, m => {
      m.querySelector('#p-res').onclick = () => { closeModal(); game.paused = false; game.last = performance.now(); };
      m.querySelector('#p-restart').onclick = () => { const g = game; startGame({ mode: g.mode, level: g.level, local2: g.local2 }); };
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
    D.coins += r.coins;
    let newBest = false, unlocked = false, gemsWon = 0, newGal = 0;
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
      newGal = !D.levels[k] && r.level === LEVELS && wld < GALS ? wld + 1 : 0; // finished a world: the next one opens
      D.levels[k] = Math.max(D.levels[k] || 0, r.stars);
    }
    D.gems += gemsWon;
    const newWorlds = (r.found || []).filter(id => !D.worlds.includes(id));
    D.worlds.push(...newWorlds);
    save();
    // in a room the next level is chosen for the host right away (levels are played in order)
    const roomNext = coop && room && room.role === 'host' && r.win && r.mode === 'level' ? nextPick(room.pick) : null;
    if (roomNext && (roomNext.secret || unlockedLevel(D, roomNext.level, roomNext.world || 1))) { room.pick = roomNext; room.setMeta({ pick: roomNext }); }
    const title = r.mode === 'endless' ? (newBest ? t('new_best') : t('game_over')) : r.win ? t('victory') : t('ship_hit');
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
      ${newGal ? `<div class="found gal-open">${galIcons[newGal - 1]} ${t('gal_opened', { w: t('gal_' + newGal) })}</div>` : ''}
      ${gemsWon ? `<div class="reward gems">+${gemsWon} ${Art.icon('gem')}</div>` : ''}${worldsHtml}
      <div class="muted">${t('score')} <b style="color:#fff">${r.score.toLocaleString()}</b></div>
      <div class="reward">+${r.coins} ${Art.icon('coin')}</div>
      <div class="muted small">${t('collected_bonus', { a: r.collected, b: r.bonus })}</div>${buttons}`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#e-next', () => startGame(sec ? { mode: 'level', level: 1, secret: { w: sec.w, k: sec.k + 1 } }
        : r.level < LEVELS ? { mode: 'level', level: r.level + 1, world: wld, local2 } : { mode: 'level', level: 1, world: wld + 1, local2 }));
      on('#e-retry', () => startGame({ mode: r.mode, level: r.level, world: wld, local2, secret: sec }));
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
      m.querySelector('#n-yes').onclick = () => { closeModal(); setNotify(true); };
      m.querySelector('#n-no').onclick = () => { closeModal(); setNotify(false); };
    });
  }
  const realtime = {
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

  // ---------- boot ----------
  async function afterLogin() {
    if (!user || user.offline) return;
    presenceSince = Date.now();
    setTimeout(askNotifications, 1500);
    Net.startPresence(user, { onInvite, onJoinRequest, onJoinReply, onPartyMsg, ...realtime, onOnline: () => { updateOnlineBadge(); if (current === 'friends') { renderFriendsList(); if (friendTab === 'parties') renderParties(); } if (current === 'coop' && !room) renderCoopFriends(); } });
    loadFriends(); loadParties();
  }
  const renders = { register: renderRegister, menu: renderMenu, levels: renderLevels, shop: renderShop, friends: renderFriends, board: renderBoard, coop: renderCoop };
  icons(); I18N.apply(); $('#r-lang').innerHTML = langLabel();
  // web: returning from CutVid's sign-in page (?code=…&state=…)
  if (!NATIVE && !window.SSDesktop && /[?&]code=/.test(location.search) && /[?&]state=/.test(location.search)) {
    const back = location.href; window.history.replaceState(null, '', location.pathname);
    const intent = store.get('ss_cv_intent', 'login'); store.set('ss_cv_intent', null);
    Net.cutvidOAuthFinish(back).then(token => intent === 'link' && user && !user.offline ? cutvidLink(token, '') : cutvidLogin(token, '')).catch(e => toast(errText(e), 3500));
  }
  // ---------- loading screen: a mini level to play while the game connects to the server ----------
  function bootLoading() {
    const enter = () => { if (!user) show('register'); else { show('menu'); if (!user.offline) afterLogin(); } resumePendingToken(); };
    if (/[?&]skipintro\b/.test(location.search)) return enter();
    show('loading', false);
    let ready = false;
    const fill = p => { $('#ld-fill').style.width = p + '%'; };
    $('#ld-text').textContent = t('ld_hint'); fill(10);
    setTimeout(() => {
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
  window.SSApp = { get user() { return user; }, get game() { return game; }, startGame, show };
})();
