// Art: ship skins, icons, avatars
(function () {
  const SHIPS = [
    { id: 'falcon',  price: 0,    shape: 'arrow',   body: '#d7e3ff', accent: '#3b82f6', glow: '#60a5fa', gun: { rate: 1,    dmg: 1,   side: 0, style: 'line' } },
    { id: 'viper',   price: 300,  shape: 'delta',   body: '#bbf7d0', accent: '#16a34a', glow: '#4ade80', gun: { rate: 1.12, dmg: 1.2, side: 0, style: 'needle' }, aura: 'pulse' },
    { id: 'nova',    price: 600,  shape: 'arrow',   body: '#fecaca', accent: '#dc2626', glow: '#f87171', gun: { rate: 1.18, dmg: 1.3, side: 1, style: 'flame' }, aura: 'sparks' },
    { id: 'saucer',  price: 900,  shape: 'saucer',  body: '#e9d5ff', accent: '#9333ea', glow: '#c084fc', gun: { rate: 1.22, dmg: 1.4, side: 1, style: 'ring' }, aura: 'spin' },
    { id: 'twin',    price: 1400, shape: 'twin',    body: '#fde68a', accent: '#ea580c', glow: '#fb923c', gun: { rate: 1.28, dmg: 1.6, side: 1, style: 'twin' }, aura: 'pulse' },
    { id: 'phantom', price: 2000, shape: 'stealth', body: '#334155', accent: '#22d3ee', glow: '#22d3ee', gun: { rate: 1.34, dmg: 1.9, side: 2, style: 'laser' }, aura: 'cloak' },
    { id: 'dragon',  price: 3000, shape: 'dragon',  body: '#fb7185', accent: '#7f1d1d', glow: '#fda4af', gun: { rate: 1.4,  dmg: 2.2, side: 2, style: 'fireball' }, aura: 'embers' },
    { id: 'golden',  price: 5000, shape: 'stealth', body: '#facc15', accent: '#a16207', glow: '#fde047', gun: { rate: 1.5,  dmg: 2.6, side: 3, style: 'star' }, aura: 'shine' },
    { id: 'comet',   price: 7500, shape: 'arrow',   body: '#bae6fd', accent: '#0369a1', glow: '#38bdf8', gun: { rate: 1.58, dmg: 2.8, side: 3, style: 'comet' }, aura: 'trail' },
    { id: 'nebula',  price: 10000, shape: 'saucer', body: '#f5d0fe', accent: '#a21caf', glow: '#e879f9', gun: { rate: 1.64, dmg: 3,   side: 3, style: 'nebula', pierce: true }, aura: 'orbit' },
    { id: 'titan',   price: 15000, shape: 'titan',  body: '#cbd5e1', accent: '#334155', glow: '#f97316', gun: { rate: 1.7,  dmg: 3.3, side: 4, style: 'beam' }, aura: 'storm' },
    { id: 'vortex',  price: 20000, shape: 'crystal', body: '#a7f3d0', accent: '#047857', glow: '#34d399', gun: { rate: 1.8,  dmg: 3.6, side: 4, style: 'vortex' }, aura: 'orbit' },
    // special ships - bought with diamonds
    { id: 'phoenix', gems: 15, shape: 'phoenix', body: '#fdba74', accent: '#c2410c', glow: '#fb923c', gun: { rate: 1.45, dmg: 2.4, side: 2, style: 'fireball' }, aura: 'embers' },
    { id: 'ghost',   gems: 25, shape: 'stealth', fx: 'ghost', body: '#e0e7ff', accent: '#6366f1', glow: '#a5b4fc', gun: { rate: 1.5,  dmg: 2.5, side: 2, style: 'wisp', pierce: true }, aura: 'cloak' },
    { id: 'crystal', gems: 40, shape: 'crystal', body: '#cffafe', accent: '#0891b2', glow: '#67e8f9', gun: { rate: 1.6,  dmg: 3,   side: 3, style: 'shard' }, aura: 'prism' },
    { id: 'rainbow', gems: 60, shape: 'phoenix', fx: 'rainbow', body: '#f0abfc', accent: '#7e22ce', glow: '#f0abfc', gun: { rate: 1.75, dmg: 3.4, side: 4, style: 'rainbow' }, aura: 'shine' },
    { id: 'void',    gems: 80, shape: 'titan', fx: 'ghost', body: '#1e1b4b', accent: '#7c3aed', glow: '#a78bfa', gun: { rate: 1.85, dmg: 3.8, side: 4, style: 'void', pierce: true }, aura: 'storm' },
    { id: 'aurora',  gems: 100, shape: 'phoenix', fx: 'aurora', body: '#a7f3d0', accent: '#0e7490', glow: '#5eead4', gun: { rate: 1.95, dmg: 4, side: 5, style: 'aurora', pierce: true }, aura: 'orbit' },
    { id: 'supernova', gems: 150, shape: 'nova', fx: 'rainbow', body: '#fff7ed', accent: '#ea580c', glow: '#fde047', gun: { rate: 2.1, dmg: 4.5, side: 5, style: 'supernova', pierce: true }, aura: 'shine' },
  ];

  function path(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); }

  // Draw ship centred at 0,0 pointing up; s = half size
  function drawShip(ctx, id, s, t, thrust = 1) {
    let k = SHIPS.find(x => x.id === id) || SHIPS[0];
    t = t || 0;
    ctx.save();
    if (k.fx === 'ghost') ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 4);
    if (k.aura) drawAura(ctx, k, s, t);
    if (k.fx === 'aurora') { const h = 140 + 50 * Math.sin(t * 2); k = Object.assign({}, k, { body: `hsl(${h},80%,78%)`, glow: `hsl(${h + 20},90%,62%)` }); }
    if (k.fx === 'rainbow') { const h = (t * 90) % 360; k = Object.assign({}, k, { body: `hsl(${h},90%,75%)`, accent: `hsl(${(h + 60) % 360},80%,40%)`, glow: `hsl(${(h + 30) % 360},95%,65%)` }); }
    // engine flame
    const fl = (0.7 + 0.3 * Math.sin(t * 40)) * thrust;
    const g = ctx.createLinearGradient(0, s * 0.6, 0, s * (1.1 + fl));
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, k.glow); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    const flames = k.shape === 'twin' ? [-s * 0.45, s * 0.45] : k.shape === 'saucer' ? [-s * 0.35, s * 0.35] : [0];
    for (const fx of flames) path(ctx, [fx - s * 0.18, s * 0.55, fx + s * 0.18, s * 0.55, fx, s * (1.1 + fl)]), ctx.fill();
    ctx.shadowColor = k.glow; ctx.shadowBlur = s * 0.5;
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, s * 0.06); ctx.strokeStyle = k.accent;
    const body = ctx.createLinearGradient(-s, 0, s, 0);
    body.addColorStop(0, k.accent); body.addColorStop(0.5, k.body); body.addColorStop(1, k.accent);
    ctx.fillStyle = body;
    switch (k.shape) {
      case 'delta':
        path(ctx, [0, -s, s * 0.95, s * 0.7, s * 0.3, s * 0.5, 0, s * 0.65, -s * 0.3, s * 0.5, -s * 0.95, s * 0.7]); ctx.fill(); ctx.stroke(); break;
      case 'saucer':
        ctx.beginPath(); ctx.ellipse(0, s * 0.15, s, s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(180,240,255,.85)'; ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.42, s * 0.42, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = k.glow; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * s * 0.35, s * 0.25, s * 0.07, 0, 7); ctx.fill(); }
        break;
      case 'twin':
        for (const sx of [-1, 1]) { path(ctx, [sx * s * 0.45, -s * 0.9, sx * s * 0.7, s * 0.6, sx * s * 0.2, s * 0.6]); ctx.fill(); ctx.stroke(); }
        path(ctx, [-s * 0.5, -s * 0.05, s * 0.5, -s * 0.05, s * 0.5, s * 0.2, -s * 0.5, s * 0.2]); ctx.fill(); ctx.stroke();
        path(ctx, [0, -s * 0.5, s * 0.18, s * 0.1, -s * 0.18, s * 0.1]); ctx.fill(); ctx.stroke();
        break;
      case 'stealth':
        path(ctx, [0, -s, s * 0.25, -s * 0.2, s, s * 0.45, s * 0.55, s * 0.6, s * 0.2, s * 0.35, 0, s * 0.55, -s * 0.2, s * 0.35, -s * 0.55, s * 0.6, -s, s * 0.45, -s * 0.25, -s * 0.2]);
        ctx.fill(); ctx.stroke();
        ctx.strokeStyle = k.glow; ctx.beginPath(); ctx.moveTo(0, -s * 0.8); ctx.lineTo(0, s * 0.4); ctx.stroke();
        break;
      case 'phoenix': {
        const f = Math.sin(t * 8) * s * 0.08;
        for (const sx of [-1, 1]) {
          ctx.beginPath(); ctx.moveTo(0, -s * 0.2);
          ctx.quadraticCurveTo(sx * s * 0.6, -s * 0.9 - f, sx * s * 1.1, -s * 0.5 - f);
          ctx.quadraticCurveTo(sx * s * 0.8, -s * 0.1, sx * s * 1.05, s * 0.2 + f);
          ctx.quadraticCurveTo(sx * s * 0.5, s * 0.15, sx * s * 0.2, s * 0.55);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        path(ctx, [0, -s, s * 0.22, -s * 0.2, s * 0.15, s * 0.7, 0, s * 0.9, -s * 0.15, s * 0.7, -s * 0.22, -s * 0.2]); ctx.fill(); ctx.stroke();
        break;
      }
      case 'crystal':
        path(ctx, [0, -s, s * 0.7, -s * 0.2, s * 0.45, s * 0.6, -s * 0.45, s * 0.6, -s * 0.7, -s * 0.2]); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(-s * 0.25, -s * 0.2); ctx.lineTo(0, s * 0.6); ctx.lineTo(s * 0.25, -s * 0.2); ctx.closePath();
        ctx.moveTo(-s * 0.7, -s * 0.2); ctx.lineTo(s * 0.7, -s * 0.2); ctx.stroke();
        break;
      case 'dragon':
        ctx.beginPath(); ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.3, -s * 0.3, s * 1.0, -s * 0.1); ctx.quadraticCurveTo(s * 0.6, s * 0.2, s * 0.85, s * 0.7);
        ctx.quadraticCurveTo(s * 0.3, s * 0.4, 0, s * 0.6); ctx.quadraticCurveTo(-s * 0.3, s * 0.4, -s * 0.85, s * 0.7);
        ctx.quadraticCurveTo(-s * 0.6, s * 0.2, -s * 1.0, -s * 0.1); ctx.quadraticCurveTo(-s * 0.3, -s * 0.3, 0, -s);
        ctx.fill(); ctx.stroke(); break;
      case 'titan': // heavy wide hull with two side cannons
        path(ctx, [0, -s * 0.9, s * 0.35, -s * 0.55, s * 0.4, -s * 0.1, s * 1.0, s * 0.15, s * 1.0, s * 0.6, s * 0.35, s * 0.7, 0, s * 0.55, -s * 0.35, s * 0.7, -s * 1.0, s * 0.6, -s * 1.0, s * 0.15, -s * 0.4, -s * 0.1, -s * 0.35, -s * 0.55]);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = k.glow; for (const sx of [-1, 1]) { ctx.fillRect(sx * s * 0.78 - s * 0.07, -s * 0.35, s * 0.14, s * 0.55); }
        break;
      case 'nova': { // a star with spikes that slowly turns
        ctx.save(); ctx.rotate(t * 0.6);
        ctx.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? s * 0.45 : s * (0.95 + 0.06 * Math.sin(t * 6 + i)), a = i * Math.PI / 8; ctx[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, -Math.cos(a) * r); }
        ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        const cg = ctx.createRadialGradient(0, 0, 1, 0, 0, s * 0.4); cg.addColorStop(0, '#fff'); cg.addColorStop(1, k.glow);
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, s * 0.35, 0, 7); ctx.fill();
        break;
      }
      default: // arrow
        path(ctx, [0, -s, s * 0.22, -s * 0.35, s * 0.3, s * 0.05, s * 0.95, s * 0.55, s * 0.9, s * 0.72, s * 0.3, s * 0.55, s * 0.2, s * 0.7, -s * 0.2, s * 0.7, -s * 0.3, s * 0.55, -s * 0.9, s * 0.72, -s * 0.95, s * 0.55, -s * 0.3, s * 0.05, -s * 0.22, -s * 0.35]);
        ctx.fill(); ctx.stroke();
    }
    if (k.shape !== 'saucer' && k.shape !== 'crystal' && k.shape !== 'nova') { // cockpit
      ctx.shadowBlur = 0;
      const cg = ctx.createLinearGradient(0, -s * 0.6, 0, 0);
      cg.addColorStop(0, '#e0f7ff'); cg.addColorStop(1, '#0ea5e9');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(0, -s * 0.25, s * 0.12, s * 0.28, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawAura(ctx, k, s, t) {
    ctx.save();
    const g = k.glow;
    if (k.aura === 'pulse') {
      const r = s * (1.15 + 0.12 * Math.sin(t * 6));
      const gr = ctx.createRadialGradient(0, 0, s * 0.3, 0, 0, r); gr.addColorStop(0, g + '55'); gr.addColorStop(1, g + '00');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    } else if (k.aura === 'sparks' || k.aura === 'embers') {
      for (let i = 0; i < (k.aura === 'embers' ? 8 : 5); i++) {
        const a = t * (2 + i * 0.3) + i * 1.3, rr = s * (0.9 + 0.25 * Math.sin(t * 3 + i));
        ctx.fillStyle = k.aura === 'embers' ? (i % 2 ? '#fb923c' : '#fde047') : g;
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 8 + i);
        ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr + s * 0.2, s * 0.06, 0, 7); ctx.fill();
      }
    } else if (k.aura === 'spin') {
      for (let i = 0; i < 6; i++) { const a = t * 3 + i * Math.PI / 3; ctx.fillStyle = i % 2 ? g : '#fff'; ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.15, Math.sin(a) * s * 0.55 + s * 0.15, s * 0.07, 0, 7); ctx.fill(); }
    } else if (k.aura === 'cloak') {
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.05); ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 5);
      ctx.beginPath(); ctx.ellipse(0, s * 0.1, s * 1.2, s * 0.95, 0, 0, 7); ctx.stroke();
    } else if (k.aura === 'shine') {
      ctx.rotate(t * 0.8); ctx.globalAlpha = 0.45;
      for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); const gr = ctx.createLinearGradient(0, 0, 0, -s * 1.5); gr.addColorStop(0, g + 'cc'); gr.addColorStop(1, g + '00'); ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-s * 0.08, 0); ctx.lineTo(0, -s * 1.5); ctx.lineTo(s * 0.08, 0); ctx.fill(); }
    } else if (k.aura === 'trail') { // comet tail behind the ship
      for (let i = 0; i < 7; i++) { const y = s * (0.6 + i * 0.25), w = s * (0.5 - i * 0.06); ctx.globalAlpha = 0.35 - i * 0.045; ctx.fillStyle = i % 2 ? '#fff' : g;
        ctx.beginPath(); ctx.ellipse(Math.sin(t * 9 + i) * s * 0.08, y, Math.max(1, w), s * 0.14, 0, 0, 7); ctx.fill(); }
    } else if (k.aura === 'orbit') { // two small moons going around
      for (let i = 0; i < 2; i++) { const a = t * 2.4 + i * Math.PI; ctx.globalAlpha = 0.9; ctx.fillStyle = i ? '#fff' : g;
        ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.25, Math.sin(a) * s * 0.5, s * 0.1, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 0.25; ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.03); ctx.beginPath(); ctx.ellipse(0, 0, s * 1.25, s * 0.5, 0, 0, 7); ctx.stroke();
    } else if (k.aura === 'storm') { // little lightning arcs
      ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.05); ctx.shadowColor = g; ctx.shadowBlur = s * 0.3;
      for (let i = 0; i < 3; i++) { if (Math.sin(t * 13 + i * 2.1) < 0.2) continue; const a = i * 2.1 + Math.floor(t * 6) * 0.7; ctx.beginPath();
        for (let j = 0; j <= 4; j++) { const r = s * (0.9 + j * 0.1), aa = a + (j % 2 ? 0.15 : -0.1); ctx[j ? 'lineTo' : 'moveTo'](Math.cos(aa) * r, Math.sin(aa) * r); } ctx.stroke(); }
    } else if (k.aura === 'prism') {
      ctx.rotate(t * 1.5); ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, s * 0.05); ctx.globalAlpha = 0.6;
      ctx.beginPath(); for (let i = 0; i < 3; i++) { const a = i * 2 * Math.PI / 3; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s * 1.3, Math.sin(a) * s * 1.3); } ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  }

  function shipPreview(id, px = 96) {
    const c = document.createElement('canvas'); c.width = c.height = px;
    const x = c.getContext('2d'); x.translate(px / 2, px / 2 - px * 0.05); drawShip(x, id, px * 0.34, 0.3, 0.6);
    return c.toDataURL();
  }

  // ---- SVG icons (24x24) ----
  const I = {
    coin: '<circle cx="12" cy="12" r="10" fill="#facc15" stroke="#a16207" stroke-width="1.5"/><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fde68a" stroke-width="1.2"/><path d="M12 7.5l1.4 2.9 3.1.4-2.3 2.1.6 3.1L12 14.5 9.2 16l.6-3.1-2.3-2.1 3.1-.4z" fill="#a16207"/>',
    shield: '<path d="M12 2l8 3v6c0 5.2-3.4 9.4-8 11-4.6-1.6-8-5.8-8-11V5z" fill="#38bdf8" stroke="#e0f2fe" stroke-width="1.4"/><path d="M12 5.5l5 1.9v3.8c0 3.4-2.1 6.2-5 7.4z" fill="#0284c7"/>',
    heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill="#f43f5e" stroke="#fecdd3" stroke-width="1.3"/>',
    bolt: '<path d="M13.5 2L5 13.5h6L10 22l9-12h-6z" fill="#fde047" stroke="#ca8a04" stroke-width="1.2" stroke-linejoin="round"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
    shop: '<path d="M4 8h16l-1.2 12H5.2z" fill="currentColor" opacity=".9"/><path d="M8.5 8V6.5a3.5 3.5 0 017 0V8" fill="none" stroke="currentColor" stroke-width="2"/>',
    friends: '<circle cx="9" cy="8" r="3.5" fill="currentColor"/><circle cx="17" cy="9" r="2.8" fill="currentColor" opacity=".7"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6z" fill="currentColor"/><path d="M15 14.2c3.4-.6 6 1.2 6.5 5.8H17" fill="currentColor" opacity=".7"/>',
    trophy: '<path d="M7 3h10v5a5 5 0 01-10 0z" fill="#facc15"/><path d="M7 5H3.5c0 3 1.5 5 4 5.3M17 5h3.5c0 3-1.5 5-4 5.3" fill="none" stroke="#facc15" stroke-width="1.8"/><path d="M10.5 13h3v4h-3zM7.5 18h9v3h-9z" fill="#eab308"/>',
    gear: '<path d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.4 2.1l-1.9-.4a6.8 6.8 0 00-.8-1.9l1.1-1.6-1.5-1.5-1.6 1.1a6.8 6.8 0 00-1.9-.8l-.4-1.9h-2.2l-.4 1.9a6.8 6.8 0 00-1.9.8L7.3 5.2 5.8 6.7l1.1 1.6a6.8 6.8 0 00-.8 1.9l-1.9.4v2.2l1.9.4c.2.7.4 1.3.8 1.9l-1.1 1.6 1.5 1.5 1.6-1.1c.6.4 1.2.6 1.9.8l.4 1.9h2.2l.4-1.9c.7-.2 1.3-.4 1.9-.8l1.6 1.1 1.5-1.5-1.1-1.6c.4-.6.6-1.2.8-1.9l1.9-.4z" fill="currentColor"/>',
    rotate: '<rect x="6" y="2.5" width="12" height="19" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="18.5" r="1" fill="currentColor"/>',
    rotateL: '<rect x="2.5" y="6" width="19" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18.5" cy="12" r="1" fill="currentColor"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5m0-5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
    back: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 15V5a1 1 0 011-1h10" fill="none" stroke="currentColor" stroke-width="2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10" rx="2" fill="currentColor"/><path d="M8 10.5V8a4 4 0 018 0v2.5" fill="none" stroke="currentColor" stroke-width="2"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#facc15" stroke="#a16207" stroke-width="1"/>',
    starOff: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5L2.5 9.3l6.6-.8z" fill="#334155" stroke="#475569" stroke-width="1"/>',
    infinity: '<path d="M7 8.5c-2 0-3.5 1.6-3.5 3.5s1.5 3.5 3.5 3.5c3.5 0 6.5-7 10-7 2 0 3.5 1.6 3.5 3.5s-1.5 3.5-3.5 3.5c-3.5 0-6.5-7-10-7z" fill="none" stroke="currentColor" stroke-width="2.2"/>',
    magnet: '<path d="M5 4h4v8a3 3 0 006 0V4h4v8a7 7 0 01-14 0z" fill="#ef4444"/><path d="M5 4h4v3H5zM15 4h4v3h-4z" fill="#e2e8f0"/>',
    gun: '<path d="M12 2l2.5 6h-5zM6 9l2 5H4zm12 0l2 5h-4z" fill="#f97316"/><rect x="10" y="9" width="4" height="12" rx="1" fill="#fdba74"/><rect x="4.5" y="15" width="3" height="6" rx="1" fill="#fdba74"/><rect x="16.5" y="15" width="3" height="6" rx="1" fill="#fdba74"/>',
    plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    send: '<path d="M3 11.5L21 3l-7.5 18-2.5-7.5z" fill="currentColor"/>',
    cutvid: '<rect x="2" y="2" width="20" height="20" rx="6" fill="#d946ef"/><path d="M2 14L22 4v12a6 6 0 01-6 6H8a6 6 0 01-6-6z" fill="#8b5cf6" opacity=".55"/><circle cx="8" cy="16" r="2.6" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16" cy="16" r="2.6" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M9.6 14L16 5.5M14.4 14L8 5.5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>',
    google: '<path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z" fill="#4285f4"/><path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z" fill="#34a853"/><path d="M6.4 14a6 6 0 010-3.9V7.4H3.1a10 10 0 000 9.2z" fill="#fbbc05"/><path d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z" fill="#ea4335"/>',
    keyboard: '<rect x="2" y="6" width="20" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 10h1M9 10h1M12 10h1M15 10h1M18 10h1M7 14h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    globe: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M2.5 12h19M12 2.5c2.8 3 2.8 16 0 19M12 2.5c-2.8 3-2.8 16 0 19" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    gem: '<path d="M7 3h10l4 6-9 12L3 9z" fill="#22d3ee" stroke="#cffafe" stroke-width="1.2" stroke-linejoin="round"/><path d="M3 9h18M9 3l3 18M15 3l-3 18M7 3l2 6M17 3l-2 6" stroke="#0e7490" stroke-width="1" fill="none"/>',
    secret: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="#c084fc" stroke-width="1.8" stroke-dasharray="3 2.5"/><path d="M12 6.5l1.6 3.6 3.9.4-2.9 2.6.8 3.9L12 15l-3.4 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#c084fc"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
    plasma: '<circle cx="12" cy="12" r="5" fill="#e879f9"/><circle cx="12" cy="12" r="9" fill="none" stroke="#c026d3" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#f0abfc" stroke-width="1.6" stroke-linecap="round"/>',
    x: '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    rocket: '<path d="M12 2c4 2.5 5.5 7 4.5 12h-9C6.5 9 8 4.5 12 2z" fill="#e2e8f0"/><circle cx="12" cy="9" r="2" fill="#38bdf8"/><path d="M7.5 14l-3 4 3.5-.5zm9 0l3 4-3.5-.5z" fill="#ef4444"/><path d="M9.5 15.5h5L12 21z" fill="#f97316"/>',
    timer: '<circle cx="12" cy="13" r="8" fill="none" stroke="#fde047" stroke-width="2"/><path d="M12 13V8.5M12 13l3 2" stroke="#fde047" stroke-width="2" stroke-linecap="round"/><path d="M9.5 2.5h5" stroke="#fde047" stroke-width="2" stroke-linecap="round"/>',
    clover: '<circle cx="9" cy="9" r="3.6" fill="#4ade80"/><circle cx="15" cy="9" r="3.6" fill="#22c55e"/><circle cx="9" cy="15" r="3.6" fill="#22c55e"/><circle cx="15" cy="15" r="3.6" fill="#4ade80"/><path d="M12 12q2 5 5 9" stroke="#15803d" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
    revive: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 018-2.8A4.5 4.5 0 0120 10c0 5.8-8 11-8 11z" fill="#4ade80" stroke="#dcfce7" stroke-width="1.3"/><path d="M12 8.5v6M9 11.5h6" stroke="#14532d" stroke-width="2" stroke-linecap="round"/>',
    drone: '<circle cx="12" cy="13" r="5" fill="#94a3b8" stroke="#e2e8f0" stroke-width="1.2"/><circle cx="12" cy="12.5" r="2" fill="#22d3ee"/><path d="M3 6h7M14 6h7M6.5 6v4M17.5 6v4" stroke="#e2e8f0" stroke-width="1.6" stroke-linecap="round"/>',
  };

  const AVATARS = [
    { id: 'rocket', price: 0, svg: '<path d="M12 2c4 2.5 5.5 7 4.5 12H7.5C6.5 9 8 4.5 12 2z" fill="#e2e8f0"/><circle cx="12" cy="9" r="2.2" fill="#38bdf8" stroke="#0369a1"/><path d="M7.5 14l-3 4 3.5-.5zm9 0l3 4-3.5-.5z" fill="#ef4444"/><path d="M9.5 15.5h5L12 22z" fill="#f97316"/>' },
    { id: 'alien', price: 0, svg: '<ellipse cx="12" cy="12" rx="8" ry="9.5" fill="#4ade80"/><ellipse cx="8.6" cy="11" rx="2.6" ry="3.6" transform="rotate(-25 8.6 11)" fill="#052e16"/><ellipse cx="15.4" cy="11" rx="2.6" ry="3.6" transform="rotate(25 15.4 11)" fill="#052e16"/><path d="M10 17.5q2 1 4 0" stroke="#052e16" stroke-width="1.2" fill="none"/>' },
    { id: 'planet', price: 0, svg: '<circle cx="12" cy="12" r="6.5" fill="#a78bfa"/><path d="M8 9.5q4-2 8 1" stroke="#7c3aed" stroke-width="1.4" fill="none"/><ellipse cx="12" cy="12.5" rx="11" ry="3.3" fill="none" stroke="#fbbf24" stroke-width="1.8" transform="rotate(-18 12 12)"/>' },
    { id: 'ufo', price: 150, svg: '<path d="M7.5 10a4.5 4.5 0 019 0z" fill="#7dd3fc"/><ellipse cx="12" cy="12.5" rx="10" ry="3.5" fill="#94a3b8"/><circle cx="6.5" cy="12.5" r="1" fill="#fde047"/><circle cx="12" cy="13.3" r="1" fill="#fde047"/><circle cx="17.5" cy="12.5" r="1" fill="#fde047"/><path d="M9 16l-2 5h10l-2-5z" fill="#fde047" opacity=".35"/>' },
    { id: 'astro', price: 250, svg: '<circle cx="12" cy="11" r="8" fill="#f1f5f9"/><rect x="6.5" y="7.5" width="11" height="7" rx="3.5" fill="#0f172a"/><path d="M8.5 9.5h3" stroke="#38bdf8" stroke-width="1.3" stroke-linecap="round"/><rect x="7" y="18" width="10" height="4" rx="1.5" fill="#cbd5e1"/>' },
    { id: 'comet', price: 300, svg: '<path d="M3 3l11 7-2.5 2.5z" fill="#38bdf8" opacity=".6"/><path d="M3 9l9 3-1.5 2z" fill="#38bdf8" opacity=".4"/><circle cx="15.5" cy="15.5" r="5.5" fill="#e0f2fe" stroke="#38bdf8" stroke-width="1.5"/>' },
    { id: 'robot', price: 400, svg: '<rect x="5" y="7" width="14" height="12" rx="3" fill="#94a3b8"/><circle cx="9.3" cy="12" r="2" fill="#f43f5e"/><circle cx="14.7" cy="12" r="2" fill="#f43f5e"/><rect x="9" y="15.5" width="6" height="1.5" rx=".7" fill="#334155"/><path d="M12 7V3.5" stroke="#94a3b8" stroke-width="1.5"/><circle cx="12" cy="3" r="1.3" fill="#facc15"/>' },
    { id: 'moon', price: 500, svg: '<path d="M15.5 3a9 9 0 104.8 15.3A7.6 7.6 0 0115.5 3z" fill="#fde68a"/><circle cx="9" cy="10" r="1.4" fill="#eab308"/><circle cx="10.5" cy="16" r="1.9" fill="#eab308"/><circle cx="6.5" cy="14" r=".9" fill="#eab308"/>' },
    { id: 'skull', price: 700, svg: '<path d="M12 3a8 8 0 00-8 8c0 3 1.5 4.8 3 5.6V20h10v-3.4c1.5-.8 3-2.6 3-5.6a8 8 0 00-8-8z" fill="#e2e8f0"/><circle cx="8.8" cy="11.5" r="2.2" fill="#111827"/><circle cx="15.2" cy="11.5" r="2.2" fill="#111827"/><path d="M11 15l1-1.6 1 1.6z" fill="#111827"/>' },
    { id: 'crown', price: 1200, svg: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#facc15" stroke="#a16207" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="14" r="1.6" fill="#ef4444"/><circle cx="7.5" cy="15" r="1.1" fill="#22d3ee"/><circle cx="16.5" cy="15" r="1.1" fill="#22d3ee"/>' },
    { id: 'diamond', gems: 8, svg: '<circle cx="12" cy="12" r="11" fill="#083344"/><path d="M7.5 7h9l3 4.5L12 20l-7.5-8.5z" fill="#22d3ee" stroke="#cffafe" stroke-width=".8"/><path d="M4.5 11.5h15M10 7l2 13M14 7l-2 13" stroke="#0e7490" stroke-width=".8" fill="none"/>' },
    { id: 'phoenix', gems: 12, svg: '<circle cx="12" cy="12" r="11" fill="#431407"/><path d="M12 19c-4-2-7-6-6-11 2 2 3 3 4 3 0-3 1-5 2-7 1 2 2 4 2 7 1 0 2-1 4-3 1 5-2 9-6 11z" fill="#fb923c"/><path d="M12 18c-2-1-3-3-2.5-5.5 1 1 1.6 1.2 2.5 1.2 0-1.4.3-2.4 1-3.4.6 1 .8 2 .8 3.4.9 0 1.5-.2 2.5-1.2.4 2.5-.6 4.5-2.8 5.5z" fill="#fde047"/>' },
    { id: 'voidav', gems: 30, svg: '<circle cx="12" cy="12" r="11" fill="#0b0720"/><circle cx="12" cy="12" r="8" fill="none" stroke="#a78bfa" stroke-width="1.4" stroke-dasharray="1 2.2"/><circle cx="12" cy="12" r="5" fill="#000" stroke="#7c3aed" stroke-width="1.5"/><path d="M4 12c3-2 13-2 16 0" stroke="#c4b5fd" stroke-width="1" fill="none"/>' },
    { id: 'auroraav', gems: 40, svg: '<circle cx="12" cy="12" r="11" fill="#022c22"/><path d="M3 14c3-6 6 2 9-4s6 0 9-3" stroke="#5eead4" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M3 18c3-5 6 1 9-3s6 0 9-2" stroke="#a7f3d0" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/><circle cx="7" cy="6" r=".7" fill="#fff"/><circle cx="17" cy="5" r=".7" fill="#fff"/>' },
    { id: 'crownx', gems: 60, svg: '<circle cx="12" cy="12" r="11" fill="#1e1b4b"/><path d="M4 9l4 3.5L12 5l4 7.5L20 9l-2 9H6z" fill="#22d3ee" stroke="#cffafe" stroke-width="1" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="1.6" fill="#f0abfc"/>' },
    { id: 'galaxy', gems: 20, svg: '<circle cx="12" cy="12" r="11" fill="#1e1b4b"/><path d="M12 12c3-1 5 1 4 3.5s-5 3.5-8 1.5S4 10 7 7s9-3 11 1" fill="none" stroke="#f0abfc" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8" fill="#fff"/><circle cx="6" cy="17" r=".7" fill="#fff"/><circle cx="18" cy="6" r=".7" fill="#fff"/>' },
    { id: 'satellite', price: 600, svg: '<rect x="9" y="9" width="6" height="6" rx="1" fill="#e2e8f0" transform="rotate(45 12 12)"/><rect x="1.5" y="10" width="6" height="4" fill="#38bdf8" stroke="#0369a1" stroke-width=".6" transform="rotate(45 12 12)"/><rect x="16.5" y="10" width="6" height="4" fill="#38bdf8" stroke="#0369a1" stroke-width=".6" transform="rotate(45 12 12)"/><circle cx="12" cy="12" r="1.3" fill="#f43f5e"/>' },
    { id: 'starfish', price: 800, svg: '<path d="M12 2l2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L12 16.3 6.1 20l1.7-6.7-5.3-4.4 6.9-.5z" fill="#fb923c" stroke="#c2410c" stroke-width="1"/><circle cx="10" cy="11" r="1" fill="#431407"/><circle cx="14" cy="11" r="1" fill="#431407"/><path d="M10.5 13.5q1.5 1 3 0" stroke="#431407" stroke-width=".9" fill="none"/>' },
    { id: 'octo', price: 1000, svg: '<path d="M5 12a7 7 0 0114 0v2c0 1-1 1-1 3s1 3 0 4-2-1-3-2-1 2-3 2-2-3-3-2-2 3-3 2 0-2 0-4-1-2-1-3z" fill="#c084fc"/><circle cx="9.5" cy="11" r="1.8" fill="#fff"/><circle cx="14.5" cy="11" r="1.8" fill="#fff"/><circle cx="9.8" cy="11.3" r=".9" fill="#1e1b4b"/><circle cx="14.8" cy="11.3" r=".9" fill="#1e1b4b"/>' },
    { id: 'fire', price: 1500, svg: '<path d="M12 22c-4.5 0-7-3-7-6.5 0-4 3-5.5 3.5-9.5 1.5 1.5 2.3 3 2.3 4.8C12 9 13 6 12.5 2c4 2.5 6.5 6.5 6.5 12 0 4.5-3 8-7 8z" fill="#f97316"/><path d="M12 21c-2.2 0-3.5-1.5-3.5-3.4 0-2 1.5-3 2-5 1 1 1.4 2 1.4 3 .8-.8 1.4-2 1.2-3.6 1.6 1.2 2.4 3 2.4 5.3 0 2.2-1.4 3.7-3.5 3.7z" fill="#fde047"/>' },
    { id: 'dragonav', price: 2500, svg: '<circle cx="12" cy="12" r="11" fill="#450a0a"/><path d="M5 9l3-5 2 4h4l2-4 3 5-2 9H7z" fill="#ef4444"/><circle cx="9.5" cy="11.5" r="1.3" fill="#fde047"/><circle cx="14.5" cy="11.5" r="1.3" fill="#fde047"/><path d="M9.5 15.5l1 1 1.5-1 1.5 1 1-1" stroke="#fde047" stroke-width=".9" fill="none"/>' },
    { id: 'blackhole', price: 2000, svg: '<circle cx="12" cy="12" r="10" fill="#7c3aed" opacity=".35"/><circle cx="12" cy="12" r="7" fill="none" stroke="#f472b6" stroke-width="1.6" stroke-dasharray="6 3"/><circle cx="12" cy="12" r="4" fill="#000" stroke="#c084fc"/>' },
  ];

  // party logos: a shield badge in two colours with a symbol from the icons or avatars
  const LOGOS = [
    ['#f59e0b', '#7c3aed', 'I', 'star'], ['#0ea5e9', '#1e3a8a', 'I', 'bolt'], ['#ef4444', '#7f1d1d', 'A', 'fire'], ['#22c55e', '#14532d', 'A', 'alien'],
    ['#a855f7', '#1e1b4b', 'A', 'skull'], ['#facc15', '#a16207', 'A', 'crown'], ['#06b6d4', '#164e63', 'I', 'gem'], ['#f43f5e', '#831843', 'I', 'heart'],
    ['#64748b', '#0f172a', 'I', 'shield'], ['#fb923c', '#7c2d12', 'A', 'dragonav'], ['#38bdf8', '#0c4a6e', 'A', 'planet'], ['#e879f9', '#701a75', 'I', 'plasma'],
    ['#fde047', '#713f12', 'I', 'trophy'], ['#94a3b8', '#1e293b', 'A', 'ufo'], ['#c084fc', '#3b0764', 'A', 'octo'], ['#2dd4bf', '#134e4a', 'A', 'rocket'],
  ].map((l, i) => ({ id: 'l' + (i + 1), c1: l[0], c2: l[1], src: l[2], sym: l[3] }));
  let logoN = 0;
  function logo(id) {
    const L = LOGOS.find(x => x.id === id) || LOGOS[0], n = ++logoN;
    const sym = L.src === 'I' ? I[L.sym] : (AVATARS.find(a => a.id === L.sym) || AVATARS[0]).svg;
    return `<svg class="logo" viewBox="0 0 24 24"><defs><linearGradient id="plg${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${L.c1}"/><stop offset="1" stop-color="${L.c2}"/></linearGradient></defs>
      <path d="M12 1.2l9.3 3.6v6.6c0 5.6-3.9 9.9-9.3 11.6-5.4-1.7-9.3-6-9.3-11.6V4.8z" fill="url(#plg${n})" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/>
      <g transform="translate(5.6 5.2) scale(.53)">${sym}</g></svg>`;
  }
  function icon(name, cls = '') { return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[name] || ''}</svg>`; }
  function avatar(id, cls = '') { const a = AVATARS.find(x => x.id === id) || AVATARS[0]; return `<svg class="av ${cls}" viewBox="0 0 24 24">${a.svg}</svg>`; }

  window.Art = { SHIPS, AVATARS, LOGOS, drawShip, shipPreview, icon, avatar, logo };
})();
