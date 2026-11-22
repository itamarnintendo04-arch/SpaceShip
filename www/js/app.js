// SpaceShip app: screens, profile, shop, friends, co-op lobby
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const { Game, Sfx, levelCfg, WORLDS } = window.SSGame;
  const GEM_RATE = 10; // 1 diamond = 10 coins
  // special items - bought with diamonds
  const GEM_ITEMS = [
    { id: 'plasma', icon: 'plasma', gems: 30 },
    { id: 'shield2', icon: 'shield', gems: 20 },
    { id: 'supermag', icon: 'magnet', gems: 15 },
    { id: 'goldheart', icon: 'heart', gems: 35, dkey: 'up_life_d' },
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
  ];

  // ---------- state ----------
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const defData = () => ({ coins: 100, ships: ['falcon'], avatars: [], skin: 'falcon', up: { weapon: 1, shield: 0, magnet: 0, life: 0 }, levels: {}, best: 0, ts: 0, gems: 0, worlds: [], slevels: {}, items: [] });
  let user = store.get('ss_user', null);
  let settings = store.get('ss_settings', { orientation: DESKTOP ? 'landscape' : 'portrait', sound: true });
  let loadingGame = null;
  let friends = [], game = null, room = null, roomPeer = null, peerStats = null, current = null, history = [];
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

  // ---------- helpers ----------
  const at = h => '\u2066@' + h + '\u2069';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = root => (root || document).querySelectorAll('[data-ic]').forEach(e => { e.outerHTML = Art.icon(e.dataset.ic); });
  function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
  function modal(html, onBind) { $('#modal-card').innerHTML = html; icons($('#modal-card')); $('#modal').classList.remove('hidden'); onBind && onBind($('#modal-card')); }
  function closeModal() { $('#modal').classList.add('hidden'); }
  const coinHtml = n => `${Art.icon('coin')}<span>${Number(n).toLocaleString()}</span>`;
  const gemHtml = n => `${Art.icon('gem')}<span>${Number(n).toLocaleString()}</span>`;
  const walletHtml = D => `<span class="wal">${coinHtml(D.coins)}</span><span class="wal gemc">${gemHtml(D.gems || 0)}</span>`;
  const errText = e => {
    const m = (e && e.message) || '';
    if (m.includes('handle_taken')) return t('e_handle_taken');
    if (m.includes('bad_handle')) return t('e_bad_handle');
    if (m.includes('code_not_found')) return t('e_code_not_found');
    if (m.includes('self')) return t('e_self');
    if (m.includes('bad_login')) return t('e_bad_login');
    if (m.includes('bad_code') || m.includes('code_expired')) return t('e_bad_code');
    if (m.includes('bad_email')) return t('e_bad_email');
    if (m.includes('email_taken')) return t('e_email_taken');
    if (m.includes('email_set')) return t('e_email_set');
    if (m.includes('too_soon')) return t('e_too_soon');
    if (m.includes('smtp_not_configured')) return t('e_smtp');
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
  $('#r-cutvid').addEventListener('click', () => signInWithCutvid('login'));

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
    const cutvidFallback = async () => {
      try { await Net.cvEmailCode(email); step('cvcode'); }
      catch (e) {
        if (e.message === 'cv_no_account') step(intent === 'login' ? 'noplayer' : 'later');
        else if (e.message === 'cv_send_failed') { closeModal(); toast(t('cv_send_redirect'), 4000); setTimeout(() => signInWithCutvid(intent === 'add' ? 'link' : 'login'), 900); }
        else step('later');
      }
    };
    const sendFailed = e => /send_failed|smtp_not_configured|offline|Failed to fetch|FunctionsFetchError/i.test(String(e && e.message));
    const step = (state, msg) => {
      const codeInput = `<input id="ef-code" inputmode="numeric" maxlength="8" dir="ltr" autocomplete="one-time-code" placeholder="123456" style="text-align:center;font-size:24px;letter-spacing:6px">`;
      const body = {
        email: `<label>${t('email_label')}<input id="ef-email" type="email" dir="ltr" autocomplete="email" placeholder="you@gmail.com" value="${esc(email)}"></label>
          <button class="btn primary" id="ef-go">${t('next')}</button>`,
        code: `<p class="small">${t('email_6_sent', { e: `<b dir="ltr">${esc(email)}</b>` })}</p>${codeInput}
          <button class="btn primary" id="ef-go">${intent === 'add' ? t('verify') : t('login')}</button>`,
        cvcode: `<p class="small">${Art.icon('cutvid')} ${t('cv_code_sent', { e: `<b dir="ltr">${esc(email)}</b>` })}</p>${codeInput}
          <button class="btn primary" id="ef-go">${intent === 'add' ? t('verify') : t('login')}</button>`,
        later: `<div style="font-size:40px">⏳</div><p>${t('cv_try_later')}</p><button class="btn primary" id="ef-go">${t('try_again')}</button>`,
        noplayer: `<p>${t('no_player_email')}</p><button class="btn primary" id="ef-go">${t('tab_new')}</button>`,
      }[state];
      modal(`<div style="font-size:40px">✉️</div><h2>${intent === 'add' ? t('add_email') : t('login_email_title')}</h2>
        ${state === 'email' && intent === 'add' ? `<p class="muted small">${t('ask_email_body')}</p>` : ''}
        ${body}<div class="status ${msg && msg.ok ? 'ok' : 'err'}" id="ef-st">${msg ? esc(msg.text) : ''}</div>
        <button class="btn ghost" id="ef-x">${t('cancel')}</button>`, m => {
        m.querySelector('#ef-x').onclick = closeModal;
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
                catch (e) { if (sendFailed(e)) await cutvidFallback(); else throw e; }
              } else {
                let r;
                try { r = await Net.emailLoginStartByEmail(email, I18N.lang); }
                catch (e) { if (sendFailed(e)) return cutvidFallback(); throw e; }
                if (r && r.found) step('code'); else await cutvidFallback(); // not a SpaceShip email: maybe a CutVid account
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
        ${user.offline ? '' : `<button class="chip" id="s-notif">${settings.notify ? '🔔 ' + t('updates_on') : '🔕 ' + t('updates_off')}</button>`}
      </div>
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
      <button class="btn primary" id="p-save">${t('save')}</button>${user.offline ? '' : `<button class="btn ghost" id="p-out">${t('sign_out')}</button>`}<button class="btn ghost" id="p-x">${t('close')}</button>`, m => {
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
      m.querySelector('#p-save').onclick = () => { const n = m.querySelector('#p-name').value.trim(); if (n) { user.name = n; save(); } closeModal(); renderMenu(); };
      m.querySelector('#p-x').onclick = closeModal;
      const cvb = m.querySelector('#p-cv'); if (cvb) cvb.onclick = () => { closeModal(); signInWithCutvid('link'); };
    });
  }

  // ---------- levels ----------
  function renderLevels() {
    $$('[data-coins]').forEach(e => e.innerHTML = walletHtml(user.data));
    const L = user.data.levels; let html = '';
    for (let n = 1; n <= LEVELS; n++) {
      const stars = L[n] || 0, unlocked = n === 1 || L[n - 1] > 0, next = unlocked && !stars;
      html += `<button data-bl="${t('hud_boss').replace(/[!！]/g, '')}" class="lv ${levelCfg(n).boss ? 'boss' : ''} ${unlocked ? '' : 'locked'} ${next ? 'next' : ''}" data-lv="${n}" ${unlocked ? '' : 'disabled'}>
        ${unlocked ? `<b>${n}</b><div class="stars">${[1, 2, 3].map(i => Art.icon(i <= stars ? 'star' : 'starOff')).join('')}</div>` : Art.icon('lock')}</button>`;
    }
    // secret worlds
    const D = user.data;
    html += `<div class="sw-head">${Art.icon('secret')} ${t('secret_worlds')} <small>${D.worlds.length}/${WORLDS.length}</small></div>`;
    WORLDS.forEach((w, i) => {
      const wn = i + 1;
      if (!D.worlds.includes(w.id)) {
        html += `<div class="world locked-w"><div class="w-title">${Art.icon('lock')} ${t('secret_world_q')}</div><div class="w-hint">${t('hint')} ${t(w.id + '_hint')}</div></div>`;
        return;
      }
      html += `<div class="world" style="--h:${w.hue}"><div class="w-title">${Art.icon('secret')} ${t(w.id + '_name')}</div><div class="w-levels">` +
        [1, 2, 3].map(k => {
          const key = wn + '-' + k, st = D.slevels[key] || 0, open = k === 1 || D.slevels[wn + '-' + (k - 1)] > 0;
          return `<button data-bl="${t('hud_boss').replace(/[!！]/g, '')}" class="lv sl ${open ? '' : 'locked'} ${k === 3 ? 'boss' : ''}" data-sw="${wn}" data-sk="${k}" ${open ? '' : 'disabled'}>
            ${open ? `<b>${wn}-${k}</b><div class="stars">${[1, 2, 3].map(j => Art.icon(j <= st ? 'star' : 'starOff')).join('')}</div>
            <span class="gem-r">${st ? '✓' : gemHtml(w.gems[k - 1])}</span>` : Art.icon('lock')}</button>`;
        }).join('') + `</div></div>`;
    });
    $('#lv-grid').innerHTML = html;
  }
  $('#lv-grid').addEventListener('click', e => {
    const s = e.target.closest('[data-sw]');
    if (s && !s.disabled) return startGame({ mode: 'level', level: 1, secret: { w: +s.dataset.sw, k: +s.dataset.sk } });
    const b = e.target.closest('[data-lv]'); if (b && !b.disabled) startGame({ mode: 'level', level: +b.dataset.lv });
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
        return `<div class="item special ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b><small>${t('shipd_' + s.id)}</small>
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
      return `<div class="item ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${t('ship_' + s.id)}</b>
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

  // ---------- friends ----------
  async function loadFriends() {
    if (!user || user.offline) return;
    try { friends = await Net.friends(user) || []; } catch (e) { console.warn(e); }
    if (current === 'friends') renderFriendsList();
    if (current === 'coop') renderCoopFriends();
    updateOnlineBadge();
  }
  function updateOnlineBadge() { const n = friends.filter(f => Net.isOnline(f.id)).length; const b = $('#m-online'); if (!b) return; b.textContent = n; b.classList.toggle('hidden', !n); }
  function renderFriends() {
    if (user.offline) { $('#f-mycode').textContent = '------'; $('#f-list').innerHTML = `<div class="empty">${t('need_server_friends')}</div>`; return; }
    $('#f-mycode').textContent = user.friend_code; renderFriendsList(); loadFriends();
  }
  function personRow(f, actions) {
    const on = Net.isOnline(f.id);
    return `<div class="person"><div class="avatar">${Art.avatar(f.avatar)}</div><div class="info"><b>${esc(f.name)}<span class="dot ${on ? 'on' : ''}"></span></b><small>@${esc(f.handle)}</small></div>${actions(f, on)}</div>`;
  }
  function renderFriendsList() {
    $('#f-list').innerHTML = friends.length ? friends.map(f => personRow(f, (f, on) =>
      `<button class="btn small ${on ? 'primary' : ''}" data-invite="${f.id}" ${on ? '' : 'disabled'}>${t('invite')}</button><button class="icon-btn" data-rm="${f.id}">${Art.icon('x')}</button>`)).join('')
      : `<div class="empty">${t('no_friends')}</div>`;
  }
  $('#f-list').addEventListener('click', async e => {
    const inv = e.target.closest('[data-invite]'), rm = e.target.closest('[data-rm]');
    if (inv) inviteFriend(inv.dataset.invite);
    if (rm) { const f = friends.find(x => x.id === rm.dataset.rm); if (!confirm(t('confirm_rm_friend', { h: at(f.handle) }))) return; try { await Net.removeFriend(user, f.id); friends = friends.filter(x => x !== f); renderFriendsList(); } catch (er) { toast(errText(er)); } }
  });
  $('#f-copy').addEventListener('click', () => copy(user.friend_code));
  $('#f-share').addEventListener('click', () => share(t('share_friend', { code: user.friend_code, h: '@' + user.handle })));
  $('#f-add').addEventListener('click', async () => {
    const code = $('#f-code').value.trim().toUpperCase(), st = $('#f-status');
    if (user.offline) return toast(t('need_server'));
    if (code.length < 6) { st.className = 'status err'; st.textContent = t('code6'); return; }
    try { const f = await Net.addFriend(user, code); st.className = 'status ok'; st.textContent = '✓ ' + t('friend_added', { h: at(f.handle) }); $('#f-code').value = ''; loadFriends();
      Net.sendTo(f.id, 'friend_added', { handle: user.handle, name: user.name }).catch(() => {}); }
    catch (e) { st.className = 'status err'; st.textContent = errText(e); }
  });

  // ---------- leaderboard ----------
  async function renderBoard() {
    $('#b-list').innerHTML = `<div class="empty">${t('loading')}</div>`;
    try {
      const rows = await Net.leaderboard();
      $('#b-list').innerHTML = rows.length ? rows.map((r, i) => `<div class="person ${r.id === user.id ? 'me-row' : ''}"><div class="rank">${i + 1}</div><div class="avatar">${Art.avatar(r.avatar)}</div><div class="info"><b>${esc(r.name)}</b><small>@${esc(r.handle)}</small></div><b style="color:var(--gold)">${r.best.toLocaleString()}</b></div>`).join('') : `<div class="empty">${t('no_records')}</div>`;
    } catch (e) { $('#b-list').innerHTML = `<div class="empty">${t('e_offline')}<br>${t('your_best', { n: user.data.best.toLocaleString() })}</div>`; }
  }

  // ---------- co-op ----------
  const myStats = () => {
    const D = user.data, has = id => (D.items || []).includes(id);
    return { weapon: D.up.weapon, shield: D.up.shield + (has('shield2') ? 2 : 0), magnet: D.up.magnet + (has('supermag') ? 5 : 0),
      life: D.up.life + (has('goldheart') ? 1 : 0), plasma: has('plasma') };
  };
  const meInfo = () => ({ id: user.id, handle: user.handle, name: user.name, avatar: user.avatar, skin: user.data.skin, stats: myStats() });
  const roomCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  function renderCoop() {
    $('#c-start').classList.toggle('hidden', !!room); $('#c-lobby').classList.toggle('hidden', !room);
    if (room) renderLobby(); else { renderCoopFriends(); loadFriends(); }
  }
  function renderCoopFriends() {
    const on = friends.filter(f => Net.isOnline(f.id));
    $('#c-friends').innerHTML = user.offline ? `<div class="empty">${t('need_server')}</div>` : on.length ? on.map(f => personRow(f, () => `<button class="btn small primary" data-invite="${f.id}">${t('invite')}</button>`)).join('') : `<div class="empty small">${t('no_online_friends')}</div>`;
  }
  $('#c-friends').addEventListener('click', e => { const b = e.target.closest('[data-invite]'); if (b) inviteFriend(b.dataset.invite); });
  function slot(p) { return p ? `<div class="avatar">${Art.avatar(p.avatar)}</div><b>${esc(p.name)}</b><small>@${esc(p.handle)}</small>` : `<div class="avatar"></div><b class="muted">${t('waiting')}</b>`; }
  function renderLobby() {
    $('#c-roomcode').textContent = room.code;
    const host = room.role === 'host' ? user : roomPeer, guest = room.role === 'host' ? roomPeer : user;
    $('#c-slot1').innerHTML = slot(host); $('#c-slot2').innerHTML = slot(guest);
    $('#c-slot2').classList.toggle('empty-slot', !guest);
    $('#c-hostctl').classList.toggle('hidden', room.role !== 'host');
    $('#c-wait').classList.toggle('hidden', room.role === 'host' || !roomPeer);
    if (room.role === 'host') {
      const sel = $('#c-level'), prev = sel.value;
      const L = user.data.levels; let o = `<option value="endless">${t('endless')}</option>`;
      for (let n = 1; n <= LEVELS; n++) if (n === 1 || L[n - 1] > 0) o += `<option value="${n}">${t('level_n', { n })}${levelCfg(n).boss ? ' ' + t('boss_tag') : ''}</option>`;
      sel.innerHTML = o; sel.value = prev || (room.nextLevel ? String(room.nextLevel) : '1'); if (!sel.value) sel.value = '1';
      $('#c-go').disabled = !(roomPeer && peerStats);
    }
    icons($('#c-lobby'));
  }
  function openRoom(code, role) {
    if (user.offline) return toast(t('need_server'));
    if (room) room.leave();
    roomPeer = null; peerStats = null;
    let found = false;
    room = Net.room(code, role, user, {
      onPeer: p => {
        if (role === 'guest' && p.role !== 'host') return;
        found = true; roomPeer = p; Sfx.init(); Sfx.power();
        if (role === 'guest') room.send('hello', meInfo());
        toast(t('in_room', { h: at(p.handle) }));
        if (current === 'coop') renderLobby();
      },
      onPeerLeft: () => {
        roomPeer = null; peerStats = null;
        if (game) { endGameAbrupt(t('friend_left_game')); }
        else toast(t('friend_left_room'));
        if (role === 'guest') { leaveRoom(); return; }
        if (current === 'coop') renderLobby();
      },
      onSync: others => { if (others.length > 1 && role === 'guest' && !found) { toast(t('room_full')); leaveRoom(); } },
      onMessage: (ev, p) => {
        if (ev === 'hello' && role === 'host') { peerStats = p; roomPeer = Object.assign(roomPeer || {}, p); room.send('hello', meInfo()); if (current === 'coop') renderLobby(); }
        else if (ev === 'hello' && role === 'guest') { peerStats = p; }
        else if (ev === 'start' && role === 'guest') startGame({ mode: p.mode, level: p.level, H: p.H, coop: { room, role: 'guest' }, peer: p.host });
        else if (ev === 'end' && role === 'guest' && game) { const r = p; setTimeout(() => game && onGameEnd(r), 200); }
        else if (game) game.onNet(ev, p);
      },
      onError: () => toast(t('room_conn')),
    });
    room.nextLevel = 1;
    if (role === 'guest') setTimeout(() => { if (room && room.code === code && !found) { toast(t('room_not_found')); leaveRoom(); } }, 7000);
    if (current !== 'coop') show('coop'); else renderCoop();
  }
  function leaveRoom() { if (room) { room.send('bye', {}); room.leave(); } room = null; roomPeer = null; peerStats = null; if (current === 'coop') renderCoop(); }
  $('#c-create').addEventListener('click', () => openRoom(roomCode(), 'host'));
  $('#c-join').addEventListener('click', () => { const c = $('#c-code').value.trim().toUpperCase(); if (c.length !== 5) { $('#c-status').className = 'status err'; $('#c-status').textContent = t('room5'); return; } openRoom(c, 'guest'); });
  $('#c-copy').addEventListener('click', () => share(t('share_room', { code: room.code })));
  $('#c-leave').addEventListener('click', leaveRoom);
  $('#c-go').addEventListener('click', () => {
    if (!roomPeer || !peerStats) return;
    const v = $('#c-level').value, mode = v === 'endless' ? 'endless' : 'level', level = mode === 'level' ? +v : 1;
    startGame({ mode, level, coop: { room, role: 'host' }, peer: peerStats });
  });
  async function inviteFriend(fid) {
    const f = friends.find(x => x.id === fid); if (!f) return;
    if (!room || room.role !== 'host') openRoom(roomCode(), 'host');
    try { await Net.sendInvite(fid, { code: room.code, from: { handle: user.handle, name: user.name, avatar: user.avatar } }); toast(t('invite_sent', { h: at(f.handle) })); }
    catch (e) { toast(t('invite_fail')); }
  }
  function onInvite(p) {
    if (game || !p || !p.code) return;
    notify(t('game_invite'), t('n_invite', { h: '@' + p.from.handle }));
    Sfx.init(); Sfx.power();
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>${t('game_invite')}</h2>
      <p><b>${esc(p.from.name)}</b> <span dir="ltr" style="color:var(--cyan)">@${esc(p.from.handle)}</span> ${t('invites_you')}</p>
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
    show('game', false);
    lockOrientation(settings.orientation);
    const wantLand = settings.orientation === 'landscape';
    const hint = () => $('#g-rotate').classList.toggle('hidden', !wantLand || innerWidth > innerHeight);
    hint(); setTimeout(hint, 600);
    const safeTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--st')) || 0;
    const start = () => {
      game = new Game($('#game'), {
        mode: o.mode, level: o.level, secret: o.secret || null, orientation: settings.orientation, H: o.H, safeTop: safeTop + 4,
        me: meInfo(), peer: o.peer, coop: o.coop, hd: DESKTOP, local2: !!o.local2,
        p2: o.local2 ? { id: 'p2', handle: 'player2', name: t('player2'), skin: user.data.skin === 'viper' ? 'falcon' : 'viper', stats: myStats() } : null,
        onEnd: r => onGameEnd(r), onPauseKey: () => pause(),
      });
      if (o.coop && o.coop.role === 'host') { room.send('start', { mode: o.mode, level: o.level, H: game.H, host: meInfo() }); }
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
    const r = game.result || { win: false, stars: 0, coins: game.coins, collected: game.coins, bonus: 0, score: game.score, level: game.level, mode: game.mode };
    toast(msg); onGameEnd(r);
  }
  function onGameEnd(r) {
    if (!game) return;
    const coop = game.coop, local2 = game.local2, D = user.data;
    stopGame();
    D.coins += r.coins;
    let newBest = false, unlocked = false, gemsWon = 0;
    D.gems = D.gems || 0; D.worlds = D.worlds || []; D.slevels = D.slevels || {}; D.items = D.items || [];
    const sec = r.secret, skey = sec ? sec.w + '-' + sec.k : null;
    if (r.mode === 'endless' && r.score > D.best) { D.best = r.score; newBest = true; }
    if (sec && r.win) {
      if (!D.slevels[skey]) gemsWon = WORLDS[sec.w - 1].gems[sec.k - 1];   // diamonds for the first clear
      D.slevels[skey] = Math.max(D.slevels[skey] || 0, r.stars);
    } else if (r.mode === 'level' && r.win) { unlocked = !D.levels[r.level] && r.level < LEVELS; D.levels[r.level] = Math.max(D.levels[r.level] || 0, r.stars); }
    D.gems += gemsWon;
    const newWorlds = (r.found || []).filter(id => !D.worlds.includes(id));
    D.worlds.push(...newWorlds);
    save();
    if (coop && room) room.nextLevel = r.mode === 'level' && r.win ? Math.min(LEVELS, r.level + 1) : r.level;
    const title = r.mode === 'endless' ? (newBest ? t('new_best') : t('game_over')) : r.win ? t('victory') : t('ship_hit');
    const stars = r.mode === 'level' && r.win ? `<div class="big-stars">${[1, 2, 3].map(i => Art.icon(i <= r.stars ? 'star' : 'starOff')).join('')}</div>` : '';
    const hasNext = sec ? r.win && sec.k < 3 : r.mode === 'level' && r.win && r.level < LEVELS;
    const worldsHtml = newWorlds.map(id => { const w = WORLDS.find(x => x.id === id); return `<div class="found">${Art.icon('secret')} ${t('found_world')} <b>${t(w.id + '_name')}</b><br><small>${t(w.id + '_how')} · ${t('waits_levels')}</small></div>`; }).join('');
    let buttons;
    if (coop) buttons = `<button class="btn primary big" id="e-lobby">${t('back_room')}</button><button class="btn ghost" id="e-menu">${t('menu')}</button>`;
    else buttons = `${hasNext ? `<button class="btn primary big" id="e-next">${t('next_level')}</button>` : ''}
      <button class="btn ${hasNext ? '' : 'primary big'}" id="e-retry">${r.win && r.mode === 'level' ? t('play_again') : t('try_again')}</button>
      <button class="btn" id="e-shop">${Art.icon('shop')}${t('shop')}</button><button class="btn ghost" id="e-menu">${t('menu')}</button>`;
    modal(`<h2>${title}</h2>${stars}
      ${sec ? `<div class="muted">✦ ${t(WORLDS[sec.w - 1].id + '_name')} ${sec.k}/3</div>` : r.mode === 'level' ? `<div class="muted">${t('level_n', { n: r.level })}${unlocked ? ' · ' + t('level_unlocked', { n: r.level + 1 }) : ''}</div>` : ''}
      ${gemsWon ? `<div class="reward gems">+${gemsWon} ${Art.icon('gem')}</div>` : ''}${worldsHtml}
      <div class="muted">${t('score')} <b style="color:#fff">${r.score.toLocaleString()}</b></div>
      <div class="reward">+${r.coins} ${Art.icon('coin')}</div>
      <div class="muted small">${t('collected_bonus', { a: r.collected, b: r.bonus })}</div>${buttons}`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#e-next', () => startGame(sec ? { mode: 'level', level: 1, secret: { w: sec.w, k: sec.k + 1 } } : { mode: 'level', level: r.level + 1, local2 }));
      on('#e-retry', () => startGame({ mode: r.mode, level: r.level, local2, secret: sec }));
      on('#e-shop', () => { closeModal(); history = ['menu']; show('shop', false); });
      on('#e-menu', () => { closeModal(); if (coop) leaveRoom(); history = []; show('menu', false); });
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
    Net.startPresence(user, { onInvite, ...realtime, onOnline: () => { updateOnlineBadge(); if (current === 'friends') renderFriendsList(); if (current === 'coop' && !room) renderCoopFriends(); } });
    loadFriends();
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
