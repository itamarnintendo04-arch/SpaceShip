// SpaceShip music: original tracks (one more for each world) synthesised live with Web Audio (no audio files).
//   loading — light and curious, menu — dreamy, game — driving.
// Music.play(name) picks the track, Music.setVolume(1..100), Music.setEnabled(bool).
(function () {
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

  // Each track: tempo, steps per bar (16ths), chord roots per bar (MIDI), and voices.
  const TRACKS = {
    loading: {
      bpm: 104, chords: [57, 53, 60, 55], // Am F C G
      chordType: [[0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]],
      arp: [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 0, 2, 1, 2], arpOct: 12, arpWave: 'triangle', arpGain: 0.10,
      bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], bassGain: 0.16,
      hats: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1], kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], snare: [],
      pad: 0.035,
    },
    menu: {
      bpm: 84, chords: [60, 57, 53, 55], // C Am F G
      chordType: [[0, 4, 7, 11], [0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 10]],
      arp: [0, -1, 1, -1, 2, -1, 3, -1, 2, -1, 1, -1, 0, -1, 2, -1], arpOct: 12, arpWave: 'sine', arpGain: 0.09,
      bass: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], bassGain: 0.13,
      hats: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], kick: [], snare: [],
      pad: 0.05,
    },
    game: {
      bpm: 132, chords: [52, 52, 48, 50], // Em Em C D
      chordType: [[0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]],
      arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3], arpOct: 24, arpWave: 'square', arpGain: 0.045,
      bass: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1], bassGain: 0.15,
      hats: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1], kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      pad: 0.025,
    },
    // world 2 — frozen nebula: glassy, sparkling, a bit slower
    game2: {
      bpm: 116, chords: [62, 58, 53, 60], // Dm Bb F C
      chordType: [[0, 3, 7, 10], [0, 4, 7, 11], [0, 4, 7, 9], [0, 4, 7]],
      arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 6, 5, 3, 2, 1], arpOct: 24, arpWave: 'sine', arpGain: 0.08,
      bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0], bassGain: 0.14,
      hats: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], kick: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
      pad: 0.045,
    },
    // world 3 — lava galaxy: fast and heavy
    game3: {
      bpm: 150, chords: [57, 57, 53, 55], // Am Am F G
      chordType: [[0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]],
      arp: [0, 0, 1, 0, 2, 0, 1, 0, 0, 0, 1, 0, 3, 2, 1, 0], arpOct: 12, arpWave: 'sawtooth', arpGain: 0.035,
      bass: [1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1], bassGain: 0.16,
      hats: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], kick: [1, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0],
      snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      pad: 0.02,
    },
    // world 4 — void core: dark and mysterious
    game4: {
      bpm: 124, chords: [48, 44, 41, 43], // Cm Ab Fm G
      chordType: [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7, 10]],
      arp: [0, -1, 2, -1, 1, -1, 3, 2, 0, -1, 2, -1, 4, 3, 2, -1], arpOct: 24, arpWave: 'square', arpGain: 0.04,
      bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0], bassGain: 0.17,
      hats: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0], kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
      snare: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
      pad: 0.055,
    },
  };

  let ctx = null, master = null, bus = null, noiseBuf = null;
  let enabled = true, volume = 60, want = null, playing = null;
  let step = 0, nextTime = 0, timer = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = (window.SSGame && SSGame.Sfx && SSGame.Sfx.ctx) || new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    bus = ctx.createDynamicsCompressor(); bus.connect(master);
    const n = ctx.sampleRate * 0.5; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  const level = () => (enabled ? Math.pow(volume / 100, 1.6) * 0.9 : 0); // perceptual-ish curve

  function tone(freq, t, dur, type, gain, attack = 0.005, release = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + release + 0.02);
  }
  function noise(t, dur, gain, hp) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.02);
  }
  function kick(t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.45, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.25);
  }

  function scheduleStep(T, s, t) {
    const sp = 60 / T.bpm / 4, bar = Math.floor(s / 16) % T.chords.length, i = s % 16;
    const root = T.chords[bar], chord = T.chordType[bar];
    // pad at the start of each bar
    if (i === 0 && T.pad) for (const iv of chord) tone(NOTE(root + iv), t, sp * 15, 'sawtooth', T.pad / chord.length * 1.6, 0.25, 0.4);
    // arpeggio
    const a = T.arp[i];
    if (a >= 0) { const iv = chord[a % chord.length] + 12 * Math.floor(a / chord.length); tone(NOTE(root + T.arpOct + iv), t, sp * 0.8, T.arpWave, T.arpGain); }
    // bass
    if (T.bass[i]) tone(NOTE(root - 12), t, sp * 1.6, 'triangle', T.bassGain, 0.004, 0.06);
    if (T.kick[i]) kick(t);
    if (T.snare[i]) noise(t, 0.16, 0.18, 1200);
    if (T.hats[i]) noise(t, 0.04, 0.06, 7000);
  }
  function tick() {
    if (!ctx || !playing) return;
    const T = TRACKS[playing], sp = 60 / T.bpm / 4;
    while (nextTime < ctx.currentTime + 0.12) { scheduleStep(T, step, nextTime); nextTime += sp; step++; }
  }
  function startTrack(name) {
    playing = name; step = 0; nextTime = ctx.currentTime + 0.08;
    if (!timer) timer = setInterval(tick, 25);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(level(), now + 0.8); // fade in
  }

  const Music = {
    TRACKS: Object.keys(TRACKS),
    // call from a user gesture (browsers only allow audio after one)
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
      if (want && want !== playing && enabled) startTrack(want);
    },
    play(name) {
      if (want === name) return;
      want = name;
      if (!ctx || !enabled || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      if (playing) { // quick fade out, then switch
        master.gain.cancelScheduledValues(now); master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.35);
        setTimeout(() => { if (want === name) startTrack(name); }, 380);
      } else startTrack(name);
    },
    setVolume(v) {
      volume = Math.max(1, Math.min(100, Math.round(v)));
      if (ctx && playing) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05);
    },
    setEnabled(on) {
      enabled = !!on;
      if (!ctx) return;
      if (!enabled) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.08); playing = null; }
      else if (want) startTrack(want);
    },
    // pause everything while the app is in the background
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    get volume() { return volume; }, get enabled() { return enabled; }, get track() { return playing; },
  };
  window.Music = Music;
})();
