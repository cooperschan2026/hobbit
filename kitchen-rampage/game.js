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
  combat: { critChance: 0.1, critMul: 2, hitFlash: 0.07 },
  difficulty: { hpPerMin: 0.15 },   // 敌人血量每分钟 +15%
  grid: { cell: 64 },
  spawn: {
    margin: 60,            // 在屏幕外多远处生成
    leash: 260,            // 掉队超过屏幕外这么远，就挪到玩家前方
    opening: 6,            // 开局先刷几只，免得冷场
    // [时间(秒), 每秒刷怪数, 同屏上限]，相邻两点之间线性插值
    curve: [
      [0, 0.9, 24], [30, 1.3, 40], [60, 1.8, 60], [120, 2.6, 90], [180, 5.2, 170],
      [240, 6.2, 200], [300, 7.5, 240], [360, 9, 280], [390, 26, 400], [445, 26, 400], [450, 0, 0],
    ],
  },
  xp: { base: 5, perLevel: 4 },        // 升级所需经验 = 5 + 等级 * 4
  gems: {
    values: [1, 5, 20],                // 蓝 / 绿 / 红
    maxOnField: 300,                   // 超过就就近合并成大晶体
    mergeCell: 170,
    popSpeed: 150,                     // 被吸之前先往外弹一下
    attractAccel: 2400,                // 飞向主角的加速度
    comboWindow: 0.45,                 // 连续拾取音调升高的时间窗
  },
  drops: { green: 0.03, greenPerMin: 0.018, red: 0.0, redPerMin: 0.003 },
  levelUp: { rerolls: 2, shockRadius: 230, shockForce: 620, healAmount: 30, goldAmount: 50, inputDelay: 0.28 },
  enemies: {
    broccoli: { name: '西兰花', r: 15, hp: 18, speed: 48, dmg: 8, mass: 1.6, colors: ['#5fbf55', '#2f7d32', '#a5d67a'] },
  },
  weapons: {
    spatula: {
      levels: [
        { dmg: 12, count: 1, pierce: 1, cd: 0.9, speed: 440, range: 520, kb: 90 },
        { dmg: 12, count: 2, pierce: 1, cd: 0.9, speed: 440, range: 520, kb: 90 },
        { dmg: 15, count: 2, pierce: 2, cd: 0.9, speed: 460, range: 540, kb: 100 },
        { dmg: 15, count: 3, pierce: 2, cd: 0.85, speed: 460, range: 540, kb: 100 },
        { dmg: 20, count: 3, pierce: 3, cd: 0.8, speed: 480, range: 560, kb: 110 },
      ],
    },
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
// 空间网格：散列网格做敌人碰撞查询（每帧重建，O(n)）
// =====================================================================
const GRID_BITS = 7, GRID_N = 1 << GRID_BITS, GRID_MASK = GRID_N - 1;
const BIG_R = 26; // 半径大于它的（Boss）单独存放，每次查询都检查
const grid = { head: new Int32Array(GRID_N * GRID_N), next: new Int32Array(1024), list: [], big: [] };
const QR = [];    // 查询结果缓冲区（不要嵌套使用）
function gridBuild(list) {
  const inv = 1 / CONFIG.grid.cell;
  grid.head.fill(-1);
  if (grid.next.length < list.length) grid.next = new Int32Array(list.length * 2);
  grid.list = list; grid.big.length = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.r > BIG_R) { grid.big.push(e); continue; }
    const k = ((Math.floor(e.x * inv) & GRID_MASK) << GRID_BITS) | (Math.floor(e.y * inv) & GRID_MASK);
    grid.next[i] = grid.head[k]; grid.head[k] = i;
  }
}
// 找出与圆 (x, y, r) 相交的所有存活敌人，写入 QR，返回数量
function query(x, y, r) {
  const inv = 1 / CONFIG.grid.cell, pad = r + BIG_R;
  const x0 = Math.floor((x - pad) * inv), x1 = Math.floor((x + pad) * inv);
  const y0 = Math.floor((y - pad) * inv), y1 = Math.floor((y + pad) * inv);
  const list = grid.list, head = grid.head, next = grid.next;
  let n = 0;
  for (let cx = x0; cx <= x1; cx++) {
    const row = (cx & GRID_MASK) << GRID_BITS;
    for (let cy = y0; cy <= y1; cy++) {
      let i = head[row | (cy & GRID_MASK)];
      while (i !== -1) {
        const e = list[i];
        if (!e.dead) { const dx = e.x - x, dy = e.y - y, rs = r + e.r; if (dx * dx + dy * dy < rs * rs) QR[n++] = e; }
        i = next[i];
      }
    }
  }
  const big = grid.big;
  for (let i = 0; i < big.length; i++) {
    const e = big[i];
    if (!e.dead) { const dx = e.x - x, dy = e.y - y, rs = r + e.r; if (dx * dx + dy * dy < rs * rs) QR[n++] = e; }
  }
  return n;
}

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
  buildIcons();
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
function makeSprite(w, h, draw, ax = w / 2, ay = h / 2, res = sprRes) {
  const cv = makeCanvas(w * res, h * res);
  const c = cv.getContext('2d');
  c.scale(res, res);
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

// ---- 表情小部件 ----
function eye(c, x, y, r, look = 1) {
  circ(c, x, y, r); fs(c, '#ffffff', 1.5);
  circ(c, x + look * r * 0.32, y + r * 0.12, r * 0.58); c.fillStyle = OL; c.fill();
  circ(c, x + look * r * 0.32 - r * 0.2, y - r * 0.12, r * 0.2); c.fillStyle = '#fff'; c.fill();
}
function brow(c, x1, y1, x2, y2, lw = 2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = lw; c.strokeStyle = OL; c.stroke(); }
function mouth(c, x, y, w, frown = true) {
  c.beginPath();
  if (frown) c.arc(x, y + w * 0.9, w, -Math.PI * 0.8, -Math.PI * 0.2); else c.arc(x, y - w * 0.3, w, 0.2, Math.PI - 0.2);
  c.lineWidth = 1.6; c.strokeStyle = OL; c.stroke();
}

// ---- 敌人：西兰花 ----
function drawBroccoli(c) {
  c.beginPath(); c.moveTo(-6.5, 3); c.lineTo(6.5, 3); c.lineTo(5.5, 15.5); c.quadraticCurveTo(0, 18.5, -5.5, 15.5); c.closePath();
  fs(c, lg(c, -6, 3, 6, 17, ['#d4ecb0', '#93c95a']));
  blob(c, [[-10, -3, 8], [0, -9.5, 9.5], [10, -3, 8], [-6, 4, 7], [6, 4, 7], [0, -1, 9]], lg(c, -8, -19, 8, 11, ['#86d873', '#3c9a3e']));
  c.fillStyle = 'rgba(25,85,40,0.35)';
  for (const [x, y, r] of [[-12, -6, 2.4], [-5, -14, 2.6], [5, -15, 2.2], [12, -7, 2.4], [-9, 6, 2], [9, 6, 2], [0, -17, 1.8]]) { circ(c, x, y, r); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.28)';
  for (const [x, y, r] of [[-7, -12, 2.6], [-1, -16, 2], [-12, -2, 1.6]]) { circ(c, x, y, r); c.fill(); }
  eye(c, -3.5, -2, 3.6); eye(c, 5, -2, 3.6);
  brow(c, -7.5, -7.5, -1, -5.2); brow(c, 9, -7.5, 2.5, -5.2);
  mouth(c, 1, 5, 2.6, true);
}

// ---- 武器：飞锅铲 ----
function drawSpatulaArt(c) {
  rr(c, -16, -2.6, 16, 5.2, 2.6); fs(c, lg(c, 0, -3, 0, 3, ['#d9965a', '#8e5a2c']), 1.6);
  c.fillStyle = OL; circ(c, -12.5, 0, 1); c.fill();
  rr(c, -1.5, -1.6, 5, 3.2, 1); fs(c, '#9aa4b8', 1.2);
  rr(c, 3, -7, 13, 14, 3.5); fs(c, lg(c, 3, -7, 16, 7, ['#ffffff', '#a9b3c7']), 1.6);
  c.fillStyle = 'rgba(43,29,46,0.5)';
  for (let k = 0; k < 3; k++) { rr(c, 6 + k * 3.2, -4.3, 1.5, 8.6, 0.75); c.fill(); }
}

// ---- 调料晶（经验） ----
const GEM_COLORS = [
  ['#c9f3ff', '#4fc3f7', '#1d78c2', 'rgba(79,195,247,0.6)'],
  ['#dcffd0', '#6fdc5e', '#2d9a3a', 'rgba(111,220,94,0.6)'],
  ['#ffd6d2', '#ff5e57', '#b8262b', 'rgba(255,94,87,0.6)'],
  ['#fff7c9', '#ffd23f', '#d08400', 'rgba(255,210,63,0.7)'],
];
const GEM_SIZE = [6, 7.5, 9, 11.5];
function drawGem(c, cols, s) {
  const w = s * 0.72;
  const outline = () => { c.beginPath(); c.moveTo(0, -s); c.lineTo(w, 0); c.lineTo(0, s); c.lineTo(-w, 0); c.closePath(); };
  outline(); c.fillStyle = cols[1]; c.fill();
  c.beginPath(); c.moveTo(0, -s); c.lineTo(-w, 0); c.lineTo(0, s * 0.18); c.closePath(); c.fillStyle = cols[0]; c.fill();
  c.beginPath(); c.moveTo(w, 0); c.lineTo(0, s); c.lineTo(0, s * 0.18); c.closePath(); c.fillStyle = cols[2]; c.fill();
  outline(); c.lineWidth = 1.5; c.strokeStyle = OL; c.stroke();
  shine(c, -s * 0.24, -s * 0.38, s * 0.11, s * 0.26, 0.9);
}

// ---- 补给：包子、金币 ----
function drawBun(c) {
  ell(c, 0, 3, 15, 11.5); fs(c, lg(c, 0, -9, 0, 15, ['#ffffff', '#eadcc4']), 2.2);
  c.strokeStyle = 'rgba(150,115,80,0.55)'; c.lineWidth = 1.3;
  for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(k * 1.8, -5.5); c.quadraticCurveTo(k * 4.8, -1, k * 6.2, 5); c.stroke(); }
  circ(c, 0, -6, 2.3); c.fillStyle = '#e6d6bb'; c.fill();
  shine(c, -8, -2, 2.5, 4, 0.7);
}
function drawCoin(c) {
  circ(c, 0, 0, 15); fs(c, lg(c, -10, -12, 10, 12, ['#fff3a8', '#ffc531', '#de8a0a']), 2.4);
  circ(c, 0, 0, 10.5); c.lineWidth = 1.6; c.strokeStyle = 'rgba(150,80,0,0.55)'; c.stroke();
  rr(c, -4, -4, 8, 8, 1.5); c.fillStyle = OL; c.fill();
  shine(c, -6, -7, 2.5, 4, 0.7);
}
function drawHeartArt(c) {
  c.beginPath(); c.moveTo(0, 13); c.bezierCurveTo(-24, -3, -11, -21, 0, -8); c.bezierCurveTo(11, -21, 24, -3, 0, 13);
  fs(c, lg(c, 0, -18, 0, 13, ['#ff9db5', '#ff3f6c']), 2.4);
  shine(c, -8, -7, 2.6, 4.5, 0.65);
}

