'use strict';
/* =====================================================================
 * 暴走厨房 —— 类吸血鬼幸存者肉鸽小游戏
 * 纯 HTML5 Canvas + 原生 JavaScript，无外部依赖，美术全部由代码绘制。
 *
 * 代码分块：
 *   CONFIG → 工具 → 画布与镜头 → 输入 → 音效 → 美术 → 武器/被动数据 →
 *   敌人数据 → 游戏状态 → 刷怪与时间线 → 战斗 → 更新 → 渲染 → 界面 → 主循环
 * ===================================================================== */

// =====================================================================
// CONFIG：所有数值集中在这里，方便调
// =====================================================================
const CONFIG = {
  view: {
    worldW: 1100,          // 横向至少能看到的世界宽度
    worldH: 720,           // 纵向至少能看到的世界高度
    maxDpr: 2,
    maxPixels: 6.5e6,      // 画布像素上限（防止 4K 屏卡顿）
  },
  camera: { follow: 9, shakeMax: 13, shakeDecay: 2.4 },
  floor: { tile: 64, period: 8 },
  player: {
    hp: 100,
    speed: 160,            // 像素/秒
    accelTime: 0.08,       // 约 0.08 秒到满速
    pickup: 60,            // 拾取半径
    radius: 13,
    invuln: 0.5,           // 受击无敌时间
    lowHp: 0.3,            // 低于 30% 血量进入危险状态
  },
};

// =====================================================================
// 工具函数
// =====================================================================
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function angleDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function fmtTime(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 对象池：避免频繁创建/回收对象造成 GC 卡顿
class Pool {
  constructor(make) { this.make = make; this.free = []; }
  get() { return this.free.length ? this.free.pop() : this.make(); }
  put(o) { this.free.push(o); }
}
// 把 dead 的对象移回对象池，保持数组紧凑
function compact(arr, pool) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) { const o = arr[i]; if (o.dead) pool.put(o); else arr[j++] = o; }
  arr.length = j;
}

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 隐私模式等情况忽略 */ } },
};

const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif';

// =====================================================================
// 画布与镜头
// =====================================================================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, zoom: 1, ww: 0, wh: 0, ui: 1 };
const cam = { x: 0, y: 0, shake: 0, ox: 0, oy: 0 };
// 世界坐标 → 设备像素：dev = world * K + (OX, OY)
let K = 1, OX = 0, OY = 0;

function resize() {
  const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, CONFIG.view.maxDpr);
  if (w * h * dpr * dpr > CONFIG.view.maxPixels) dpr = Math.max(1, Math.sqrt(CONFIG.view.maxPixels / (w * h)));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  view.w = w; view.h = h; view.dpr = dpr;
  view.zoom = Math.min(w / CONFIG.view.worldW, h / CONFIG.view.worldH);
  view.ww = w / view.zoom; view.wh = h / view.zoom;
  view.ui = clamp(Math.min(w / 1280, h / 760), 0.62, 1.6);
  buildSprites();
}

function shake(amount) {
  if (!game.settings.shake) return;
  cam.shake = Math.min(1, cam.shake + amount);
}

