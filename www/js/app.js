// SpaceShip app: screens, profile, shop, friends, co-op lobby
(function () {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const { Game, Sfx, levelCfg } = window.SSGame;
  const LEVELS = SS_CONFIG.LEVEL_COUNT;
  const Cap = window.Capacitor && window.Capacitor.Plugins || {};
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const PLATFORM = window.SS_PLATFORM || (NATIVE ? 'mobile' : 'web');
  const DESKTOP = PLATFORM === 'desktop' || (!NATIVE && matchMedia('(pointer: fine)').matches && innerWidth >= 900);

  const UPGRADES = [
    { id: 'weapon', name: 'תותח', icon: 'gun', desc: 'יותר יריות בכל צרור', base: 1, costs: [250, 600, 1200, 2500] },
    { id: 'shield', name: 'מגנים', icon: 'shield', desc: 'מגנים בתחילת כל שלב', base: 0, costs: [150, 300, 600, 1000, 1600] },
    { id: 'magnet', name: 'מגנט', icon: 'magnet', desc: 'מושך מטבעות מרחוק', base: 0, costs: [200, 500, 1000] },
    { id: 'life', name: 'חיים נוספים', icon: 'heart', desc: 'לב נוסף בכל משחק', base: 0, costs: [800, 2000] },
  ];

  // ---------- state ----------
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const defData = () => ({ coins: 100, ships: ['falcon'], avatars: [], skin: 'falcon', up: { weapon: 1, shield: 0, magnet: 0, life: 0 }, levels: {}, best: 0, ts: 0 });
  let user = store.get('ss_user', null);
  let settings = store.get('ss_settings', { orientation: DESKTOP ? 'landscape' : 'portrait', sound: true });
  let friends = [], game = null, room = null, roomPeer = null, peerStats = null, current = null, history = [];
  if (user) user.data = Object.assign(defData(), user.data || {});

  const save = () => {
    user.data.ts = Date.now(); store.set('ss_user', user);
    if (!user.offline) { clearTimeout(save.t); save.t = setTimeout(() => Net.save(user, user.data, user.data.best).catch(e => console.warn('save', e)), 800); }
  };
  const saveSettings = () => store.set('ss_settings', settings);
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
  const errText = e => {
    const m = (e && e.message) || '';
    if (m.includes('handle_taken')) return 'שם המשתמש הזה כבר תפוס';
    if (m.includes('bad_handle')) return 'שם משתמש: 3-20 תווים, אותיות אנגלית קטנות, מספרים, _ או .';
    if (m.includes('code_not_found')) return 'הקוד לא נמצא';
    if (m.includes('self')) return 'זה הקוד שלך 🙂';
    if (m.includes('bad_login')) return '@ או טוקן לא נכונים';
    if (m.includes('bad_code') || m.includes('code_expired')) return 'הקוד לא נכון או שפג תוקפו';
    if (m.includes('bad_email')) return 'כתובת אימייל לא תקינה';
    if (m.includes('email_taken')) return 'האימייל הזה כבר מחובר למשתמש אחר';
    if (m.includes('email_set')) return 'למשתמש עם אימייל אין טוקן';
    if (m.includes('too_soon')) return 'חכה חצי דקה ונסה שוב';
    if (m.includes('smtp_not_configured')) return 'שליחת מיילים עוד לא הוגדרה בשרת';
    if (m.includes('send_failed')) return 'לא הצלחנו לשלוח מייל, נסה שוב';
    if (m.includes('oauth_not_configured')) return 'ההתחברות עם CutVid עוד לא הופעלה';
    if (m.includes('oauth_denied')) return 'ביטלת את ההתחברות עם CutVid';
    if (m.includes('oauth_failed')) return 'ההתחברות עם CutVid נכשלה, נסה שוב';
    if (m.includes('cutvid_unauthorized')) return 'ההתחברות ל-CutVid פגה, נסה שוב';
    if (m.includes('already_linked')) return 'חשבון ה-CutVid הזה כבר מחובר למשתמש אחר';
    if (m.includes('unauthorized')) return 'שגיאת התחברות';
    return 'אין חיבור לשרת';
  };
  function copy(text) { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('הועתק!'), () => toast(text)); }
  function share(text) { if (Cap.Share) return Cap.Share.share({ text }); if (navigator.share) return navigator.share({ text }).catch(() => {}); copy(text); }

  // ---------- navigation ----------
  function show(name, push = true) {
    if (current && push && current !== name) history.push(current);
    $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
    current = name;
    $('#bgfx').style.display = name === 'game' ? 'none' : '';
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
    if (cvPending) $('#r-cvbanner').innerHTML = `${Art.icon('cutvid')} מחובר ל-CutVid: <b dir="ltr">${esc(cvPending.email)}</b><br>בחר שם ושם משתמש ל-SpaceShip`;
    $('#r-cutvid').classList.toggle('hidden', !!cvPending);
  }
  $('#r-avatars').addEventListener('click', e => { const b = e.target.closest('[data-av]'); if (!b) return; regAvatar = b.dataset.av; renderRegister(); });
  $('#r-handle').addEventListener('input', e => {
    const v = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); if (v !== e.target.value) e.target.value = v;
    clearTimeout(checkT); checkT = setTimeout(checkHandle, 350);
  });
  async function checkHandle() {
    const h = $('#r-handle').value, st = $('#r-status'); handleOk = false;
    if (h.length < 3) { st.className = 'status'; st.textContent = h ? 'לפחות 3 תווים' : ''; return; }
    st.className = 'status'; st.textContent = 'בודק...';
    try {
      const ok = await Net.handleAvailable(h);
      if ($('#r-handle').value !== h) return;
      handleOk = ok; st.className = 'status ' + (ok ? 'ok' : 'err'); st.textContent = ok ? '✓ ' + at(h) + ' פנוי!' : '✗ ' + at(h) + ' כבר תפוס';
    } catch (e) { st.className = 'status err'; st.textContent = 'אין חיבור לשרת'; $('#r-offline').classList.remove('hidden'); }
  }
  $('#r-go').addEventListener('click', async () => {
    Sfx.init();
    const name = $('#r-name').value.trim(), h = $('#r-handle').value.trim(), st = $('#r-status');
    if (!name) { st.className = 'status err'; st.textContent = 'כתוב את השם שלך'; return; }
    if (!/^[a-z0-9_.]{3,20}$/.test(h)) { st.className = 'status err'; st.textContent = errText({ message: 'bad_handle' }); return; }
    $('#r-go').disabled = true;
    try {
      const r = cvPending ? (await Net.cutvidCall({ action: 'register', token: cvPending.token, handle: h, name, avatar: regAvatar })).profile : await Net.register(h, name, regAvatar);
      const data = user && user.offline ? user.data : defData();
      user = { id: r.id, secret: r.secret, handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code, data, cutvid: cvPending ? cvPending.email : undefined, has_token: !!r.token };
      cvPending = null;
      save(); rememberAccount(user); afterLogin(); show('menu'); history = []; toast('ברוך הבא ' + at(r.handle) + '!');
      if (r.token) showToken(r.token, true);
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
    toast('פותח את CutVid…');
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
      finishLogin(r, { cutvid: res.email || email });
    } else { cvPending = { token, email: res.email || email }; show('register', false); }
  }
  async function cutvidLink(token, email) {
    const res = await Net.cutvidCall({ action: 'link', token, id: user.id, secret: user.secret });
    user.cutvid = res.email || email; store.set('ss_user', user); closeModal(); toast('החשבון קושר ל-CutVid ✓');
  }
  $('#r-cutvid').addEventListener('click', () => signInWithCutvid('login'));

  // ---------- existing account: saved login key, @ + token, or @ + email code ----------
  function finishLogin(r, extra) {
    user = Object.assign({ id: r.id, secret: r.secret, handle: r.handle, name: r.name, avatar: r.avatar, friend_code: r.friend_code,
      email: r.email || null, has_token: !!r.has_token, data: Object.assign(defData(), r.data || {}) }, extra || {});
    store.set('ss_user', user); rememberAccount(user); Net.stopPresence(); afterLogin();
    closeModal(); history = []; show('menu'); toast('ברוך הבא ' + at(r.handle) + '! ההתקדמות סונכרנה');
  }
  let loginMethod = 'token', codeSent = false;
  $('#r-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-rt]'); if (!b) return;
    $$('#r-tabs .tab').forEach(t => t.classList.toggle('on', t === b));
    $('#r-new').classList.toggle('hidden', b.dataset.rt !== 'new'); $('#r-login').classList.toggle('hidden', b.dataset.rt !== 'login');
    if (b.dataset.rt === 'login') renderSaved();
  });
  $('#l-method').addEventListener('click', e => {
    const b = e.target.closest('[data-lm]'); if (!b) return;
    loginMethod = b.dataset.lm; codeSent = false;
    $$('#l-method button').forEach(x => x.classList.toggle('on', x === b));
    $('#l-token-box').classList.toggle('hidden', loginMethod !== 'token'); $('#l-email-box').classList.toggle('hidden', loginMethod !== 'email');
    $('#l-code-row').classList.add('hidden'); $('#l-go').textContent = loginMethod === 'email' ? 'שלח לי קוד' : 'כניסה'; $('#l-status').textContent = '';
  });
  $('#l-handle').addEventListener('input', e => { const v = e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''); if (v !== e.target.value) e.target.value = v; });
  function renderSaved() {
    const list = savedAccounts();
    $('#l-saved').innerHTML = list.length ? `<div class="lbl">מפתחות התחברות שמורים במכשיר</div><div class="saved-acc">${list.map(a =>
      `<button class="person" data-acc="${esc(a.id)}"><div class="avatar">${Art.avatar(a.avatar)}</div><div class="info"><b>${esc(a.name)}</b><small>@${esc(a.handle)}</small></div><span class="chip">כניסה</span></button>`).join('')}</div><div class="or"><span>או</span></div>` : '';
  }
  $('#l-saved').addEventListener('click', async e => {
    const b = e.target.closest('[data-acc]'); if (!b) return;
    const a = savedAccounts().find(x => x.id === b.dataset.acc); const st = $('#l-status');
    st.className = 'status'; st.textContent = 'מתחבר...';
    try { const r = await Net.login(a.id, a.secret); finishLogin(Object.assign(r, { secret: a.secret })); }
    catch (er) {
      st.className = 'status err'; st.textContent = errText(er);
      if (String(er.message).includes('unauthorized')) { store.set('ss_accounts', savedAccounts().filter(x => x.id !== a.id)); renderSaved(); }
    }
  });
  $('#l-go').addEventListener('click', async () => {
    Sfx.init();
    const h = $('#l-handle').value.trim(), st = $('#l-status'), btn = $('#l-go');
    if (h.length < 3) { st.className = 'status err'; st.textContent = 'כתוב את שם המשתמש (@)'; return; }
    btn.disabled = true; st.className = 'status'; st.textContent = 'רגע...';
    try {
      if (loginMethod === 'token') {
        const t = $('#l-token').value.trim();
        if (t.replace(/[^a-z0-9]/gi, '').length < 12) throw new Error('bad_login');
        finishLogin(await Net.loginToken(h, t));
      } else if (!codeSent) {
        const em = $('#l-email').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) throw new Error('bad_email');
        await Net.emailLoginStart(h, em);
        codeSent = true; $('#l-code-row').classList.remove('hidden'); btn.textContent = 'כניסה';
        st.className = 'status ok'; st.textContent = 'אם @ והאימייל מתאימים — שלחנו קוד למייל'; $('#l-code').focus();
      } else {
        const r = await Net.emailLoginConfirm(h, $('#l-code').value.trim());
        if (!r || r.error) throw new Error('bad_code');
        finishLogin(r);
      }
    } catch (e) { st.className = 'status err'; st.textContent = errText(e); }
    finally { btn.disabled = false; }
  });

  // The login token is shown in full only here. It signs in on other devices together with the @handle.
  function showToken(token, first) {
    modal(`<h2>${first ? 'הטוקן הסודי שלך' : 'טוקן חדש'}</h2>
      <p class="muted small">כדי להיכנס למשתמש <b dir="ltr">@${esc(user.handle)}</b> ממכשיר אחר מזינים את ה-@ ואת הטוקן. ההתקדמות מסתנכרנת אוטומטית.</p>
      <div class="token-box" id="t-val">${esc(token)}</div>
      <div class="row center"><button class="chip" id="t-copy">${Art.icon('copy')}העתק</button><button class="chip" id="t-share">${Art.icon('send')}שתף</button><button class="chip" id="t-file">שמור כקובץ</button></div>
      <div class="warn">⚠️ שמור אותו במקום בטוח (מנהל סיסמאות, צילום מסך, פתק). לא נוכל להציג אותו שוב, ומי שיש לו את הטוקן יכול להיכנס למשתמש.${first ? '<br>רוצה בלי טוקן? הגדר אימייל בפרופיל.' : ''}</div>
      <label class="check"><input type="checkbox" id="t-ok"> שמרתי את הטוקן</label>
      <button class="btn primary" id="t-done" disabled>המשך</button>`, m => {
      const text = `SpaceShip\n@${user.handle}\n${token}`;
      m.querySelector('#t-copy').onclick = () => copy(token);
      m.querySelector('#t-share').onclick = () => share(text);
      m.querySelector('#t-file').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' })); a.download = `SpaceShip-${user.handle}-token.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
      m.querySelector('#t-ok').onchange = e => { m.querySelector('#t-done').disabled = !e.target.checked; };
      m.querySelector('#t-done').onclick = closeModal;
    });
  }

  $('#r-offline').addEventListener('click', () => {
    const name = $('#r-name').value.trim() || 'טייס', h = $('#r-handle').value.trim() || 'pilot';
    user = user || { id: 'local-' + Math.random().toString(36).slice(2), handle: h, name, avatar: regAvatar, offline: true, data: defData() };
    Object.assign(user, { name, handle: h, avatar: regAvatar, offline: true }); save(); show('menu'); history = [];
  });

  // ---------- menu ----------
  function renderMenu() {
    $('#m-me').innerHTML = `<div class="avatar">${Art.avatar(user.avatar)}</div><div><b>${esc(user.name)}</b><small>@${esc(user.handle)}</small></div>`;
    $('#m-coins').innerHTML = coinHtml(user.data.coins);
    $('#t-orient').innerHTML = settings.orientation === 'landscape' ? Art.icon('rotateL') + 'מצב: לרוחב' : Art.icon('rotate') + 'מצב: לאורך';
    $('#t-sound').innerHTML = settings.sound ? Art.icon('sound') + 'צליל' : Art.icon('mute') + 'מושתק';
    $('#m-offline').classList.toggle('hidden', !user.offline);
    $('#m-local2').classList.toggle('hidden', !DESKTOP); $('#m-desk').classList.toggle('hidden', !DESKTOP);
    updateOnlineBadge();
  }
  $('#m-me').addEventListener('click', () => editProfile());
  $('#m-local2').addEventListener('click', () => {
    const L = user.data.levels; let o = '<option value="endless">מצב אינסופי</option>';
    for (let n = 1; n <= LEVELS; n++) if (n === 1 || L[n - 1] > 0) o += `<option value="${n}">שלב ${n}${levelCfg(n).boss ? ' (בוס)' : ''}</option>`;
    modal(`<h2>2 שחקנים</h2>
      <div class="vs"><div class="slot"><div class="avatar">${Art.avatar(user.avatar)}</div><b>${esc(user.name)}</b><small>WASD / ג'ויסטיק 1</small></div><div class="plus">+</div>
      <div class="slot"><div class="avatar">${Art.avatar('alien')}</div><b>שחקן 2</b><small>חצים / ג'ויסטיק 2</small></div></div>
      <select id="l2-lv">${o}</select><button class="btn primary big" id="l2-go">התחל!</button><button class="btn ghost" id="l2-x">ביטול</button>`, m => {
      m.querySelector('#l2-x').onclick = closeModal;
      m.querySelector('#l2-go').onclick = () => { const v = m.querySelector('#l2-lv').value; startGame(v === 'endless' ? { mode: 'endless', local2: true } : { mode: 'level', level: +v, local2: true }); };
    });
  });
  $('#t-orient').addEventListener('click', () => { settings.orientation = settings.orientation === 'landscape' ? 'portrait' : 'landscape'; saveSettings(); renderMenu(); toast(settings.orientation === 'landscape' ? 'החללית תטוס ימינה — לרוחב' : 'החללית תטוס למעלה — לאורך'); });
  $('#t-sound').addEventListener('click', () => { settings.sound = Sfx.on = !settings.sound; saveSettings(); renderMenu(); });
  $('#m-reg').addEventListener('click', e => { e.preventDefault(); show('register'); });
  function editProfile() {
    modal(`<h2>הפרופיל שלי</h2><div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(user.avatar)}</div>
      <b dir="ltr" style="color:var(--cyan)">@${esc(user.handle)}</b>
      <label>שם<input id="p-name" maxlength="24" value="${esc(user.name)}"></label>
      <p class="muted small">שם המשתמש (@) ייחודי וקבוע. אייקונים נוספים — בחנות.</p>
      ${user.offline ? '' : `<div class="sec"><h3>התחברות ממכשירים אחרים</h3>${user.email
        ? `<div class="small">אימייל: <b dir="ltr">${esc(user.email)}</b><br><span class="muted">נכנסים עם @ ואימייל (קוד נשלח למייל). אין טוקן.</span></div><button class="btn small" id="p-em-rm">הסר אימייל וחזור לטוקן</button>`
        : `<div class="small muted">נכנסים עם @ והטוקן הסודי. רוצה בלי טוקן? הגדר אימייל.</div>
           <div class="row"><input id="p-email" type="email" dir="ltr" placeholder="you@gmail.com"><button class="btn small" id="p-em-send">שלח קוד</button></div>
           <div class="row hidden" id="p-em-code-row"><input id="p-em-code" inputmode="numeric" maxlength="6" dir="ltr" placeholder="123456"><button class="btn small primary" id="p-em-ok">אמת</button></div>
           <div class="status" id="p-em-st"></div>
           <button class="btn small" id="p-tok">צור טוקן חדש</button>`}</div>`}
      ${user.offline ? '' : user.cutvid ? `<div class="cv-banner">${Art.icon('cutvid')} מקושר ל-CutVid: <b dir="ltr">${esc(user.cutvid)}</b></div>` : `<button class="btn cutvid" id="p-cv">${Art.icon('cutvid')}קשר חשבון CutVid</button>`}
      <button class="btn primary" id="p-save">שמור</button>${user.offline ? '' : '<button class="btn ghost" id="p-out">התנתק מהמכשיר</button>'}<button class="btn ghost" id="p-x">סגור</button>`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      const st = m.querySelector('#p-em-st');
      const say = (t, ok) => { if (st) { st.className = 'status ' + (ok ? 'ok' : 'err'); st.textContent = t; } else toast(t); };
      on('#p-em-send', async () => {
        const em = m.querySelector('#p-email').value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) return say(errText({ message: 'bad_email' }));
        try { await Net.emailSetStart(user, em); m.querySelector('#p-em-code-row').classList.remove('hidden'); say('שלחנו קוד ל-' + em, true); }
        catch (e) { say(errText(e)); }
      });
      on('#p-em-ok', async () => {
        try {
          const em = await Net.emailSetConfirm(user, m.querySelector('#p-em-code').value.trim());
          if (!em) return say(errText({ message: 'bad_code' }));
          user.email = em; user.has_token = false; store.set('ss_user', user); closeModal(); toast('האימייל נשמר — מעכשיו נכנסים עם @ ואימייל, והטוקן בוטל', 4000);
        } catch (e) { say(errText(e)); }
      });
      on('#p-em-rm', async () => {
        if (!confirm('להסיר את האימייל? תקבל טוקן חדש להתחברות.')) return;
        try { const t = await Net.emailRemove(user); user.email = null; user.has_token = true; store.set('ss_user', user); showToken(t, false); } catch (e) { toast(errText(e)); }
      });
      on('#p-tok', async () => {
        if (!confirm('ליצור טוקן חדש? הטוקן הקודם יפסיק לעבוד.')) return;
        try { const t = await Net.regenToken(user); user.has_token = true; store.set('ss_user', user); showToken(t, false); } catch (e) { toast(errText(e)); }
      });
      on('#p-out', () => {
        if (!confirm('להתנתק? מפתח ההתחברות נשאר שמור במכשיר, ואפשר להיכנס שוב מ"יש לי משתמש".')) return;
        Net.stopPresence(); user = null; store.set('ss_user', null); closeModal(); friends = []; history = []; show('register', false);
        $('#r-tabs [data-rt="login"]').click();
      });
      m.querySelector('#p-save').onclick = () => { const n = m.querySelector('#p-name').value.trim(); if (n) { user.name = n; save(); } closeModal(); renderMenu(); };
      m.querySelector('#p-x').onclick = closeModal;
      const cvb = m.querySelector('#p-cv'); if (cvb) cvb.onclick = () => { closeModal(); signInWithCutvid('link'); };
    });
  }

  // ---------- levels ----------
  function renderLevels() {
    $$('[data-coins]').forEach(e => e.innerHTML = coinHtml(user.data.coins));
    const L = user.data.levels; let html = '';
    for (let n = 1; n <= LEVELS; n++) {
      const stars = L[n] || 0, unlocked = n === 1 || L[n - 1] > 0, next = unlocked && !stars;
      html += `<button class="lv ${levelCfg(n).boss ? 'boss' : ''} ${unlocked ? '' : 'locked'} ${next ? 'next' : ''}" data-lv="${n}" ${unlocked ? '' : 'disabled'}>
        ${unlocked ? `<b>${n}</b><div class="stars">${[1, 2, 3].map(i => Art.icon(i <= stars ? 'star' : 'starOff')).join('')}</div>` : Art.icon('lock')}</button>`;
    }
    $('#lv-grid').innerHTML = html;
  }
  $('#lv-grid').addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (b && !b.disabled) startGame({ mode: 'level', level: +b.dataset.lv }); });

  // ---------- shop ----------
  let shopTab = 'ships';
  $('#shop-tabs').addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (!t) return; shopTab = t.dataset.tab; $$('#shop-tabs .tab').forEach(x => x.classList.toggle('on', x === t)); renderShop(); });
  function renderShop() {
    const D = user.data; $$('[data-coins]').forEach(e => e.innerHTML = coinHtml(D.coins));
    let html = '';
    if (shopTab === 'ships') html = Art.SHIPS.map(s => {
      const own = D.ships.includes(s.id), eq = D.skin === s.id;
      return `<div class="item ${eq ? 'eq' : ''}"><img src="${Art.shipPreview(s.id, 160)}" alt=""><b>${s.name}</b>
        ${eq ? '<button class="btn small" disabled>בשימוש ✓</button>' : own ? `<button class="btn small" data-equip="${s.id}">השתמש</button>` : `<button class="btn small gold" data-buy-ship="${s.id}" ${D.coins < s.price ? 'disabled' : ''}>${coinHtml(s.price)}</button>`}</div>`;
    }).join('');
    else if (shopTab === 'up') html = UPGRADES.map(u => {
      const lvl = D.up[u.id] || u.base, i = lvl - u.base, max = i >= u.costs.length, cost = u.costs[i];
      return `<div class="item"><div class="pic">${Art.icon(u.icon)}</div><b>${u.name}</b><small>${u.desc}</small>
        <div class="pips">${u.costs.map((_, j) => `<i class="${j < i ? 'on' : ''}"></i>`).join('')}</div>
        ${max ? '<button class="btn small" disabled>מקסימום ✓</button>' : `<button class="btn small gold" data-up="${u.id}" ${D.coins < cost ? 'disabled' : ''}>${coinHtml(cost)}</button>`}</div>`;
    }).join('');
    else html = Art.AVATARS.map(a => {
      const own = a.price === 0 || D.avatars.includes(a.id), eq = user.avatar === a.id;
      return `<div class="item ${eq ? 'eq' : ''}"><div class="pic avatar">${Art.avatar(a.id)}</div>
        ${eq ? '<button class="btn small" disabled>בשימוש ✓</button>' : own ? `<button class="btn small" data-av-eq="${a.id}">השתמש</button>` : `<button class="btn small gold" data-buy-av="${a.id}" ${D.coins < a.price ? 'disabled' : ''}>${coinHtml(a.price)}</button>`}</div>`;
    }).join('');
    $('#shop-list').innerHTML = html;
  }
  $('#shop-list').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return; const D = user.data;
    const pay = c => { if (D.coins < c) { toast('אין מספיק מטבעות'); return false; } D.coins -= c; Sfx.init(); Sfx.coin(); return true; };
    if (b.dataset.equip) D.skin = b.dataset.equip;
    else if (b.dataset.buyShip) { const s = Art.SHIPS.find(x => x.id === b.dataset.buyShip); if (!pay(s.price)) return; D.ships.push(s.id); D.skin = s.id; toast('קנית את ' + s.name + '!'); }
    else if (b.dataset.up) { const u = UPGRADES.find(x => x.id === b.dataset.up), lvl = D.up[u.id] || u.base; if (!pay(u.costs[lvl - u.base])) return; D.up[u.id] = lvl + 1; toast(u.name + ' שודרג!'); }
    else if (b.dataset.avEq) user.avatar = b.dataset.avEq;
    else if (b.dataset.buyAv) { const a = Art.AVATARS.find(x => x.id === b.dataset.buyAv); if (!pay(a.price)) return; D.avatars.push(a.id); user.avatar = a.id; toast('אייקון חדש!'); }
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
    if (user.offline) { $('#f-mycode').textContent = '------'; $('#f-list').innerHTML = '<div class="empty">צריך להתחבר לשרת כדי להוסיף חברים</div>'; return; }
    $('#f-mycode').textContent = user.friend_code; renderFriendsList(); loadFriends();
  }
  function personRow(f, actions) {
    const on = Net.isOnline(f.id);
    return `<div class="person"><div class="avatar">${Art.avatar(f.avatar)}</div><div class="info"><b>${esc(f.name)}<span class="dot ${on ? 'on' : ''}"></span></b><small>@${esc(f.handle)}</small></div>${actions(f, on)}</div>`;
  }
  function renderFriendsList() {
    $('#f-list').innerHTML = friends.length ? friends.map(f => personRow(f, (f, on) =>
      `<button class="btn small ${on ? 'primary' : ''}" data-invite="${f.id}" ${on ? '' : 'disabled'}>הזמן</button><button class="icon-btn" data-rm="${f.id}">${Art.icon('x')}</button>`)).join('')
      : '<div class="empty">עוד אין לך חברים. שתף את הקוד שלך!</div>';
  }
  $('#f-list').addEventListener('click', async e => {
    const inv = e.target.closest('[data-invite]'), rm = e.target.closest('[data-rm]');
    if (inv) inviteFriend(inv.dataset.invite);
    if (rm) { const f = friends.find(x => x.id === rm.dataset.rm); if (!confirm('להסיר את ' + at(f.handle) + '?')) return; try { await Net.removeFriend(user, f.id); friends = friends.filter(x => x !== f); renderFriendsList(); } catch (er) { toast(errText(er)); } }
  });
  $('#f-copy').addEventListener('click', () => copy(user.friend_code));
  $('#f-share').addEventListener('click', () => share(`בוא נהיה חברים ב-SpaceShip! קוד החבר שלי: ${user.friend_code}  (@${user.handle})`));
  $('#f-add').addEventListener('click', async () => {
    const code = $('#f-code').value.trim().toUpperCase(), st = $('#f-status');
    if (user.offline) return toast('צריך להתחבר לשרת');
    if (code.length < 6) { st.className = 'status err'; st.textContent = 'הקוד הוא 6 תווים'; return; }
    try { const f = await Net.addFriend(user, code); st.className = 'status ok'; st.textContent = '✓ ' + at(f.handle) + ' נוסף לחברים!'; $('#f-code').value = ''; loadFriends(); }
    catch (e) { st.className = 'status err'; st.textContent = errText(e); }
  });

  // ---------- leaderboard ----------
  async function renderBoard() {
    $('#b-list').innerHTML = '<div class="empty">טוען...</div>';
    try {
      const rows = await Net.leaderboard();
      $('#b-list').innerHTML = rows.length ? rows.map((r, i) => `<div class="person ${r.id === user.id ? 'me-row' : ''}"><div class="rank">${i + 1}</div><div class="avatar">${Art.avatar(r.avatar)}</div><div class="info"><b>${esc(r.name)}</b><small>@${esc(r.handle)}</small></div><b style="color:var(--gold)">${r.best.toLocaleString()}</b></div>`).join('') : '<div class="empty">עוד אין שיאים — תהיה הראשון!</div>';
    } catch (e) { $('#b-list').innerHTML = `<div class="empty">אין חיבור לשרת<br>השיא שלך: ${user.data.best.toLocaleString()}</div>`; }
  }

  // ---------- co-op ----------
  const myStats = () => ({ weapon: user.data.up.weapon, shield: user.data.up.shield, magnet: user.data.up.magnet, life: user.data.up.life });
  const meInfo = () => ({ id: user.id, handle: user.handle, name: user.name, avatar: user.avatar, skin: user.data.skin, stats: myStats() });
  const roomCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.random() * 32 | 0]).join('');
  function renderCoop() {
    $('#c-start').classList.toggle('hidden', !!room); $('#c-lobby').classList.toggle('hidden', !room);
    if (room) renderLobby(); else { renderCoopFriends(); loadFriends(); }
  }
  function renderCoopFriends() {
    const on = friends.filter(f => Net.isOnline(f.id));
    $('#c-friends').innerHTML = user.offline ? '<div class="empty">צריך להתחבר לשרת</div>' : on.length ? on.map(f => personRow(f, () => `<button class="btn small primary" data-invite="${f.id}">הזמן</button>`)).join('') : '<div class="empty small">אין חברים מחוברים כרגע</div>';
  }
  $('#c-friends').addEventListener('click', e => { const b = e.target.closest('[data-invite]'); if (b) inviteFriend(b.dataset.invite); });
  function slot(p) { return p ? `<div class="avatar">${Art.avatar(p.avatar)}</div><b>${esc(p.name)}</b><small>@${esc(p.handle)}</small>` : `<div class="avatar"></div><b class="muted">ממתין...</b>`; }
  function renderLobby() {
    $('#c-roomcode').textContent = room.code;
    const host = room.role === 'host' ? user : roomPeer, guest = room.role === 'host' ? roomPeer : user;
    $('#c-slot1').innerHTML = slot(host); $('#c-slot2').innerHTML = slot(guest);
    $('#c-slot2').classList.toggle('empty-slot', !guest);
    $('#c-hostctl').classList.toggle('hidden', room.role !== 'host');
    $('#c-wait').classList.toggle('hidden', room.role === 'host' || !roomPeer);
    if (room.role === 'host') {
      const sel = $('#c-level'), prev = sel.value;
      const L = user.data.levels; let o = '<option value="endless">מצב אינסופי</option>';
      for (let n = 1; n <= LEVELS; n++) if (n === 1 || L[n - 1] > 0) o += `<option value="${n}">שלב ${n}${levelCfg(n).boss ? ' (בוס)' : ''}</option>`;
      sel.innerHTML = o; sel.value = prev || (room.nextLevel ? String(room.nextLevel) : '1'); if (!sel.value) sel.value = '1';
      $('#c-go').disabled = !(roomPeer && peerStats);
    }
    icons($('#c-lobby'));
  }
  function openRoom(code, role) {
    if (user.offline) return toast('צריך להתחבר לשרת');
    if (room) room.leave();
    roomPeer = null; peerStats = null;
    let found = false;
    room = Net.room(code, role, user, {
      onPeer: p => {
        if (role === 'guest' && p.role !== 'host') return;
        found = true; roomPeer = p; Sfx.init(); Sfx.power();
        if (role === 'guest') room.send('hello', meInfo());
        toast(at(p.handle) + ' בחדר!');
        if (current === 'coop') renderLobby();
      },
      onPeerLeft: () => {
        roomPeer = null; peerStats = null;
        if (game) { endGameAbrupt('החבר עזב את המשחק'); }
        else toast('החבר עזב את החדר');
        if (role === 'guest') { leaveRoom(); return; }
        if (current === 'coop') renderLobby();
      },
      onSync: others => { if (others.length > 1 && role === 'guest' && !found) { toast('החדר מלא'); leaveRoom(); } },
      onMessage: (ev, p) => {
        if (ev === 'hello' && role === 'host') { peerStats = p; roomPeer = Object.assign(roomPeer || {}, p); room.send('hello', meInfo()); if (current === 'coop') renderLobby(); }
        else if (ev === 'hello' && role === 'guest') { peerStats = p; }
        else if (ev === 'start' && role === 'guest') startGame({ mode: p.mode, level: p.level, H: p.H, coop: { room, role: 'guest' }, peer: p.host });
        else if (ev === 'end' && role === 'guest' && game) { const r = p; setTimeout(() => game && onGameEnd(r), 200); }
        else if (game) game.onNet(ev, p);
      },
      onError: () => toast('בעיית חיבור לחדר'),
    });
    room.nextLevel = 1;
    if (role === 'guest') setTimeout(() => { if (room && room.code === code && !found) { toast('החדר לא נמצא'); leaveRoom(); } }, 7000);
    if (current !== 'coop') show('coop'); else renderCoop();
  }
  function leaveRoom() { if (room) { room.send('bye', {}); room.leave(); } room = null; roomPeer = null; peerStats = null; if (current === 'coop') renderCoop(); }
  $('#c-create').addEventListener('click', () => openRoom(roomCode(), 'host'));
  $('#c-join').addEventListener('click', () => { const c = $('#c-code').value.trim().toUpperCase(); if (c.length !== 5) { $('#c-status').className = 'status err'; $('#c-status').textContent = 'קוד חדר הוא 5 תווים'; return; } openRoom(c, 'guest'); });
  $('#c-copy').addEventListener('click', () => share(`בוא לשחק איתי SpaceShip! קוד חדר: ${room.code}`));
  $('#c-leave').addEventListener('click', leaveRoom);
  $('#c-go').addEventListener('click', () => {
    if (!roomPeer || !peerStats) return;
    const v = $('#c-level').value, mode = v === 'endless' ? 'endless' : 'level', level = mode === 'level' ? +v : 1;
    startGame({ mode, level, coop: { room, role: 'host' }, peer: peerStats });
  });
  async function inviteFriend(fid) {
    const f = friends.find(x => x.id === fid); if (!f) return;
    if (!room || room.role !== 'host') openRoom(roomCode(), 'host');
    try { await Net.sendInvite(fid, { code: room.code, from: { handle: user.handle, name: user.name, avatar: user.avatar } }); toast('ההזמנה נשלחה ל-' + at(f.handle)); }
    catch (e) { toast('לא הצלחנו לשלוח הזמנה'); }
  }
  function onInvite(p) {
    if (game || !p || !p.code) return;
    Sfx.init(); Sfx.power();
    modal(`<div class="avatar" style="width:80px;height:80px;margin:0 auto">${Art.avatar(p.from.avatar)}</div><h2>הזמנה למשחק!</h2>
      <p><b>${esc(p.from.name)}</b> <span dir="ltr" style="color:var(--cyan)">@${esc(p.from.handle)}</span> מזמין אותך לשחק ביחד</p>
      <button class="btn primary big" id="i-yes">הצטרף</button><button class="btn ghost" id="i-no">לא עכשיו</button>`, m => {
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
        mode: o.mode, level: o.level, orientation: settings.orientation, H: o.H, safeTop: safeTop + 4,
        me: meInfo(), peer: o.peer, coop: o.coop, hd: DESKTOP, local2: !!o.local2,
        p2: o.local2 ? { id: 'p2', handle: 'player2', name: 'שחקן 2', skin: user.data.skin === 'viper' ? 'falcon' : 'viper', stats: myStats() } : null,
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
      modal(`<h2>לצאת מהמשחק?</h2><p class="muted">החבר שלך ימשיך לבד</p><button class="btn primary" id="q-no">המשך לשחק</button><button class="btn ghost" id="q-yes">צא</button>`, m => {
        m.querySelector('#q-no').onclick = closeModal;
        m.querySelector('#q-yes').onclick = () => { closeModal(); leaveRoom(); stopGame(); show('menu', false); history = []; };
      });
      return;
    }
    game.paused = true;
    modal(`<h2>הפסקה</h2><button class="btn primary big" id="p-res">המשך</button><button class="btn" id="p-restart">התחל מחדש</button><button class="btn ghost" id="p-quit">יציאה לתפריט</button>`, m => {
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
    let newBest = false, unlocked = false;
    if (r.mode === 'endless' && r.score > D.best) { D.best = r.score; newBest = true; }
    if (r.mode === 'level' && r.win) { unlocked = !D.levels[r.level] && r.level < LEVELS; D.levels[r.level] = Math.max(D.levels[r.level] || 0, r.stars); }
    save();
    if (coop && room) room.nextLevel = r.mode === 'level' && r.win ? Math.min(LEVELS, r.level + 1) : r.level;
    const title = r.mode === 'endless' ? (newBest ? 'שיא חדש!' : 'המשחק נגמר') : r.win ? 'ניצחון!' : 'החללית נפגעה';
    const stars = r.mode === 'level' && r.win ? `<div class="big-stars">${[1, 2, 3].map(i => Art.icon(i <= r.stars ? 'star' : 'starOff')).join('')}</div>` : '';
    const hasNext = r.mode === 'level' && r.win && r.level < LEVELS;
    let buttons;
    if (coop) buttons = `<button class="btn primary big" id="e-lobby">חזרה לחדר</button><button class="btn ghost" id="e-menu">תפריט</button>`;
    else buttons = `${hasNext ? '<button class="btn primary big" id="e-next">שלב הבא</button>' : ''}
      <button class="btn ${hasNext ? '' : 'primary big'}" id="e-retry">${r.win && r.mode === 'level' ? 'שחק שוב' : 'נסה שוב'}</button>
      <button class="btn" id="e-shop">${Art.icon('shop')}חנות</button><button class="btn ghost" id="e-menu">תפריט</button>`;
    modal(`<h2>${title}</h2>${stars}
      ${r.mode === 'level' ? `<div class="muted">שלב ${r.level}${unlocked ? ' · שלב ' + (r.level + 1) + ' נפתח!' : ''}</div>` : ''}
      <div class="muted">ניקוד: <b style="color:#fff">${r.score.toLocaleString()}</b></div>
      <div class="reward">+${r.coins} ${Art.icon('coin')}</div>
      <div class="muted small">נאספו ${r.collected} · בונוס ${r.bonus}</div>${buttons}`, m => {
      const on = (id, f) => { const b = m.querySelector(id); if (b) b.onclick = f; };
      on('#e-next', () => startGame({ mode: 'level', level: r.level + 1, local2 }));
      on('#e-retry', () => startGame({ mode: r.mode, level: r.level, local2 }));
      on('#e-shop', () => { closeModal(); history = ['menu']; show('shop', false); });
      on('#e-menu', () => { closeModal(); if (coop) leaveRoom(); history = []; show('menu', false); });
      on('#e-lobby', () => { closeModal(); if (!room) { show('menu', false); return; } history = ['menu']; show('coop', false); });
    });
  }

  // ---------- boot ----------
  async function afterLogin() {
    if (!user || user.offline) return;
    Net.startPresence(user, { onInvite, onOnline: () => { updateOnlineBadge(); if (current === 'friends') renderFriendsList(); if (current === 'coop' && !room) renderCoopFriends(); } });
    loadFriends();
  }
  const renders = { register: renderRegister, menu: renderMenu, levels: renderLevels, shop: renderShop, friends: renderFriends, board: renderBoard, coop: renderCoop };
  icons();
  // web: returning from CutVid's sign-in page (?code=…&state=…)
  if (!NATIVE && !window.SSDesktop && /[?&]code=/.test(location.search) && /[?&]state=/.test(location.search)) {
    const back = location.href; window.history.replaceState(null, '', location.pathname);
    const intent = store.get('ss_cv_intent', 'login'); store.set('ss_cv_intent', null);
    Net.cutvidOAuthFinish(back).then(token => intent === 'link' && user && !user.offline ? cutvidLink(token, '') : cutvidLogin(token, '')).catch(e => toast(errText(e), 3500));
  }
  if (!user) show('register');
  else {
    show('menu');
    if (!user.offline) Net.login(user.id, user.secret).then(r => {
      Object.assign(user, { handle: r.handle, friend_code: r.friend_code, email: r.email || null, has_token: !!r.has_token });
      if (r.data && (r.data.ts || 0) > (user.data.ts || 0)) { user.data = Object.assign(defData(), r.data); store.set('ss_user', user); if (current === 'menu') renderMenu(); }
      afterLogin();
    }).catch(e => { console.warn('login', e); if (String(e.message).includes('unauthorized')) { user.offline = true; store.set('ss_user', user); renderMenu(); } });
  }
  // automatic sync: pull newer progress from the server whenever the app comes back to the front
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !user || user.offline || game) return;
    Net.login(user.id, user.secret).then(r => {
      Object.assign(user, { handle: r.handle, name: r.name, avatar: r.avatar, email: r.email || null, has_token: !!r.has_token });
      if (r.data && (r.data.ts || 0) > (user.data.ts || 0)) user.data = Object.assign(defData(), r.data);
      store.set('ss_user', user); const fn = renders[current]; fn && current !== 'register' && fn();
    }).catch(() => {});
  });
  window.SSApp = { get user() { return user; }, startGame, show };
})();