// ---- 图标（HUD、升级卡片用，48x48） ----
const ICON_DRAW = {
  spatula: (c) => { c.rotate(-0.8); c.scale(1.4, 1.4); drawSpatulaArt(c); },
  heal: (c) => { c.scale(1.3, 1.3); drawBun(c); },
  gold: (c) => { c.scale(1.3, 1.3); drawCoin(c); },
  heart: (c) => { c.scale(1.2, 1.2); drawHeartArt(c); },
};
function buildIcons() {
  const res = Math.max(1, Math.ceil(view.ui * view.dpr * 1.7 * 2) / 2);
  SPR.icon = {};
  for (const id in ICON_DRAW) SPR.icon[id] = makeSprite(48, 48, ICON_DRAW[id], 24, 24, res);
}
function drawIcon(id, x, y, size, alpha = 1) {
  const s = SPR.icon[id];
  if (!s) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.c, x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = 1;
}

// 敌人外观表：绘制函数 + 精灵尺寸 + 摇摆动画速度
const ENEMY_ART = {
  broccoli: { draw: drawBroccoli, w: 46, h: 46, anim: 7 },
};
function buildEnemySprites(type, art) {
  const n = makeSprite(art.w, art.h, art.draw, art.ax ?? art.w / 2, art.ay ?? art.h / 2);
  SPR.enemy[type] = {
    n,
    w: tintSprite(n, '#ffffff', 0.85),   // 受击闪白
    f: tintSprite(n, '#8fd8ff', 0.45),   // 冰冻减速
    b: tintSprite(n, '#ff6a1f', 0.38),   // 灼烧
  };
}
function buildSprites() {
  const res = clamp(Math.ceil(view.zoom * view.dpr * 2) / 2, 1, 3);
  if (res === sprRes) return;
  sprRes = res;
  buildFloor();
  SPR.player = makeSprite(44, 60, drawChef, 22, 40);
  SPR.playerW = tintSprite(SPR.player, '#ffffff', 0.85);
  SPR.enemy = {};
  for (const type in ENEMY_ART) buildEnemySprites(type, ENEMY_ART[type]);
  SPR.spatula = makeSprite(36, 18, drawSpatulaArt);
  SPR.gem = GEM_COLORS.map((cols, i) => makeSprite(GEM_SIZE[i] * 2 + 6, GEM_SIZE[i] * 2 + 6, (c) => drawGem(c, cols, GEM_SIZE[i])));
  SPR.gemGlow = GEM_COLORS.map((cols) => glowSprite(cols[3], 40));
  // 屏幕暗角
  const vc = makeCanvas(256, 256), v = vc.getContext('2d');
  v.fillStyle = rg(v, 128, 128, 40, 182, ['rgba(8,6,16,0)', 'rgba(8,6,16,0.12)', 'rgba(8,6,16,0.6)']);
  v.fillRect(0, 0, 256, 256);
  SPR.vignette = vc;
}