function updateCamera(dt, tx, ty) {
  const k = 1 - Math.exp(-CONFIG.camera.follow * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.shake = Math.max(0, cam.shake - CONFIG.camera.shakeDecay * dt);
}

function computeTransform() {
  const s = cam.shake * cam.shake * CONFIG.camera.shakeMax;
  cam.ox = s ? (Math.random() * 2 - 1) * s : 0;
  cam.oy = s ? (Math.random() * 2 - 1) * s : 0;
  K = view.zoom * view.dpr;
  OX = (view.w / 2 + cam.ox) * view.dpr - cam.x * K;
  OY = (view.h / 2 + cam.oy) * view.dpr - cam.y * K;
}
const setWorld = () => ctx.setTransform(K, 0, 0, K, OX, OY);
const setUI = () => ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
// 世界坐标转屏幕 CSS 像素
const toSX = (x) => (x * K + OX) / view.dpr;
const toSY = (y) => (y * K + OY) / view.dpr;
function onScreen(x, y, m) {
  return Math.abs(x - cam.x) < view.ww / 2 + m && Math.abs(y - cam.y) < view.wh / 2 + m;
}

// =====================================================================
// 输入
// =====================================================================
const input = { down: Object.create(null), hit: Object.create(null), mouse: { x: -1, y: -1, click: false } };
const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
window.addEventListener('keydown', (e) => {
  const k = e.code || e.key;
  if (!input.down[k]) input.hit[k] = true;
  input.down[k] = true;
  if (PREVENT.has(k)) e.preventDefault();
  Sound.unlock();
});
window.addEventListener('keyup', (e) => { input.down[e.code || e.key] = false; });
window.addEventListener('blur', () => { for (const k in input.down) input.down[k] = false; autoPause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
canvas.addEventListener('mousemove', (e) => { input.mouse.x = e.clientX; input.mouse.y = e.clientY; });
canvas.addEventListener('mousedown', (e) => {
  input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.mouse.click = true;
  canvas.focus();
  Sound.unlock();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const pressed = (...codes) => codes.some((c) => input.hit[c]);
const held = (...codes) => codes.some((c) => input.down[c]);
const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  pause: ['KeyP', 'Escape'], mute: ['KeyM'], restart: ['KeyR'], start: ['Space', 'Enter', 'NumpadEnter'],
};

// =====================================================================
// 音效（WebAudio 现场合成）
// =====================================================================
const Sound = {
  ctx: null,
  master: null,
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = game.settings.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) {
    game.settings.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  },
  play() {},
};

// =====================================================================
// 美术：所有图形由代码绘制，预渲染成离屏精灵以保证性能
// =====================================================================
const OL = '#2b1d2e'; // 统一描边色
const SPR = {};
let sprRes = 0;
let floorPattern = null, floorRes = 1;

function circ(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, TAU); }
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); }
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function fs(c, fill, lw = 2) {
  c.fillStyle = fill; c.fill();
  if (lw) { c.lineWidth = lw; c.strokeStyle = OL; c.stroke(); }
}
function lg(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
function rg(c, x, y, r0, r1, stops) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  stops.forEach((s, i) => g.addColorStop(i / (stops.length - 1), s));
  return g;
}
// 多个圆合并成一团、只描外轮廓（西兰花、厨师帽用）
function blob(c, circles, fill, lw = 2) {
  c.beginPath();
  for (const [x, y, r] of circles) { c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
  c.lineWidth = lw * 2; c.strokeStyle = OL; c.stroke();
  c.fillStyle = fill; c.fill();
}
function shine(c, x, y, rx, ry, a = 0.5) { ell(c, x, y, rx, ry, -0.6); c.fillStyle = `rgba(255,255,255,${a})`; c.fill(); }

function makeCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); return cv; }
function makeSprite(w, h, draw, ax = w / 2, ay = h / 2) {
  const cv = makeCanvas(w * sprRes, h * sprRes);
  const c = cv.getContext('2d');
  c.scale(sprRes, sprRes);
  c.translate(ax, ay);
  c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  return { c: cv, w, h, ax, ay };
}
function tintSprite(s, color, alpha) {
  const cv = makeCanvas(s.c.width, s.c.height);
  const c = cv.getContext('2d');
  c.drawImage(s.c, 0, 0);
  c.globalCompositeOperation = 'source-atop';
  c.globalAlpha = alpha; c.fillStyle = color;
  c.fillRect(0, 0, cv.width, cv.height);
  return { c: cv, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
}
// 柔光圆（粒子、光晕用）
function glowSprite(color, size = 32) {
  return makeSprite(size, size, (c) => {
    c.fillStyle = rg(c, 0, 0, 0, size / 2, [color, color.replace(/[\d.]+\)$/, '0.35)'), color.replace(/[\d.]+\)$/, '0)')]);
    c.fillRect(-size / 2, -size / 2, size, size);
  });
}

// 在世界坐标里画精灵（带缩放、旋转）
function drawSpr(s, x, y, scx = 1, scy = 1, rot = 0) {
  if (rot) {
    const co = Math.cos(rot), si = Math.sin(rot);
    ctx.setTransform(K * scx * co, K * scx * si, -K * scy * si, K * scy * co, OX + x * K, OY + y * K);
  } else {
    ctx.setTransform(K * scx, 0, 0, K * scy, OX + x * K, OY + y * K);
  }
  ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
}

