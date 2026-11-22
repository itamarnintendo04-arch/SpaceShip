// SpaceShip game engine. World is W x H "portrait" units: ship near bottom, meteors fall (+y).
// Landscape mode rotates the whole world 90deg so the ship sits on the left and flies right.
(function () {
  const W = 480;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const pick = a => a[(Math.random() * a.length) | 0];

  // ---------- sound ----------
  const Sfx = {
    ctx: null, on: true, last: {},
    init() { if (!this.ctx) try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    tone(f1, f2, dur, type = 'square', vol = 0.06, key) {
      if (!this.on || !this.ctx) return;
      const now = this.ctx.currentTime;
      if (key) { if (this.last[key] && now - this.last[key] < 0.05) return; this.last[key] = now; }
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f1, now); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), now + dur);
      g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g); g.connect(this.ctx.destination); o.start(now); o.stop(now + dur);
    },
    noise(dur, vol = 0.15) {
      if (!this.on || !this.ctx) return;
      const n = this.ctx.sampleRate * dur, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); s.buffer = b; g.gain.value = vol;
      s.connect(g); g.connect(this.ctx.destination); s.start();
    },
    shoot() { this.tone(880, 220, 0.08, 'square', 0.025, 'shoot'); },
    boom(big) { this.noise(big ? 0.6 : 0.25, big ? 0.3 : 0.12); },
    coin() { this.tone(988, 1976, 0.12, 'sine', 0.06, 'coin'); },
    power() { this.tone(300, 1200, 0.3, 'triangle', 0.08); },
    hit() { this.tone(200, 60, 0.3, 'sawtooth', 0.1); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.18, 'triangle', 0.08), i * 120)); },
  };

  // ---------- the 4 worlds, 500 levels each, played in order ----------
  // each has its own meteors, enemy ships, boss colours, background and music
  const GALAXIES = [
    { n: 1, ship: 'scout',   music: 'game',  star: '#ffffff', boss: ['#64748b', '#1e1b4b', '#f43f5e'] },
    { n: 2, ship: 'saucer',  music: 'game2', star: '#e0f2fe', boss: ['#bae6fd', '#0c4a6e', '#38bdf8'] },
    { n: 3, ship: 'raider',  music: 'game3', star: '#fed7aa', boss: ['#fb923c', '#450a0a', '#fde047'] },
    { n: 4, ship: 'warship', music: 'game4', star: '#e9d5ff', boss: ['#4c1d95', '#020617', '#c084fc'] },
  ];
  const ENEMY_SHIPS = ['scout', 'saucer', 'raider', 'warship'];

  // ---------- level design ----------
  function levelCfg(n, g = 1) {
    const eff = n + (g - 1) * 45; // later worlds start harder
    const d = 1 - Math.exp(-eff / 70); // 0 -> 1, eases off so level 500 is hard but fair
    const kinds = g === 2 ? (n < 4 ? ['ice', 'frost'] : ['ice', 'frost', 'frost', 'rock'])
      : g === 3 ? (n < 4 ? ['lava', 'magma'] : ['lava', 'magma', 'magma', 'rock'])
      : g === 4 ? (n < 4 ? ['dark', 'frost'] : ['dark', 'dark', 'magma', 'frost'])
      : n < 3 ? ['rock'] : n < 6 ? ['rock', 'rock', 'ice'] : n < 10 ? ['rock', 'ice', 'lava'] : ['rock', 'ice', 'lava', 'lava'];
    const hue = g === 2 ? 190 + (n * 13) % 40 : g === 3 ? 4 + (n * 11) % 30 : g === 4 ? 262 + (n * 7) % 40 : (200 + n * 47) % 360;
    return {
      gal: g, enemy: g === 1 ? (n < 6 ? 0 : Math.min(0.16, 0.03 + d * 0.13)) : Math.min(0.3, 0.08 + d * 0.22), enemyD: d,
      n, goal: 12 + Math.min(n * 3, 100),
      spawn: Math.max(0.22, 1.05 - d * 0.8),
      speed: 1 + d * 1.9,
      bigChance: Math.min(0.55, 0.12 + d * 0.43),
      kinds,
      goldChance: 0.03 + d * 0.05,
      hpBonus: Math.floor(Math.min(eff, 200) / 8),
      boss: n % 5 === 0,
      hue,
    };
  }
  // ---- secret worlds: found by doing something special in normal levels; their levels give diamonds ----
  // trigger types: comet (shoot the golden comet), boss (beat the boss without losing a heart), crystals (collect n),
  // gold (destroy n golden meteors), coins (collect n coins), nohit (finish without being hit), fast (finish within n seconds)
  const TRIGS = [
    ['comet', 4], ['boss', 10], ['crystals', 13, 3], ['gold', 18, 5], ['coins', 22, 40],
    ['nohit', 27], ['fast', 31, 75], ['comet', 36], ['crystals', 42, 4], ['boss', 45],
    ['gold', 53, 8], ['coins', 58, 60], ['nohit', 64], ['fast', 71, 90], ['comet', 80],
    ['crystals', 88, 5], ['boss', 95], ['gold', 110, 10], ['nohit', 125], ['boss', 150],
  ];
  const KIND_SETS = [['gold', 'rock', 'lava'], ['lava', 'rock', 'lava'], ['ice', 'ice', 'rock'], ['rock', 'gold', 'ice'], ['lava', 'lava', 'ice']];
  // names & hints: i18n w1_name … w20_name and h_<type>
  const WORLDS = TRIGS.map((tr, i) => ({
    id: 'w' + (i + 1), hue: [45, 275, 190, 330, 120, 15, 220, 300, 160, 0, 250, 60, 180, 285, 95, 205, 350, 30, 140, 265][i],
    kinds: KIND_SETS[i % KIND_SETS.length],
    gems: [3 + Math.floor(i * 0.6), 4 + Math.floor(i * 0.7), 6 + i],
    trig: { type: tr[0], level: tr[1], n: tr[2] || 0 },
  }));
  function secretCfg(w, k) {
    const W_ = WORLDS[w - 1], base = levelCfg(8 + w * 4 + k * 2);
    return Object.assign(base, {
      hue: W_.hue, kinds: W_.kinds, goal: 30 + Math.min(w, 12) * 6 + k * 6, spawn: Math.max(0.2, base.spawn * 0.75),
      speed: base.speed * 1.12, bigChance: Math.min(0.6, base.bigChance + 0.1), boss: k === 3, goldChance: W_.kinds[0] === 'gold' ? 0.12 : base.goldChance,
    });
  }

  const KIND = {
    rock: { c1: '#a8a29e', c2: '#44403c', hp: 1, sp: 1 },
    ice:  { c1: '#bae6fd', c2: '#0369a1', hp: 2, sp: 0.85 },
    lava: { c1: '#fdba74', c2: '#7c2d12', hp: 1.3, sp: 1.35 },
    gold: { c1: '#fde68a', c2: '#a16207', hp: 1.5, sp: 1 },
    frost: { c1: '#f0f9ff', c2: '#38bdf8', hp: 1.6, sp: 1.1 },
    magma: { c1: '#fecaca', c2: '#b91c1c', hp: 1.5, sp: 1.25 },
    dark: { c1: '#a78bfa', c2: '#1e1b4b', hp: 2.2, sp: 0.95 },
  };
  const FX_COLORS = ['#fbbf24', '#60a5fa', '#f87171', '#a3e635', '#e879f9', '#ffffff'];
  const PICK_TYPES = ['coin', 'shield', 'rapid', 'triple', 'life', 'crystal'];

  let nextId = 1;
  const gunOf = skin => (Art.SHIPS.find(s => s.id === skin) || Art.SHIPS[0]).gun || { rate: 1, dmg: 1, side: 0, style: 'line' };

  // how a player's shot looks, by the ship's weapon style
  function drawShot(x, b, k, t, hd) {
    const st = (k.gun && k.gun.style) || 'line', c = k.glow, ang = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    if (hd) { x.shadowColor = c; x.shadowBlur = 12; }
    x.save(); x.translate(b.x, b.y); x.rotate(ang);
    switch (st) {
      case 'needle': x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 24); x.stroke(); x.fillStyle = '#fff'; x.fillRect(-1, -2, 2, 6); break;
      case 'flame': { const gr = x.createRadialGradient(0, 4, 1, 0, 4, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#fb923c'); gr.addColorStop(1, 'rgba(239,68,68,0)'); x.fillStyle = gr; x.beginPath(); x.ellipse(0, 6, 5, 11, 0, 0, 7); x.fill(); break; }
      case 'ring': x.strokeStyle = c; x.lineWidth = 2.5; x.beginPath(); x.arc(0, 0, 5 + Math.sin(t * 20) * 1.5, 0, 7); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 1.6, 0, 7); x.fill(); break;
      case 'twin': x.strokeStyle = c; x.lineWidth = 2.5; for (const dx of [-3, 3]) { x.beginPath(); x.moveTo(dx, 0); x.lineTo(dx, 16); x.stroke(); } break;
      case 'laser': { x.strokeStyle = c; x.lineWidth = 6; x.globalAlpha = 0.45; x.beginPath(); x.moveTo(0, -4); x.lineTo(0, 34); x.stroke(); x.globalAlpha = 1; x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke(); break; }
      case 'fireball': { const gr = x.createRadialGradient(0, 0, 1, 0, 0, 9); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, '#fde047'); gr.addColorStop(0.7, '#f97316'); gr.addColorStop(1, 'rgba(220,38,38,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 9, 0, 7); x.fill();
        x.fillStyle = 'rgba(251,146,60,.5)'; x.beginPath(); x.ellipse(0, 12, 3.5, 9, 0, 0, 7); x.fill(); break; }
      case 'star': { x.rotate(t * 10); x.fillStyle = '#fde047'; x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 3 : 8, a = i * Math.PI / 5; x[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, -Math.cos(a) * r); } x.closePath(); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 2, 0, 7); x.fill(); break; }
      case 'wisp': { x.globalAlpha = 0.75; const gr = x.createRadialGradient(0, 0, 1, 0, 0, 8); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(165,180,252,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 8, 0, 7); x.fill();
        x.strokeStyle = c; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 4); x.quadraticCurveTo(Math.sin(t * 25) * 6, 12, 0, 22); x.stroke(); break; }
      case 'shard': x.fillStyle = '#a5f3fc'; x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -8); x.lineTo(4, 2); x.lineTo(0, 12); x.lineTo(-4, 2); x.closePath(); x.fill(); x.stroke(); break;
      case 'comet': { const gr = x.createLinearGradient(0, -4, 0, 26); gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, '#38bdf8'); gr.addColorStop(1, 'rgba(56,189,248,0)'); x.fillStyle = gr; x.beginPath(); x.moveTo(-4, 0); x.lineTo(0, -6); x.lineTo(4, 0); x.lineTo(0, 26); x.closePath(); x.fill(); break; }
      case 'nebula': { const r = 7 + Math.sin(t * 18 + b.x) * 1.5, gr = x.createRadialGradient(0, 0, 1, 0, 0, r); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#e879f9'); gr.addColorStop(1, 'rgba(168,85,247,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); break; }
      case 'beam': { x.strokeStyle = '#f97316'; x.lineWidth = 8; x.globalAlpha = 0.4; x.beginPath(); x.moveTo(0, -6); x.lineTo(0, 38); x.stroke(); x.globalAlpha = 1; x.strokeStyle = '#fed7aa'; x.lineWidth = 3; x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 1; x.stroke(); break; }
      case 'vortex': { x.rotate(t * 16); x.strokeStyle = '#34d399'; x.lineWidth = 2.2; for (let i = 0; i < 3; i++) { x.beginPath(); x.arc(0, 0, 6, i * 2.1, i * 2.1 + 1.4); x.stroke(); } x.fillStyle = '#ecfdf5'; x.beginPath(); x.arc(0, 0, 2.2, 0, 7); x.fill(); break; }
      case 'void': { x.fillStyle = '#000'; x.strokeStyle = '#a78bfa'; x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 6.5, 0, 7); x.fill(); x.stroke(); x.globalAlpha = 0.5; x.beginPath(); x.arc(0, 0, 9 + Math.sin(t * 20) * 1.5, 0, 7); x.stroke(); break; }
      case 'aurora': { const h = 150 + 40 * Math.sin(t * 8 + b.x * 0.05); x.strokeStyle = `hsl(${h},90%,65%)`; x.lineWidth = 3; x.beginPath(); for (let i = 0; i <= 6; i++) x[i ? 'lineTo' : 'moveTo'](Math.sin(t * 30 + i) * 3, i * 4); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 2, 0, 7); x.fill(); break; }
      case 'supernova': { const r = 9 + Math.sin(t * 25) * 1.5, gr = x.createRadialGradient(0, 0, 1, 0, 0, r); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#fde047'); gr.addColorStop(0.75, '#f97316'); gr.addColorStop(1, 'rgba(249,115,22,0)'); x.fillStyle = gr; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill();
        x.rotate(t * 12); x.strokeStyle = '#fff'; x.lineWidth = 1.2; for (let i = 0; i < 4; i++) { x.rotate(Math.PI / 4); x.beginPath(); x.moveTo(-r * 1.1, 0); x.lineTo(r * 1.1, 0); x.stroke(); } break; }
      case 'rainbow': { const h = (t * 400 + b.x) % 360; x.strokeStyle = `hsl(${h},95%,65%)`; x.lineWidth = 6; x.globalAlpha = 0.55; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 22); x.stroke();
        x.globalAlpha = 1; x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 3, 0, 7); x.fill(); break; }
      default: x.strokeStyle = c; x.lineWidth = 5; x.globalAlpha = 0.5; x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 18); x.stroke(); x.strokeStyle = '#fff'; x.lineWidth = 2; x.globalAlpha = 1; x.stroke();
    }
    x.restore(); x.globalAlpha = 1;
  }

  class Game {
    constructor(canvas, opts) {
      this.cv = canvas; this.cx = canvas.getContext('2d');
      this.o = opts;
      this.mode = opts.mode; // 'level' | 'endless'
      this.landscape = opts.orientation === 'landscape';
      this.coop = opts.coop || null; // {room, role}
      this.isGuest = this.coop && this.coop.role === 'guest';
      this.local2 = !!opts.local2; this.hd = !!opts.hd; this.padPrev = {};
      this.level = opts.level || 1;
      this.galN = Math.max(1, Math.min(4, opts.world || 1)); this.gal = GALAXIES[this.galN - 1];
      this.secret = opts.secret || null; // {w, k}
      this.cfg = levelCfg(this.mode === 'endless' ? 1 : this.level, this.galN);
      if (this.secret) { this.level = 8 + this.secret.w * 4 + this.secret.k * 2; this.cfg = secretCfg(this.secret.w, this.secret.k); }
      this.found = []; this.crystals = 0; this.comet = null; this.goldKills = 0; this.hits = 0;
      const normal = this.mode === 'level' && !this.secret && !opts.mini && this.galN === 1; // secret worlds hide in world 1
      // the secret worlds that can be found in this level
      this.trigs = normal ? WORLDS.filter(w => w.trig.level === this.level) : [];
      const trig = type => this.trigs.find(w => w.trig.type === type);
      this.cometWorld = trig('comet'); this.crystalWorld = trig('crystals');
      this.cometAt = this.cometWorld ? rnd(7, 14) : 0;
      this.crystalAt = this.crystalWorld ? Array.from({ length: this.crystalWorld.trig.n }, (_, i) => 8 + i * 9) : [];
      if (trig('gold')) this.cfg.goldChance = Math.max(this.cfg.goldChance, 0.14);
      this.t = 0; this.spawnT = 1; this.kills = 0; this.score = 0; this.coins = 0;
      this.meteors = []; this.bullets = []; this.pickups = []; this.parts = []; this.floats = [];
      this.boss = null; this.bossSpawned = false;
      this.over = false; this.endT = 0; this.result = null; this.paused = false;
      this.fxQueue = []; this.netT = 0; this.livesLost = 0;
      this.keys = {}; this.drag = null; this.shake = 0;
      this.resize();
      this.H = opts.H || this.autoH;
      this.resize();
      if (this.coop) { // everybody in the room, host first; the host runs the game for all
        this.players = opts.roster.map(p => this.makePlayer(p, p.id === opts.me.id));
        this.me = this.players.find(p => p.local) || this.players[0];
      } else {
        this.players = [this.makePlayer(opts.me, true)];
        if (this.local2) this.players.push(this.makePlayer(opts.p2, true));
        this.me = this.players[0];
      }
      this.spreadPlayers();
      this.stars = [0, 1, 2].map(l => Array.from({ length: 40 + l * 25 }, () => ({ x: Math.random(), y: Math.random(), s: (l + 1) * 0.6, v: 0.03 + l * 0.05 })));
      this.makeBg();
      this.bind();
      this.last = performance.now();
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    makePlayer(p, local) {
      const st = p.stats || {};
      return {
        id: p.id, name: p.name, handle: p.handle, skin: p.skin || 'falcon', local,
        x: W / 2, y: 0, lives: (this.secret ? 1 : 3) + (st.life || 0), shield: st.shield || 0, plasma: !!st.plasma,
        weapon: st.weapon || 1, magnet: st.magnet || 0, inv: 2, alive: true, fireCd: 0, rapid: 0, triple: 0, tx: W / 2, ty: 0,
        rate: st.rate || 0, power: st.power || 0, luck: st.luck || 0, revive: !!st.revive && !(this.o && this.o.mini), drone: !!st.drone, dn: 0,
      };
    }
    spreadPlayers() {
      const n = this.players.length;
      this.players.forEach((p, i) => { p.x = p.tx = W * (i + 1) / (n + 1); p.y = p.ty = this.H - 90 - (n > 4 ? (i % 2) * 40 : 0); });
    }

    // ----- layout / input -----
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = this.cv.clientWidth || innerWidth, ch = this.cv.clientHeight || innerHeight;
      this.cv.width = cw * dpr; this.cv.height = ch * dpr; this.dpr = dpr; this.cw = cw; this.ch = ch;
      const across = this.landscape ? ch : cw, fwd = this.landscape ? cw : ch;
      this.autoH = clamp(Math.round(W * fwd / across), 640, 1000);
      const H = this.H || this.autoH;
      const s = Math.min(across / W, fwd / H);
      this.s = s;
      if (this.landscape) { this.ox = (cw - H * s) / 2; this.oy = (ch - W * s) / 2; }
      else { this.ox = (cw - W * s) / 2; this.oy = (ch - H * s) / 2; }
      if (this.bgC) this.makeBg();
    }
    worldTransform() {
      const s = this.s * this.dpr, d = this.dpr;
      const sx = this.shake ? rnd(-this.shake, this.shake) : 0, sy = this.shake ? rnd(-this.shake, this.shake) : 0;
      if (this.landscape) this.cx.setTransform(0, s, -s, 0, (this.ox + this.H * this.s + sx) * d, (this.oy + sy) * d);
      else this.cx.setTransform(s, 0, 0, s, (this.ox + sx) * d, (this.oy + sy) * d);
    }
    toScreen(x, y) { return this.landscape ? [this.ox + (this.H - y) * this.s, this.oy + x * this.s] : [this.ox + x * this.s, this.oy + y * this.s]; }
    screenDelta(dx, dy) { return this.landscape ? [dy / this.s, -dx / this.s] : [dx / this.s, dy / this.s]; }

    bind() {
      this.h = {
        down: e => { Sfx.init(); if (this.paused) return; this.drag = { px: e.clientX, py: e.clientY, x: this.me.tx, y: this.me.ty }; },
        move: e => {
          if (!this.drag) {
            // desktop: ship follows the mouse
            if (this.hd && e.pointerType === 'mouse' && !this.paused && e.target === this.cv) {
              const sx = e.clientX - this.cv.getBoundingClientRect().left, sy = e.clientY - this.cv.getBoundingClientRect().top;
              const [wx, wy] = this.landscape ? [(sy - this.oy) / this.s, this.H - (sx - this.ox) / this.s] : [(sx - this.ox) / this.s, (sy - this.oy) / this.s];
              this.me.tx = clamp(wx, 20, W - 20); this.me.ty = clamp(wy, this.H * 0.3, this.H - 30);
            }
            return;
          }
          const [dx, dy] = this.screenDelta(e.clientX - this.drag.px, e.clientY - this.drag.py);
          const k = 1.25; // a bit of acceleration so thumbs travel less
          this.me.tx = clamp(this.drag.x + dx * k, 20, W - 20);
          this.me.ty = clamp(this.drag.y + dy * k, this.H * 0.3, this.H - 30);
        },
        up: () => { this.drag = null; },
        kd: e => { this.keys[e.code] = true; if (e.code === 'KeyP' || e.code === 'Escape') this.o.onPauseKey && this.o.onPauseKey(); if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); },
        ku: e => { this.keys[e.code] = false; },
        rs: () => this.resize(),
      };
      this.cv.addEventListener('pointerdown', this.h.down);
      addEventListener('pointermove', this.h.move);
      addEventListener('pointerup', this.h.up);
      addEventListener('pointercancel', this.h.up);
      addEventListener('keydown', this.h.kd);
      addEventListener('keyup', this.h.ku);
      addEventListener('resize', this.h.rs);
    }
    destroy() {
      cancelAnimationFrame(this.raf); this.dead = true;
      this.cv.removeEventListener('pointerdown', this.h.down);
      removeEventListener('pointermove', this.h.move); removeEventListener('pointerup', this.h.up);
      removeEventListener('pointercancel', this.h.up); removeEventListener('keydown', this.h.kd);
      removeEventListener('keyup', this.h.ku); removeEventListener('resize', this.h.rs);
    }

    // ----- main loop -----
    loop(now) {
      if (this.dead) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      if (!this.paused) this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }

    keyMove(dt) {
      const k = this.keys, sp = 420 * dt;
      const dir = (L, R, U, D) => [(k[R] ? 1 : 0) - (k[L] ? 1 : 0), (k[D] ? 1 : 0) - (k[U] ? 1 : 0)];
      const wasd = dir('KeyA', 'KeyD', 'KeyW', 'KeyS'), arrows = dir('ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown');
      const ctl = this.local2 ? [[this.players[0], wasd], [this.players[1], arrows]] : [[this.me, [wasd[0] || arrows[0], wasd[1] || arrows[1]]]];
      // gamepads: pad i controls player i (single player: any pad)
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      pads.forEach((g, i) => {
        const c = this.local2 ? ctl[i] : ctl[0]; if (!c) return;
        const b = n => g.buttons[n] && g.buttons[n].pressed;
        let ax = g.axes[0] || 0, ay = g.axes[1] || 0;
        if (Math.abs(ax) < 0.2) ax = 0; if (Math.abs(ay) < 0.2) ay = 0;
        if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
        if (ax || ay) c[1] = [ax, ay];
        if (b(9) && !this.padPrev[i]) this.o.onPauseKey && this.o.onPauseKey();
        this.padPrev[i] = b(9);
      });
      for (const [p, [ax, fy]] of ctl) {
        if (!p.alive || (!ax && !fy)) continue;
        const [dx, dy] = this.landscape ? [fy, -ax] : [ax, fy];
        p.tx = clamp(p.tx + dx * sp, 20, W - 20);
        p.ty = clamp(p.ty + dy * sp, this.H * 0.3, this.H - 30);
      }
    }

    update(dt) {
      this.t += dt;
      this.shake = Math.max(0, this.shake - dt * 30);
      for (const L of this.stars) for (const s of L) { s.y += s.v * dt * (this.boss ? 0.5 : 1); if (s.y > 1) { s.y -= 1; s.x = Math.random(); } }
      this.keyMove(dt);
      // local ship follows target smoothly
      for (const me of this.players) if (me.local) {
        me.x += (me.tx - me.x) * Math.min(1, dt * 18); me.y += (me.ty - me.y) * Math.min(1, dt * 18);
        if (this.hd && me.alive && Math.random() < 0.7) this.parts.push({ x: me.x + rnd(-4, 4), y: me.y + 26, vx: rnd(-15, 15), vy: rnd(120, 200), life: 0.35, max: 0.35, sz: rnd(2, 4), c: (Art.SHIPS.find(q => q.id === me.skin) || Art.SHIPS[0]).glow });
      }
      this.updateParticles(dt);
      if (this.isGuest) return this.guestUpdate(dt);

      if (this.mode === 'endless') { const n = 1 + Math.floor(this.t / 22); if (n !== this.cfg.n) { const h = this.cfg.hue; this.cfg = levelCfg(n, this.galN); this.cfg.boss = false; this.cfg.hue = h; } }
      const cfg = this.cfg;

      // spawning
      const levelDone = this.mode === 'level' && this.kills >= cfg.goal;
      if (levelDone && cfg.boss && !this.bossSpawned) this.spawnBoss();
      if (!levelDone || this.mode === 'endless') {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawnT = cfg.spawn * rnd(0.6, 1.3) * (this.players.length > 1 ? 0.8 : 1); if (Math.random() < (cfg.enemy || 0)) this.spawnEnemy(); else this.spawnMeteor(); }
      } else if (!cfg.boss && !this.over && this.meteors.length === 0) this.finish(true);

      // secret: the golden comet (level 4) and the hidden crystals (level 13)
      if (this.cometAt && this.t > this.cometAt && !this.over) {
        this.cometAt = 0; const fromLeft = Math.random() < 0.5;
        this.comet = { x: fromLeft ? -40 : W + 40, y: rnd(70, 190), vx: (fromLeft ? 1 : -1) * 240, hp: 4, t: 0 };
        Sfx.power();
      }
      if (this.comet) {
        const c = this.comet; c.x += c.vx * dt; c.t += dt; c.y += Math.sin(c.t * 5) * 30 * dt;
        if (c.x < -60 || c.x > W + 60) { this.comet = null; this.float(W / 2, 150, t('f_comet_gone'), '#fde68a', 1.4); }
        else if (Math.random() < 0.8) this.parts.push({ x: c.x - Math.sign(c.vx) * 12, y: c.y + rnd(-4, 4), vx: -c.vx * 0.2, vy: rnd(-20, 20), life: 0.5, max: 0.5, sz: rnd(2, 5), c: '#fde047' });
      }
      while (this.crystalAt.length && this.t > this.crystalAt[0]) {
        this.crystalAt.shift();
        this.pickups.push({ x: rnd(40, W - 40), y: -20, vx: 0, vy: 150, type: 'crystal', t: 0 });
      }

      // players
      for (const p of this.players) {
        if (!p.alive) continue;
        p.inv = Math.max(0, p.inv - dt); p.rapid = Math.max(0, p.rapid - dt); p.triple = Math.max(0, p.triple - dt);
        p.fireCd -= dt;
        if (p.fireCd <= 0 && !this.over) { this.fire(p); p.fireCd = ((p.rapid > 0 ? 0.085 : 0.17) - p.weapon * 0.006) / gunOf(p.skin).rate / (1 + 0.07 * (p.rate || 0)); }
      }

      // bullets
      for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      this.bullets = this.bullets.filter(b => b.y > -30 && b.y < this.H + 30 && b.x > -30 && b.x < W + 30 && !b.dead);

      // meteors
      for (const m of this.meteors) {
        if (m.ship) this.updateEnemy(m, dt);
        m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.vr * dt;
        if (m.x < m.r && m.vx < 0 || m.x > W - m.r && m.vx > 0) m.vx *= -1;
        m.flash = Math.max(0, m.flash - dt);
      }
      // bullet vs meteor / boss / player
      for (const b of this.bullets) {
        if (b.dead) continue;
        if (b.enemy) {
          for (const p of this.players) if (p.alive && Math.hypot(p.x - b.x, p.y - b.y) < 16) { b.dead = true; this.hurt(p); }
          continue;
        }
        for (const m of this.meteors) {
          if (m.dead) continue;
          if (Math.abs(m.x - b.x) < m.r + 4 && Math.abs(m.y - b.y) < m.r + 4 && Math.hypot(m.x - b.x, m.y - b.y) < m.r + 4) {
            if (b.pierce) { if (b.hits.has(m.id)) continue; b.hits.add(m.id); } else b.dead = true;
            m.hp -= b.dmg; m.flash = 0.06;
            if (m.hp <= 0) this.killMeteor(m, b.owner);
            if (b.dead) break;
          }
        }
        const C = this.comet;
        if (!b.dead && C && Math.hypot(C.x - b.x, C.y - b.y) < 20) {
          b.dead = true; C.hp -= 1; this.spark(b.x, b.y, 6, 0);
          if (C.hp <= 0) { this.comet = null; this.explode(C.x, C.y, 50, 0); this.discover(this.cometWorld ? this.cometWorld.id : 'w1', C.x, C.y); for (let i = 0; i < 8; i++) this.drop(C.x, C.y, 'coin'); }
        }
        const B = this.boss;
        if (!b.dead && B && B.hp > 0 && Math.abs(b.x - B.x) < 95 && Math.abs(b.y - B.y) < 45) {
          b.dead = true; B.hp -= b.dmg; B.flash = 0.05;
          if (Math.random() < 0.3) this.spark(b.x, b.y, 3, 0);
          if (B.hp <= 0) this.killBoss();
        }
      }
      // meteor vs player
      for (const m of this.meteors) {
        if (m.dead) continue;
        for (const p of this.players) if (p.alive && Math.hypot(p.x - m.x, p.y - m.y) < m.r + 14) { this.hurt(p); m.hp = 0; this.killMeteor(m, -1); }
      }
      this.meteors = this.meteors.filter(m => !m.dead && m.y < this.H + 80);

      // boss
      if (this.boss && this.boss.hp > 0) this.updateBoss(dt);

      // pickups
      for (const k of this.pickups) {
        k.t += dt; k.y += k.vy * dt; k.x += k.vx * dt; k.vx *= 0.97;
        for (const p of this.players) {
          if (!p.alive) continue;
          const d = Math.hypot(p.x - k.x, p.y - k.y), mag = k.type === 'coin' ? 30 + p.magnet * 45 : k.type === 'crystal' ? 0 : 30;
          if (d < mag && d > 1) { k.x += (p.x - k.x) / d * 520 * dt; k.y += (p.y - k.y) / d * 520 * dt; }
          if (d < 24) { this.collect(p, k); break; }
        }
      }
      this.pickups = this.pickups.filter(k => !k.dead && k.y < this.H + 30);

      // game over check
      if (!this.over && this.players.every(p => !p.alive)) this.finish(false);
      if (this.over) { this.endT -= dt; if (this.endT <= 0 && !this.ended) { this.ended = true; this.o.onEnd(this.result); } }

      // co-op sync (host)
      if (this.coop) { this.netT -= dt; if (this.netT <= 0) { this.netT = 1 / 12; this.sendState(); } }
    }

    // ----- entities -----
    spawnMeteor(opt = {}) {
      const cfg = this.cfg;
      let tier = opt.tier != null ? opt.tier : Math.random() < cfg.bigChance ? 2 : Math.random() < 0.5 ? 1 : 0;
      const kind = opt.kind || (Math.random() < cfg.goldChance ? 'gold' : pick(cfg.kinds));
      const K = KIND[kind];
      const r = [15, 27, 44][tier] * rnd(0.9, 1.12);
      const n = 9 + tier * 2, pts = [];
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push([Math.cos(a) * rnd(0.75, 1.05), Math.sin(a) * rnd(0.75, 1.05)]); }
      const craters = Array.from({ length: 1 + tier }, () => [rnd(-0.45, 0.45), rnd(-0.45, 0.45), rnd(0.12, 0.25)]);
      const sp = (60 + Math.random() * 70) * cfg.speed * K.sp * (tier === 0 ? 1.2 : 1);
      const m = {
        id: nextId++, tier, kind, r, pts, craters,
        x: opt.x != null ? opt.x : rnd(r, W - r), y: opt.y != null ? opt.y : -r - 10,
        vx: opt.vx != null ? opt.vx : rnd(-40, 40), vy: opt.vy != null ? opt.vy : sp,
        rot: Math.random() * 7, vr: rnd(-2, 2), flash: 0,
        hp: Math.ceil([1, 3, 6][tier] * K.hp + (cfg.hpBonus != null ? cfg.hpBonus : Math.floor(cfg.n / 6)) * (tier + 1) * 0.5),
      };
      this.meteors.push(m); return m;
    }
    // enemy ships: each world has its own kind; they sway, and shoot at the nearest ship
    spawnEnemy() {
      const cfg = this.cfg, type = this.gal.ship, d = cfg.enemyD || 0;
      const spec = { scout: [17, 2, 1], saucer: [20, 3, 1], raider: [19, 3, 1.3], warship: [25, 6, 0.8] }[type];
      const m = {
        id: nextId++, ship: type, tier: 0, kind: 'rock', r: spec[0], pts: [], craters: [], rot: 0, vr: 0, flash: 0,
        x: rnd(40, W - 40), y: -30, vx: 0, vy: (55 + d * 60) * spec[2], ph: Math.random() * 7, shotT: rnd(1.2, 2.4),
        hp: Math.ceil(spec[1] + (cfg.hpBonus || 0) * 0.6),
      };
      this.meteors.push(m); return m;
    }
    updateEnemy(m, dt) {
      m.ph += dt;
      m.vx = Math.cos(m.ph * (m.ship === 'raider' ? 2.6 : 1.6)) * (m.ship === 'warship' ? 40 : 90);
      if (m.x < 24 && m.vx < 0 || m.x > W - 24 && m.vx > 0) m.vx *= -1;
      m.shotT -= dt;
      if (m.shotT <= 0 && m.y > 20 && m.y < this.H * 0.65 && !this.over) {
        const d = this.cfg.enemyD || 0;
        m.shotT = rnd(1.8, 3.2) / (1 + d * 0.8);
        const alive = this.players.filter(p => p.alive); if (!alive.length) return;
        const tgt = alive.reduce((a, p) => Math.hypot(p.x - m.x, p.y - m.y) < Math.hypot(a.x - m.x, a.y - m.y) ? p : a);
        const a0 = Math.atan2(tgt.x - m.x, tgt.y - m.y), sp = 190 + d * 90;
        const angles = m.ship === 'warship' ? [-0.25, 0, 0.25] : m.ship === 'saucer' ? [0] : m.ship === 'raider' ? [-0.08, 0.08] : [0];
        for (const da of angles) this.bullets.push({ x: m.x, y: m.y + m.r * 0.6, vx: Math.sin(a0 + da) * sp, vy: Math.cos(a0 + da) * sp, enemy: true, dmg: 1 });
      }
    }
    killMeteor(m, owner) {
      if (m.dead) return; m.dead = true;
      if (m.kind === 'gold' && owner >= 0) {
        this.goldKills++;
        for (const w of this.trigs) if (w.trig.type === 'gold' && this.goldKills >= w.trig.n) this.discover(w.id, m.x, m.y);
      }
      this.kills++; this.score += [10, 25, 50][m.tier] * (m.kind === 'gold' ? 3 : 1);
      this.explode(m.x, m.y, m.r, m.kind === 'ice' ? 1 : m.kind === 'lava' ? 2 : m.kind === 'gold' ? 0 : 5);
      if (m.tier > 0) for (const s of [-1, 1]) this.spawnMeteor({ tier: m.tier - 1, kind: m.kind === 'gold' ? 'rock' : m.kind, x: m.x + s * m.r * 0.4, y: m.y, vx: s * rnd(50, 110) + m.vx * 0.3, vy: m.vy * rnd(0.7, 1) });
      const nc = m.kind === 'gold' ? 6 : m.tier === 2 ? (Math.random() < 0.7 ? 2 : 0) : Math.random() < [0.25, 0.4][m.tier] ? 1 : 0;
      for (let i = 0; i < nc; i++) this.drop(m.x, m.y, 'coin');
      const r = Math.random();
      if (r < 0.012) this.drop(m.x, m.y, 'life');
      else if (r < 0.035) this.drop(m.x, m.y, 'shield');
      else if (r < 0.055) this.drop(m.x, m.y, 'rapid');
      else if (r < 0.07) this.drop(m.x, m.y, 'triple');
    }
    drop(x, y, type) { this.pickups.push({ x, y, vx: rnd(-80, 80), vy: rnd(70, 110), type, t: Math.random() * 3 }); }
    collect(p, k) {
      k.dead = true;
      if (k.type === 'coin') {
        this.coins++; Sfx.coin(); this.float(k.x, k.y, '+1', '#facc15');
        for (const w of this.trigs) if (w.trig.type === 'coins' && this.coins >= w.trig.n) this.discover(w.id, k.x, k.y);
        return;
      }
      if (k.type === 'crystal') {
        this.crystals++; Sfx.power(); this.spark(k.x, k.y, 16, 1);
        const need = this.crystalWorld ? this.crystalWorld.trig.n : 3;
        if (this.crystals >= need) this.discover(this.crystalWorld ? this.crystalWorld.id : 'w3', k.x, k.y);
        else this.float(k.x, k.y, t('f_crystal', { n: this.crystals }).replace('/3', '/' + need), '#67e8f9', 1.2);
        return;
      }
      Sfx.power(); this.fxQueue.push([k.x, k.y, -1, 0]);
      if (k.type === 'shield') { p.shield = Math.min(6, p.shield + 1); this.float(k.x, k.y, t('f_shield'), '#38bdf8'); }
      if (k.type === 'rapid') { p.rapid = 8 + 2 * (p.power || 0); this.float(k.x, k.y, t('f_rapid'), '#fde047'); }
      if (k.type === 'triple') { p.triple = 10 + 2 * (p.power || 0); this.float(k.x, k.y, t('f_triple'), '#fb923c'); }
      if (k.type === 'life') {
        const dead = this.players.find(q => !q.alive);
        if (dead) { dead.alive = true; dead.lives = 1; dead.inv = 3; this.float(k.x, k.y, t('f_friend_back'), '#f43f5e'); }
        else { p.lives = Math.min(9, p.lives + 1); this.float(k.x, k.y, t('f_life'), '#f43f5e'); }
      }
    }
    fire(p) {
      const lvl = Math.min(6, p.weapon + (p.triple > 0 ? 2 : 0)), owner = this.players.indexOf(p);
      const g = gunOf(p.skin), pierce = p.plasma || !!g.pierce;
      const add = (dx, ang, dmg = 1) => this.bullets.push({ x: p.x + dx, y: p.y - 22, vx: Math.sin(ang) * 820, vy: -Math.cos(ang) * 820, dmg: dmg * g.dmg, owner, pierce, hits: pierce ? new Set() : null });
      // side shots of better ships: pairs fanning out from the wings
      for (let i = 0; i < g.side; i++) { const ang = 0.32 + i * 0.16; add(-16 - i * 3, -ang, 0.8); add(16 + i * 3, ang, 0.8); }
      if (lvl === 1) add(0, 0);
      else if (lvl === 2) { add(-8, 0); add(8, 0); }
      else if (lvl === 3) { add(0, 0); add(-8, -0.12); add(8, 0.12); }
      else if (lvl === 4) { add(-6, 0); add(6, 0); add(-12, -0.18); add(12, 0.18); }
      else if (lvl === 5) { add(0, 0, 2); add(-8, -0.1); add(8, 0.1); add(-14, -0.25); add(14, 0.25); }
      else { add(-5, 0, 2); add(5, 0, 2); add(-10, -0.12); add(10, 0.12); add(-15, -0.28); add(15, 0.28); }
      // the drone flies next to the ship and shoots with every second shot
      if (p.drone && (p.dn ^= 1)) this.bullets.push({ x: p.x + 30, y: p.y - 6, vx: 0, vy: -820, dmg: 1.2 * g.dmg, owner, pierce, hits: pierce ? new Set() : null });
      if (p.local) Sfx.shoot();
    }
    hurt(p) {
      if (p.inv > 0 || !p.alive || this.over && this.result && this.result.win) return;
      this.shake = 8; Sfx.hit(); this.hits++;
      if (p.shield > 0) { p.shield--; p.inv = 1.2; this.fxQueue.push([p.x, p.y, -2, 1]); this.spark(p.x, p.y, 12, 1); return; }
      p.lives--; this.livesLost++; p.inv = 2;
      this.explode(p.x, p.y, 30, 2);
      if (p.lives <= 0 && p.revive) { // the revive item: back once per game
        p.revive = false; p.lives = 1; p.inv = 3; this.spark(p.x, p.y, 30, 1); this.float(p.x, p.y - 30, t('f_revive'), '#4ade80', 1.4); return;
      }
      if (p.lives <= 0) { p.alive = false; this.explode(p.x, p.y, 60, 0); }
    }
    spawnBoss() {
      this.bossSpawned = true;
      const max = 60 + Math.min(this.level, 160) * 22;
      this.boss = { x: W / 2, y: -80, hp: max, max, t: 0, flash: 0, shotT: 2 };
      this.float(W / 2, this.H * 0.4, '!!! ' + t('mothership') + ' !!!', '#f43f5e', 2.5);
    }
    updateBoss(dt) {
      const B = this.boss; B.t += dt; B.flash = Math.max(0, B.flash - dt);
      B.y += (110 - B.y) * Math.min(1, dt * 1.5);
      B.x = W / 2 + Math.sin(B.t * 0.7) * (W / 2 - 110);
      B.shotT -= dt;
      const rage = B.hp < B.max / 2;
      if (B.shotT <= 0 && B.y > 60) {
        B.shotT = rage ? 0.9 : 1.4;
        const alive = this.players.filter(p => p.alive);
        const tgt = pick(alive.length ? alive : this.players);
        const a0 = Math.atan2(tgt.x - B.x, tgt.y - B.y);
        const n = rage ? 5 : 3;
        for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.2; this.bullets.push({ x: B.x, y: B.y + 30, vx: Math.sin(a) * 260, vy: Math.cos(a) * 260, enemy: true, dmg: 1 }); }
        if (Math.random() < 0.5) this.spawnMeteor({ tier: rage ? 1 : 0, x: B.x, y: B.y + 40, vy: 150 });
      }
      for (const p of this.players) if (p.alive && Math.abs(p.x - B.x) < 90 && Math.abs(p.y - B.y) < 40) this.hurt(p);
    }
    killBoss() {
      const B = this.boss; this.score += 1000 + this.level * 100;
      for (let i = 0; i < 6; i++) setTimeout(() => !this.dead && this.explode(B.x + rnd(-70, 70), B.y + rnd(-30, 30), 50, i % 5), i * 140);
      for (let i = 0; i < 25; i++) this.drop(B.x + rnd(-60, 60), B.y, 'coin');
      this.shake = 14; this.boss = null;
      setTimeout(() => !this.dead && !this.over && this.finish(true), 1500);
    }
    finish(win) {
      if (this.o.mini) { // loading-screen mini level never ends: the ship just comes back
        for (const p of this.players) { p.alive = true; p.lives = 3; p.inv = 2; p.x = p.tx = W / 2; p.y = p.ty = this.H - 90; }
        this.float(W / 2, this.H * 0.5, '↺', '#a5f3fc', 1); return;
      }
      if (this.over) return;
      this.over = true; this.endT = win ? 1.6 : 1.8;
      const stars = win ? (this.livesLost === 0 ? 3 : this.livesLost === 1 ? 2 : 1) : 0;
      if (win) for (const w of this.trigs) {
        const tt = w.trig.type;
        if ((tt === 'boss' && this.livesLost === 0) || (tt === 'nohit' && this.hits === 0) || (tt === 'fast' && this.t <= w.trig.n)) this.discover(w.id, W / 2, this.H * 0.35);
      }
      const bonus = win && this.mode === 'level' ? 20 + Math.min(this.level, 150) * 10 : Math.floor(this.score / 200);
      this.result = { win, stars, coins: this.coins + bonus, bonus, collected: this.coins, score: this.score, level: this.o.level || 1, world: this.galN, mode: this.mode, secret: this.secret, found: this.found.slice() };
      if (win) { Sfx.win(); this.float(W / 2, this.H * 0.45, t('f_level_done'), '#4ade80', 2); }
      if (this.coop) { this.sendState(); this.coop.room.send('end', this.result); }
    }

    // a player left the room in the middle of a game
    dropPlayer(id) { const p = this.players.find(q => q.id === id && !q.local); if (p) { p.alive = false; p.lives = 0; p.gone = true; } }

    discover(id, x, y) {
      if (this.found.includes(id)) return;
      this.found.push(id); Sfx.win(); this.shake = 10;
      for (let i = 0; i < 3; i++) this.spark(x, y, 20, i);
      this.float(W / 2, this.H * 0.3, t('f_found'), '#c084fc', 2.6);
    }

    // ----- particles / effects -----
    explode(x, y, size, ci) {
      const n = Math.min(this.hd ? 70 : 40, (8 + size * 0.7) * (this.hd ? 1.6 : 1));
      for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = rnd(40, 120 + size * 4); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.4, 0.9), max: 0.9, sz: rnd(1.5, 3.5 + size / 15), c: FX_COLORS[ci] }); }
      this.parts.push({ x, y, vx: 0, vy: 0, life: 0.3, max: 0.3, ring: size * 1.8, c: FX_COLORS[ci] });
      Sfx.boom(size > 35);
      if (size > 35) this.shake = Math.max(this.shake, 5);
      if (!this.isGuest) this.fxQueue.push([x | 0, y | 0, size | 0, ci]);
    }
    spark(x, y, n, ci) { for (let i = 0; i < n; i++) { const a = Math.random() * 7, v = rnd(60, 200); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3, max: 0.3, sz: 1.6, c: FX_COLORS[ci] }); } }
    float(x, y, text, color, life = 0.9) { this.floats.push({ x, y, text, color, life, max: life }); }
    updateParticles(dt) {
      for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
      this.parts = this.parts.filter(p => p.life > 0);
      for (const f of this.floats) { f.life -= dt; f.y -= 30 * dt; }
      this.floats = this.floats.filter(f => f.life > 0);
      if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
    }

    // ----- co-op networking -----
    sendState() {
      const r1 = v => Math.round(v);
      const st = {
        m: this.meteors.map(m => [m.id, r1(m.x), r1(m.y), r1(m.vx), r1(m.vy), m.tier, m.kind[0], +m.rot.toFixed(2), +m.vr.toFixed(2), +m.r.toFixed(1), m.ship ? ENEMY_SHIPS.indexOf(m.ship) + 1 : 0]),
        b: this.bullets.map(b => [r1(b.x), r1(b.y), r1(b.vx), r1(b.vy), b.enemy ? 1 : 0, b.owner | 0]),
        k: this.pickups.map(k => [r1(k.x), r1(k.y), PICK_TYPES.indexOf(k.type)]),
        pl: this.players.map(p => [p.lives, p.shield, +p.inv.toFixed(1), p.alive ? 1 : 0, r1(p.x), r1(p.y), p.rapid > 0 ? 1 : 0, p.triple > 0 ? 1 : 0]),
        s: this.score, c: this.coins, kl: this.kills, g: this.cfg.goal, n: this.cfg.n, hue: this.cfg.hue,
        co: this.comet ? [Math.round(this.comet.x), Math.round(this.comet.y)] : null,
        bo: this.boss ? [r1(this.boss.x), r1(this.boss.y), this.boss.hp, this.boss.max] : null,
        fx: this.fxQueue.splice(0), fl: this.floats.filter(f => f.life === f.max).map(f => [r1(f.x), r1(f.y), f.text, f.color, f.max]),
      };
      this.coop.room.send('st', st);
    }
    onNet(ev, p) {
      if (ev === 'in' && !this.isGuest) { const g = this.players.find(q => q.id === p.id && !q.local); if (g) { g.tx = g.x = clamp(p.x, 0, W); g.ty = g.y = clamp(p.y, 0, this.H); } }
      else if (ev === 'st' && this.isGuest) this.applyState(p);
    }
    applyState(st) {
      const kinds = { r: 'rock', i: 'ice', l: 'lava', g: 'gold', f: 'frost', m: 'magma', d: 'dark' };
      const old = new Map(this.meteors.map(m => [m.id, m]));
      this.meteors = st.m.map(a => {
        const o = old.get(a[0]);
        const m = o || { id: a[0], pts: null, craters: null, flash: 0 };
        Object.assign(m, { x: a[1], y: a[2], vx: a[3], vy: a[4], tier: a[5], kind: kinds[a[6]], rot: a[7], vr: a[8], r: a[9], ship: a[10] ? ENEMY_SHIPS[a[10] - 1] : null });
        if (!m.pts) { const n = 9 + m.tier * 2; m.pts = []; for (let i = 0; i < n; i++) { const q = i / n * Math.PI * 2; m.pts.push([Math.cos(q) * rnd(0.75, 1.05), Math.sin(q) * rnd(0.75, 1.05)]); } m.craters = Array.from({ length: 1 + m.tier }, () => [rnd(-0.45, 0.45), rnd(-0.45, 0.45), rnd(0.12, 0.25)]); }
        return m;
      });
      this.bullets = st.b.map(a => ({ x: a[0], y: a[1], vx: a[2], vy: a[3], enemy: !!a[4], owner: a[5] }));
      this.pickups = st.k.map(a => ({ x: a[0], y: a[1], vx: 0, vy: 0, type: PICK_TYPES[a[2]], t: this.t }));
      st.pl.forEach((a, i) => {
        const p = this.players[i]; if (!p) return;
        if (p.lives > a[0] || p.shield > a[1]) { this.shake = 8; if (p.local) Sfx.hit(); }
        p.lives = a[0]; p.shield = a[1]; p.inv = a[2]; p.alive = !!a[3]; p.rapid = a[6]; p.triple = a[7];
        if (!p.local) { p.x = a[4]; p.y = a[5]; }
      });
      if (st.c > this.coins) Sfx.coin();
      this.score = st.s; this.coins = st.c; this.kills = st.kl; this.cfg.goal = st.g; this.cfg.n = st.n; this.cfg.hue = st.hue;
      this.comet = st.co ? { x: st.co[0], y: st.co[1], vx: 0, t: 0 } : null;
      this.boss = st.bo ? { x: st.bo[0], y: st.bo[1], hp: st.bo[2], max: st.bo[3], t: this.t, flash: 0 } : null;
      for (const f of st.fx) { if (f[2] === -1) Sfx.power(); else if (f[2] === -2) this.spark(f[0], f[1], 12, 1); else this.explode(f[0], f[1], f[2], f[3]); }
      for (const f of st.fl) this.float(f[0], f[1], f[2], f[3], f[4]);
    }
    guestUpdate(dt) {
      for (const m of this.meteors) { m.x += m.vx * dt; m.y += m.vy * dt; m.rot += m.vr * dt; }
      for (const b of this.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
      for (const p of this.players) if (p.alive && !this.over) { p.fireCd -= dt; if (p.local && p.fireCd <= 0) { Sfx.shoot(); p.fireCd = 0.17; } }
      this.netT -= dt;
      if (this.netT <= 0) { this.netT = 1 / 15; this.coop.room.send('in', { id: this.me.id, x: Math.round(this.me.x), y: Math.round(this.me.y) }); }
    }

    // ----- drawing -----
    makeBg() {
      const c = this.bgC || (this.bgC = document.createElement('canvas'));
      c.width = Math.max(1, this.cw / 2); c.height = Math.max(1, this.ch / 2);
      const x = c.getContext('2d'), hue = this.cfg.hue;
      x.fillStyle = '#04020f'; x.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 4; i++) {
        const gx = Math.random() * c.width, gy = Math.random() * c.height, r = Math.max(c.width, c.height) * rnd(0.3, 0.6);
        const g = x.createRadialGradient(gx, gy, 0, gx, gy, r);
        g.addColorStop(0, `hsla(${hue + i * 30},80%,45%,0.22)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
      }
      if (this.hd) for (let i = 0; i < 2; i++) {
        const px = rnd(0.1, 0.9) * c.width, py = rnd(0.1, 0.9) * c.height, pr = Math.min(c.width, c.height) * rnd(0.05, 0.12), h2 = (hue + 120 + i * 90) % 360;
        const pg = x.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
        pg.addColorStop(0, `hsla(${h2},70%,65%,.75)`); pg.addColorStop(1, `hsla(${h2},60%,15%,.75)`);
        x.fillStyle = pg; x.beginPath(); x.arc(px, py, pr, 0, 7); x.fill();
        if (i === 0) { x.strokeStyle = `hsla(${h2 + 40},80%,75%,.45)`; x.lineWidth = Math.max(1, pr * 0.12); x.beginPath(); x.ellipse(px, py, pr * 1.8, pr * 0.45, -0.35, 0, 7); x.stroke(); }
      }
      const g = this.galN, w = c.width, h = c.height;
      if (g === 2) { // northern lights over an icy sky
        for (let i = 0; i < 3; i++) {
          x.strokeStyle = `hsla(${150 + i * 25},90%,60%,${0.11 - i * 0.025})`; x.lineWidth = h * 0.045; x.filter = "blur(6px)"; x.beginPath();
          for (let k = 0; k <= 20; k++) { const px = k / 20 * w, py = h * (0.18 + i * 0.12) + Math.sin(k * 0.7 + i * 2) * h * 0.05; x[k ? 'lineTo' : 'moveTo'](px, py); }
          x.stroke();
        }
        x.filter = 'none';
        x.fillStyle = 'rgba(224,242,254,.06)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      } else if (g === 3) { // a burning glow from below and floating embers
        const lg = x.createLinearGradient(0, h, 0, h * 0.45); lg.addColorStop(0, 'rgba(239,68,68,.35)'); lg.addColorStop(1, 'rgba(239,68,68,0)');
        x.fillStyle = lg; x.fillRect(0, 0, w, h);
        for (let i = 0; i < 60; i++) { x.fillStyle = `hsla(${rnd(10, 45)},100%,60%,${rnd(0.15, 0.5)})`; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, rnd(0.6, 1.8), 0, 7); x.fill(); }
      } else if (g === 4) { // a black hole in the middle of the void
        const cx = w * 0.62, cy = h * 0.32, R = Math.min(w, h) * 0.16;
        for (let i = 4; i >= 1; i--) { x.strokeStyle = `hsla(${280 + i * 8},90%,65%,${0.08 * i})`; x.lineWidth = R * 0.12; x.beginPath(); x.ellipse(cx, cy, R * (1 + i * 0.35), R * (0.35 + i * 0.1), -0.3, 0, 7); x.stroke(); }
        const bh = x.createRadialGradient(cx, cy, 0, cx, cy, R); bh.addColorStop(0, '#000'); bh.addColorStop(0.8, '#000'); bh.addColorStop(1, 'rgba(168,85,247,.5)');
        x.fillStyle = bh; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.fill();
      }
      this.bgHue = hue;
    }
    draw() {
      const x = this.cx, d = this.dpr;
      if (this.bgHue !== this.cfg.hue) this.makeBg();
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.drawImage(this.bgC, 0, 0, this.cv.width, this.cv.height);
      // stars (screen space; flow opposite to flight direction)
      x.setTransform(d, 0, 0, d, 0, 0);
      x.fillStyle = this.gal.star;
      for (const L of this.stars) for (const s of L) {
        const sx = this.landscape ? (1 - s.y) * this.cw : s.x * this.cw, sy = this.landscape ? s.x * this.ch : s.y * this.ch;
        x.globalAlpha = 0.35 + s.s * 0.3;
        if (this.landscape) x.fillRect(sx, sy, s.s * 1.5 + s.v * 30, s.s); else x.fillRect(sx, sy, s.s, s.s * 1.5 + s.v * 30);
      }
      x.globalAlpha = 1;

      this.worldTransform();
      const t = this.t;
      // pickups
      for (const k of this.pickups) this.drawPickup(x, k, t);
      // meteors
      for (const m of this.meteors) this.drawMeteor(x, m);
      // boss
      if (this.boss) this.drawBoss(x, this.boss);
      if (this.comet) {
        const c = this.comet; x.save(); x.translate(c.x, c.y);
        x.shadowColor = '#fde047'; x.shadowBlur = 24;
        const g = x.createRadialGradient(0, 0, 2, 0, 0, 18); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#fde047'); g.addColorStop(1, 'rgba(234,179,8,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, 18, 0, 7); x.fill(); x.restore();
      }
      // bullets
      x.globalCompositeOperation = 'lighter';
      for (const b of this.bullets) {
        if (b.enemy) { x.fillStyle = '#f43f5e'; x.beginPath(); x.arc(b.x, b.y, 6, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(b.x, b.y, 2.5, 0, 7); x.fill(); continue; }
        const p = this.players[b.owner] || this.players[0];
        drawShot(x, b, Art.SHIPS.find(s => s.id === p.skin) || Art.SHIPS[0], this.t, this.hd);
      }
      // particles
      for (const p of this.parts) {
        const a = Math.max(0, p.life / p.max); x.globalAlpha = a;
        if (p.ring) { x.strokeStyle = p.c; x.lineWidth = 3 * a; x.beginPath(); x.arc(p.x, p.y, p.ring * (1 - a) + 4, 0, 7); x.stroke(); }
        else { x.fillStyle = p.c; x.fillRect(p.x - p.sz / 2, p.y - p.sz / 2, p.sz, p.sz); }
      }
      x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.shadowBlur = 0;
      // ships
      for (const p of this.players) {
        if (!p.alive) continue;
        if (p.inv > 0 && Math.floor(t * 14) % 2 === 0 && p.shield === 0) continue;
        x.save(); x.translate(p.x, p.y);
        x.rotate(clamp((p.tx - p.x) * 0.01, -0.3, 0.3) * (p.local ? 1 : 0));
        Art.drawShip(x, p.skin, 22, t, 1);
        x.restore();
        if (p.drone && p.alive) { // a small helper drone floating beside the ship
          const dx = p.x + 30, dy = p.y - 4 + Math.sin(t * 5) * 3;
          x.fillStyle = '#94a3b8'; x.strokeStyle = '#e2e8f0'; x.lineWidth = 1.5; x.beginPath(); x.arc(dx, dy, 7, 0, 7); x.fill(); x.stroke();
          x.fillStyle = '#22d3ee'; x.beginPath(); x.arc(dx, dy - 1, 2.6, 0, 7); x.fill();
          x.strokeStyle = 'rgba(226,232,240,.7)'; x.beginPath(); x.moveTo(dx - 11, dy - 7 + Math.sin(t * 40) * 1.5); x.lineTo(dx + 11, dy - 7 - Math.sin(t * 40) * 1.5); x.stroke();
        }
        if (p.shield > 0 || p.inv > 1) {
          x.strokeStyle = `rgba(56,189,248,${0.5 + 0.3 * Math.sin(t * 6)})`; x.lineWidth = 2.5;
          x.beginPath(); x.arc(p.x, p.y + 2, 32, 0, 7); x.stroke();
          x.fillStyle = 'rgba(56,189,248,0.08)'; x.fill();
        }
      }
      // HUD (screen space)
      x.setTransform(d, 0, 0, d, 0, 0);
      // names over ships in co-op
      if (this.players.length > 1) {
        x.font = '600 12px system-ui, sans-serif'; x.textAlign = 'center';
        for (const p of this.players) if (p.alive) { const [sx, sy] = this.toScreen(p.x, p.y); x.fillStyle = p.local ? '#a5f3fc' : '#fde68a'; x.direction = 'ltr'; x.fillText('@' + p.handle, sx, sy + (this.landscape ? 44 : 48) * Math.min(1, this.s * 1.4)); }
      }
      for (const f of this.floats) {
        const [sx, sy] = this.toScreen(f.x, f.y);
        x.globalAlpha = Math.min(1, f.life / f.max * 2); x.fillStyle = f.color; x.textAlign = 'center';
        x.font = `800 ${f.max > 1 ? 30 : 16}px system-ui, sans-serif`; x.fillText(f.text, sx, sy);
      }
      x.globalAlpha = 1; x.direction = I18N.dir;
      this.drawHud(x);
    }
    drawEnemy(x, m) {
      const t = this.t, fl = m.flash > 0;
      x.save(); x.translate(m.x, m.y);
      x.rotate(clamp(m.vx * 0.003, -0.35, 0.35));
      const r = m.r;
      if (m.ship === 'scout') { // small red fighter pointing down
        x.shadowColor = '#f43f5e'; x.shadowBlur = 12;
        x.fillStyle = fl ? '#fff' : '#94a3b8'; x.beginPath(); x.moveTo(0, r); x.lineTo(r, -r * 0.7); x.lineTo(0, -r * 0.3); x.lineTo(-r, -r * 0.7); x.closePath(); x.fill();
        x.fillStyle = '#f43f5e'; x.beginPath(); x.moveTo(0, r * 0.6); x.lineTo(r * 0.3, -r * 0.2); x.lineTo(-r * 0.3, -r * 0.2); x.closePath(); x.fill();
        x.fillStyle = '#fb923c'; x.beginPath(); x.arc(0, -r * 0.5, r * 0.18 + Math.sin(t * 30) * 2, 0, 7); x.fill();
      } else if (m.ship === 'saucer') { // icy flying saucer
        x.shadowColor = '#38bdf8'; x.shadowBlur = 16;
        x.fillStyle = fl ? '#fff' : '#bae6fd'; x.beginPath(); x.ellipse(0, 0, r, r * 0.42, 0, 0, 7); x.fill();
        x.fillStyle = 'rgba(14,165,233,.85)'; x.beginPath(); x.ellipse(0, -r * 0.15, r * 0.45, r * 0.45, 0, Math.PI, 0); x.fill();
        for (let i = 0; i < 5; i++) { const a = t * 4 + i * 1.256; x.fillStyle = i % 2 ? '#e0f2fe' : '#0ea5e9'; x.beginPath(); x.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.2 + r * 0.05, 2.2, 0, 7); x.fill(); }
      } else if (m.ship === 'raider') { // spiky lava raider with flames
        x.shadowColor = '#f97316'; x.shadowBlur = 16;
        x.fillStyle = fl ? '#fff' : '#7f1d1d'; x.beginPath();
        for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + Math.PI / 2, rr = i % 2 ? r * 0.55 : r; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
        x.closePath(); x.fill(); x.strokeStyle = '#fb923c'; x.lineWidth = 2; x.stroke();
        const g = x.createRadialGradient(0, 0, 1, 0, 0, r * 0.45); g.addColorStop(0, '#fff'); g.addColorStop(1, '#f97316');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, r * 0.35 + Math.sin(t * 12) * 1.5, 0, 7); x.fill();
      } else { // heavy void warship
        x.shadowColor = '#a855f7'; x.shadowBlur = 18;
        x.fillStyle = fl ? '#fff' : '#1e1b4b'; x.beginPath();
        x.moveTo(0, r); x.lineTo(r * 0.5, r * 0.4); x.lineTo(r, r * 0.5); x.lineTo(r * 0.9, -r * 0.6); x.lineTo(r * 0.3, -r * 0.4); x.lineTo(0, -r * 0.8);
        x.lineTo(-r * 0.3, -r * 0.4); x.lineTo(-r * 0.9, -r * 0.6); x.lineTo(-r, r * 0.5); x.lineTo(-r * 0.5, r * 0.4); x.closePath(); x.fill();
        x.strokeStyle = '#c084fc'; x.lineWidth = 2; x.stroke();
        x.fillStyle = `rgba(192,132,252,${0.6 + 0.4 * Math.sin(t * 6)})`; x.beginPath(); x.arc(0, 0, r * 0.22, 0, 7); x.fill();
        for (const sx of [-1, 1]) { x.fillStyle = '#e879f9'; x.fillRect(sx * r * 0.7 - 2, r * 0.35, 4, 7); }
      }
      x.restore();
    }
    drawMeteor(x, m) {
      if (m.ship) return this.drawEnemy(x, m);
      const K = KIND[m.kind];
      x.save(); x.translate(m.x, m.y); x.rotate(m.rot);
      const glow = { lava: '#f97316', gold: '#facc15', magma: '#ef4444', dark: '#a855f7', frost: '#7dd3fc' }[m.kind];
      if (glow) { x.shadowColor = glow; x.shadowBlur = 16; }
      const g = x.createRadialGradient(-m.r * 0.3, -m.r * 0.3, m.r * 0.1, 0, 0, m.r);
      g.addColorStop(0, m.flash > 0 ? '#fff' : K.c1); g.addColorStop(1, K.c2);
      x.fillStyle = g; x.beginPath();
      m.pts.forEach((p, i) => i ? x.lineTo(p[0] * m.r, p[1] * m.r) : x.moveTo(p[0] * m.r, p[1] * m.r));
      x.closePath(); x.fill();
      x.shadowBlur = 0; x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.stroke();
      x.fillStyle = 'rgba(0,0,0,.22)';
      for (const c of m.craters) { x.beginPath(); x.arc(c[0] * m.r, c[1] * m.r, c[2] * m.r, 0, 7); x.fill(); }
      if (m.kind === 'dark') { x.strokeStyle = 'rgba(216,180,254,.7)'; x.lineWidth = 1.2; x.beginPath(); x.arc(0, 0, m.r * 0.55, 0, 4.5); x.stroke(); }
      if (m.kind === 'frost') { x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.2; x.beginPath(); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.moveTo(Math.cos(a) * m.r * 0.5, Math.sin(a) * m.r * 0.5); x.lineTo(-Math.cos(a) * m.r * 0.5, -Math.sin(a) * m.r * 0.5); } x.stroke(); }
      if (m.kind === 'lava' || m.kind === 'magma') { x.strokeStyle = '#fbbf24'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-m.r * 0.5, 0); x.lineTo(0, m.r * 0.2); x.lineTo(m.r * 0.4, -m.r * 0.3); x.stroke(); }
      x.restore();
    }
    drawPickup(x, k, t) {
      const bob = Math.sin((t + k.t) * 5) * 2;
      x.save(); x.translate(k.x, k.y + bob);
      if (k.type === 'crystal') {
        x.rotate(t * 2); x.shadowColor = '#67e8f9'; x.shadowBlur = 20;
        x.fillStyle = '#a5f3fc'; x.strokeStyle = '#fff'; x.lineWidth = 1.5;
        x.beginPath(); x.moveTo(0, -15); x.lineTo(10, 0); x.lineTo(0, 15); x.lineTo(-10, 0); x.closePath(); x.fill(); x.stroke();
        x.restore(); return;
      }
      if (k.type === 'coin') {
        const w = Math.abs(Math.cos((t + k.t) * 4)) * 9 + 1;
        x.fillStyle = '#facc15'; x.strokeStyle = '#a16207'; x.lineWidth = 1.5;
        x.beginPath(); x.ellipse(0, 0, w, 10, 0, 0, 7); x.fill(); x.stroke();
        x.fillStyle = '#fef08a'; x.beginPath(); x.ellipse(0, 0, w * 0.4, 5, 0, 0, 7); x.fill();
      } else {
        const col = { shield: '#38bdf8', rapid: '#fde047', triple: '#fb923c', life: '#f43f5e' }[k.type];
        x.shadowColor = col; x.shadowBlur = 14;
        x.strokeStyle = col; x.lineWidth = 2.5; x.fillStyle = 'rgba(15,23,42,.8)';
        x.beginPath(); x.arc(0, 0, 14, 0, 7); x.fill(); x.stroke(); x.shadowBlur = 0;
        x.fillStyle = col; x.font = '900 15px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
        if (this.landscape) x.rotate(-Math.PI / 2);
        x.fillText({ shield: '◈', rapid: '⚡', triple: '✶', life: '♥' }[k.type], 0, 1);
      }
      x.restore();
    }
    drawBoss(x, B) {
      x.save(); x.translate(B.x, B.y);
      const bc = this.gal.boss;
      x.shadowColor = bc[2]; x.shadowBlur = 25;
      const g = x.createLinearGradient(0, -40, 0, 40);
      g.addColorStop(0, B.flash > 0 ? '#fff' : bc[0]); g.addColorStop(1, bc[1]);
      x.fillStyle = g;
      x.beginPath(); x.moveTo(-100, -5); x.lineTo(-60, -30); x.lineTo(60, -30); x.lineTo(100, -5); x.lineTo(70, 30); x.lineTo(20, 40); x.lineTo(-20, 40); x.lineTo(-70, 30); x.closePath(); x.fill();
      x.shadowBlur = 0; x.strokeStyle = bc[2]; x.lineWidth = 2; x.stroke();
      x.fillStyle = '#a78bfa'; x.beginPath(); x.ellipse(0, -20, 30, 20, 0, Math.PI, 0); x.fill();
      for (let i = -3; i <= 3; i++) { x.fillStyle = (Math.floor(B.t * 6) + i) % 2 ? '#fde047' : '#f43f5e'; x.beginPath(); x.arc(i * 22, 8, 4, 0, 7); x.fill(); }
      x.fillStyle = '#f43f5e'; x.beginPath(); x.arc(0, 30, 9 + Math.sin(B.t * 8) * 2, 0, 7); x.fill();
      x.restore();
    }
    drawHud(x) {
      if (this.o.mini) { // loading screen: just the score
        x.direction = 'ltr'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '800 22px system-ui'; x.fillStyle = '#e2e8f0';
        x.fillText(this.score.toLocaleString(), this.cw / 2, 30 + (this.o.safeTop || 0)); return;
      }
      x.direction = I18N.dir;
      const cw = this.cw, pad = 12, me = this.me, top = 10 + (this.o.safeTop || 0);
      x.textBaseline = 'middle';
      // lives & shields (left)
      x.textAlign = 'left'; x.font = '700 18px system-ui';
      let hx = pad + 46;
      x.fillStyle = '#f43f5e'; x.fillText('♥'.repeat(Math.min(me.lives, 6)) + (me.lives > 6 ? '+' : ''), hx, top + 14);
      if (me.shield > 0) { x.fillStyle = '#38bdf8'; x.fillText('◈'.repeat(Math.min(me.shield, 6)), hx, top + 38); }
      let py = top + (me.shield > 0 ? 60 : 38);
      x.font = '700 12px system-ui';
      if (me.rapid > 0) { x.fillStyle = '#fde047'; x.fillText('⚡ ' + Math.ceil(me.rapid), hx, py); hx += 46; }
      if (me.triple > 0) { x.fillStyle = '#fb923c'; x.fillText('✶ ' + Math.ceil(me.triple), hx, py); }
      // coins & score (right)
      x.textAlign = 'right'; x.font = '800 18px system-ui';
      x.fillStyle = '#facc15'; x.direction = 'ltr'; x.fillText('● ' + this.coins, cw - pad, top + 14);
      x.fillStyle = '#e2e8f0'; x.font = '700 14px system-ui'; x.fillText(this.score.toLocaleString(), cw - pad, top + 38); x.direction = I18N.dir;
      // progress
      const bw = Math.min(260, cw * 0.4), bx = (cw - bw) / 2, by = top + 4;
      x.textAlign = 'center'; x.fillStyle = '#cbd5e1'; x.font = '700 12px system-ui';
      let label, frac;
      if (this.boss) { label = t('mothership'); frac = this.boss.hp / this.boss.max; x.fillStyle = '#fda4af'; }
      else if (this.mode === 'endless') { label = t('hud_endless', { n: this.cfg.n }); frac = (this.t % 22) / 22; }
      else if (this.secret) { label = '✦ ' + t(WORLDS[this.secret.w - 1].id + '_name') + ' ' + this.secret.k + '/3' + (this.cfg.boss && this.kills >= this.cfg.goal ? ' · ' + t('hud_boss') : ''); frac = Math.min(1, this.kills / this.cfg.goal); }
      else { label = (this.galN > 1 ? t('gal_' + this.galN) + ' · ' : '') + t('level_n', { n: this.level }) + (this.cfg.boss && this.kills >= this.cfg.goal ? ' · ' + t('hud_boss') : ''); frac = Math.min(1, this.kills / this.cfg.goal); }
      x.fillText(label, cw / 2, by + 26);
      x.fillStyle = 'rgba(255,255,255,.12)'; roundRect(x, bx, by, bw, 9, 5); x.fill();
      const pg = x.createLinearGradient(bx, 0, bx + bw, 0);
      if (this.boss) { pg.addColorStop(0, '#be123c'); pg.addColorStop(1, '#f43f5e'); } else { pg.addColorStop(0, '#22d3ee'); pg.addColorStop(1, '#a855f7'); }
      x.fillStyle = pg; roundRect(x, bx, by, Math.max(4, bw * frac), 9, 5); x.fill();
      // partner status
      if (this.players.length > 1) { // the other players: up to 4 shown, then "+n"
        const others = this.players.filter(p => p !== me && !p.gone);
        const parts = others.slice(0, 4).map(o => '@' + o.handle + ' ' + (o.alive ? '♥' + o.lives : '✖'));
        if (others.length > 4) parts.push('+' + (others.length - 4));
        x.textAlign = 'center'; x.font = '600 12px system-ui'; x.fillStyle = '#fde68a';
        x.direction = 'ltr'; x.fillText(parts.join('  ·  '), cw / 2, by + 44);
      }
    }
  }
  function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }

  window.SSGame = { GALAXIES, Game, Sfx, levelCfg, WORLDS };
})();