// =====================================================================
// 武器数据：每把武器一条 { id, name, desc, labels, init, update }，数值在 CONFIG.weapons
// =====================================================================
const SRC = { spatula: 0, knife: 1, chili: 2, pepper: 3, pin: 4, frost: 5, pot: 6, fire: 7, vortex: 8, misc: 9 };
const N_SRC = 10; // 每个伤害来源对同一敌人有独立的命中冷却
const WEAPONS = {};
const WEAPON_ORDER = [];
function defWeapon(def) { WEAPONS[def.id] = def; WEAPON_ORDER.push(def.id); }
function wStats(w) { const c = CONFIG.weapons[w.id]; return w.evo ? c.evo : c.levels[w.lv - 1]; }

defWeapon({
  id: 'spatula', name: '飞锅铲', color: '#ffd166',
  desc: '自动朝最近的敌人扔出锅铲，可以穿透敌人。',
  labels: { dmg: '伤害', count: '数量', pierce: '穿透', cd: '冷却' },
  init(w) { w.cd = 0.2; w.queue = 0; w.qt = 0; w.targets = []; w.ti = 0; },
  update(w, s, dt) {
    const p = state.player;
    if (w.queue > 0) {
      w.qt -= dt;
      if (w.qt <= 0) { w.qt = 0.08; w.queue--; throwSpatula(w, s); }
    }
    w.cd -= dt;
    if (w.cd <= 0 && w.queue === 0) {
      if (nearestEnemies(p.x, p.y, s.range, s.count, w.targets) === 0) { w.cd = 0; return; }
      w.queue = s.count; w.qt = 0; w.ti = 0;
      w.cd = s.cd * p.cdMul;
    }
  },
});
function throwSpatula(w, s) {
  const p = state.player;
  let t = w.targets.length ? w.targets[w.ti++ % w.targets.length] : null;
  if (!t || t.dead) t = nearestEnemies(p.x, p.y, s.range * 1.2, 1, w.targets) ? w.targets[0] : null;
  const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facey, p.facex);
  const b = spawnBullet('spatula', w, p.x, p.y - 4, Math.cos(ang) * s.speed, Math.sin(ang) * s.speed);
  b.r = 10; b.dmg = s.dmg; b.pierce = s.pierce + 1; b.life = 1.4; b.kb = s.kb;
  b.spin = 17 * (Math.random() < 0.5 ? -1 : 1);
  Sound.play('throw');
}

// 被动道具表（第 4 步填充）与进化表（第 6 步填充）
const PASSIVES = {};
const PASSIVE_ORDER = [];
const EVOLUTIONS = [];

// =====================================================================
// 子弹（对象池）
// =====================================================================
const bulletPool = new Pool(() => ({ hits: [] }));
function spawnBullet(kind, w, x, y, vx, vy) {
  const b = bulletPool.get();
  b.dead = false; b.kind = kind; b.w = w; b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  b.r = 8; b.dmg = 0; b.pierce = 1; b.life = 1; b.t = 0; b.rot = Math.atan2(vy, vx); b.spin = 0; b.kb = 0;
  b.hits.length = 0; b.a = 0; b.b = 0; b.c = 0; b.tx = 0; b.ty = 0; b.mode = 0;
  state.bullets.push(b);
  return b;
}
const BULLET_UPDATE = {
  spatula(b, dt) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.spin * dt;
    if (b.t > b.life) { b.dead = true; return; }
    const n = query(b.x, b.y, b.r);
    for (let k = 0; k < n; k++) {
      const e = QR[k];
      if (b.hits.includes(e.id)) continue;
      b.hits.push(e.id);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      hurtEnemy(e, b.dmg, b.w, b.vx / sp, b.vy / sp, b.kb);
      if (--b.pierce <= 0) { b.dead = true; break; }
    }
  },
};
const BULLET_DRAW = {
  spatula(b) { drawSpr(SPR.spatula, b.x, b.y, 1, 1, b.rot); },
};

// =====================================================================
// 敌人（对象池）
// =====================================================================
const enemyPool = new Pool(() => ({ hitCd: new Float32Array(N_SRC) }));
const gemPool = new Pool(() => ({}));
function spawnEnemy(type, x, y) {
  const d = CONFIG.enemies[type];
  const e = enemyPool.get();
  const hpMul = 1 + CONFIG.difficulty.hpPerMin * (state.t / 60);
  e.dead = false; e.type = type; e.id = ++state.eid;
  e.x = x; e.y = y; e.vx = 0; e.vy = 0; e.kx = 0; e.ky = 0;
  e.r = d.r; e.hp = e.maxHp = d.hp * hpMul; e.speed = d.speed * rand(0.92, 1.08); e.dmg = d.dmg; e.mass = d.mass;
  e.flash = 0; e.stun = 0; e.slowT = 0; e.slow = 0; e.burnT = 0; e.burnDps = 0; e.burnAcc = 0; e.burnW = null;
  e.hitCd.fill(0);
  e.elite = false; e.boss = false; e.dash = false; e.scale = 1; e.t = 0; e.phase = Math.random() * TAU;
  e.face = x < state.player.x ? 1 : -1; e.rot = 0; e.mode = 0; e.modeT = 0; e.shootT = 0; e.dirx = 0; e.diry = 0;
  state.enemies.push(e);
  return e;
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
    facex: 1, facey: 0, flip: 1, walkT: 0, moving: false, hurtT: 0,
    might: 1, cdMul: 1, armor: 0, regen: 0, spdMul: 1, pickupMul: 1,
    weapons: [], passives: [],
  };
}

function newState() {
  return {
    t: 0,
    player: makePlayer(),
    slowmo: 0, slowmoScale: 1,
    enemies: [], bullets: [], gems: [], fx: [],
    kills: 0, eid: 0, spawnAcc: 0, noSpawn: false, dying: 0,
    level: 1, xp: 0, gold: 0, pendingLevels: 0, rerolls: CONFIG.levelUp.rerolls,
    pickCombo: 0, lastPick: -9, mergeT: 0,
  };
}

function startGame() {
  state = newState();
  cam.x = 0; cam.y = 0; cam.shake = 0;
  game.phase = 'play';
  addWeapon('spatula');
  for (let i = 0; i < CONFIG.spawn.opening; i++) spawnOne();
}

function addWeapon(id) {
  const w = { id, def: WEAPONS[id], lv: 1, evo: false, dmg: 0, born: state.t };
  w.def.init(w);
  state.player.weapons.push(w);
  return w;
}

function addPassive(id) {
  state.player.passives.push({ id, def: PASSIVES[id], lv: 1 });
  recalcStats();
}
const findWeapon = (id) => state.player.weapons.find((w) => w.id === id);
const findPassive = (id) => state.player.passives.find((x) => x.id === id);
const passiveLv = (id) => { const x = findPassive(id); return x ? x.lv : 0; };