// ---- 主角：小厨师 ----
function drawChef(c) {
  ell(c, -6, 15, 5, 3.5); fs(c, '#4a3b52');
  ell(c, 6, 15, 5, 3.5); fs(c, '#4a3b52');
  rr(c, -11, -4, 22, 19, 8); fs(c, lg(c, -11, -4, 11, 15, ['#ffffff', '#d9deea']));
  c.fillStyle = '#b3bacb';
  for (const [x, y] of [[-3.5, 4], [-3.5, 9.5], [3.5, 4], [3.5, 9.5]]) { circ(c, x, y, 1.3); c.fill(); }
  c.beginPath(); c.moveTo(-7.5, -4); c.lineTo(7.5, -4); c.lineTo(1, 3.5); c.closePath(); fs(c, '#ef4b3f', 1.6);
  circ(c, 0, -11, 10); fs(c, lg(c, -6, -20, 6, -2, ['#ffe6cc', '#f5c296']));
  blob(c, [[-6, -27, 6.5], [0, -30.5, 7.5], [6, -27, 6.5]], lg(c, 0, -38, 0, -20, ['#ffffff', '#e8ebf3']));
  rr(c, -8.5, -24.5, 17, 6.5, 2); fs(c, '#f4f6fb');
  c.fillStyle = 'rgba(160,170,195,.45)'; c.fillRect(-7, -20.5, 14, 1.2);
  ell(c, 2, -12, 1.7, 2.5); c.fillStyle = OL; c.fill();
  ell(c, 7.5, -12, 1.7, 2.5); c.fill();
  c.fillStyle = '#fff'; circ(c, 2.6, -13.1, 0.75); c.fill(); circ(c, 8.1, -13.1, 0.75); c.fill();
  c.fillStyle = 'rgba(255,105,105,.5)'; ell(c, -1.8, -7.6, 2.4, 1.4); c.fill(); ell(c, 10, -7.6, 1.6, 1.3); c.fill();
  c.beginPath(); c.arc(5.4, -7.8, 2.2, 0.25, Math.PI - 0.25); c.lineWidth = 1.4; c.strokeStyle = OL; c.stroke();
}

// ---- 地面：深色厨房瓷砖，预渲染成平铺图案 ----
function buildFloor() {
  const T = CONFIG.floor.tile, N = CONFIG.floor.period, size = T * N;
  floorRes = Math.min(sprRes, 2);
  const cv = makeCanvas(size * floorRes, size * floorRes);
  const c = cv.getContext('2d');
  c.scale(floorRes, floorRes);
  const rnd = mulberry32(20240607);
  c.fillStyle = '#1b202c'; c.fillRect(0, 0, size, size);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i * T, y = j * T, odd = (i + j) & 1;
      const v = (rnd() - 0.5) * 5;
      const b = odd ? [45, 54, 69] : [40, 48, 62];
      c.fillStyle = `rgb(${(b[0] + v) | 0},${(b[1] + v) | 0},${(b[2] + v * 1.2) | 0})`;
      c.fillRect(x + 1.5, y + 1.5, T - 3, T - 3);
      c.fillStyle = 'rgba(255,255,255,0.035)';
      c.fillRect(x + 1.5, y + 1.5, T - 3, 2); c.fillRect(x + 1.5, y + 1.5, 2, T - 3);
      c.fillStyle = 'rgba(0,0,0,0.13)';
      c.fillRect(x + 1.5, y + T - 3.5, T - 3, 2); c.fillRect(x + T - 3.5, y + 1.5, 2, T - 3);
      if (rnd() < 0.08) { // 瓷砖小裂纹
        c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 1;
        let px = x + 8 + rnd() * (T - 16), py = y + 8 + rnd() * (T - 16);
        c.beginPath(); c.moveTo(px, py);
        for (let k = 0; k < 3; k++) { px += (rnd() - 0.5) * 18; py += (rnd() - 0.5) * 18; c.lineTo(px, py); }
        c.stroke();
      }
    }
  }
  // 面粉、酱汁印记（跨边缘绘制以保证无缝平铺）
  const splat = (x, y, r, col) => {
    const pts = [];
    for (let k = 0; k < 6; k++) pts.push([(rnd() - 0.5) * r * 1.4, (rnd() - 0.5) * r * 1.4, r * (0.35 + rnd() * 0.45)]);
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      c.fillStyle = col; c.beginPath();
      for (const [dx, dy, rr2] of pts) { c.moveTo(x + ox + dx + rr2, y + oy + dy); c.arc(x + ox + dx, y + oy + dy, rr2, 0, TAU); }
      c.fill();
    }
  };
  for (let k = 0; k < 6; k++) splat(rnd() * size, rnd() * size, 10 + rnd() * 18, 'rgba(255,246,230,0.035)');
  for (let k = 0; k < 4; k++) splat(rnd() * size, rnd() * size, 8 + rnd() * 12, 'rgba(0,0,0,0.07)');
  for (let k = 0; k < 4; k++) splat(rnd() * size, rnd() * size, 5 + rnd() * 8, 'rgba(255,120,80,0.03)');
  c.fillStyle = 'rgba(255,225,190,0.07)';
  for (let k = 0; k < 50; k++) { circ(c, rnd() * size, rnd() * size, 0.6 + rnd() * 1.1); c.fill(); }
  floorPattern = ctx.createPattern(cv, 'repeat');
  if (floorPattern.setTransform) floorPattern.setTransform(new DOMMatrix([1 / floorRes, 0, 0, 1 / floorRes, 0, 0]));
}

