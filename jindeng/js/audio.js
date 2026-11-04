'use strict';
// =====================================================================
// 音频：WebAudio 现场合成音效 + 简单的循环配乐（五声音阶小音序器）
// =====================================================================
const SFX_GAP = { hit: 0.04, enemyDie: 0.05, pickup: 0.03, blip: 0.045, swing: 0.05, shoot: 0.08, step: 0.2, smoke: 0.3, spikeOut: 0.1, block: 0.08, frogLand: 0.1 };
const Snd = {
  ctx: null, master: null, sfx: null, mus: null, noiseBuf: null, last: Object.create(null),
  track: null, trackName: '', nextT: 0, stepI: 0, vol: { master: 0.8, music: 0.55, sfx: 0.8 },
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const c = new AC(); this.ctx = c;
        this.master = c.createGain(); const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5;
        this.master.connect(comp); comp.connect(c.destination);
        this.sfx = c.createGain(); this.sfx.connect(this.master);
        this.mus = c.createGain(); this.mus.connect(this.master);
        const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
        this.applyVol();
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  applyVol() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.03);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.03);
    this.mus.gain.setTargetAtTime(this.vol.music * 0.5, t, 0.03);
  },
  ok() { return this.ctx && this.ctx.state === 'running'; },
  env(g, t, vol, dur, a = 0.005) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur); },
  tone(type, f0, f1, dur, vol, delay = 0, out) {
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, vol, dur); o.connect(g); g.connect(out || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, type, f0, f1, q = 1, delay = 0, out) {
    const c = this.ctx, t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, vol, dur, 0.004); s.connect(f); f.connect(g); g.connect(out || this.sfx); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
  },
  bellAt(f, t, vol, out, decay = 1.4) {
    const c = this.ctx;
    for (const [m, v] of [[1, 1], [2.76, 0.35], [5.4, 0.12]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * m;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + decay / m);
      o.connect(g); g.connect(out || this.sfx); o.start(t); o.stop(t + decay + 0.1);
    }
  },
  play(name, arg) {
    if (!this.ok()) return;
    const now = this.ctx.currentTime, gap = SFX_GAP[name] || 0;
    if (gap && now - (this.last[name] ?? -9) < gap) return;
    this.last[name] = now;
    const fn = SFX[name];
    if (fn) try { fn(this, arg); } catch (e) { /* 忽略 */ }
  },
  // ---------------- 配乐 ----------------
  music(name) {
    if (this.trackName === name) return;
    this.trackName = name; this.track = name ? parseTrack(TRACKS[name]) : null; this.stepI = 0;
    if (this.ctx) this.nextT = this.ctx.currentTime + 0.1;
  },
  tick() {
    if (!this.ok() || !this.track) return;
    const tr = this.track, c = this.ctx, stepDur = 60 / tr.bpm / 2;
    if (this.nextT < c.currentTime - 0.5) this.nextT = c.currentTime + 0.05;
    while (this.nextT < c.currentTime + 0.15) {
      const i = this.stepI % tr.len, t = this.nextT;
      for (const v of tr.voices) {
        const ev = v.ev[i % v.ev.length];
        if (ev) playVoice(this, v.inst, ev.f, t, ev.d * stepDur, v.vol);
      }
      if (tr.drums) for (const [kind, pat] of tr.drums) if (pat[i % pat.length] === 'x') playDrum(this, kind, t);
      this.stepI++; this.nextT += stepDur;
    }
  },
};
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function nf(tok) { const m = /^([A-G])(b|#)?(\d)$/.exec(tok); if (!m) return 0; const n = NOTE[m[1]] + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0) + (+m[3] + 1) * 12; return 440 * Math.pow(2, (n - 69) / 12); }
// 旋律字符串：音名=一个八分音，'-' 延长，'.' 休止，'|' 只是分隔
function parseLine(s) {
  const toks = s.replace(/\|/g, ' ').trim().split(/\s+/), ev = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === '-' || t === '.') { ev.push(null); continue; }
    let d = 1; while (toks[i + d] === '-') d++;
    if (t.includes('+')) ev.push({ f: t.split('+').map(nf), d }); else ev.push({ f: nf(t), d });
  }
  return ev;
}
function parseTrack(T) {
  const voices = T.voices.map((v) => ({ inst: v[0], vol: v[1], ev: parseLine(v[2]) }));
  const len = Math.max(...voices.map((v) => v.ev.length), ...(T.drums || []).map((d) => d[1].length));
  return { bpm: T.bpm, voices, drums: T.drums, len };
}
function playVoice(S, inst, f, t, dur, vol) {
  const c = S.ctx, out = S.mus;
  if (Array.isArray(f)) { for (const ff of f) playVoice(S, inst, ff, t, dur, vol / f.length * 1.6); return; }
  if (inst === 'bell') { S.bellAt(f, t, vol, out, 1.6); return; }
  const o = c.createOscillator(), g = c.createGain();
  if (inst === 'pad') {
    const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
    const o2 = c.createOscillator(); o.type = o2.type = 'sawtooth'; o.frequency.value = f; o2.frequency.value = f * 1.006;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.4)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f2); o2.connect(f2); f2.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    return;
  }
  o.type = inst === 'flute' ? 'sine' : inst === 'bass' ? 'triangle' : inst === 'lead' ? 'square' : inst === 'saw' ? 'sawtooth' : 'triangle';
  o.frequency.value = f;
  if (inst === 'flute') { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 5.5; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  let node = o;
  if (inst === 'saw' || inst === 'lead') { const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = inst === 'saw' ? 1400 : 2200; o.connect(f2); node = f2; }
  const a = inst === 'flute' ? 0.04 : 0.008;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  node.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
}
function playDrum(S, kind, t) {
  const c = S.ctx, out = S.mus;
  if (kind === 'kick') { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.18); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.25); return; }
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = S.noiseBuf;
  const cfg = { hat: ['highpass', 7000, 0.06, 0.08], snare: ['bandpass', 1800, 0.14, 0.18], block: ['bandpass', 1300, 0.05, 0.22], taiko: ['lowpass', 220, 0.3, 0.5] }[kind];
  f.type = cfg[0]; f.frequency.value = cfg[1]; f.Q.value = kind === 'block' ? 8 : 1;
  g.gain.setValueAtTime(cfg[3], t); g.gain.exponentialRampToValueAtTime(0.0001, t + cfg[2]);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + cfg[2] + 0.05);
}
// 曲目：[乐器, 音量, 旋律]
const TRACKS = {
  title: { bpm: 56, voices: [
    ['pad', 0.10, 'A3+C4+E4 - - - - - - - | F3+A3+C4 - - - - - - - | D3+F3+A3 - - - - - - - | E3+G3+B3 - - - - - - -'],
    ['bell', 0.10, 'A4 . . . E5 . . . | D5 . . . C5 . . . | A4 . . . G4 . . . | E4 . . . . . . .'],
  ] },
  town: { bpm: 78, voices: [
    ['tri', 0.09, 'A4 - C5 - D5 - E5 - | G5 - E5 - D5 - C5 - | A4 - - - G4 - A4 - | C5 - D5 - A4 - - - | E5 - G5 - A5 - G5 E5 | D5 - C5 - D5 - E5 - | G4 - A4 - C5 - D5 - | A4 - - - - - - -'],
    ['bass', 0.13, 'A2 - - - E3 - - - | F2 - - - C3 - - - | D2 - - - A2 - - - | E2 - - - E3 - - - | A2 - - - E3 - - - | F2 - - - C3 - - - | G2 - - - D3 - - - | A2 - - - E2 - - -'],
    ['pad', 0.04, 'A3+C4+E4 - - - - - - - | F3+A3+C4 - - - - - - - | D3+F3+A3 - - - - - - - | E3+G3+B3 - - - - - - -'],
  ] },
  bamboo: { bpm: 88, voices: [
    ['flute', 0.11, 'E5 - D5 E5 G5 - E5 - | D5 - C5 - A4 - - - | C5 D5 E5 - G5 - A5 - | G5 E5 D5 - E5 - - - | A5 - G5 - E5 - D5 - | E5 - - - . . . . | C5 - D5 - E5 - G5 - | A4 - - - - - . .'],
    ['bass', 0.12, 'A2 - - - - - E3 - | G2 - - - - - D3 - | F2 - - - - - C3 - | E2 - - - - - B2 -'],
  ], drums: [['block', 'x..x..x.x..x..x.'], ['hat', '..x...x...x...x.']] },
  lake: { bpm: 64, voices: [
    ['bell', 0.11, 'E5 . . . . . B4 . | C5 . . . . . A4 . | G4 . . . . E5 . . | D5 . . . . . . . | E5 . . . G5 . . . | A5 . . . . . G5 . | E5 . . . D5 . . . | C5 . . . . . . .'],
    ['pad', 0.05, 'A3+C4+E4 - - - - - - - - - - - - - - - | F3+A3+C4 - - - - - - - - - - - - - - - | D3+F3+A3 - - - - - - - - - - - - - - - | E3+G3+B3 - - - - - - - - - - - - - - -'],
  ] },
  kiln: { bpm: 96, voices: [
    ['bass', 0.15, 'A1 . A2 . A1 . G1 . | A1 . A2 . C2 . D2 . | F1 . F2 . F1 . E1 . | G1 . G2 . E1 . E2 .'],
    ['saw', 0.05, 'E4 - - D4 E4 - G4 - | A4 - - - G4 - E4 - | C4 - D4 - E4 - - - | D4 - - - . . . . | E4 - G4 - A4 - C5 - | D5 - C5 - A4 - - - | G4 - E4 - D4 - E4 - | A3 - - - - - - -'],
  ], drums: [['taiko', 'x.......x...x...'], ['hat', '..x...x...x...xx']] },
  summit: { bpm: 70, voices: [
    ['pad', 0.07, 'A3+C4+E4 - - - - - - - | G3+B3+D4 - - - - - - - | F3+A3+C4 - - - - - - - | E3+G3+B3 - - - - - - -'],
    ['flute', 0.08, 'A4 - - - C5 - - - | B4 - - - G4 - - - | A4 - C5 - D5 - E5 - | E5 - - - - - - -'],
    ['bass', 0.1, 'A2 - - - - - - - | G2 - - - - - - - | F2 - - - - - - - | E2 - - - - - - -'],
  ] },
  boss: { bpm: 132, voices: [
    ['bass', 0.16, 'A1 A1 A2 A1 G1 G1 G2 G1 | F1 F1 F2 F1 E1 E1 E2 E1 | A1 A1 A2 A1 C2 C2 C3 C2 | D2 D2 D3 D2 E1 E1 E2 E2'],
    ['lead', 0.045, 'A4 . C5 . E5 D5 C5 . | G4 . A4 . E4 - - - | A4 . C5 . E5 G5 A5 . | G5 E5 D5 C5 B4 - - -'],
  ], drums: [['kick', 'x...x...x...x...'], ['snare', '..x...x...x...x.'], ['hat', 'xxxxxxxxxxxxxxxx']] },
  master: { bpm: 118, voices: [
    ['pad', 0.07, 'A3+C4+E4 - - - - - - - | F3+A3+C4 - - - - - - - | G3+B3+D4 - - - - - - - | E3+G#3+B3 - - - - - - -'],
    ['bass', 0.15, 'A1 . A2 . A1 . E2 . | F1 . F2 . F1 . C2 . | G1 . G2 . G1 . D2 . | E1 . E2 . E1 . G#1 .'],
    ['lead', 0.04, 'E5 - D5 - C5 - B4 - | C5 - A4 - - - - - | B4 - C5 - D5 - G5 - | G#4 - - - - - - -'],
  ], drums: [['taiko', 'x.....x...x.....'], ['hat', '..x...x...x...x.']] },
  ending: { bpm: 64, voices: [
    ['bell', 0.1, 'C5 . D5 . E5 . G5 . | A5 . . . G5 . E5 . | D5 . E5 . C5 . . . | . . . . . . . .'],
    ['pad', 0.06, 'C4+E4+G4 - - - - - - - | A3+C4+E4 - - - - - - - | F3+A3+C4 - - - - - - - | G3+B3+D4 - - - - - - -'],
  ] },
};
const SFX = {
  swing: (s, n) => s.noise(0.09 + (n === 2 ? 0.05 : 0), n === 2 ? 0.16 : 0.1, 'bandpass', n === 2 ? 900 : 1500, n === 2 ? 300 : 600, 1.4),
  hit: (s, heavy) => { s.noise(0.08, heavy ? 0.3 : 0.2, 'lowpass', 2400, 300, 0.8); s.tone('square', heavy ? 160 : 220, 70, 0.08, heavy ? 0.12 : 0.08); },
  block: (s) => { s.tone('square', 1200, 1100, 0.06, 0.06); s.tone('triangle', 1800, 1700, 0.08, 0.05); },
  enemyDie: (s) => { s.noise(0.3, 0.16, 'bandpass', 800, 200, 1); s.tone('sine', 300, 60, 0.25, 0.1); },
  roll: (s) => s.noise(0.18, 0.08, 'lowpass', 900, 300, 0.7),
  perfect: (s) => { s.bellAt(1568, s.ctx.currentTime, 0.12); s.bellAt(2093, s.ctx.currentTime + 0.06, 0.08); },
  hurt: (s) => { s.tone('sawtooth', 300, 80, 0.2, 0.14); s.noise(0.15, 0.12, 'lowpass', 900, 200); },
  heal: (s) => { s.tone('sine', 523, 784, 0.25, 0.1); s.tone('sine', 659, 1046, 0.3, 0.08, 0.12); },
  soup: (s) => { s.noise(0.25, 0.06, 'bandpass', 600, 900, 3); },
  oilLow: (s) => { s.tone('sine', 220, 180, 0.2, 0.08); s.tone('sine', 220, 180, 0.2, 0.08, 0.25); },
  charge: (s) => s.tone('sine', 300, 900, 0.9, 0.05),
  burst: (s) => { s.noise(0.6, 0.25, 'bandpass', 3000, 400, 0.8); s.tone('sine', 880, 220, 0.5, 0.15); s.bellAt(1046, s.ctx.currentTime, 0.1); },
  dash: (s) => { s.noise(0.15, 0.12, 'bandpass', 2500, 800, 1.5); s.tone('sine', 600, 1200, 0.1, 0.05); },
  hookShoot: (s) => s.tone('square', 900, 400, 0.12, 0.04),
  hookLatch: (s) => { s.tone('square', 1400, 1300, 0.05, 0.06); s.noise(0.08, 0.08, 'highpass', 4000, 0, 1); },
  fireThrow: (s) => s.noise(0.25, 0.08, 'bandpass', 700, 1800, 1),
  ignite: (s) => { s.noise(0.5, 0.15, 'lowpass', 2500, 400, 0.7); s.tone('sine', 200, 400, 0.3, 0.06); },
  bell: (s) => { s.bellAt(392, s.ctx.currentTime, 0.18, null, 2.2); s.bellAt(587, s.ctx.currentTime + 0.02, 0.06, null, 1.5); },
  iceCrack: (s) => { s.noise(0.3, 0.2, 'highpass', 2000, 6000, 1); s.tone('square', 1800, 600, 0.12, 0.04); },
  jar: (s) => s.noise(0.12, 0.1, 'lowpass', 500, 200, 1),
  chest: (s) => { [523, 659, 784, 1046].forEach((f, i) => s.tone('triangle', f, f, 0.15, 0.09, i * 0.07)); },
  pickup: (s) => s.tone('sine', 1320, 1760, 0.06, 0.07),
  oil: (s) => { s.tone('sine', 660, 990, 0.12, 0.08); s.noise(0.1, 0.05, 'bandpass', 1200, 600, 2, 0.05); },
  piece: (s) => { [659, 784, 988, 1318].forEach((f, i) => s.tone('triangle', f, f, 0.2, 0.1, i * 0.09)); },
  ability: (s) => { [440, 554, 659, 880, 1108].forEach((f, i) => s.tone('triangle', f, f, 0.35, 0.1, i * 0.1)); s.noise(1, 0.05, 'highpass', 5000, 9000, 1, 0.3); },
  lighthouse: (s) => { [220, 330, 440, 660].forEach((f, i) => s.tone('sine', f, f, 1.6, 0.08, i * 0.15)); s.bellAt(880, s.ctx.currentTime + 0.5, 0.1, null, 2.5); },
  door: (s) => s.noise(0.2, 0.08, 'lowpass', 400, 150, 1),
  blip: (s, p) => s.tone('square', p || 600, (p || 600) * 0.98, 0.03, 0.025),
  menu: (s) => s.tone('triangle', 880, 880, 0.04, 0.06),
  select: (s) => s.tone('triangle', 660, 990, 0.08, 0.08),
  buy: (s) => { s.tone('sine', 988, 988, 0.08, 0.08); s.tone('sine', 1318, 1318, 0.12, 0.08, 0.08); },
  deny: (s) => s.tone('square', 200, 160, 0.15, 0.06),
  roar: (s) => { s.tone('sawtooth', 90, 50, 1.0, 0.18); s.noise(1.0, 0.15, 'lowpass', 600, 80, 0.7); },
  phase: (s) => { s.noise(0.8, 0.2, 'lowpass', 3000, 100, 0.7); s.tone('sine', 110, 55, 0.8, 0.2); },
  victory: (s) => { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => s.tone('triangle', f, f, i > 4 ? 0.6 : 0.15, 0.1, i * 0.12)); },
  death: (s) => { [392, 330, 262, 196].forEach((f, i) => s.tone('triangle', f, f * 0.97, 0.35, 0.1, i * 0.22)); },
  splash: (s) => s.noise(0.4, 0.2, 'lowpass', 1500, 200, 0.7),
  fall: (s) => s.tone('sine', 600, 100, 0.4, 0.08),
  steal: (s) => s.tone('sine', 800, 300, 0.3, 0.07),
  spikeOut: (s) => { s.noise(0.08, 0.15, 'highpass', 2000, 0, 1); s.tone('square', 300, 150, 0.06, 0.05); },
  frogLand: (s) => { s.noise(0.12, 0.12, 'lowpass', 800, 200, 1); s.tone('sine', 140, 70, 0.1, 0.1); },
  shoot: (s) => s.tone('triangle', 1200, 500, 0.12, 0.05),
  flame: (s) => s.noise(0.35, 0.1, 'bandpass', 900, 2000, 1),
  smoke: (s) => s.noise(0.5, 0.05, 'lowpass', 600, 300, 1),
  shatter: (s) => { s.noise(0.3, 0.2, 'highpass', 3000, 6000, 1); [1800, 2400, 2000].forEach((f, i) => s.tone('triangle', f, f * 0.9, 0.1, 0.05, i * 0.04)); },
  slam: (s) => { s.noise(0.5, 0.3, 'lowpass', 600, 60, 0.8); s.tone('sine', 90, 35, 0.4, 0.3); },
  warn: (s) => s.tone('square', 700, 700, 0.07, 0.04),
  lava: (s) => s.noise(0.6, 0.08, 'lowpass', 300, 150, 1),
};