// 根据被动道具重新计算主角属性
function recalcStats() {
  const p = state.player;
  const oldMax = p.maxHp;
  p.might = 1; p.cdMul = 1; p.armor = 0; p.regen = 0; p.spdMul = 1; p.pickupMul = 1; p.maxHp = CONFIG.player.hp;
  for (const ps of p.passives) ps.def.apply(p, ps.lv);
  if (p.maxHp > oldMax) p.hp += p.maxHp - oldMax;
  p.hp = Math.min(p.hp, p.maxHp);
}

function endRun(win) {
  game.phase = win ? 'win' : 'over';
  game.endAt = game.time;
}

function saveSettings() { store.set('kr_settings', game.settings); }

function autoPause() { if (game.phase === 'play') game.phase = 'pause'; }

// =====================================================================
// 刷怪与时间线
// =====================================================================
function curveAt(curve, t) {
  if (t <= curve[0][0]) return curve[0];
  for (let i = 1; i < curve.length; i++) {
    const b = curve[i];
    if (t < b[0]) { const a = curve[i - 1], k = (t - a[0]) / (b[0] - a[0]); return [t, lerp(a[1], b[1], k), lerp(a[2], b[2], k)]; }
  }
  return curve[curve.length - 1];
}
// 屏幕外一圈（矩形边）上的随机点
function edgePoint(margin) {
  const p = state.player;
  const hw = view.ww / 2 + margin, hh = view.wh / 2 + margin;
  let r = Math.random() * (4 * hw + 4 * hh);
  if (r < 2 * hw) return [p.x - hw + r, p.y - hh];
  r -= 2 * hw; if (r < 2 * hw) return [p.x - hw + r, p.y + hh];
  r -= 2 * hw; if (r < 2 * hh) return [p.x - hw, p.y - hh + r];
  r -= 2 * hh; return [p.x + hw, p.y - hh + r];
}
// 从玩家出发沿某个角度，落在屏幕外边缘的点
function edgePointDir(ang, margin) {
  const hw = view.ww / 2 + margin, hh = view.wh / 2 + margin;
  const c = Math.cos(ang), s = Math.sin(ang);
  const t = Math.min(hw / (Math.abs(c) || 1e-6), hh / (Math.abs(s) || 1e-6));
  return [state.player.x + c * t, state.player.y + s * t];
}
function pickEnemyType() { return 'broccoli'; }
function spawnOne() { const [x, y] = edgePoint(CONFIG.spawn.margin); spawnEnemy(pickEnemyType(), x, y); }
function updateSpawning(dt) {
  if (state.noSpawn) return;
  const c = curveAt(CONFIG.spawn.curve, state.t);
  state.spawnAcc += c[1] * dt;
  while (state.spawnAcc >= 1) {
    state.spawnAcc -= 1;
    if (state.enemies.length >= c[2]) { state.spawnAcc = 0; break; }
    spawnOne();
  }
}

// =====================================================================
// 战斗
// =====================================================================
const NE_D = new Float64Array(32);
// 找最近的 k 个敌人（k ≤ 32），结果写入 out，返回数量
function nearestEnemies(x, y, range, k, out) {
  out.length = 0;
  const r2 = range * range, list = state.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 > r2) continue;
    let j;
    if (out.length < k) { j = out.length; out.push(e); NE_D[j] = d2; }
    else if (d2 < NE_D[k - 1]) { j = k - 1; out[j] = e; NE_D[j] = d2; }
    else continue;
    while (j > 0 && NE_D[j] < NE_D[j - 1]) {
      const te = out[j]; out[j] = out[j - 1]; out[j - 1] = te;
      const td = NE_D[j]; NE_D[j] = NE_D[j - 1]; NE_D[j - 1] = td;
      j--;
    }
  }
  return out.length;
}

// 对敌人造成伤害；w 为来源武器（统计伤害用），(dx,dy) 为击退方向
function hurtEnemy(e, base, w, dx, dy, kb, noCrit) {
  if (e.dead) return 0;
  let dmg = base * state.player.might;
  let crit = false;
  if (!noCrit && Math.random() < CONFIG.combat.critChance) { dmg *= CONFIG.combat.critMul; crit = true; }
  e.hp -= dmg;
  e.flash = CONFIG.combat.hitFlash;
  if (kb && !e.boss) { const k = kb / e.mass; e.kx += dx * k; e.ky += dy * k; }
  if (w) w.dmg += dmg;
  onEnemyHit(e, dmg, crit);
  if (e.hp <= 0) killEnemy(e, w);
  return dmg;
}
function onEnemyHit() { Sound.play('hit'); }

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  state.kills++;
  Sound.play('kill');
  dropGems(e);
}

// ---- 经验晶 ----
function spawnGem(x, y, value) {
  const g = gemPool.get();
  g.dead = false; g.x = x; g.y = y; g.value = value; g.kind = gemKind(value);
  const a = Math.random() * TAU, s = rand(30, 90);
  g.vx = Math.cos(a) * s; g.vy = Math.sin(a) * s;
  g.attract = false; g.spd = 0; g.phase = Math.random() * TAU;
  state.gems.push(g);
  return g;
}
const gemKind = (v) => (v >= 50 ? 3 : v >= 20 ? 2 : v >= 5 ? 1 : 0);
function dropGems(e) {
  const D = CONFIG.drops, m = state.t / 60, V = CONFIG.gems.values;
  const n = CONFIG.enemies[e.type].gems || 1;
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const v = r < D.red + D.redPerMin * m ? V[2] : r < D.green + D.greenPerMin * m ? V[1] : V[0];
    spawnGem(e.x + rand(-4, 4), e.y + rand(-4, 4), v);
  }
}
function xpNeed(level) { return CONFIG.xp.base + level * CONFIG.xp.perLevel; }
function gainXp(v) {
  state.xp += v;
  while (state.xp >= xpNeed(state.level)) {
    state.xp -= xpNeed(state.level);
    state.level++;
    state.pendingLevels++;
  }
}
function collectGem(g) {
  g.dead = true;
  if (state.t - state.lastPick < CONFIG.gems.comboWindow) state.pickCombo++; else state.pickCombo = 0;
  state.lastPick = state.t;
  Sound.play('pick', state.pickCombo);
  gainXp(g.value);
}
// 地上晶体太多时就近合并（同一格子里的合成一个大晶体）
function mergeGems() {
  const gems = state.gems, max = CONFIG.gems.maxOnField;
  if (gems.length <= max) return;
  const cell = CONFIG.gems.mergeCell, map = new Map();
  for (const g of gems) {
    if (g.attract || g.dead) continue;
    const key = Math.floor(g.x / cell) * 100003 + Math.floor(g.y / cell);
    const t = map.get(key);
    if (!t) { map.set(key, g); continue; }
    t.value += g.value; t.kind = gemKind(t.value); g.dead = true;
  }
  compact(gems, gemPool);
  if (gems.length > max) { // 还是太多：最远的统统并进一个
    const p = state.player;
    gems.sort((a, b) => ((b.x - p.x) ** 2 + (b.y - p.y) ** 2) - ((a.x - p.x) ** 2 + (a.y - p.y) ** 2));
    const t = gems[0];
    for (let i = 1; i <= gems.length - max + 20 && i < gems.length; i++) { if (gems[i].attract) continue; t.value += gems[i].value; gems[i].dead = true; }
    t.kind = gemKind(t.value);
    compact(gems, gemPool);
  }
}