function buildSprites() {
  const res = clamp(Math.ceil(view.zoom * view.dpr * 2) / 2, 1, 3);
  if (res === sprRes) return;
  sprRes = res;
  buildFloor();
  SPR.player = makeSprite(44, 60, drawChef, 22, 40);
  SPR.playerW = tintSprite(SPR.player, '#ffffff', 0.85);
  // 屏幕暗角
  const vc = makeCanvas(256, 256), v = vc.getContext('2d');
  v.fillStyle = rg(v, 128, 128, 40, 182, ['rgba(8,6,16,0)', 'rgba(8,6,16,0.12)', 'rgba(8,6,16,0.6)']);
  v.fillRect(0, 0, 256, 256);
  SPR.vignette = vc;
}

// =====================================================================
// 游戏状态
// =====================================================================
const game = {
  phase: 'title', // title | play | pause | levelup | over | win
  time: 0,        // 真实时间（界面动画用）
  settings: Object.assign({ shake: true, muted: false, numbers: true }, store.get('kr_settings', {})),
  debug: /[?&]debug=1/.test(location.search),
  fps: 60, upMs: 0, drawMs: 0,
};
let state = null;

function makePlayer() {
  const P = CONFIG.player;
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: P.radius,
    hp: P.hp, maxHp: P.hp, invuln: 0,
    facex: 1, facey: 0, flip: 1, walkT: 0, moving: false,
  };
}

function newState() {
  return {
    t: 0,
    player: makePlayer(),
    slowmo: 0, slowmoScale: 1,
  };
}

function startGame() {
  state = newState();
  cam.x = 0; cam.y = 0; cam.shake = 0;
  game.phase = 'play';
}

function saveSettings() { store.set('kr_settings', game.settings); }

function autoPause() { if (game.phase === 'play') game.phase = 'pause'; }

