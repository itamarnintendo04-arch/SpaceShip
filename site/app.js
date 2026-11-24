// SpaceShip site: language switch (he/en), device detection and download links from /api/config.
(function () {
  const L = window.SITE_I18N, LANGS = window.SITE_LANGS;
  const EN = L.en;
  // English by default; the visitor can pick any of the 14 languages
  let lang = 'en';
  try { const v = localStorage.getItem('ss_site_lang'); if (v && L[v]) lang = v; } catch (e) {}
  const T = (k, x) => String((L[lang] || EN)[k] || EN[k] || '').replace('{x}', x || '');

  // which device is this?
  const ua = navigator.userAgent, isIPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const device = /iPhone|iPad|iPod/.test(ua) || isIPadOS ? 'ios' : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'mac' : /Linux|X11/.test(ua) ? 'linux' : null;
  const NAMES = { ios: 'iPhone', android: 'Android', windows: 'Windows', mac: 'Mac', linux: 'Linux' };

  let cfg = null;
  const $ = (id) => document.getElementById(id);
  const mb = (n) => (n / 1048576).toFixed(n > 100 * 1048576 ? 0 : 1) + ' MB';

  function apply() {
    document.documentElement.lang = lang; document.documentElement.dir = LANGS.find((l) => l.id === lang).rtl ? 'rtl' : 'ltr';
    document.querySelectorAll('[data-k]').forEach((el) => { el.textContent = T(el.dataset.k); });
    document.title = T('title');
    $('lang-code').textContent = lang.toUpperCase();
    document.querySelectorAll('[data-lang]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.lang === lang)));
    document.querySelectorAll('.dl').forEach((c) => c.setAttribute('data-mine', T('mine')));
    if (device) { $('hero-dl-t').textContent = T('dl_for', NAMES[device]); }
    links();
  }

  function links() {
    const files = (cfg && cfg.files) || {}, fallback = (cfg && cfg.page) || $('all-rel').href;
    for (const k of ['android', 'windows', 'windowsPortable', 'mac', 'linux']) {
      const a = $('dl-' + k), f = files[k];
      a.href = f ? f.url : fallback; a.removeAttribute('aria-disabled');
      const m = $('m-' + k); if (m && f) m.textContent = f.name.replace(/^SpaceShip-?/, '').replace(/^\./, '') + ' · ' + mb(f.size);
    }
    const ios = $('dl-ios'), iosUrl = cfg && (cfg.ios || (files.ios && files.ios.url));
    if (iosUrl) { ios.href = iosUrl; ios.removeAttribute('aria-disabled'); ios.firstElementChild.textContent = T('ios_btn'); }
    else { ios.href = fallback; ios.removeAttribute('aria-disabled'); ios.firstElementChild.textContent = T('ios_btn'); }
    $('ios-note').textContent = (cfg && cfg.iosNote) || (cfg && !cfg.ios && files.ios ? T('ios_unsigned') : '');
    if (cfg && cfg.version) $('ver-line').textContent = T('version') + ' ' + cfg.version + (cfg.published ? ' · ' + new Date(cfg.published).toLocaleDateString(lang) : '');
    if (cfg && cfg.page) $('all-rel').href = cfg.page;
    // quick download buttons under the hero, one per device
    for (const k of ['ios', 'android', 'windows', 'mac', 'linux']) {
      const q = $('q-' + k), url = k === 'ios' ? cfg && cfg.ios : files[k] && files[k].url;
      q.href = url || '#download'; q.classList.toggle('soon', !!cfg && !url);
      q.title = url ? T('dl_for', NAMES[k]) : (k === 'ios' ? T('ios_soon') : '');
    }
    // hero button: straight to this device's file when there is one
    const hero = $('hero-dl'), mine = device && (device === 'ios' ? cfg && (cfg.ios || (files.ios && files.ios.url)) : files[device] && files[device].url);
    hero.href = mine || '#download';
  }

  if (device) { const c = document.querySelector('.dl[data-plat="' + device + '"]'); if (c) { c.classList.add('mine'); c.parentNode.prepend(c); } }
  const menu = $('lang-menu'), langBtn = $('lang');
  menu.innerHTML = LANGS.map((l) => `<li><button type="button" data-lang="${l.id}" lang="${l.id}" dir="${l.rtl ? 'rtl' : 'ltr'}">${l.name}</button></li>`).join('');
  const openMenu = (on) => { menu.hidden = !on; langBtn.setAttribute('aria-expanded', String(on)); };
  langBtn.addEventListener('click', (e) => { e.stopPropagation(); openMenu(menu.hidden); });
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (!b) return;
    lang = b.dataset.lang; try { localStorage.setItem('ss_site_lang', lang); } catch (err) {} openMenu(false); apply(); });
  document.addEventListener('click', () => openMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') openMenu(false); });
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