// 升级瞬间：金光 + 震开周围敌人
function levelUpBurst() {
  const p = state.player, R = CONFIG.levelUp.shockRadius, F = CONFIG.levelUp.shockForce;
  for (const e of state.enemies) {
    if (e.dead || e.boss) continue;
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d > R) continue;
    const k = (F * (1 - d / R * 0.6)) / e.mass;
    e.kx += (dx / d) * k; e.ky += (dy / d) * k;
  }
  game.flashAt = game.time;
  addRing(p.x, p.y, R, 0.45, 'rgba(255,214,102,0.9)', 7);
  Sound.play('levelup');
}

// ---- 简单特效：冲击波圆环 ----
function addRing(x, y, r, dur, color, lw = 4) {
  state.fx.push({ kind: 'ring', x, y, r, t: 0, dur, color, lw });
}

function hurtPlayer(raw) {
  const p = state.player;
  if (p.invuln > 0 || p.hp <= 0 || game.god) return;
  const dmg = Math.max(1, raw - p.armor);
  p.hp -= dmg;
  p.invuln = CONFIG.player.invuln;
  p.hurtT = 0.35;
  shake(0.32);
  Sound.play('hurt');
  if (p.hp <= 0) {
    p.hp = 0;
    state.dying = 0.55;
    state.slowmo = 1.6; state.slowmoScale = 0.3;
    shake(0.6);
  }
}
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

function updateWeapons(dt) {
  const ws = state.player.weapons;
  for (let i = 0; i < ws.length; i++) ws[i].def.update(ws[i], wStats(ws[i]), dt);
}

function updateBullets(dt) {
  const list = state.bullets;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.dead) continue;
    b.t += dt;
    BULLET_UPDATE[b.kind](b, dt);
  }
}

function updateGems(dt) {
  const p = state.player, gems = state.gems;
  const pr = CONFIG.player.pickup * p.pickupMul, pr2 = pr * pr;
  const fr = Math.exp(-dt * 5), acc = CONFIG.gems.attractAccel * dt;
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (g.dead) continue;
    const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
    if (!g.attract) {
      if (d2 < pr2 || state.vacuum) { g.attract = true; g.spd = -CONFIG.gems.popSpeed; }
      else { g.x += g.vx * dt; g.y += g.vy * dt; g.vx *= fr; g.vy *= fr; continue; }
    }
    g.spd += acc;
    const d = Math.sqrt(d2) || 1, stepLen = g.spd * dt;
    if (d < p.r + 6 || stepLen >= d) { collectGem(g); continue; }
    g.x += (dx / d) * stepLen; g.y += (dy / d) * stepLen;
  }
  state.vacuum = false;
  state.mergeT -= dt;
  if (state.mergeT <= 0) { state.mergeT = 0.5; mergeGems(); }
  if (state.pendingLevels > 0) { levelUpBurst(); openLevelUp('level'); }
}

function updateFx(dt) {
  const fx = state.fx;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.t += dt;
    if (f.t >= f.dur) fx.splice(i, 1);
  }
}

function updateEnemies(dt) {
  const p = state.player, list = state.enemies;
  const leashX = view.ww / 2 + CONFIG.spawn.leash, leashY = view.wh / 2 + CONFIG.spawn.leash;
  const kd = Math.exp(-dt * 9);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.flash > 0) e.flash -= dt;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    // 掉队太远：挪到玩家前方的屏幕外（保持压力）
    if (!e.boss && (Math.abs(dx) > leashX || Math.abs(dy) > leashY)) {
      if (e.dash) { e.dead = true; continue; }
      const [nx, ny] = edgePointDir(Math.atan2(dy, dx) + rand(-0.7, 0.7), CONFIG.spawn.margin);
      e.x = nx; e.y = ny; e.kx = e.ky = 0;
      continue;
    }
    let spd = e.speed;
    if (e.slowT > 0) { e.slowT -= dt; spd *= 1 - e.slow; }
    let mvx = 0, mvy = 0;
    if (e.stun > 0) e.stun -= dt;
    else { mvx = (dx / d) * spd; mvy = (dy / d) * spd; }
    e.vx = mvx; e.vy = mvy;
    e.x += (mvx + e.kx) * dt; e.y += (mvy + e.ky) * dt;
    e.kx *= kd; e.ky *= kd;
    if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1;
    // 接触伤害 + 不让敌人叠进主角身体里
    const ex = e.x - p.x, ey = e.y - p.y, ed2 = ex * ex + ey * ey;
    const cr = e.r + p.r * 0.75;
    if (ed2 < cr * cr) {
      hurtPlayer(e.dmg);
      const minD = (e.r + p.r) * 0.82, ed = Math.sqrt(ed2) || 1;
      if (ed < minD) { e.x = p.x + (ex / ed) * minD; e.y = p.y + (ey / ed) * minD; }
    }
  }
  separate();
}

// 敌人之间柔性推开，避免叠成一坨
function separate() {
  const list = state.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead || e.dash) continue;
    const n = query(e.x, e.y, e.r * 0.9);
    let px = 0, py = 0;
    for (let k = 0; k < n; k++) {
      const o = QR[k];
      if (o === e || o.dash) continue;
      let dx = e.x - o.x, dy = e.y - o.y, d2 = dx * dx + dy * dy;
      const rs = (e.r + o.r) * 0.9;
      if (d2 >= rs * rs) continue;
      if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
      const d = Math.sqrt(d2);
      const push = ((rs - d) / d) * (o.mass / (e.mass + o.mass)) * 0.5;
      px += dx * push; py += dy * push;
    }
    e.x += px; e.y += py;
  }
}

function update(dt) {
  const p = state.player;
  gridBuild(state.enemies);
  if (state.dying > 0) {
    state.dying -= dt;
    if (state.dying <= 0) { endRun(false); return; }
  } else {
    state.t += dt;
    updatePlayer(dt);
    updateWeapons(dt);
    updateSpawning(dt);
  }
  updateBullets(dt);
  updateEnemies(dt);
  if (state.dying <= 0) updateGems(dt);
  updateFx(dt);
  updateCamera(dt, p.x, p.y);
  compact(state.enemies, enemyPool);
  compact(state.bullets, bulletPool);
  compact(state.gems, gemPool);
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

function drawGems() {
  const gems = state.gems, t = state.t;
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (!onScreen(g.x, g.y, 40)) continue;
    const s = 0.55 + g.kind * 0.12 + (g.kind === 3 ? Math.min(0.6, g.value / 400) : 0);
    drawSpr(SPR.gemGlow[g.kind], g.x, g.y, s * (1 + Math.sin(t * 5 + g.phase) * 0.12), s);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < gems.length; i++) {
    const g = gems[i];
    if (!onScreen(g.x, g.y, 40)) continue;
    const big = g.kind === 3 ? 1 + Math.min(0.5, g.value / 500) : 1;
    drawSpr(SPR.gem[g.kind], g.x, g.y + Math.sin(t * 3.2 + g.phase) * 1.6, big, big, Math.sin(t * 2 + g.phase) * 0.15);
  }
}

