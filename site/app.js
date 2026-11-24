// SpaceShip site: language switch (he/en), device detection and download links from /api/config.
(function () {
  const EN = {
    nav_features: 'Features', nav_worlds: 'Worlds', nav_download: 'Download', nav_faq: 'FAQ',
    free: 'Free · no ads', lead: 'Fly, shoot and win. 4 worlds with 2,000 levels, special ships, clubs with chat, and real-time play with friends.',
    dl_now: 'Download', more: "What's inside?",
    st_worlds: 'Worlds', st_levels: 'Levels', st_secret: 'Secret worlds', st_langs: 'Languages',
    feat_title: 'What awaits you in space',
    f1_t: '4 worlds, 2,000 levels', f1_p: 'Asteroid Belt, Frozen Nebula, Lava Galaxy and Void Core. Every world has its own enemy ships, background and music, and they open in order.',
    f2_t: '20 secret worlds', f2_p: 'Hidden between the levels. Find them to win diamonds and special rewards.',
    f3_t: 'Ships and weapons', f3_p: 'A huge shop with ships, auras, avatars and upgrades. The pricier the ship, the stronger and prettier its shots, all the way up to Supernova.',
    f4_t: 'Clubs with ranks', f4_p: 'Leader, co-leader, senior and member. Each club has a logo and a chat with word filters, and you can see who is online and who is in a game room.',
    f5_t: 'Play with friends', f5_p: 'Open a room, invite friends and play the same level together in real time. You can also ask to join a friend who is already playing.',
    f6_t: 'Cloud save', f6_p: 'All progress is saved to your account. Sign in on any device with your @name and an email code and continue where you left off.',
    worlds_title: 'Four worlds', worlds_sub: '500 levels in each world. Finish one and the next opens.',
    g1: 'Asteroid Belt', g2: 'Frozen Nebula', g3: 'Lava Galaxy', g4: 'Void Core',
    dl_title: 'Download', dl_sub: 'Free on every device.',
    ios_meta: 'iOS 13 or later', ios_btn: 'Download for iPhone', ios_soon: 'Coming soon',
    android_btn: 'Download APK', android_note: 'Open the file on your phone and allow "install from unknown sources".',
    win_btn: 'Install for Windows', win_port: 'Portable (no install)',
    mac_btn: 'Download for Mac', mac_note: 'First launch: right-click the app, then Open.',
    linux_btn: 'Download AppImage', linux_note: 'Mark the file as executable (chmod +x) and open it.',
    all_rel: 'All versions and files →', version: 'Version', mine: 'Your device', dl_for: 'Download for',
    shop_title: 'A huge shop', shop_sub: 'Collect coins and diamonds in the levels and buy new ships with special shots, auras, avatars, a helper drone, extra lives and speed, power and luck upgrades.',
    t1: 'Comet, Nebula, Titan, Vortex', t2: 'Diamond ships: Void, Aurora, Supernova', t3: 'Auras: Trail, Orbit, Storm',
    faq_title: 'FAQ',
    q1: 'Is the game really free?', a1: 'Yes. No payments and no ads. You earn every coin and diamond by playing.',
    q2: 'How do I switch devices without losing progress?', a2: 'On the new device choose "I have an account" and sign in with your @name and email. A sign-in code arrives by email and all your progress loads from the cloud.',
    q3: "Can I play with someone who isn't on my friends list?", a3: 'Yes. Being in the same club is enough, or just send them the room code.',
    q4: 'Windows shows a warning. Is that OK?', a4: 'Yes. The game is new and not yet known to SmartScreen. Click "More info" and then "Run anyway".',
    title: 'SpaceShip — space shooter',
  };
  const HE = {};
  document.querySelectorAll('[data-k]').forEach((el) => { HE[el.dataset.k] = el.textContent; });
  Object.assign(HE, { ios_soon: 'בקרוב', version: 'גרסה', mine: 'המכשיר שלך', dl_for: 'הורדה ל-', title: document.title });

  let lang = 'he';
  try { lang = localStorage.getItem('ss_site_lang') || (/^he\b/i.test(navigator.language) ? 'he' : 'en'); } catch (e) { lang = /^he\b/i.test(navigator.language) ? 'he' : 'en'; }
  const T = (k) => (lang === 'he' ? HE : EN)[k] || HE[k] || '';

  // which device is this?
  const ua = navigator.userAgent, isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const device = /iPhone|iPad|iPod/.test(ua) || isIPadOS ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  const NAMES = { ios: 'iPhone', android: 'Android', windows: 'Windows', mac: 'Mac', linux: 'Linux' };

  let cfg = null;
  const $ = (id) => document.getElementById(id);
  const mb = (n) => (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1) + ' MB';

  function apply() {
    document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-k]').forEach((el) => { el.textContent = T(el.dataset.k); });
    document.title = T('title');
    $('lang').textContent = lang === 'he' ? 'English' : 'עברית';
    document.querySelectorAll('.dl').forEach((c) => c.setAttribute('data-mine', T('mine')));
    if (device) { $('hero-dl-t').textContent = lang === 'he' ? T('dl_for') + NAMES[device] : T('dl_for') + ' ' + NAMES[device]; }
    links();
  }

  function links() {
    const files = (cfg && cfg.files) || {}, fallback = (cfg && cfg.page) || $('all-rel').href;
    for (const k of ['android', 'windows', 'windowsPortable', 'mac', 'linux']) {
      const a = $('dl-' + k), f = files[k];
      a.href = f ? f.url : fallback; a.removeAttribute('aria-disabled');
      const m = $('m-' + k); if (m && f) m.textContent = f.name.replace(/^SpaceShip-?/, '').replace(/^\./, '') + ' · ' + mb(f.size);
    }
    const ios = $('dl-ios');
    if (cfg && cfg.ios) { ios.href = cfg.ios; ios.removeAttribute('aria-disabled'); ios.firstElementChild.textContent = T('ios_btn'); }
    else { ios.href = '#'; ios.setAttribute('aria-disabled', 'true'); ios.firstElementChild.textContent = cfg ? T('ios_soon') : T('ios_btn'); }
    $('ios-note').textContent = (cfg && cfg.iosNote) || '';
    if (cfg && cfg.version) $('ver-line').textContent = T('version') + ' ' + cfg.version + (cfg.published ? ' · ' + new Date(cfg.published).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US') : '');
    if (cfg && cfg.page) $('all-rel').href = cfg.page;
    // hero button: straight to this device's file when there is one
    const hero = $('hero-dl'), mine = device && (device === 'ios' ? cfg && cfg.ios : files[device] && files[device].url);
    hero.href = mine || '#download';
  }

  if (device) { const c = document.querySelector('.dl[data-plat="' + device + '"]'); if (c) { c.classList.add('mine'); c.parentNode.prepend(c); } }
  $('lang').addEventListener('click', () => { lang = lang === 'he' ? 'en' : 'he'; try { localStorage.setItem('ss_site_lang', lang); } catch (e) {} apply(); });
  $('yr').textContent = new Date().getFullYear();
  apply();
  fetch('/api/config').then((r) => (r.ok ? r.json() : null)).then((d) => { cfg = d || { files: {} }; links(); }).catch(() => { cfg = { files: {} }; links(); });

  // starfield
  const cv = $('stars'), cx = cv.getContext('2d'); let W, H, stars = [];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function size() { const d = Math.min(devicePixelRatio || 1, 2); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d;
    stars = Array.from({ length: Math.round(innerWidth * innerHeight / 5000) }, () => ({ x: Math.random() * W, y: Math.random() * H, z: Math.random() * .8 + .2 })); }
  function draw() { cx.clearRect(0, 0, W, H);
    for (const s of stars) { if (!still) { s.y += s.z * 0.6; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
      cx.globalAlpha = s.z; cx.fillStyle = '#fff'; cx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2); }
    if (!still) requestAnimationFrame(draw); }
  addEventListener('resize', () => { size(); if (still) draw(); }); size(); draw();
})();