// =====================================================================
// 更新
// =====================================================================
function updatePlayer(dt) {
  const p = state.player;
  let ix = 0, iy = 0;
  if (held(...KEYS.left)) ix -= 1;
  if (held(...KEYS.right)) ix += 1;
  if (held(...KEYS.up)) iy -= 1;
  if (held(...KEYS.down)) iy += 1;
  const len = Math.hypot(ix, iy);
  if (len > 0) {
    ix /= len; iy /= len;
    p.facex = ix; p.facey = iy;
    if (Math.abs(ix) > 0.2) p.flip = ix > 0 ? 1 : -1;
  }
  const spd = CONFIG.player.speed;
  const tx = ix * spd, ty = iy * spd;
  const acc = (spd / CONFIG.player.accelTime) * dt;
  const dx = tx - p.vx, dy = ty - p.vy, dl = Math.hypot(dx, dy);
  if (dl <= acc) { p.vx = tx; p.vy = ty; } else { p.vx += (dx / dl) * acc; p.vy += (dy / dl) * acc; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  const sp = Math.hypot(p.vx, p.vy);
  p.moving = sp > 10;
  p.walkT += dt * (sp / spd) * 2.2;
  if (p.invuln > 0) p.invuln -= dt;
}

function update(dt) {
  state.t += dt;
  updatePlayer(dt);
  updateCamera(dt, state.player.x, state.player.y);
}

// =====================================================================
// 渲染：世界
// =====================================================================
function drawFloor() {
  setWorld();
  ctx.fillStyle = floorPattern;
  const m = 40;
  ctx.fillRect(cam.x - view.ww / 2 - m, cam.y - view.wh / 2 - m, view.ww + m * 2, view.wh + m * 2);
}

function drawShadow(x, y, rx, ry, a = 0.28) {
  setWorld();
  ctx.fillStyle = `rgba(8,6,18,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

function drawPlayer() {
  const p = state.player;
  drawShadow(p.x, p.y + 15, 13, 5);
  const bob = p.moving ? Math.abs(Math.sin(p.walkT * Math.PI)) : 0;
  const breathe = Math.sin(game.time * 3) * 0.02;
  const sxs = (1 + bob * 0.05 - breathe) * p.flip;
  const sys = 1 - bob * 0.05 + breathe;
  const blink = p.invuln > 0 && ((state.t * 18) | 0) % 2 === 0;
  drawSpr(blink ? SPR.playerW : SPR.player, p.x, p.y - bob * 3, sxs, sys, p.moving ? Math.sin(p.walkT * Math.PI) * 0.06 : 0);
}

function renderWorld() {
  drawFloor();
  drawPlayer();
  // 暗角
  setUI();
  ctx.drawImage(SPR.vignette, 0, 0, view.w, view.h);
}

// =====================================================================
// 界面
// =====================================================================
function font(size, weight = 'bold') { return `${weight} ${Math.round(size)}px ${FONT}`; }
function text(str, x, y, size, color, align = 'center', weight = 'bold', base = 'middle') {
  ctx.font = font(size, weight); ctx.textAlign = align; ctx.textBaseline = base;
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function textO(str, x, y, size, color, outline = OL, lw = 4, align = 'center', base = 'middle') {
  ctx.font = font(size); ctx.textAlign = align; ctx.textBaseline = base;
  ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = outline; ctx.strokeText(str, x, y);
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}
function panel(x, y, w, h, r, fill = 'rgba(24,20,36,0.88)', stroke = 'rgba(255,255,255,0.10)') {
  rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = 1.5; ctx.strokeStyle = stroke; ctx.stroke(); }
}
function dim(a) { setUI(); ctx.fillStyle = `rgba(12,9,20,${a})`; ctx.fillRect(0, 0, view.w, view.h); }

function renderHUD() {
  setUI();
  const u = view.ui;
  textO(fmtTime(state.t), view.w - 22 * u, 34 * u, 30 * u, '#fff7ec', OL, 5 * u, 'right');
  // 头顶小血条
  const p = state.player;
  const bx = toSX(p.x), by = toSY(p.y - 46);
  const bw = 34 * view.zoom, bh = 4.5 * view.zoom;
  rr(ctx, bx - bw / 2 - 1.5, by - 1.5, bw + 3, bh + 3, 3); ctx.fillStyle = 'rgba(20,14,26,0.85)'; ctx.fill();
  const f = clamp(p.hp / p.maxHp, 0, 1);
  if (f > 0) { rr(ctx, bx - bw / 2, by, bw * f, bh, 2); ctx.fillStyle = f < CONFIG.player.lowHp ? '#ff4d5e' : '#5ee27a'; ctx.fill(); }
  text('P 暂停 · M 静音', 16 * u, view.h - 16 * u, 13 * u, 'rgba(255,255,255,0.35)', 'left', 'normal');
}

function renderTitle() {
  cam.x = game.time * 22; cam.y = game.time * 9; cam.shake = 0;
  computeTransform();
  drawFloor();
  setUI();
  ctx.drawImage(SPR.vignette, 0, 0, view.w, view.h);
  dim(0.35);
  const u = view.ui, cx = view.w / 2, cy = view.h / 2;
  // 标题
  const wob = Math.sin(game.time * 2.2) * 0.025;
  ctx.save();
  ctx.translate(cx, cy - 200 * u);
  ctx.rotate(wob);
  ctx.font = font(92 * u, '900'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText('暴走厨房', 4 * u, 8 * u);
  ctx.lineWidth = 14 * u; ctx.strokeStyle = OL; ctx.strokeText('暴走厨房', 0, 0);
  const g = ctx.createLinearGradient(0, -46 * u, 0, 46 * u);
  g.addColorStop(0, '#ffe08a'); g.addColorStop(0.55, '#ffa53d'); g.addColorStop(1, '#ff5a3c');
  ctx.fillStyle = g; ctx.fillText('暴走厨房', 0, 0);
  ctx.restore();
  text('食材成精了！只管走位，厨具自动开火，撑过 8 分钟打败西瓜大王。', cx, cy - 128 * u, 18 * u, '#f3e9ff', 'center', 'normal');
  // 小厨师
  const bob = Math.abs(Math.sin(game.time * 4)) * 6 * u;
  ctx.save();
  ctx.translate(cx, cy + 4 * u - bob);
  ctx.scale(2.2 * u / sprRes, 2.2 * u / sprRes);
  ctx.drawImage(SPR.player.c, -SPR.player.ax * sprRes, -SPR.player.ay * sprRes);
  ctx.restore();
  // 操作说明
  const rows = [['WASD / 方向键', '移动'], ['1 / 2 / 3 或鼠标', '升级时选卡'], ['P / Esc', '暂停'], ['M', '静音'], ['R', '死亡/通关后重开']];
  const pw = 420 * u, ph = (rows.length * 28 + 26) * u, px = cx - pw / 2, py = cy + 66 * u;
  panel(px, py, pw, ph, 14 * u);
  rows.forEach(([k, v], i) => {
    const y = py + (26 + i * 28) * u;
    text(k, cx - 16 * u, y, 16 * u, '#ffd166', 'right');
    text(v, cx + 16 * u, y, 16 * u, '#e9e2f5', 'left', 'normal');
  });
  if (Math.sin(game.time * 5) > -0.3) textO('按 空格 开始', cx, py + ph + 44 * u, 28 * u, '#ffffff', OL, 6 * u);
}

function renderPause() {
  dim(0.6);
  const u = view.ui, cx = view.w / 2, cy = view.h / 2;
  textO('已暂停', cx, cy - 20 * u, 48 * u, '#fff7ec', OL, 8 * u);
  text('按 P / Esc 继续', cx, cy + 34 * u, 18 * u, '#d9d0ea', 'center', 'normal');
}

function renderDebug() {
  setUI();
  const lines = [`FPS ${game.fps.toFixed(0)}`, `更新 ${game.upMs.toFixed(2)}ms  绘制 ${game.drawMs.toFixed(2)}ms`];
  ctx.font = font(12, 'normal'); ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const w = 230, h = lines.length * 16 + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(view.w / 2 - w / 2, view.h - h - 8, w, h);
  ctx.fillStyle = '#9fffa8';
  lines.forEach((l, i) => ctx.fillText(l, view.w / 2 - w / 2 + 8, view.h - h - 3 + i * 16));
}

// =====================================================================
// 主循环
// =====================================================================
function handleInput() {
  if (pressed(...KEYS.mute)) { Sound.setMuted(!game.settings.muted); saveSettings(); }
  switch (game.phase) {
    case 'title':
      if (pressed(...KEYS.start) || input.mouse.click) startGame();
      break;
    case 'play':
      if (pressed(...KEYS.pause)) game.phase = 'pause';
      break;
    case 'pause':
      if (pressed(...KEYS.pause) || input.mouse.click) game.phase = 'play';
      break;
  }
}

function step(rdt) {
  let ts = 1;
  if (state.slowmo > 0) { state.slowmo -= rdt; ts = state.slowmoScale; }
  const dt = Math.min(rdt, 0.05) * ts;
  const n = dt > 1 / 50 ? 2 : 1; // 低帧率时分两步，避免子弹穿透
  for (let i = 0; i < n; i++) update(dt / n);
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (game.phase === 'title') { renderTitle(); return; }
  computeTransform();
  renderWorld();
  renderHUD();
  if (game.phase === 'pause') renderPause();
}

let lastNow = performance.now();
function frame(now) {
  let rdt = (now - lastNow) / 1000;
  lastNow = now;
  if (!(rdt > 0)) rdt = 0;
  if (rdt > 0.1) rdt = 0.1;
  game.time += rdt;
  if (rdt > 0) game.fps = lerp(game.fps, 1 / rdt, 0.05);
  handleInput();
  const t0 = performance.now();
  if (game.phase === 'play') step(rdt);
  const t1 = performance.now();
  render();
  if (game.debug) renderDebug();
  const t2 = performance.now();
  game.upMs = lerp(game.upMs, t1 - t0, 0.1);
  game.drawMs = lerp(game.drawMs, t2 - t1, 0.1);
  input.hit = Object.create(null);
  input.mouse.click = false;
  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);

// 调试/自动化测试用
if (game.debug) window.__kr = { CONFIG, game, input, get state() { return state; }, update, startGame };