function drawFx() {
  setWorld();
  for (const f of state.fx) {
    if (f.kind === 'ring') {
      const k = f.t / f.dur, e = easeOutCubic(k);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = f.color; ctx.lineWidth = f.lw * (1 - k * 0.7);
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * e, 0, TAU); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

const byY = (a, b) => a.y - b.y;
function drawEnemies() {
  const list = state.enemies, m = 90;
  list.sort(byY);
  // 影子一次性批量画
  setWorld();
  ctx.fillStyle = 'rgba(8,6,18,0.26)';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!onScreen(e.x, e.y, m)) continue;
    const rx = e.r * e.scale * 0.95, ry = rx * 0.36, y = e.y + e.r * e.scale * 0.92;
    ctx.moveTo(e.x + rx, y); ctx.ellipse(e.x, y, rx, ry, 0, 0, TAU);
  }
  ctx.fill();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!onScreen(e.x, e.y, m)) continue;
    const art = SPR.enemy[e.type];
    const v = e.flash > 0 ? art.w : e.burnT > 0 ? art.b : e.slowT > 0 ? art.f : art.n;
    const ph = e.stun > 0 ? e.phase : e.t * ENEMY_ART[e.type].anim + e.phase;
    const sq = Math.sin(ph) * 0.07, sc = e.scale;
    drawSpr(v, e.x, e.y, sc * (1 + sq) * e.face, sc * (1 - sq), e.rot + Math.sin(ph * 0.5) * 0.07);
  }
}

function drawBullets() {
  const list = state.bullets;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (onScreen(b.x, b.y, 60)) BULLET_DRAW[b.kind](b);
  }
}

