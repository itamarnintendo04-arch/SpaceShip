// SpaceShip cutscenes, drawn live on a canvas over the whole app (no video files):
//   Cutscene.intro(ship, T)          the opening: a bomb throws an innocent passer-by into a ship that wasn't ready,
//                                    his head hits the launch button and the ship (the player's current one) takes off
//   Cutscene.ship(ship, T, name)     a new ship: hangar, spotlight, the ship rises on a platform
//   Cutscene.warp(ship, T, o)        moving to another world: a hyperspace jump into the world's colours
// Every scene can be skipped (Skip button / tap). Scenes queue, so several can be asked for at once.
(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // canvas text follows the language's direction (Hebrew / Arabic right to left)
  const textDir = ctx => { ctx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr'; };
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const sfx = () => (window.SSGame && window.SSGame.Sfx) || null;
  const play = (name, ...a) => { const s = sfx(); if (s && s[name]) try { s[name](...a); } catch (e) {} };

  let queue = Promise.resolve();
  function run(scene) { const p = queue.then(scene, scene); queue = p.catch(() => {}); return p; }

  // a full-screen canvas with a Skip button; draw(ctx, t, W, H) until t >= dur or the player skips
  function stage(dur, draw, { skipText = 'Skip', tapToClose = 0 } = {}) {
    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.className = 'cutscene';
      const cv = document.createElement('canvas');
      const btn = document.createElement('button'); btn.className = 'cs-skip'; btn.textContent = skipText;
      wrap.append(cv, btn); document.body.appendChild(wrap);
      const ctx = cv.getContext('2d'); let W, H, dpr, done = false, t0 = performance.now(), raf;
      const size = () => { dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; };
      size(); addEventListener('resize', size);
      const end = () => { if (done) return; done = true; cancelAnimationFrame(raf); removeEventListener('resize', size);
        wrap.classList.add('out'); setTimeout(() => { wrap.remove(); resolve(); }, 260); };
      btn.onclick = e => { e.stopPropagation(); end(); };
      if (tapToClose) wrap.onclick = () => { if ((performance.now() - t0) / 1000 > tapToClose) end(); };
      const frame = now => {
        if (done) return;
        const t = typeof window.__csT === 'number' ? window.__csT : (now - t0) / 1000;   // __csT: a fixed time, for testing
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
        try { draw(ctx, t, W, H); } catch (e) { console.warn('cutscene', e); return end(); }
        if (t >= dur) return end();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
  }

  // ---------- shared drawing ----------
  const stars = Array.from({ length: 160 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
  function starfield(ctx, W, H, t, drift = 0, tint = '#fff') {
    ctx.fillStyle = tint;
    for (const s of stars) {
      const y = ((s.y + drift * (0.2 + s.z)) % 1 + 1) % 1;
      ctx.globalAlpha = 0.3 + s.z * 0.7 * (0.75 + 0.25 * Math.sin(t * 3 + s.x * 40));
      ctx.fillRect(s.x * W, y * H, 1 + s.z * 1.6, 1 + s.z * 1.6);
    }
    ctx.globalAlpha = 1;
  }
  function ship(ctx, id, x, y, s, t, thrust, rot = 0) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    if (window.Art) window.Art.drawShip(ctx, id, s, t, thrust); ctx.restore();
  }
  function bigText(ctx, txt, x, y, size, color, t0, t) {
    const k = seg(t, t0, t0 + 0.25), pop = k < 1 ? 0.4 + 0.8 * k : 1 + 0.04 * Math.sin(t * 12);
    ctx.save(); ctx.translate(x, y); ctx.scale(pop, pop); ctx.rotate(-0.08);
    ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; textDir(ctx);
    ctx.lineWidth = size * 0.16; ctx.strokeStyle = '#1e0b3a'; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = color; ctx.fillText(txt, 0, 0); ctx.restore();
  }
  function caption(ctx, txt, W, H, alpha = 1) {
    if (!txt) return;
    ctx.save(); ctx.globalAlpha = alpha;
    const fs = Math.max(15, Math.min(22, W / 22)); ctx.font = `700 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; textDir(ctx);
    const w = Math.min(W - 32, ctx.measureText(txt).width + 36);
    ctx.fillStyle = 'rgba(5,2,26,.72)'; roundRect(ctx, (W - w) / 2, H - 92, w, fs + 22, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(txt, W / 2, H - 92 + (fs + 22) / 2, W - 48); ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // the passer-by: a round little guy with a cap; pose 'walk' | 'scared' | 'fly' | 'dizzy'
  function hero(ctx, x, y, k, t, pose, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.lineCap = 'round';
    const leg = pose === 'walk' ? Math.sin(t * 10) * 0.5 : pose === 'fly' ? 0.9 : pose === 'scared' ? Math.sin(t * 40) * 0.15 : 0;
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = k * 0.13;
    ctx.beginPath(); ctx.moveTo(-k * 0.12, -k * 0.35); ctx.lineTo(-k * 0.12 - Math.sin(leg) * k * 0.3, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k * 0.12, -k * 0.35); ctx.lineTo(k * 0.12 + Math.sin(leg) * k * 0.3, 0); ctx.stroke();
    // body
    ctx.fillStyle = '#16a34a'; roundRect(ctx, -k * 0.28, -k * 0.95, k * 0.56, k * 0.65, k * 0.2); ctx.fill();
    // arms
    const arm = pose === 'scared' || pose === 'fly' ? -1.2 : Math.sin(t * 10) * 0.6;
    ctx.strokeStyle = '#fcd9b6'; ctx.lineWidth = k * 0.11;
    ctx.beginPath(); ctx.moveTo(-k * 0.26, -k * 0.8); ctx.lineTo(-k * 0.26 - Math.cos(arm) * k * 0.3, -k * 0.8 + Math.sin(arm) * k * 0.35); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k * 0.26, -k * 0.8); ctx.lineTo(k * 0.26 + Math.cos(arm) * k * 0.3, -k * 0.8 + Math.sin(arm) * k * 0.35); ctx.stroke();
    // head + cap
    ctx.fillStyle = '#fcd9b6'; ctx.beginPath(); ctx.arc(0, -k * 1.22, k * 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2563eb'; ctx.beginPath(); ctx.arc(0, -k * 1.3, k * 0.33, Math.PI, 0); ctx.fill(); ctx.fillRect(0, -k * 1.33, k * 0.45, k * 0.08);
    // face
    ctx.fillStyle = '#1e293b';
    if (pose === 'dizzy') { ctx.font = `${k * 0.22}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('x  x', 0, -k * 1.15); }
    else {
      const big = pose === 'scared' || pose === 'fly' ? 1.8 : 1;
      ctx.beginPath(); ctx.arc(-k * 0.11, -k * 1.2, k * 0.045 * big, 0, TAU); ctx.arc(k * 0.11, -k * 1.2, k * 0.045 * big, 0, TAU); ctx.fill();
      ctx.beginPath();
      if (pose === 'walk') { ctx.arc(0, -k * 1.1, k * 0.1, 0.2, Math.PI - 0.2); ctx.lineWidth = k * 0.04; ctx.strokeStyle = '#1e293b'; ctx.stroke(); }
      else { ctx.ellipse(0, -k * 1.06, k * 0.07, k * 0.09, 0, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
  }
  function bomb(ctx, x, y, k, t, lit) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#111827'; ctx.beginPath(); ctx.arc(0, 0, k, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(-k * 0.35, -k * 0.35, k * 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#374151'; ctx.fillRect(-k * 0.25, -k * 1.2, k * 0.5, k * 0.35);
    ctx.strokeStyle = '#a16207'; ctx.lineWidth = k * 0.12; ctx.beginPath(); ctx.moveTo(0, -k * 1.2); ctx.quadraticCurveTo(k * 0.5, -k * 1.7, k * 0.3, -k * 2); ctx.stroke();
    if (lit) for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, r = Math.random() * k * 0.5;
      ctx.fillStyle = i % 2 ? '#fde047' : '#fb923c'; ctx.fillRect(k * 0.3 + Math.cos(a) * r, -k * 2 + Math.sin(a) * r, 3, 3); }
    ctx.restore();
  }

  // ---------- 1. the opening ----------
  function intro(shipId, T = k => k) {
    const parts = Array.from({ length: 70 }, () => ({ a: Math.random() * TAU, v: 80 + Math.random() * 380, s: 2 + Math.random() * 6, c: ['#fde047', '#fb923c', '#ef4444', '#f8fafc'][Math.random() * 4 | 0] }));
    const smoke = Array.from({ length: 26 }, (_, i) => ({ dx: (Math.random() - 0.5) * 2, v: 0.3 + Math.random(), r: 0.5 + Math.random(), d: i * 0.06 }));
    let boomed = false, bonked = false, lifted = false;
    return run(() => stage(10.6, (ctx, t, W, H) => {
      const m = Math.min(W, H), k = clamp(m * 0.11, 30, 70), s = clamp(m * 0.2, 60, 140);
      const lift = ease(seg(t, 6.6, 9.2)), camY = lift * H * 0.9;          // the camera follows the ship up
      let shake = 0; if (t > 3.4 && t < 4.1) shake = (4.1 - t) * 14; if (t > 6.4 && t < 7.4) shake = 5;
      ctx.save(); ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake + camY);
      // sky: evening on the ground, space higher up
      const g = ctx.createLinearGradient(0, -H, 0, H); g.addColorStop(0, '#05021a'); g.addColorStop(0.55, '#1e1b4b'); g.addColorStop(1, '#7c3aed');
      ctx.fillStyle = g; ctx.fillRect(-20, -H * 1.2, W + 40, H * 2.4);
      ctx.save(); ctx.translate(0, -camY); starfield(ctx, W, H, t, lift * 0.6); ctx.restore();
      const gy = H * 0.78;                                                   // ground line
      ctx.fillStyle = '#312e81'; ctx.beginPath(); ctx.moveTo(0, gy); for (let x = 0; x <= W; x += 40) ctx.lineTo(x, gy - 30 - 22 * Math.sin(x / 90)); ctx.lineTo(W, gy); ctx.fill();
      ctx.fillStyle = '#1e1b4b'; ctx.fillRect(-20, gy, W + 40, H);
      ctx.fillStyle = '#4338ca'; ctx.fillRect(-20, gy, W + 40, 6);
      // the rock where someone hides
      const rx = W * 0.08, hide = t > 1.0 && t < 2.6 ? ease(seg(t, 1.0, 1.3)) * (1 - ease(seg(t, 2.3, 2.6))) : 0;
      if (hide) { ctx.fillStyle = '#0b0820'; ctx.beginPath(); ctx.arc(rx, gy - k * 0.9 - hide * k * 0.6, k * 0.42, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ef4444'; ctx.fillRect(rx - k * 0.18, gy - k * 0.95 - hide * k * 0.6, k * 0.1, k * 0.06); ctx.fillRect(rx + k * 0.08, gy - k * 0.95 - hide * k * 0.6, k * 0.1, k * 0.06);
        if (t > 1.4 && t < 1.9) { ctx.fillStyle = '#0b0820'; ctx.fillRect(rx + k * 0.2, gy - k * 1.4 - hide * k * 0.6, k * 0.5, k * 0.14); } }
      ctx.fillStyle = '#3730a3'; ctx.beginPath(); ctx.ellipse(rx, gy - k * 0.35, k * 0.85, k * 0.55, 0, Math.PI, 0); ctx.fill();
      // launch pad + the ship (not ready: hatch open, warning stripes)
      const px = W * 0.7, padY = gy;
      if (lift < 1) {
        ctx.fillStyle = '#475569'; ctx.fillRect(px - s * 0.9, padY - 8, s * 1.8, 10);
        ctx.fillStyle = '#facc15'; for (let i = 0; i < 6; i++) ctx.fillRect(px - s * 0.9 + i * s * 0.32, padY - 8, s * 0.16, 4);
        ctx.strokeStyle = '#64748b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(px + s * 0.75, padY - 8); ctx.lineTo(px + s * 0.75, padY - s * 1.7); ctx.lineTo(px + s * 0.35, padY - s * 1.7); ctx.stroke();
      }
      const shipY = padY - s * 0.95 - lift * H * 1.25 - (t > 6.4 ? Math.sin(t * 60) * 1.5 : 0);
      const thrust = t < 6.4 ? 0 : t < 6.8 ? 0.6 : 1.4;
      if (t > 6.4) for (const p of smoke) { const a = (t - 6.4 - p.d); if (a < 0) continue;
        ctx.fillStyle = `rgba(203,213,225,${clamp(0.55 - a * 0.18, 0, 0.55)})`; ctx.beginPath();
        ctx.arc(px + p.dx * s * (0.4 + a), padY - 6 - a * 14 * p.v, s * 0.22 * p.r * (1 + a), 0, TAU); ctx.fill(); }
      ship(ctx, shipId, px, shipY, s, t, thrust);
      if (t < 6.2) { // the open hatch on the ship's side
        const hx = px - s * 0.18, hy = padY - s * 1.05;
        ctx.fillStyle = '#0f172a'; roundRect(ctx, hx - s * 0.13, hy - s * 0.18, s * 0.26, s * 0.36, 6); ctx.fill();
        ctx.fillStyle = '#94a3b8'; ctx.save(); ctx.translate(hx - s * 0.13, hy - s * 0.18); ctx.rotate(-0.9); roundRect(ctx, 0, 0, s * 0.26, s * 0.36, 6); ctx.fill(); ctx.restore();
        if (Math.sin(t * 8) > 0) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(px + s * 0.42, padY - s * 1.55, 5, 0, TAU); ctx.fill(); }
      }
      // the passer-by
      const hx0 = W * 0.1, hxW = W * 0.3;
      if (t < 3.4) {
        const walk = ease(seg(t, 0, 2.2)), x = hx0 + (hxW - hx0) * walk;
        const pose = t < 2.6 ? 'walk' : 'scared';
        hero(ctx, x, gy, k, t, pose);
        if (t < 2.3) { ctx.fillStyle = '#c4b5fd'; ctx.font = `${k * 0.4}px sans-serif`; ctx.fillText('♪', x + k * 0.4, gy - k * 1.7 - Math.sin(t * 5) * 6); }
        if (t > 2.6) bigText(ctx, '!', x + k * 0.1, gy - k * 2.1, k * 0.9, '#fde047', 2.6, t);
      } else if (t < 4.7) {                                                  // flung by the blast into the hatch
        const f = ease(seg(t, 3.4, 4.6)), x = hxW + (px - s * 0.18 - hxW) * f, y = gy - Math.sin(f * Math.PI) * H * 0.38 - f * s * 1.05;
        hero(ctx, x, y + k * 0.6, k * (1 - f * 0.45), t, 'fly', t * 9);
      }
      // the bomb: thrown from behind the rock, lands at his feet
      if (t > 1.4 && t < 3.4) {
        const b = ease(seg(t, 1.4, 2.4)), bx = rx + (hxW - k * 0.7 - rx) * b, by = gy - k * 0.3 - Math.sin(b * Math.PI) * H * 0.22;
        bomb(ctx, bx, by, k * 0.3, t, true);
        if (!boomed && t > 2.4 && t < 2.5) play('tone', 600, 300, 0.08, 'square', 0.05);
      }
      if (t > 3.4 && !boomed) { boomed = true; play('boom', true); }
      if (t > 3.4 && t < 4.6) { const a = t - 3.4;
        for (const p of parts) { ctx.globalAlpha = clamp(1 - a, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(hxW - k * 0.7 + Math.cos(p.a) * p.v * a, gy - k * 0.3 + Math.sin(p.a) * p.v * a + 200 * a * a, p.s, p.s); }
        ctx.globalAlpha = clamp(0.9 - a * 2, 0, 1); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(hxW - k * 0.7, gy - k * 0.3, k * (1 + a * 4), 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        bigText(ctx, T('cs_boom'), hxW, gy - k * 2.6, k * 1.1, '#fb923c', 3.4, t); }
      if (lift > 0.05 && lift < 0.9) bigText(ctx, T('cs_aah'), px + s * 0.9, shipY - s * 0.2, k * 0.55, '#f8fafc', 6.9, t);
      ctx.restore();
      if (t > 3.4 && t < 3.55) { ctx.fillStyle = `rgba(255,255,255,${1 - (t - 3.4) / 0.15})`; ctx.fillRect(0, 0, W, H); }
      // inside the cockpit: tumbling in, head on the big red button
      if (t > 4.6 && t < 6.4) {
        const o = ease(seg(t, 4.6, 4.85)) * (1 - ease(seg(t, 6.15, 6.4))), R = m * 0.36 * o, cx = W / 2, cy = H * 0.42;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
        ctx.fillStyle = '#0f172a'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
        const alarm = t > 5.3 && Math.sin(t * 14) > 0; if (alarm) { ctx.fillStyle = 'rgba(239,68,68,.25)'; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); }
        ctx.fillStyle = '#334155'; roundRect(ctx, cx - R * 0.8, cy + R * 0.25, R * 1.6, R * 0.5, 10); ctx.fill();
        for (let i = 0; i < 5; i++) { ctx.fillStyle = ['#22c55e', '#eab308', '#ef4444', '#38bdf8', '#a855f7'][i]; ctx.globalAlpha = Math.sin(t * 6 + i) > 0 ? 1 : 0.3; ctx.beginPath(); ctx.arc(cx - R * 0.6 + i * R * 0.16, cy + R * 0.36, R * 0.04, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
        const pressed = t > 5.3, bx = cx + R * 0.35, by = cy + R * 0.42;
        ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.ellipse(bx, by + 6, R * 0.2, R * 0.08, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.ellipse(bx, by - (pressed ? 0 : R * 0.06), R * 0.18, R * 0.08, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.max(9, R * 0.07)}px system-ui, sans-serif`; ctx.textAlign = 'center'; textDir(ctx); ctx.fillText(T('cs_launch'), bx, by + R * 0.16);
        ctx.fillStyle = '#fde047'; ctx.fillText(T('cs_not_ready'), cx - R * 0.3, cy - R * 0.55);
        const fall = ease(seg(t, 4.75, 5.3)), tx = cx - R * 0.5 + (bx - cx + R * 0.5) * fall, ty = cy - R * 0.9 + (by - R * 0.3 - cy + R * 0.9) * fall;
        // upside down with the head right on the button once it lands
        hero(ctx, pressed ? bx : tx, pressed ? by - R * 0.1 - k * 0.9 * 1.22 : ty + k * 1.25, k * 0.9, t, pressed ? 'dizzy' : 'fly', pressed ? Math.PI : t * 8);
        if (pressed) { if (!bonked) { bonked = true; play('hit'); setTimeout(() => play('power'), 250); }
          bigText(ctx, T('cs_bonk'), cx - R * 0.2, cy - R * 0.15, R * 0.24, '#fde047', 5.3, t);
          for (let i = 0; i < 3; i++) { const a = t * 4 + i * TAU / 3; ctx.fillStyle = '#fde047'; ctx.font = `${R * 0.08}px sans-serif`; ctx.fillText('★', bx + Math.cos(a) * R * 0.2, by - R * 0.32 + Math.sin(a) * R * 0.06); } }
        ctx.restore();
        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
      }
      if (t > 6.6 && !lifted) { lifted = true; play('tone', 80, 400, 1.6, 'sawtooth', 0.05); }
      // last moment: out in space, the ship flies off; fade out into the game
      if (t > 9.6) { ctx.fillStyle = `rgba(5,2,26,${ease(seg(t, 9.6, 10.6))})`; ctx.fillRect(0, 0, W, H); }
      caption(ctx, t < 2.4 ? T('cs_cap1') : t < 4.6 ? T('cs_cap2') : t < 6.4 ? T('cs_cap3') : t < 9.6 ? T('cs_cap4') : '', W, H, 1);
    }, { skipText: T('cs_skip') }));
  }

  // ---------- 2. a new ship ----------
  function newShip(shipId, T = k => k, name = '') {
    const sparks = Array.from({ length: 40 }, () => ({ a: Math.random() * TAU, v: 60 + Math.random() * 220, c: ['#fde047', '#67e8f9', '#f0abfc', '#fff'][Math.random() * 4 | 0] }));
    let rang = false;
    return run(() => stage(4.6, (ctx, t, W, H) => {
      const m = Math.min(W, H), s = clamp(m * 0.2, 60, 150), cx = W / 2, cy = H * 0.46;
      ctx.fillStyle = '#05021a'; ctx.fillRect(0, 0, W, H);
      // hangar doors slide open
      const open = ease(seg(t, 0.1, 0.9));
      starfield(ctx, W, H, t, t * 0.02);
      // rotating light rays behind the ship
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 0.5); ctx.globalAlpha = 0.18 * ease(seg(t, 0.8, 1.4));
      for (let i = 0; i < 12; i++) { ctx.rotate(TAU / 12); ctx.fillStyle = i % 2 ? '#a78bfa' : '#67e8f9'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-m * 0.08, -m); ctx.lineTo(m * 0.08, -m); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1;
      // spotlight
      const sg = ctx.createLinearGradient(0, 0, 0, cy + s); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, 'rgba(255,255,255,.16)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(cx - 20, 0); ctx.lineTo(cx + 20, 0); ctx.lineTo(cx + s * 1.1, cy + s * 0.9); ctx.lineTo(cx - s * 1.1, cy + s * 0.9); ctx.fill();
      // the platform rises with the ship
      const rise = ease(seg(t, 0.6, 1.6)), py = H + s - (H + s - (cy + s * 0.85)) * rise;
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.ellipse(cx, py, s * 0.95, s * 0.22, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, py, s * 0.95, s * 0.22, 0, 0, TAU); ctx.stroke();
      ship(ctx, shipId, cx, py - s * 0.95 + Math.sin(t * 2) * 4 * rise, s, t, 0.5 + 0.3 * Math.sin(t * 5));
      if (t > 1.6) { if (!rang) { rang = true; play('win'); }
        const a = t - 1.6; for (const p of sparks) { ctx.globalAlpha = clamp(1 - a / 1.4, 0, 1); ctx.fillStyle = p.c; ctx.fillRect(cx + Math.cos(p.a) * p.v * a, cy - s * 0.1 + Math.sin(p.a) * p.v * a, 3, 3); } ctx.globalAlpha = 1;
        bigText(ctx, T('cs_new_ship'), cx, H * 0.14, clamp(m * 0.09, 26, 54), '#fde047', 1.6, t);
        if (name) bigText(ctx, name, cx, py + s * 0.55, clamp(m * 0.06, 18, 36), '#f8fafc', 1.8, t); }
      // the doors
      ctx.fillStyle = '#1e1b4b'; ctx.fillRect(0, 0, W / 2 * (1 - open), H); ctx.fillRect(W - W / 2 * (1 - open), 0, W / 2 * (1 - open), H);
      ctx.fillStyle = '#facc15'; if (open < 1) { ctx.fillRect(W / 2 * (1 - open) - 6, 0, 6, H); ctx.fillRect(W - W / 2 * (1 - open), 0, 6, H); }
      if (t > 3.9) { ctx.fillStyle = `rgba(5,2,26,${ease(seg(t, 3.9, 4.6))})`; ctx.fillRect(0, 0, W, H); }
    }, { skipText: T('cs_skip'), tapToClose: 1.2 }));
  }

  // ---------- 3. a jump to another world ----------
  // seen from the passer-by: hyperspace into the new world, his ship runs dry, an abandoned ship drifts nearby,
  // he jumps across, nearly misses, grabs the edge, climbs in, the old wreck lights up and flies on
  function shipTinted(ctx, id, x, y, s, t, thrust, rot, dark) {
    // the ship drawn on its own canvas, then darkened (an abandoned ship) as much as `dark` (0..1)
    const S = Math.ceil(s * 4), c = shipTinted.c || (shipTinted.c = document.createElement('canvas'));
    c.width = c.height = S; const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
    g.save(); g.translate(S / 2, S / 2); if (rot) g.rotate(rot); if (window.Art) window.Art.drawShip(g, id, s, t, thrust); g.restore();
    if (dark > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(30,34,52,${0.82 * dark})`; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(c, x - S / 2, y - S / 2);
  }
  function warp(shipId, T = k => k, o = {}) {
    const col = o.color || '#a78bfa', streaks = Array.from({ length: 120 }, () => ({ a: Math.random() * TAU, d: Math.random(), w: 0.5 + Math.random() * 1.5 }));
    const dust = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), r: 0.5 + Math.random() * 2 }));
    let rang = 0;
    return run(() => stage(8.4, (ctx, t, W, H) => {
      const m = Math.min(W, H), s = clamp(m * 0.15, 48, 110), k = clamp(m * 0.09, 26, 56), cy = H * 0.48;
      // 1. hyperspace (0 - 1.3s)
      if (t < 1.3) {
        ctx.fillStyle = '#05021a'; ctx.fillRect(0, 0, W, H);
        const sp = ease(seg(t, 0, 1.1)), cx = W / 2;
        if (!rang) { rang = 1; play('tone', 120, 1800, 1.3, 'sawtooth', 0.04); }
        for (const st of streaks) { st.d = (st.d + 0.006 + sp * 0.035) % 1; const r0 = st.d * m * 0.9, r1 = r0 + 4 + sp * m * 0.3 * st.d;
          ctx.strokeStyle = st.w > 1.4 ? col : '#e0e7ff'; ctx.globalAlpha = 0.3 + st.d * 0.7; ctx.lineWidth = st.w;
          ctx.beginPath(); ctx.moveTo(cx + Math.cos(st.a) * r0, cy + Math.sin(st.a) * r0); ctx.lineTo(cx + Math.cos(st.a) * r1, cy + Math.sin(st.a) * r1); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ship(ctx, shipId, cx, H * 0.78 - sp * H * 0.25, s, t, 1.6);
        if (t > 1.15) { ctx.fillStyle = `rgba(255,255,255,${(t - 1.15) / 0.15})`; ctx.fillRect(0, 0, W, H); }
        return;
      }
      // 2. the new world: its own colours (the space changes)
      const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, m * 1.1); g.addColorStop(0, col); g.addColorStop(0.45, '#130d33'); g.addColorStop(1, '#05021a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.25; ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.25, m * 0.35, m * 0.12, -0.4, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      starfield(ctx, W, H, t, t * 0.01);
      for (const d of dust) { ctx.fillStyle = col; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(((d.x - t * 0.02) % 1 + 1) % 1 * W, d.y * H, d.r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
      if (t < 1.55) { ctx.fillStyle = `rgba(255,255,255,${1 - (t - 1.3) / 0.25})`; ctx.fillRect(0, 0, W, H); }
      // the camera follows the passer-by: it slides from his ship to the abandoned one
      const pan = ease(seg(t, 2.6, 4.4)) * W * 0.2;
      ctx.save(); ctx.translate(-pan, 0);
      const ax = W * 0.24, ay = cy + Math.sin(t * 1.3) * 6;                     // his ship: out of fuel, drifting
      const bx = W * 0.8, by = cy - s * 0.25 + Math.sin(t * 0.9 + 1) * 8;        // the abandoned ship
      const oldGone = ease(seg(t, 4.6, 6.0));
      if (oldGone < 1) {
        ctx.globalAlpha = 1 - oldGone;
        ship(ctx, shipId, ax - oldGone * W * 0.3, ay + oldGone * 40, s * 0.95, t, t < 1.9 ? 0.6 * (1 - seg(t, 1.5, 1.9)) : 0, 0.25 + oldGone * 0.6);
        if (t > 1.6 && t < 3.2) for (let i = 0; i < 3; i++) { const a = (t * 2 + i * 0.33) % 1; ctx.fillStyle = `rgba(148,163,184,${0.5 * (1 - a)})`; ctx.beginPath(); ctx.arc(ax - s * 0.2 - a * 30, ay + s * 0.4 + a * 10, 6 + a * 14, 0, TAU); ctx.fill(); }
        if (t < 2.6 && Math.sin(t * 9) > 0) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(ax + s * 0.35, ay - s * 0.35, 4, 0, TAU); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      // the abandoned ship: dark and still, then it powers up in its colours
      const power = ease(seg(t, 5.2, 6.0)), fly = ease(seg(t, 6.4, 7.6));
      shipTinted(ctx, shipId, bx + fly * W * 0.15, by - fly * H * 0.75, s * 1.05, t, power * 1.4, -0.35 * (1 - power), 1 - power);
      if (power > 0 && power < 1) { ctx.globalAlpha = 0.6 * (1 - power); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(bx, by, s * (0.6 + power), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      if (t > 2.0 && t < 2.6) bigText(ctx, '?', bx + s * 0.1, by - s * 0.9, k * 1.1, '#fde047', 2.0, t);
      // the passer-by: climbs out, jumps, nearly misses, grabs the edge, climbs in
      const hx0 = ax + s * 0.15, hy0 = ay - s * 0.35, edgeX = bx - s * 0.45, edgeY = by + s * 0.2;
      if (t > 2.3 && t < 5.0) {
        let hx, hy, rot = 0, pose = 'walk';
        if (t < 2.9) { hx = hx0; hy = hy0 - ease(seg(t, 2.3, 2.6)) * k * 0.5; pose = 'scared'; }                         // out of the hatch, gets ready
        else if (t < 4.0) { const f = seg(t, 2.9, 4.0), e = f < 0.75 ? f / 0.75 * 0.9 : 0.9 + (f - 0.75) / 0.25 * 0.1;   // slows down at the end: almost not enough
          hx = hx0 + (edgeX - hx0) * e; hy = hy0 + (edgeY + k * 1.4 - hy0) * e - Math.sin(e * Math.PI) * H * 0.16; rot = Math.sin(t * 3) * 0.2; pose = 'fly'; }
        else if (t < 4.6) { hx = edgeX + Math.sin(t * 14) * 3 * (1 - seg(t, 4.0, 4.6)); hy = edgeY + k * 1.45; pose = 'fly'; }   // hanging by one hand
        else { const c = ease(seg(t, 4.6, 5.0)); hx = edgeX + c * s * 0.35; hy = edgeY + k * 1.45 - c * (k * 1.45 + s * 0.15); pose = 'fly'; }
        hero(ctx, hx, hy, k, t, pose, rot);
        if (t > 3.75 && t < 4.05) bigText(ctx, '!!', hx + k * 0.6, hy - k * 2.2, k * 0.8, '#f87171', 3.75, t);
        if (t >= 4.0 && t < 4.6) { ctx.strokeStyle = '#fcd9b6'; ctx.lineWidth = k * 0.11; ctx.beginPath(); ctx.moveTo(hx + k * 0.2, hy - k * 0.85); ctx.lineTo(edgeX + k * 0.1, edgeY); ctx.stroke(); }
        if (t > 3.95 && rang < 2) { rang = 2; play('hit'); }
      }
      if (t > 5.2 && rang < 3) { rang = 3; play('power'); }
      if (t > 6.4 && rang < 4) { rang = 4; play('tone', 90, 700, 1.0, 'sawtooth', 0.05); }
      ctx.restore();
      // the world's name
      if (t > 6.2) { if (o.sub) bigText(ctx, o.sub, W / 2, H * 0.62, clamp(m * 0.05, 15, 26), '#e0e7ff', 6.2, t); bigText(ctx, o.name || '', W / 2, H * 0.7, clamp(m * 0.09, 24, 56), '#fff', 6.3, t); }
      caption(ctx, t < 2.4 ? T('cs_w1') : t < 2.9 ? T('cs_w2') : t < 3.9 ? T('cs_w3') : t < 5.1 ? T('cs_w4') : t < 6.2 ? T('cs_w5') : '', W, H, 1);
      if (t > 7.8) { ctx.fillStyle = `rgba(5,2,26,${ease(seg(t, 7.8, 8.4))})`; ctx.fillRect(0, 0, W, H); }
    }, { skipText: T('cs_skip'), tapToClose: 1.5 }));
  }

  // ---------- 0. the studio logo: ItamaRos Games ----------
  function studio() {
    const dust = Array.from({ length: 90 }, () => ({ a: Math.random() * TAU, r: 0.6 + Math.random() * 0.8, s: 1 + Math.random() * 2 }));
    const NAME = 'ItamaRos', SUB = 'GAMES';
    let rang = false;
    return run(() => stage(3.4, (ctx, t, W, H) => {
      const m = Math.min(W, H), cx = W / 2, cy = H * 0.4, R = clamp(m * 0.13, 40, 90);
      ctx.fillStyle = '#05021a'; ctx.fillRect(0, 0, W, H);
      // star dust pulled into the emblem
      const pull = ease(seg(t, 0, 1.0));
      for (const d of dust) { const r = (1 - pull) * d.r * m * 0.8 + R * 1.6 * pull;
        ctx.globalAlpha = 0.25 + 0.75 * (1 - pull * 0.6); ctx.fillStyle = '#c4b5fd';
        ctx.fillRect(cx + Math.cos(d.a + t * 0.8) * r, cy + Math.sin(d.a + t * 0.8) * r * 0.45, d.s, d.s); }
      ctx.globalAlpha = 1;
      // the planet
      const pop = ease(seg(t, 0.5, 1.0)), pr = R * (0.6 + 0.4 * pop) * (1 + 0.02 * Math.sin(t * 3));
      if (pop > 0) {
        const glow = ctx.createRadialGradient(cx, cy, pr * 0.5, cx, cy, pr * 2.2); glow.addColorStop(0, 'rgba(139,92,246,.45)'); glow.addColorStop(1, 'rgba(139,92,246,0)');
        ctx.globalAlpha = pop; ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, pr * 2.2, 0, TAU); ctx.fill();
        const pg = ctx.createLinearGradient(cx - pr, cy - pr, cx + pr, cy + pr); pg.addColorStop(0, '#22d3ee'); pg.addColorStop(0.55, '#8b5cf6'); pg.addColorStop(1, '#ec4899');
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.arc(cx - pr * 0.35, cy - pr * 0.35, pr * 0.35, 0, TAU); ctx.fill();
        // orbit ring (back half, planet, front half) and a little rocket flying around it
        ctx.strokeStyle = 'rgba(253,224,71,.85)'; ctx.lineWidth = Math.max(2, R * 0.05);
        ctx.beginPath(); ctx.ellipse(cx, cy, pr * 1.6, pr * 0.42, -0.25, Math.PI, TAU); ctx.stroke();
        const a = t * 2.4 + 1, ox = Math.cos(a) * pr * 1.6, oy = Math.sin(a) * pr * 0.42;
        const rx = cx + ox * Math.cos(-0.25) - oy * Math.sin(-0.25), ry = cy + ox * Math.sin(-0.25) + oy * Math.cos(-0.25);
        if (Math.sin(a) > 0) { ship(ctx, 'falcon', rx, ry, R * 0.32, t, 0.8, a + Math.PI); }
        ctx.beginPath(); ctx.ellipse(cx, cy, pr * 1.6, pr * 0.42, -0.25, 0, Math.PI); ctx.stroke();
        if (Math.sin(a) <= 0) { ship(ctx, 'falcon', rx, ry, R * 0.32, t, 0.8, a + Math.PI); }
        ctx.globalAlpha = 1;
      }
      if (!rang && t > 0.9) { rang = true; [523, 784, 1046].forEach((f, i) => setTimeout(() => play('tone', f, f, 0.35, 'sine', 0.05), i * 110)); }
      // the name, letter by letter, then GAMES
      const fs = clamp(m * 0.13, 34, 84), ty = cy + R * 2.25;
      ctx.font = `900 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textBaseline = 'middle'; ctx.direction = 'ltr'; ctx.textAlign = 'left';
      const tw = ctx.measureText(NAME).width; let x = cx - tw / 2;
      const tg = ctx.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); tg.addColorStop(0, '#67e8f9'); tg.addColorStop(0.5, '#a78bfa'); tg.addColorStop(1, '#f472b6');
      for (let i = 0; i < NAME.length; i++) {
        const ch = NAME[i], w = ctx.measureText(ch).width, k = ease(seg(t, 1.1 + i * 0.07, 1.4 + i * 0.07));
        if (k > 0) { ctx.save(); ctx.globalAlpha = k; ctx.translate(x + w / 2, ty + (1 - k) * fs * 0.5); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
          ctx.shadowColor = 'rgba(168,85,247,.8)'; ctx.shadowBlur = fs * 0.35; ctx.fillStyle = tg; ctx.translate(-(x + w / 2), 0); ctx.fillText(ch, x, 0); ctx.restore(); }
        x += w;
      }
      // a sweep of light over the name
      const sw = seg(t, 2.05, 2.55);
      if (sw > 0 && sw < 1) {   // only the letters light up: the name is drawn again with a moving white band
        const sx = cx - tw / 2 - fs + (tw + fs * 2) * sw, lg = ctx.createLinearGradient(sx - fs * 0.5, 0, sx + fs * 0.5, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.fillStyle = lg; ctx.fillText(NAME, cx - tw / 2, ty); ctx.restore(); }
      const gk = ease(seg(t, 1.75, 2.15));
      if (gk > 0) { const gs = fs * 0.32; ctx.save(); ctx.globalAlpha = gk; ctx.font = `800 ${gs}px system-ui, -apple-system, "Segoe UI", sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#e0e7ff';
        ctx.letterSpacing = (gs * (0.9 - 0.4 * gk)) + 'px'; ctx.fillText(SUB, cx + gs * 0.3, ty + fs * 0.78); ctx.restore();
        ctx.strokeStyle = `rgba(167,139,250,${gk * 0.6})`; ctx.lineWidth = 2; const lw = tw * 0.42 * gk;
        ctx.beginPath(); ctx.moveTo(cx - tw / 2, ty + fs * 0.78); ctx.lineTo(cx - tw / 2 + lw * 0.45, ty + fs * 0.78); ctx.moveTo(cx + tw / 2, ty + fs * 0.78); ctx.lineTo(cx + tw / 2 - lw * 0.45, ty + fs * 0.78); ctx.stroke(); }
      if (t > 2.8) { ctx.fillStyle = `rgba(5,2,26,${ease(seg(t, 2.8, 3.4))})`; ctx.fillRect(0, 0, W, H); }
    }, { skipText: '›', tapToClose: 0.3 }));
  }

  window.Cutscene = { studio, intro, ship: newShip, warp, get busy() { return !!document.querySelector('.cutscene'); } };

  // the studio logo when the app opens, unless animations are off (Settings) or a test link skips the intro
  try {
    const st = JSON.parse(localStorage.getItem('ss_settings') || '{}');
    if (st.anims !== false && !/[?&]skipintro\b/.test(location.search)) studio();
  } catch (e) { studio(); }
})();