function drawPlayer() {
  const p = state.player;
  if (p.hp <= 0) { // 倒地
    drawShadow(p.x, p.y + 15, 15, 5);
    const k = clamp(1 - state.dying / 0.55, 0, 1);
    drawSpr(SPR.player, p.x, p.y + 6 * k, p.flip, 1, p.flip * k * Math.PI / 2);
    return;
  }
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
  drawGems();
  drawEnemies();
  drawPlayer();
  drawBullets();
  drawFx();
  // 暗角
  setUI();
  ctx.drawImage(SPR.vignette, 0, 0, view.w, view.h);
  // 升级金光
  const fk = game.flashAt != null ? 1 - (game.time - game.flashAt) / 0.7 : 0;
  if (fk > 0) {
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, 0, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
    g.addColorStop(0, `rgba(255,230,140,${0.18 * fk})`);
    g.addColorStop(1, `rgba(255,190,60,${0.55 * fk})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  }
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

function renderXpBar() {
  const u = view.ui, h = 14 * u, W = view.w;
  ctx.fillStyle = 'rgba(14,10,22,0.78)'; ctx.fillRect(0, 0, W, h + 4 * u);
  const f = clamp(state.xp / xpNeed(state.level), 0, 1);
  if (f > 0) {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#45c6ff'); g.addColorStop(1, '#8b6bff');
    ctx.fillStyle = g; ctx.fillRect(2 * u, 2 * u, (W - 4 * u) * f, h);
    ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(2 * u, 2 * u, (W - 4 * u) * f, h * 0.35);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.strokeRect(1.5 * u, 1.5 * u, W - 3 * u, h + 1 * u);
  textO(`Lv ${state.level}`, W - 10 * u, 2 * u + h / 2 + 0.5, 13 * u, '#ffffff', OL, 3.5 * u, 'right');
}

function renderHUD() {
  setUI();
  const u = view.ui;
  renderXpBar();
  textO(fmtTime(state.t), view.w - 22 * u, 48 * u, 30 * u, '#fff7ec', OL, 5 * u, 'right');
  textO(`击杀 ${state.kills}`, view.w - 22 * u, 78 * u, 17 * u, '#ffd9a8', OL, 4 * u, 'right');
  if (state.gold > 0) textO(`金币 ${state.gold}`, view.w - 22 * u, 100 * u, 15 * u, '#ffe27a', OL, 4 * u, 'right');
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

// =====================================================================
// 升级三选一
// =====================================================================
function buildChoices() {
  const p = state.player, out = [];
  for (const ev of EVOLUTIONS) if (out.length < 3 && canEvolve(ev)) out.push({ kind: 'evo', id: ev.weapon, ev });
  const pool = [];
  for (const id of WEAPON_ORDER) {
    const w = findWeapon(id);
    if (w) { if (!w.evo && w.lv < CONFIG.weapons[id].levels.length) pool.push({ kind: 'wup', id, wt: 1.25 }); }
    else if (p.weapons.length < 6) pool.push({ kind: 'wnew', id, wt: p.weapons.length < 3 ? 1.35 : 0.9 });
  }
  for (const id of PASSIVE_ORDER) {
    const ps = findPassive(id);
    // 能和已有武器组成进化的被动，出现概率高一点
    const pairs = EVOLUTIONS.some((ev) => ev.passive === id && p.weapons.some((w) => w.id === ev.weapon && !w.evo));
    if (ps) { if (ps.lv < 5) pool.push({ kind: 'pup', id, wt: 0.9 * (pairs ? 1.3 : 1) }); }
    else if (p.passives.length < 6) pool.push({ kind: 'pnew', id, wt: 0.8 * (pairs ? 1.7 : 1) });
  }
  while (out.length < 3 && pool.length) {
    let sum = 0;
    for (const c of pool) sum += c.wt;
    let r = Math.random() * sum, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].wt; if (r <= 0) break; }
    out.push(pool.splice(i, 1)[0]);
  }
  // 全都满级了：给回血或金币
  if (out.length < 3) out.push({ kind: 'heal' });
  if (out.length < 3) out.push({ kind: 'gold' });
  return out;
}
function canEvolve(ev) {
  const w = findWeapon(ev.weapon);
  return !!(w && !w.evo && w.lv >= CONFIG.weapons[ev.weapon].levels.length && findPassive(ev.passive));
}

function openLevelUp(kind) {
  if (game.phase !== 'play') return;
  const pending = kind === 'chest' ? 1 : state.pendingLevels;
  if (kind !== 'chest') state.pendingLevels = 0;
  game.phase = 'levelup';
  game.lv = { kind, pending, choices: buildChoices(), t0: game.time, hover: -1, sel: 0, rects: [], lift: [0, 0, 0], reroll: null };
}

function applyChoice(ch) {
  const p = state.player;
  switch (ch.kind) {
    case 'wnew': addWeapon(ch.id); break;
    case 'wup': findWeapon(ch.id).lv++; break;
    case 'pnew': addPassive(ch.id); break;
    case 'pup': findPassive(ch.id).lv++; recalcStats(); break;
    case 'evo': evolveWeapon(ch.ev); break;
    case 'heal': p.hp = Math.min(p.maxHp, p.hp + CONFIG.levelUp.healAmount); break;
    case 'gold': state.gold += CONFIG.levelUp.goldAmount; break;
  }
}
function evolveWeapon() {}

function chooseCard(i) {
  const L = game.lv, ch = L.choices[i];
  if (!ch) return;
  applyChoice(ch);
  Sound.play('select');
  L.pending--;
  if (L.pending > 0 && game.phase === 'levelup') {
    L.choices = buildChoices(); L.t0 = game.time; L.sel = 0; L.lift = [0, 0, 0];
  } else if (game.phase === 'levelup') game.phase = 'play';
}
function rerollCards() {
  if (state.rerolls <= 0) return;
  state.rerolls--;
  const L = game.lv;
  L.choices = buildChoices(); L.t0 = game.time - 0.1; L.lift = [0, 0, 0];
  Sound.play('select');
}

function handleLevelUpInput() {
  const L = game.lv, n = L.choices.length, m = input.mouse;
  const inRect = (r) => r && m.x >= r[0] && m.x <= r[0] + r[2] && m.y >= r[1] && m.y <= r[1] + r[3];
  const prevHover = L.hover;
  L.hover = -1;
  for (let i = 0; i < n; i++) if (inRect(L.rects[i])) L.hover = i;
  if (L.hover >= 0 && L.hover !== prevHover) L.sel = L.hover;
  if (game.time - L.t0 < CONFIG.levelUp.inputDelay) return; // 防止连按误选
  let pickI = -1;
  if (pressed('Digit1', 'Numpad1')) pickI = 0;
  if (pressed('Digit2', 'Numpad2')) pickI = 1;
  if (pressed('Digit3', 'Numpad3')) pickI = 2;
  if (pressed('ArrowLeft', 'KeyA')) L.sel = (L.sel + n - 1) % n;
  if (pressed('ArrowRight', 'KeyD')) L.sel = (L.sel + 1) % n;
  if (pressed('Space', 'Enter', 'NumpadEnter')) pickI = L.sel;
  if (m.click) { if (L.hover >= 0) pickI = L.hover; else if (inRect(L.reroll)) rerollCards(); }
  if (pressed('KeyR')) rerollCards();
  if (pickI >= 0 && pickI < n) chooseCard(pickI);
}

function fmtNum(v) { return Number.isInteger(v) ? String(v) : String(+v.toFixed(2)); }
function fmtStat(def, key, v) {
  const L = def.labels[key];
  const unit = Array.isArray(L) ? L[1] || '' : '', scale = Array.isArray(L) ? L[2] || 1 : 1;
  return fmtNum(v * scale) + unit;
}
const labelOf = (def, key) => (Array.isArray(def.labels[key]) ? def.labels[key][0] : def.labels[key]);
function cardInfo(ch) {
  switch (ch.kind) {
    case 'wnew': {
      const d = WEAPONS[ch.id], s = CONFIG.weapons[ch.id].levels[0];
      const stats = Object.keys(d.labels).slice(0, 3).map((k) => `${labelOf(d, k)} ${fmtStat(d, k, s[k])}`).join(' · ');
      return { tag: '新武器', color: '#ff9f43', name: d.name, icon: ch.id, lv: 0, lines: [d.desc, stats] };
    }
    case 'wup': {
      const w = findWeapon(ch.id), d = w.def, lv = CONFIG.weapons[ch.id].levels, a = lv[w.lv - 1], b = lv[w.lv];
      const lines = [];
      for (const k in d.labels) if (a[k] !== b[k]) lines.push(`${labelOf(d, k)}  ${fmtStat(d, k, a[k])} → ${fmtStat(d, k, b[k])}`);
      return { tag: '武器升级', color: '#ffc94d', name: d.name, icon: ch.id, lv: w.lv, lines };
    }
    case 'pnew': {
      const d = PASSIVES[ch.id];
      return { tag: '新道具', color: '#4fd1c5', name: d.name, icon: ch.id, lv: 0, lines: [d.desc, `${d.label} ${d.total(1)}`] };
    }
    case 'pup': {
      const ps = findPassive(ch.id), d = ps.def;
      return { tag: '道具升级', color: '#63e6be', name: d.name, icon: ch.id, lv: ps.lv, lines: [d.desc, `${d.label}  ${d.total(ps.lv)} → ${d.total(ps.lv + 1)}`] };
    }
    case 'evo': {
      const ev = ch.ev;
      return { tag: '进化！', color: '#ffd23f', name: ev.name, icon: ev.weapon, lv: -1, evo: true,
        lines: [`${WEAPONS[ev.weapon].name} + ${PASSIVES[ev.passive].name}`, ev.desc] };
    }
    case 'heal': return { tag: '补给', color: '#ff7eb6', name: '热腾腾的包子', icon: 'heal', lv: -1, lines: [`立即恢复 ${CONFIG.levelUp.healAmount} 点生命`] };
    default: return { tag: '补给', color: '#ffd23f', name: '一袋金币', icon: 'gold', lv: -1, lines: [`金币 +${CONFIG.levelUp.goldAmount}`] };
  }
}

const NO_BREAK = '，。、；：！？）》」…—·';
function wrapText(str, maxW, size, weight = 'normal') {
  ctx.font = font(size, weight);
  const out = [];
  let line = '';
  for (const ch of str) {
    const test = line + ch;
    if (line && ctx.measureText(test).width > maxW && !NO_BREAK.includes(ch)) { out.push(line); line = ch; }
    else line = test;
  }
  if (line) out.push(line);
  return out;
}

function drawCard(info, x, y, w, h, idx, hot, appear) {
  const u = view.ui, t = game.time;
  ctx.save();
  ctx.globalAlpha = appear;
  // 外发光
  if (hot || info.evo) {
    ctx.shadowColor = info.evo ? 'rgba(255,210,63,0.9)' : info.color;
    ctx.shadowBlur = (info.evo ? 26 + Math.sin(t * 5) * 10 : 18) * u;
  }
  rr(ctx, x, y, w, h, 16 * u);
  ctx.fillStyle = lg(ctx, x, y, x, y + h, hot ? ['#3d3254', '#251f33'] : ['#322a45', '#1e1929']);
  ctx.fill();
  ctx.shadowBlur = 0;
  // 边框（进化卡为流动的金边）
  ctx.lineWidth = (hot ? 3.5 : 2.5) * u;
  if (info.evo) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    const o = (t * 0.6) % 1;
    g.addColorStop(0, '#b8860b'); g.addColorStop(o, '#fff6bf'); g.addColorStop(Math.min(1, o + 0.15), '#ffd23f'); g.addColorStop(1, '#b8860b');
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = hot ? info.color : 'rgba(255,255,255,0.16)';
  ctx.stroke();
  // 顶部标签
  ctx.font = font(13 * u);
  const tw = ctx.measureText(info.tag).width + 20 * u;
  rr(ctx, x + 14 * u, y + 14 * u, tw, 24 * u, 12 * u); ctx.fillStyle = info.color; ctx.fill();
  text(info.tag, x + 14 * u + tw / 2, y + 26.5 * u, 13 * u, '#231a2c');
  // 数字键提示
  rr(ctx, x + w - 38 * u, y + 14 * u, 24 * u, 24 * u, 7 * u);
  ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
  text(String(idx + 1), x + w - 26 * u, y + 26.5 * u, 14 * u, 'rgba(255,255,255,0.75)');
  // 图标
  const icx = x + w / 2, icy = y + 92 * u;
  ctx.fillStyle = rg(ctx, icx, icy, 4 * u, 46 * u, [info.evo ? 'rgba(255,214,90,0.55)' : 'rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']);
  ctx.beginPath(); ctx.arc(icx, icy, 46 * u, 0, TAU); ctx.fill();
  drawIcon(info.icon, icx, icy + Math.sin(t * 2.5 + idx) * 2 * u, 70 * u, appear);
  // 名称
  textO(info.name, icx, y + 156 * u, 23 * u, info.evo ? '#ffe680' : '#ffffff', OL, 4 * u);
  // 等级宝石
  let ly = y + 186 * u;
  if (info.lv >= 0) {
    for (let k = 0; k < 5; k++) {
      const px = icx + (k - 2) * 19 * u, s = 6 * u;
      ctx.beginPath(); ctx.moveTo(px, ly - s); ctx.lineTo(px + s, ly); ctx.lineTo(px, ly + s); ctx.lineTo(px - s, ly); ctx.closePath();
      if (k < info.lv) ctx.fillStyle = '#ffd23f';
      else if (k === info.lv) ctx.fillStyle = `rgba(255,236,150,${0.45 + Math.sin(t * 6) * 0.35})`;
      else ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fill();
    }
    text(info.lv === 0 ? '新获得' : `Lv ${info.lv} → Lv ${info.lv + 1}`, icx, ly + 20 * u, 13 * u, '#cbbfe0', 'center', 'normal');
    ly += 46 * u;
  } else ly += 6 * u;
  // 描述
  ctx.globalAlpha = appear;
  for (const line of info.lines) {
    for (const seg of wrapText(line, w - 36 * u, 15 * u)) {
      text(seg, icx, ly, 15 * u, line.includes('→') ? '#9ff0c0' : '#ece4f7', 'center', 'normal');
      ly += 21 * u;
    }
    ly += 4 * u;
  }
  ctx.restore();
}

function renderLevelUp() {
  const L = game.lv, u = view.ui, t = game.time - L.t0, cx = view.w / 2, cy = view.h / 2;
  dim(0.58 * clamp(t / 0.15, 0, 1));
  const ta = easeOutBack(clamp(t / 0.35, 0, 1));
  const title = L.kind === 'chest' ? '宝箱奖励！' : `升级！ Lv ${state.level}`;
  ctx.save();
  ctx.translate(cx, cy - 215 * u);
  ctx.scale(ta, ta);
  ctx.font = font(44 * u, '900'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 10 * u; ctx.strokeStyle = OL; ctx.strokeText(title, 0, 0);
  ctx.fillStyle = lg(ctx, 0, -22 * u, 0, 22 * u, ['#fff1a8', '#ffb340']); ctx.fillText(title, 0, 0);
  ctx.restore();
  text(L.pending > 1 ? `选择一项强化（还有 ${L.pending - 1} 次）` : '选择一项强化', cx, cy - 172 * u, 16 * u, '#d9cdee', 'center', 'normal');
  const n = L.choices.length, cw = 232 * u, ch = 318 * u, gap = 24 * u;
  const x0 = cx - (n * cw + (n - 1) * gap) / 2, y0 = cy - ch / 2 + 6 * u;
  const hot = L.hover >= 0 ? L.hover : L.sel;
  for (let i = 0; i < n; i++) {
    const a = clamp((t - i * 0.06) / 0.32, 0, 1);
    L.lift[i] = lerp(L.lift[i] || 0, i === hot ? 1 : 0, 0.25);
    const x = x0 + i * (cw + gap), y = y0 + (1 - easeOutBack(a)) * 90 * u - L.lift[i] * 10 * u;
    L.rects[i] = [x, y, cw, ch];
    drawCard(cardInfo(L.choices[i]), x, y, cw, ch, i, i === hot, a);
  }
  // 重抽按钮
  const bw = 200 * u, bh = 40 * u, bx = cx - bw / 2, by = y0 + ch + 26 * u;
  const can = state.rerolls > 0;
  L.reroll = [bx, by, bw, bh];
  rr(ctx, bx, by, bw, bh, 20 * u);
  ctx.fillStyle = can ? 'rgba(126,99,255,0.85)' : 'rgba(90,80,110,0.5)'; ctx.fill();
  ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
  text(`重抽（R） 剩余 ${state.rerolls} 次`, cx, by + bh / 2 + 1, 16 * u, can ? '#ffffff' : 'rgba(255,255,255,0.45)');
  text('按 1 / 2 / 3、方向键 + 空格，或直接点击卡片', cx, by + bh + 26 * u, 14 * u, 'rgba(230,220,245,0.6)', 'center', 'normal');
}

function renderOver() {
  const k = clamp((game.time - game.endAt) / 0.5, 0, 1);
  dim(0.7 * k);
  const u = view.ui, cx = view.w / 2, cy = view.h / 2;
  ctx.globalAlpha = k;
  textO('你被食材淹没了……', cx, cy - 60 * u, 46 * u, '#ff8a7a', OL, 8 * u);
  text(`存活 ${fmtTime(state.t)}  ·  击杀 ${state.kills}`, cx, cy + 6 * u, 22 * u, '#f3e9ff');
  if (Math.sin(game.time * 5) > -0.3) textO('按 R 重新开始', cx, cy + 70 * u, 26 * u, '#ffffff', OL, 6 * u);
  ctx.globalAlpha = 1;
}

function renderDebug() {
  setUI();
  const lines = [`FPS ${game.fps.toFixed(0)}`, `更新 ${game.upMs.toFixed(2)}ms  绘制 ${game.drawMs.toFixed(2)}ms`];
  if (state) lines.push(`敌人 ${state.enemies.length}  子弹 ${state.bullets.length}  晶体 ${state.gems.length}`);
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
      if (game.debug && pressed('KeyL')) { state.xp = xpNeed(state.level); gainXp(0); }
      break;
    case 'pause':
      if (pressed(...KEYS.pause) || input.mouse.click) game.phase = 'play';
      break;
    case 'levelup':
      handleLevelUpInput();
      break;
    case 'over':
    case 'win':
      if (pressed(...KEYS.restart) && game.time - game.endAt > 0.4) startGame();
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
  else if (game.phase === 'over') renderOver();
  else if (game.phase === 'levelup') renderLevelUp();
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
