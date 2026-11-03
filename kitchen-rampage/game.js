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
  combat: { critChance: 0.1, critMul: 2, hitFlash: 0.05, flashGap: 0.1 },
  audio: { volume: 0.5, heartbeat: 0.9 },
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
  fx: { maxParticles: 900, maxTexts: 90, killChips: 5 },
  // 被动道具：每级效果
  passives: {
    whetstone: { might: 0.10 },          // 磨刀石：伤害 +10%
    shoes: { speed: 0.08 },              // 跑鞋：移速 +8%
    apron: { hp: 20, regen: 0.2 },       // 围裙：最大生命 +20，每秒回 0.2
    magnet: { pickup: 0.25 },            // 大磁铁：拾取半径 +25%
    clock: { cd: 0.08 },                 // 闹钟：武器冷却 -8%
    wrap: { armor: 1 },                  // 保鲜膜：受到伤害 -1
  },
  enemies: {
    broccoli: { name: '西兰花', r: 15, hp: 18, speed: 48, dmg: 8, mass: 1.6, colors: ['#5fbf55', '#2f7d32', '#a5d67a'] },
    chili: { name: '小辣椒', r: 10, hp: 7, speed: 100, dmg: 5, mass: 0.7, pack: [3, 6], colors: ['#ff4d4d', '#c8102e', '#6fcf5b'] },
    egg: { name: '鸡蛋', r: 14, hp: 26, speed: 58, dmg: 8, mass: 1.3, split: 3, colors: ['#fffaf0', '#efe3cc', '#ffcf3f'] },
    yolk: { name: '小蛋黄', r: 8, hp: 6, speed: 92, dmg: 4, mass: 0.6, gemChance: 0.5, colors: ['#ffcf3f', '#ff9f1c', '#fff3c0'] },
    onion: { name: '洋葱', r: 15, hp: 32, speed: 55, dmg: 9, mass: 1.5, gasR: 60, gasLife: 4, gasSlow: 0.4, colors: ['#c39cf0', '#8e5cc9', '#efe2ff'] },
    potato: {
      name: '土豆炮手', r: 15, hp: 42, speed: 68, dmg: 8, mass: 2, gems: 2, keep: 270, shootCd: 2.6, windup: 0.45,
      bullet: { speed: 185, dmg: 7, r: 7, life: 4 }, colors: ['#c69060', '#8d5f38', '#e8c39b'],
    },
    boss: { name: '西瓜大王', r: 62, hp: 5000, speed: 52, dmg: 18, mass: 60, colors: ['#4caf50', '#2e7d32', '#e8344a', '#2b1d2e', '#9be07a'] },
  },
  elite: { scale: 1.5, hpMul: 10, dmgMul: 1.5, speedMul: 0.95, massMul: 4, redGems: 3 },
  pickups: { bunChance: 0.006, bunHeal: 30, maxBuns: 3, magnetChance: 0.0012, chestHeal: 20 },
  // 不同时间段各种敌人的出现权重（取不超过当前时间的最后一档）
  spawnWeights: [
    [0, { broccoli: 1 }],
    [45, { broccoli: 0.75, chili: 0.25 }],
    [120, { broccoli: 0.5, chili: 0.25, egg: 0.25 }],
    [180, { broccoli: 0.35, chili: 0.25, egg: 0.2, onion: 0.2 }],
    [240, { broccoli: 0.28, chili: 0.24, egg: 0.18, onion: 0.18, potato: 0.12 }],
    [390, { broccoli: 0.32, chili: 0.3, egg: 0.16, onion: 0.14, potato: 0.08 }],
  ],
  // 时间线事件（秒）
  events: [
    { t: 60, type: 'chiliRush', count: 26, speed: 230, warn: 1.6 },
    { t: 150, type: 'elite' },
    { t: 180, type: 'banner', text: '食材大军增援！', sub: '敌人密度翻倍', color: '#ff9f43' },
    { t: 240, type: 'elite' },
    { t: 300, type: 'ring', count: 56 },
    { t: 330, type: 'elite' },
    { t: 390, type: 'horde', burst: 90 },
    { t: 420, type: 'elite' },
    { t: 450, type: 'clear' },
    { t: 480, type: 'boss' },
  ],
  // Boss【西瓜大王】
  boss: {
    speed: 52, rollDmg: 24,
    chaseTime: [3.0, 4.2],           // 追击多久后发动滚动冲撞
    windup: 0.9,                     // 冲撞前蓄力（地上会出现红色预警）
    rollSpeed: 440, rollTime: 1.25, recover: 0.7,
    seeds: 10, seedSpeed: 150, seedDmg: 6,
    split: 0.5,                      // 血量过半裂成两个小西瓜
    halfScale: 0.68, halfSpeedMul: 1.25, halfSeeds: 7,
    adds: { rate: 1.6, max: 45 },    // 打 Boss 时继续刷少量小怪（给经验）
    redGems: 10,
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
      // 进化：铁锅暴雨（锅铲照扔，另外每秒砸 8 口锅）
      evo: { dmg: 22, count: 3, pierce: 4, cd: 0.75, speed: 500, range: 580, kb: 120, pots: 8, potDmg: 45, potR: 62, fall: 0.5 },
    },
    knife: {
      levels: [
        { dmg: 9, count: 2, radius: 68, spin: 3.3, hitCd: 0.4, kb: 140 },
        { dmg: 9, count: 3, radius: 68, spin: 3.3, hitCd: 0.4, kb: 140 },
        { dmg: 12, count: 3, radius: 82, spin: 3.6, hitCd: 0.4, kb: 150 },
        { dmg: 12, count: 4, radius: 82, spin: 4.0, hitCd: 0.38, kb: 150 },
        { dmg: 15, count: 5, radius: 96, spin: 4.3, hitCd: 0.36, kb: 160 },
      ],
      // 进化：料理旋风（刀数翻倍、半径脉动、刀光拖尾）
      evo: { dmg: 20, count: 10, radius: 108, pulse: 0.42, pulseSpeed: 2.2, spin: 4.6, hitCd: 0.3, kb: 180 },
    },
    chili: {
      levels: [
        { dmg: 5, burn: 4, range: 125, angle: 50, cd: 2.4, dur: 1.0, tick: 0.15 },
        { dmg: 5, burn: 4, range: 150, angle: 50, cd: 2.4, dur: 1.0, tick: 0.15 },
        { dmg: 7, burn: 7, range: 150, angle: 55, cd: 2.3, dur: 1.0, tick: 0.15 },
        { dmg: 7, burn: 7, range: 175, angle: 70, cd: 2.2, dur: 1.1, tick: 0.15 },
        { dmg: 9, burn: 10, range: 205, angle: 75, cd: 2.0, dur: 1.3, tick: 0.15 },
      ],
      // 进化：地狱火锅（火焰更猛，脚下留下燃烧 3 秒的红油）
      evo: { dmg: 11, burn: 14, range: 240, angle: 85, cd: 1.1, dur: 1.4, tick: 0.12, trail: 3, trailR: 30, trailDmg: 12, trailTick: 0.35, trailGap: 22 },
    },
    pepper: {
      levels: [
        { dmg: 20, radius: 80, cd: 3.0, count: 1, stun: 1.0, kb: 260 },
        { dmg: 20, radius: 95, cd: 3.0, count: 1, stun: 1.0, kb: 260 },
        { dmg: 26, radius: 95, cd: 2.6, count: 1, stun: 1.2, kb: 280 },
        { dmg: 26, radius: 110, cd: 2.6, count: 2, stun: 1.2, kb: 280 },
        { dmg: 32, radius: 125, cd: 2.2, count: 2, stun: 1.4, kb: 300 },
      ],
      // 进化：黑胡椒风暴（先吸到中心再炸开）
      evo: { dmg: 70, radius: 165, cd: 2.4, count: 2, stun: 1.6, kb: 380, pullR: 240, pullTime: 1.1, pullSpeed: 300, tickDmg: 6 },
    },
    pin: {
      levels: [
        { dmg: 15, count: 1, dist: 220, cd: 1.6, kb: 150, hitCd: 0.35 },
        { dmg: 15, count: 2, dist: 220, cd: 1.6, kb: 150, hitCd: 0.35 },
        { dmg: 19, count: 2, dist: 270, cd: 1.6, kb: 160, hitCd: 0.35 },
        { dmg: 19, count: 3, dist: 270, cd: 1.5, kb: 160, hitCd: 0.33 },
        { dmg: 24, count: 4, dist: 320, cd: 1.4, kb: 170, hitCd: 0.3 },
      ],
    },
    frost: {
      levels: [
        { dmg: 3, radius: 72, slow: 0.25, tick: 0.4 },
        { dmg: 4, radius: 86, slow: 0.25, tick: 0.4 },
        { dmg: 4, radius: 96, slow: 0.35, tick: 0.4 },
        { dmg: 6, radius: 110, slow: 0.35, tick: 0.4 },
        { dmg: 8, radius: 126, slow: 0.45, tick: 0.4 },
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
// 同一种音效的最短间隔（秒），防止几百个敌人同时挨打时爆音
const SFX_GAP = { hit: 0.035, kill: 0.03, pick: 0.022, throw: 0.06, whoosh: 0.09, clang: 0.07, boom: 0.08, spit: 0.12, fire: 0.25, hurt: 0.1, select: 0.04, heal: 0.1 };
const PICK_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
const Sound = {
  ctx: null, master: null, noiseBuf: null, last: Object.create(null),
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        const c = new AC();
        this.ctx = c;
        this.master = c.createGain();
        this.master.gain.value = game.settings.muted ? 0 : CONFIG.audio.volume;
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 6;
        this.master.connect(comp); comp.connect(c.destination);
        const buf = c.createBuffer(1, c.sampleRate, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = buf;
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  setMuted(m) {
    game.settings.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : CONFIG.audio.volume, this.ctx.currentTime, 0.02);
  },
  env(g, t, vol, dur, attack = 0.005) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  },
  // 单个振荡器音（可滑音）
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, vol, dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.03);
  },
  // 滤波噪声（噗、嗖、轰）
  noise(dur, vol, type, f0, f1, q = 1, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noiseBuf;
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, vol, dur, 0.004);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 0.4); src.stop(t + dur + 0.05);
  },
  play(name, arg) {
    if (!this.ctx || game.settings.muted || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime, gap = SFX_GAP[name] || 0;
    if (gap && now - (this.last[name] ?? -9) < gap) return;
    this.last[name] = now;
    const fn = SFX[name];
    if (fn) try { fn(this, arg); } catch (e) { /* 个别浏览器不支持某些参数时静默 */ }
  },
};
const SFX = {
  hit: (s) => { s.noise(0.06, 0.16, 'bandpass', rand(700, 1100), 260, 1.2); s.tone('sine', 230, 90, 0.06, 0.1); },
  kill: (s) => s.tone('triangle', rand(480, 620), 140, 0.09, 0.09),
  pick: (s, combo) => {
    const f = 700 * Math.pow(2, PICK_SCALE[Math.min(combo | 0, PICK_SCALE.length - 1)] / 12);
    s.tone('sine', f, f, 0.08, 0.13); s.tone('triangle', f * 2, f * 2, 0.05, 0.035);
  },
  throw: (s) => s.noise(0.07, 0.05, 'bandpass', 2600, 900, 2),
  whoosh: (s) => s.noise(0.18, 0.07, 'bandpass', 600, 1900, 1.5),
  fire: (s) => { s.noise(0.55, 0.09, 'lowpass', 2000, 500, 0.7); s.noise(0.35, 0.04, 'bandpass', 3200, 1500, 1); },
  boom: (s) => { s.noise(0.45, 0.3, 'lowpass', 1400, 80, 0.8); s.tone('sine', 140, 40, 0.35, 0.28); s.noise(0.12, 0.06, 'highpass', 2500, 5000, 1, 0.12); },
  clang: (s) => { s.tone('square', 520, 500, 0.16, 0.045); s.tone('square', 790, 770, 0.14, 0.035); s.noise(0.1, 0.1, 'highpass', 3000, 0, 0.7); s.tone('sine', 110, 50, 0.15, 0.15); },
  hurt: (s) => { s.tone('sawtooth', 320, 90, 0.2, 0.16); s.noise(0.15, 0.14, 'lowpass', 900, 200); },
  heart: (s) => { s.tone('sine', 78, 50, 0.13, 0.42); s.tone('sine', 72, 46, 0.12, 0.3, 0.17); },
  levelup: (s) => { [523, 659, 784, 1047].forEach((f, i) => s.tone('triangle', f, f, 0.14, 0.13, i * 0.07)); s.tone('sine', 2093, 2093, 0.25, 0.05, 0.3); },
  select: (s) => s.tone('triangle', 880, 1320, 0.08, 0.1),
  chest: (s) => { [784, 988, 1175, 1568, 1976].forEach((f, i) => s.tone('sine', f, f, 0.16, 0.1, i * 0.06)); s.noise(0.5, 0.04, 'highpass', 5000, 9000, 1, 0.1); },
  evolve: (s) => { [523, 659, 784, 988].forEach((f) => s.tone('triangle', f, f, 0.9, 0.08)); s.tone('sine', 400, 1600, 0.6, 0.08); s.noise(0.8, 0.05, 'highpass', 4000, 9000, 1, 0.1); },
  heal: (s) => { s.tone('sine', 660, 990, 0.14, 0.12); s.tone('sine', 990, 1320, 0.14, 0.1, 0.1); },
  magnet: (s) => { s.tone('sawtooth', 200, 900, 0.35, 0.05); s.tone('sine', 400, 1600, 0.35, 0.08); },
  warn: (s) => { s.tone('square', 880, 880, 0.09, 0.05); s.tone('square', 660, 660, 0.09, 0.05, 0.12); },
  rush: (s) => s.noise(0.7, 0.12, 'bandpass', 700, 2600, 1.2),
  vortex: (s) => s.noise(1.0, 0.09, 'bandpass', 300, 1300, 2),
  spit: (s) => s.tone('square', 320, 140, 0.07, 0.05),
  bossWarn: (s) => s.tone('sawtooth', 150, 320, 0.5, 0.1),
  roll: (s) => { s.noise(0.9, 0.2, 'lowpass', 320, 110, 0.7); s.tone('sine', 62, 40, 0.8, 0.25); },
  boss: (s) => { s.tone('sawtooth', 72, 45, 1.3, 0.22); s.noise(1.1, 0.18, 'lowpass', 500, 60, 0.7); },
  split: (s) => { s.noise(0.5, 0.3, 'lowpass', 1600, 100, 0.8); s.noise(0.25, 0.15, 'bandpass', 900, 300, 2, 0.05); s.tone('sine', 120, 40, 0.4, 0.3); },
  siren: (s) => {
    const c = s.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(500, t);
    for (let i = 0; i < 6; i++) { o.frequency.linearRampToValueAtTime(900, t + i * 0.6 + 0.3); o.frequency.linearRampToValueAtTime(500, t + i * 0.6 + 0.6); }
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
    g.gain.setValueAtTime(0.06, t + 3.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    o.connect(f); f.connect(g); g.connect(s.master); o.start(t); o.stop(t + 3.7);
  },
  win: (s) => { [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.52], [1047, 0.64]].forEach(([f, d]) => s.tone('triangle', f, f, d > 0.6 ? 0.6 : 0.14, 0.13, d)); },
  lose: (s) => { [392, 330, 262, 196].forEach((f, i) => s.tone('triangle', f, f * 0.97, 0.3, 0.12, i * 0.2)); },
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

// ---- 武器：旋转菜刀、擀面杖、胡椒罐、辣椒、冰箱 ----
function drawKnifeArt(c) {
  rr(c, -15, -3, 11, 6, 2.5); fs(c, lg(c, 0, -3, 0, 3, ['#5a4964', '#241a29']), 1.6);
  c.fillStyle = '#d9dde6'; circ(c, -12, 0, 0.9); c.fill(); circ(c, -8, 0, 0.9); c.fill();
  c.beginPath(); c.moveTo(-4, -4.5); c.lineTo(10, -4.5); c.quadraticCurveTo(16, -4, 17, 0); c.quadraticCurveTo(12, 5.5, -4, 5.5); c.closePath();
  fs(c, lg(c, 0, -5, 0, 6, ['#ffffff', '#c3cbd9', '#8d97ab']), 1.6);
  c.beginPath(); c.moveTo(-3, 3.4); c.quadraticCurveTo(10, 3.8, 15.2, 0.6); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke();
}
function drawPinArt(c) {
  rr(c, -17, -2.5, 8, 5, 2.5); fs(c, '#b07a45', 1.4);
  rr(c, 9, -2.5, 8, 5, 2.5); fs(c, '#b07a45', 1.4);
  rr(c, -11, -5, 22, 10, 5); fs(c, lg(c, 0, -5, 0, 5, ['#f6cf98', '#d39a5c', '#a8703c']), 1.6);
  c.strokeStyle = 'rgba(120,70,30,0.35)'; c.lineWidth = 0.9;
  c.beginPath(); c.moveTo(-7, 1.5); c.lineTo(2, 1.5); c.moveTo(0, -1.5); c.lineTo(8, -1.5); c.stroke();
  shine(c, -4, -2.6, 5, 1.1, 0.5);
}
function drawShakerArt(c) {
  rr(c, -7, -4, 14, 16, 4); fs(c, lg(c, -7, 0, 7, 0, ['#6a6376', '#2f2a38']), 1.6);
  rr(c, -5, 1, 10, 6, 1.5); c.fillStyle = '#efdcb5'; c.fill();
  c.fillStyle = OL; circ(c, 0, 4, 1.2); c.fill();
  rr(c, -6.5, -11, 13, 8, 3.5); fs(c, lg(c, 0, -11, 0, -3, ['#ffffff', '#a8b2c4']), 1.6);
  for (const [x, y] of [[-2.5, -8], [0, -8.7], [2.5, -8]]) { circ(c, x, y, 0.8); c.fill(); }
}
function drawChiliBody(c) {
  c.beginPath(); c.moveTo(-12, -5); c.bezierCurveTo(-2, -9, 10, -6, 16, 3); c.bezierCurveTo(8, 2, -2, 6, -12, 5); c.closePath();
  fs(c, lg(c, 0, -8, 0, 6, ['#ff7a6b', '#e8262b', '#a3141e']), 1.8);
  shine(c, -3, -4.4, 5, 1.3, 0.5);
  c.beginPath(); c.moveTo(-11, -5.5); c.quadraticCurveTo(-16, 0, -11, 5.5); c.quadraticCurveTo(-9, 0, -11, -5.5); fs(c, '#4caf50', 1.5);
  c.beginPath(); c.moveTo(-14, 0); c.quadraticCurveTo(-19, -1, -20, -6);
  c.lineWidth = 3.2; c.strokeStyle = OL; c.stroke(); c.lineWidth = 1.4; c.strokeStyle = '#6fcf5b'; c.stroke();
}
function drawFlameArt(c, x, y, s) {
  c.beginPath(); c.moveTo(x, y - 5 * s); c.quadraticCurveTo(x + 14 * s, y - 7 * s, x + 17 * s, y); c.quadraticCurveTo(x + 14 * s, y + 7 * s, x, y + 5 * s); c.closePath();
  fs(c, '#ff8c2e', 1.6);
  c.beginPath(); c.moveTo(x + 1, y - 2.6 * s); c.quadraticCurveTo(x + 10 * s, y - 3.5 * s, x + 11 * s, y); c.quadraticCurveTo(x + 10 * s, y + 3.5 * s, x + 1, y + 2.6 * s); c.closePath();
  c.fillStyle = '#ffe066'; c.fill();
}
function drawSnowflake(c, r, col = '#e8f8ff', lw = 1.6) {
  c.strokeStyle = col; c.lineWidth = lw;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(ca * r, sa * r);
    const bx = ca * r * 0.6, by = sa * r * 0.6;
    for (const s of [-1, 1]) { const b = a + s * 0.7; c.moveTo(bx, by); c.lineTo(bx + Math.cos(b) * r * 0.3, by + Math.sin(b) * r * 0.3); }
    c.stroke();
  }
}
function drawFridgeIcon(c) {
  rr(c, -11, -17, 22, 34, 4); fs(c, lg(c, -11, 0, 11, 0, ['#ffffff', '#cfe7f3']), 2);
  c.beginPath(); c.moveTo(-11, -5); c.lineTo(11, -5); c.lineWidth = 2; c.strokeStyle = OL; c.stroke();
  c.fillStyle = OL; rr(c, 6, -14, 2.5, 6, 1); c.fill(); rr(c, 6, -2, 2.5, 9, 1); c.fill();
  shine(c, -6, -11, 1.6, 4, 0.8);
  c.save(); c.translate(-12, 12);
  circ(c, 0, 0, 8.5); c.fillStyle = 'rgba(120,210,255,0.9)'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = OL; c.stroke();
  drawSnowflake(c, 6, '#ffffff', 1.5);
  c.restore();
}

function drawPotArt(c) {
  c.beginPath(); c.moveTo(13, -3); c.lineTo(25, -6); c.lineWidth = 6; c.strokeStyle = OL; c.stroke(); c.lineWidth = 3.4; c.strokeStyle = '#a8703c'; c.stroke();
  c.beginPath(); c.moveTo(-16, -4); c.quadraticCurveTo(-15, 10, 0, 11); c.quadraticCurveTo(15, 10, 16, -4); c.closePath();
  fs(c, lg(c, 0, -4, 0, 11, ['#5b5868', '#2a2733']), 2);
  ell(c, 0, -4, 16, 3.6); fs(c, lg(c, -16, -4, 16, -4, ['#7d7a8c', '#3d3a48']), 2);
  c.beginPath(); c.moveTo(-11, 1); c.quadraticCurveTo(-9, 7, -3, 8.5); c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
}

// ---- 被动道具图标 ----
function star4(c, x, y, r, col) {
  c.beginPath(); c.moveTo(x, y - r);
  c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r);
  c.fillStyle = col; c.fill();
}
function drawWhetstone(c) {
  c.beginPath(); c.moveTo(-17, 0); c.lineTo(9, -9); c.lineTo(18, -3); c.lineTo(-8, 7); c.closePath(); fs(c, '#a9bfd4', 2);
  c.beginPath(); c.moveTo(-17, 0); c.lineTo(-8, 7); c.lineTo(-8, 14); c.lineTo(-17, 7); c.closePath(); fs(c, '#5d7287', 2);
  c.beginPath(); c.moveTo(-8, 7); c.lineTo(18, -3); c.lineTo(18, 4); c.lineTo(-8, 14); c.closePath(); fs(c, '#7d95ad', 2);
  star4(c, 7, -15, 6, '#fff3b0'); star4(c, 14, -10, 3, '#ffffff');
}
function drawShoe(c) {
  c.beginPath(); c.moveTo(-17, 6); c.lineTo(15, 6); c.quadraticCurveTo(20, 6, 19, 11); c.lineTo(-17, 11); c.quadraticCurveTo(-20, 8.5, -17, 6); fs(c, '#ffffff', 2);
  c.beginPath(); c.moveTo(-16, 6); c.quadraticCurveTo(-17, -9, -9, -10); c.lineTo(-2, -10); c.quadraticCurveTo(0, -2, 8, -1); c.quadraticCurveTo(17, 0, 17, 6); c.closePath();
  fs(c, lg(c, 0, -10, 0, 6, ['#ff6b6b', '#d9343f']), 2);
  c.beginPath(); c.moveTo(-12, 2); c.quadraticCurveTo(-2, 4, 9, -1); c.lineWidth = 2.2; c.strokeStyle = '#ffd166'; c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(-6, -7); c.lineTo(-1, -5); c.moveTo(-5, -4); c.lineTo(0, -2); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-26, -4); c.lineTo(-20, -4); c.moveTo(-28, 1); c.lineTo(-21, 1); c.moveTo(-25, 6); c.lineTo(-20, 6); c.stroke();
}
function drawApronIcon(c) {
  c.beginPath(); c.moveTo(-6, -14); c.quadraticCurveTo(0, -23, 6, -14); c.lineWidth = 2.6; c.strokeStyle = OL; c.stroke();
  c.beginPath(); c.moveTo(-7, -14); c.lineTo(7, -14); c.lineTo(8, -5); c.lineTo(13, -4); c.lineTo(12, 16); c.quadraticCurveTo(0, 19, -12, 16); c.lineTo(-13, -4); c.lineTo(-8, -5); c.closePath();
  fs(c, lg(c, 0, -14, 0, 18, ['#ffa8c6', '#ef5c8b']), 2);
  c.beginPath(); c.moveTo(-13, -4); c.lineTo(-20, 1); c.moveTo(13, -4); c.lineTo(20, 1); c.lineWidth = 2.2; c.strokeStyle = OL; c.stroke();
  rr(c, -6.5, 3, 13, 8.5, 2); fs(c, '#ffd6e4', 1.5);
  c.beginPath(); c.moveTo(0, 9.5); c.bezierCurveTo(-5, 6, -3, 3.5, 0, 5.5); c.bezierCurveTo(3, 3.5, 5, 6, 0, 9.5); c.fillStyle = '#ff4f7f'; c.fill();
}
function drawMagnetIcon(c) {
  c.beginPath(); c.arc(0, -2, 15, Math.PI, 0, false); c.lineTo(15, 13); c.lineTo(6, 13); c.lineTo(6, -2); c.arc(0, -2, 6, 0, Math.PI, true); c.lineTo(-6, 13); c.lineTo(-15, 13); c.closePath();
  fs(c, lg(c, -15, -16, 15, 13, ['#ff7b7b', '#c92a3a']), 2);
  rr(c, -15, 8, 9, 6, 1); fs(c, '#e7ecf3', 1.6);
  rr(c, 6, 8, 9, 6, 1); fs(c, '#e7ecf3', 1.6);
  shine(c, -9, -9, 2, 4.5, 0.5);
}
function drawClockIcon(c) {
  c.strokeStyle = OL; c.lineWidth = 2.4;
  c.beginPath(); c.moveTo(-8, 12); c.lineTo(-12, 17); c.moveTo(8, 12); c.lineTo(12, 17); c.stroke();
  circ(c, -10, -12, 5.5); fs(c, '#ffd23f', 2); circ(c, 10, -12, 5.5); fs(c, '#ffd23f', 2);
  circ(c, 0, 1, 14); fs(c, lg(c, -10, -12, 10, 14, ['#ff9a73', '#e64a19']), 2);
  circ(c, 0, 1, 10.5); fs(c, '#fffaf0', 1.5);
  c.beginPath(); c.moveTo(0, 1); c.lineTo(0, -6); c.moveTo(0, 1); c.lineTo(5, 3); c.lineWidth = 2; c.strokeStyle = OL; c.stroke();
  c.fillStyle = '#e64a19'; circ(c, 0, 1, 1.6); c.fill();
}
function drawWrapIcon(c) {
  c.beginPath(); c.moveTo(-9, 4); c.lineTo(14, 4); c.lineTo(12, 17); c.lineTo(-8, 15); c.closePath(); fs(c, 'rgba(205,240,255,0.75)', 1.5);
  rr(c, -16, -11, 32, 15, 7); fs(c, lg(c, 0, -11, 0, 4, ['#d9f6ff', '#86cfee']), 2);
  ell(c, -16, -3.5, 3.6, 7.5); fs(c, '#ecfaff', 1.6);
  ell(c, -16, -3.5, 1.8, 4); c.fillStyle = '#c69c6d'; c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(-6, -8, 16, 2); c.fillRect(-2, 8, 10, 1.5);
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
  knife: (c) => { c.rotate(-0.8); c.scale(1.35, 1.35); drawKnifeArt(c); },
  chili: (c) => { c.rotate(-0.45); c.translate(-6, 2); drawChiliBody(c); drawFlameArt(c, 17, 3, 0.85); },
  pepper: (c) => { c.rotate(0.35); c.scale(1.45, 1.45); drawShakerArt(c); },
  pin: (c) => { c.rotate(-0.7); c.scale(1.3, 1.3); drawPinArt(c); },
  frost: (c) => { c.translate(4, 0); drawFridgeIcon(c); },
  whetstone: drawWhetstone,
  shoes: (c) => { c.translate(3, 0); drawShoe(c); },
  apron: drawApronIcon,
  magnet: drawMagnetIcon,
  clock: drawClockIcon,
  wrap: drawWrapIcon,
  heal: (c) => { c.scale(1.3, 1.3); drawBun(c); },
  gold: (c) => { c.scale(1.3, 1.3); drawCoin(c); },
  heart: (c) => { c.scale(1.2, 1.2); drawHeartArt(c); },
  chest: (c) => { c.translate(0, 2); c.scale(1.1, 1.1); drawChest(c); },
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

// ---- 敌人：小辣椒、鸡蛋、小蛋黄、洋葱、土豆炮手 ----
function drawChiliEnemy(c) {
  drawChiliBody(c);
  eye(c, 1, -1.8, 2.7); eye(c, 7.5, -0.6, 2.4);
  brow(c, -2, -5.5, 3.5, -4, 1.6); brow(c, 10, -4.2, 5.5, -3.4, 1.6);
}
function drawEgg(c) {
  ell(c, 0, 1, 12.5, 15.5); fs(c, lg(c, -8, -14, 8, 16, ['#ffffff', '#f6eedd', '#dccfb5']));
  c.beginPath(); c.moveTo(-6, -11); c.lineTo(-3, -8); c.lineTo(-1, -11); c.lineTo(2, -7.5); c.lineWidth = 1.2; c.strokeStyle = 'rgba(120,95,70,0.6)'; c.stroke();
  shine(c, -5.5, -6, 2.6, 4.5, 0.85);
  eye(c, -3, 2, 3.2); eye(c, 5, 2, 3.2);
  brow(c, -6.5, -2.5, -0.5, -0.8); brow(c, 8.5, -2.5, 2.5, -0.8);
  c.fillStyle = 'rgba(255,120,120,0.45)'; ell(c, -6.5, 7, 2.2, 1.3); c.fill(); ell(c, 8.5, 7, 2.2, 1.3); c.fill();
  mouth(c, 1.5, 8, 2.2, true);
}
function drawYolk(c) {
  c.beginPath();
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * TAU, r = 10.5 + Math.sin(i * 2.7) * 1.4; c.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85 + 1.5); }
  c.closePath(); fs(c, 'rgba(255,255,255,0.92)', 1.4);
  circ(c, 0.5, 0, 7.5); fs(c, rg(c, -2, -3, 1, 8, ['#fff1a8', '#ffc928', '#ff9a1c']), 1.6);
  shine(c, -2.5, -3, 1.6, 2.6, 0.85);
  eye(c, -1.2, 0.5, 2.1); eye(c, 3.6, 0.5, 2.1);
  brow(c, -3.6, -2.4, -0.2, -1.6, 1.4); brow(c, 6, -2.4, 2.6, -1.6, 1.4);
}
function drawOnion(c) {
  c.beginPath(); c.moveTo(-2, -15); c.quadraticCurveTo(-6, -22, -3, -26); c.quadraticCurveTo(0, -20, 0, -15); fs(c, '#6fcf5b', 1.5);
  c.beginPath(); c.moveTo(1, -15); c.quadraticCurveTo(6, -21, 4, -27); c.quadraticCurveTo(0, -21, -1, -15); fs(c, '#58b84a', 1.5);
  c.beginPath(); c.moveTo(0, -16); c.bezierCurveTo(9, -14, 16, -4, 15, 4); c.bezierCurveTo(14, 12, 7, 16, 0, 16); c.bezierCurveTo(-7, 16, -14, 12, -15, 4); c.bezierCurveTo(-16, -4, -9, -14, 0, -16); c.closePath();
  fs(c, lg(c, -12, -14, 12, 16, ['#e2c8ff', '#a875e0', '#7a45b5']));
  c.strokeStyle = 'rgba(255,255,255,0.32)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-1, -14); c.quadraticCurveTo(-11, 0, -4, 15); c.moveTo(1, -14); c.quadraticCurveTo(11, 0, 4, 15); c.stroke();
  c.strokeStyle = 'rgba(232,214,180,0.9)'; c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-2, 16); c.lineTo(-4, 19.5); c.moveTo(0, 16.5); c.lineTo(0, 20); c.moveTo(2, 16); c.lineTo(4, 19.5); c.stroke();
  eye(c, -3.5, 1, 3.3); eye(c, 5, 1, 3.3);
  c.beginPath(); c.moveTo(-4.5, 5); c.quadraticCurveTo(-7, 9, -4.5, 10.5); c.quadraticCurveTo(-2, 9, -4.5, 5); c.fillStyle = '#7fd4ff'; c.fill();
  c.beginPath(); c.moveTo(-2, 9); c.quadraticCurveTo(0.5, 7, 3, 9); c.quadraticCurveTo(5.5, 11, 7, 9); c.lineWidth = 1.5; c.strokeStyle = OL; c.stroke();
}
function drawPotato(c) {
  rr(c, -14, -13, 28, 26, 10); fs(c, lg(c, -12, -12, 12, 14, ['#ddb07c', '#b07a48', '#8a5a32']));
  c.fillStyle = 'rgba(90,55,25,0.45)';
  for (const [x, y, r] of [[-9, -8, 1.6], [9, -9, 1.3], [-10, 8, 1.4], [10, 7, 1.7], [2, -11, 1.1]]) { circ(c, x, y, r); c.fill(); }
  shine(c, -7, -7, 2.5, 4, 0.4);
  eye(c, -3.5, -3, 3); eye(c, 5, -3, 3);
  brow(c, -7, -7.5, -0.5, -6); brow(c, 8.5, -7.5, 2, -6);
  ell(c, 1, 5.5, 4, 3.2); fs(c, '#3a2230', 1.6);
  ell(c, 1, 5, 2.2, 1.4); c.fillStyle = '#1a0f16'; c.fill();
}
function drawPotatoBullet(c) {
  circ(c, 0, 0, 6.5); fs(c, rg(c, -2, -2, 1, 7, ['#e8c39b', '#b07a48', '#8a5a32']), 1.6);
  c.fillStyle = 'rgba(90,55,25,0.55)'; circ(c, 2, 1.5, 1.1); c.fill(); circ(c, -2, 2.5, 0.9); c.fill();
}
function drawChest(c) {
  rr(c, -15, -2, 30, 16, 3); fs(c, lg(c, 0, -2, 0, 14, ['#c98545', '#8a5326']), 2);
  c.beginPath(); c.moveTo(-15, -2); c.lineTo(-15, -7); c.quadraticCurveTo(0, -18, 15, -7); c.lineTo(15, -2); c.closePath();
  fs(c, lg(c, 0, -14, 0, -2, ['#e09a55', '#a5642e']), 2);
  c.fillStyle = '#ffd23f'; c.strokeStyle = OL; c.lineWidth = 1.4;
  for (const x of [-11, 8]) { c.beginPath(); c.rect(x, -11.5, 3.2, 25.5); c.fill(); c.stroke(); }
  rr(c, -4, -6, 8, 9, 1.6); fs(c, '#ffe680', 1.6);
  c.fillStyle = OL; circ(c, 0, -2.5, 1.2); c.fill(); c.fillRect(-0.6, -2.5, 1.2, 3);
  shine(c, -8, -10, 3, 1.4, 0.45);
}

// ---- Boss：西瓜大王 ----
function drawWatermelon(c) {
  const R = 62;
  circ(c, 0, 0, R); fs(c, rg(c, -22, -26, 8, R, ['#a8e88a', '#56b85a', '#2e7d32']), 3);
  c.save(); circ(c, 0, 0, R - 1.5); c.clip();
  c.strokeStyle = 'rgba(22,80,32,0.9)'; c.lineWidth = 7;
  for (let k = -3; k <= 3; k++) {
    c.beginPath();
    for (let y = -R; y <= R; y += 5) {
      const w = Math.sqrt(Math.max(0, 1 - (y / R) ** 2));
      c.lineTo(k * 19 * w + Math.sin(y * 0.22 + k * 2) * 3.5, y);
    }
    c.stroke();
  }
  c.restore();
  circ(c, 0, 0, R); c.lineWidth = 3; c.strokeStyle = OL; c.stroke();
  shine(c, -30, -30, 9, 15, 0.35);
  eye(c, -21, -8, 11.5, 0); eye(c, 21, -8, 11.5, 0);
  brow(c, -36, -27, -11, -17, 5); brow(c, 36, -27, 11, -17, 5);
  c.beginPath(); c.moveTo(-25, 14); c.quadraticCurveTo(0, 50, 25, 14); c.closePath(); fs(c, '#e8344a', 2.6);
  c.fillStyle = '#fff'; c.fillRect(-20, 14.5, 40, 4.5);
  c.fillStyle = OL;
  for (const [x, y] of [[-9, 26], [3, 31], [12, 24]]) { ell(c, x, y, 1.6, 2.6, 0.3); c.fill(); }
  c.beginPath(); c.moveTo(-26, -56); c.lineTo(-31, -86); c.lineTo(-14, -69); c.lineTo(0, -92); c.lineTo(14, -69); c.lineTo(31, -86); c.lineTo(26, -56); c.closePath();
  fs(c, lg(c, 0, -92, 0, -56, ['#fff3a0', '#ffc531', '#e08e0b']), 2.6);
  circ(c, 0, -65, 4.5); fs(c, '#ff4d6d', 1.6);
  circ(c, -17, -62, 3); fs(c, '#4fc3f7', 1.4); circ(c, 17, -62, 3); fs(c, '#4fc3f7', 1.4);
}
function drawSeed(c) {
  c.beginPath(); c.moveTo(6, 0); c.quadraticCurveTo(0, -4.5, -5, 0); c.quadraticCurveTo(0, 4.5, 6, 0); fs(c, '#231a26', 1.2);
  shine(c, -1, -1.2, 1.2, 0.7, 0.6);
}

// 敌人外观表：绘制函数 + 精灵尺寸 + 摇摆动画速度
const ENEMY_ART = {
  broccoli: { draw: drawBroccoli, w: 46, h: 46, anim: 7 },
  chili: { draw: drawChiliEnemy, w: 44, h: 22, anim: 16 },
  egg: { draw: drawEgg, w: 34, h: 40, anim: 8 },
  yolk: { draw: drawYolk, w: 28, h: 28, anim: 14 },
  onion: { draw: drawOnion, w: 40, h: 56, ay: 30, anim: 7 },
  potato: { draw: drawPotato, w: 38, h: 38, anim: 6 },
  boss: { draw: drawWatermelon, w: 140, h: 172, ay: 100, anim: 3 },
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
  SPR.knife = makeSprite(36, 16, drawKnifeArt);
  SPR.pin = makeSprite(38, 14, drawPinArt);
  SPR.shaker = makeSprite(18, 28, drawShakerArt, 9, 15);
  SPR.snow = makeSprite(16, 16, (c) => drawSnowflake(c, 6.5, 'rgba(225,246,255,0.9)', 1.4));
  SPR.glowY = glowSprite('rgba(255,236,140,1)', 48);
  SPR.glowO = glowSprite('rgba(255,140,40,1)', 48);
  SPR.glowR = glowSprite('rgba(225,55,30,0.9)', 48);
  SPR.glowC = glowSprite('rgba(150,225,255,1)', 48);
  SPR.glowW = glowSprite('rgba(255,255,255,1)', 48);
  SPR.glowP = glowSprite('rgba(190,120,255,1)', 48);
  SPR.glowG = glowSprite('rgba(255,215,90,1)', 48);
  SPR.smoke = glowSprite('rgba(52,44,58,0.85)', 48);
  SPR.smokeL = glowSprite('rgba(235,225,245,0.7)', 48);
  SPR.potatoB = makeSprite(18, 18, drawPotatoBullet);
  SPR.pot = makeSprite(56, 30, drawPotArt, 24, 14);
  SPR.seed = makeSprite(16, 12, drawSeed);
  SPR.chest = makeSprite(38, 34, drawChest, 19, 18);
  SPR.bun = makeSprite(36, 30, drawBun, 18, 14);
  SPR.magnet = makeSprite(40, 36, drawMagnetIcon, 20, 18);
  SPR.heart = makeSprite(36, 34, drawHeartArt, 18, 17);
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
// 地面区域（催泪雾、铁锅、红油、胡椒漩涡）的行为表
const ZONE_UPDATE = {}, ZONE_END = {}, ZONE_DRAW = {};
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
    if (w.evo) potRain(w, s, dt);
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
// 铁锅暴雨：随机砸向屏幕内的敌人
function potRain(w, s, dt) {
  w.potAcc = (w.potAcc || 0) + s.pots * dt;
  while (w.potAcc >= 1) {
    w.potAcc -= 1;
    let x, y;
    const list = state.enemies, e = list.length ? list[(Math.random() * list.length) | 0] : null;
    if (e && !e.dead && Math.random() < 0.75 && onScreen(e.x, e.y, -20)) { x = e.x + rand(-12, 12); y = e.y + rand(-12, 12); }
    else { x = cam.x + rand(-0.45, 0.45) * view.ww; y = cam.y + rand(-0.42, 0.42) * view.wh; }
    const z = addZone('pot', x, y, s.potR, s.fall + 0.45);
    z.w = w; z.a = 0; z.spin = rand(-3, 3);
  }
}
ZONE_UPDATE.pot = (z) => {
  if (z.a || z.t < wStats(z.w).fall) return;
  z.a = 1;
  const s = wStats(z.w), n = query(z.x, z.y, z.r);
  for (let k = 0; k < n; k++) {
    const e = QR[k], dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1;
    hurtEnemy(e, s.potDmg, z.w, dx / d, dy / d, 220);
  }
  chips(z.x, z.y, 6, ['#d9d2e6', '#9a93a8', '#5b5868'], 180, 3.5);
  for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, sp = rand(200, 380); addPart(P_SPARK, z.x, z.y, Math.cos(a) * sp, Math.sin(a) * sp, 0.22, 2, '#ffe9a8'); }
  addRing(z.x, z.y, z.r, 0.3, 'rgba(255,240,200,0.8)', 4);
  shake(0.05);
  Sound.play('clang');
};
ZONE_DRAW.pot = (z, a) => {
  const fall = wStats(z.w).fall, k = Math.min(1, z.t / fall);
  if (!z.a) {
    setWorld();
    ctx.fillStyle = `rgba(8,6,18,${0.15 + k * 0.3})`;
    ctx.beginPath(); ctx.ellipse(z.x, z.y + 6, 22 * (0.4 + k * 0.6), 8 * (0.4 + k * 0.6), 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(255,90,70,${0.25 + k * 0.4})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(z.x, z.y + 6, z.r * 0.8, z.r * 0.32, 0, 0, TAU); ctx.stroke();
    const h = (1 - k) * (1 - k) * 420;
    drawSpr(SPR.pot, z.x, z.y - h, 1.2, 1.2, z.spin * (1 - k));
  } else {
    const after = z.t - fall, sq = Math.max(0, 1 - after * 6) * 0.25;
    ctx.globalAlpha = a;
    drawSpr(SPR.pot, z.x, z.y + 2, 1.2 * (1 + sq), 1.2 * (1 - sq));
    ctx.globalAlpha = 1;
  }
};

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

// ---- 旋转菜刀 ----
defWeapon({
  id: 'knife', name: '旋转菜刀', color: '#cfd8ea',
  desc: '菜刀围着你转圈，切碎靠近的食材。',
  labels: { dmg: '伤害', count: '刀数', radius: '半径', spin: ['转速', ' 圈/秒', 1 / TAU] },
  init(w) { w.ang = 0; w.pos = []; },
  update(w, s, dt) {
    const p = state.player;
    w.ang += s.spin * dt;
    const n = s.count, R = knifeRadius(w, s);
    w.pos.length = 0;
    for (let i = 0; i < n; i++) {
      const a = w.ang + (i * TAU) / n, x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
      w.pos.push(x, y, a);
      const m = query(x, y, 14);
      for (let k = 0; k < m; k++) {
        const e = QR[k];
        if (e.hitCd[SRC.knife] > state.t) continue;
        e.hitCd[SRC.knife] = state.t + s.hitCd;
        hurtEnemy(e, s.dmg, w, Math.cos(a), Math.sin(a), s.kb);
      }
    }
  },
  draw(w) {
    if (w.evo) drawKnifeTrails(w);
    const sc = w.evo ? 1.3 : 1.05;
    for (let i = 0; i < w.pos.length; i += 3) drawSpr(SPR.knife, w.pos[i], w.pos[i + 1], sc, sc, w.pos[i + 2] + Math.PI / 2);
  },
});
function knifeRadius(w, s) {
  w.lastR = w.evo ? s.radius * (1 + s.pulse * Math.sin(state.t * s.pulseSpeed)) : s.radius;
  return w.lastR;
}
// 料理旋风的刀光拖尾
function drawKnifeTrails(w) {
  const p = state.player, R = w.lastR;
  setWorld();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < w.pos.length; i += 3) {
    const a = w.pos[i + 2];
    for (let k = 0; k < 4; k++) {
      ctx.strokeStyle = `rgba(150,220,255,${0.07 + k * 0.07})`;
      ctx.lineWidth = 11 - k * 2.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, R, a - 0.8 + k * 0.19, a); ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'butt';
}

// ---- 辣椒喷火 ----
defWeapon({
  id: 'chili', name: '辣椒喷火', color: '#ff6b3d',
  desc: '朝移动方向喷出锥形火焰，被烧到的敌人会持续灼烧。',
  labels: { dmg: '火焰伤害', burn: ['灼烧', '/秒'], range: '射程', angle: ['锥角', '°'] },
  init(w) { w.cd = 0.6; w.fireT = 0; w.tick = 0; w.dir = Math.atan2(state.player.facey, state.player.facex); w.pacc = 0; },
  update(w, s, dt) {
    const p = state.player;
    w.dir += angleDiff(w.dir, Math.atan2(p.facey, p.facex)) * Math.min(1, dt * 10);
    if (w.evo) { // 地狱火锅：脚下留下燃烧的红油
      w.trailT = (w.trailT || 0) - dt;
      const dx = p.x - (w.lx ?? p.x + 999), dy = p.y - (w.ly ?? p.y);
      if (dx * dx + dy * dy > s.trailGap * s.trailGap || w.trailT <= 0) {
        const z = addZone('fire', p.x, p.y + 8, s.trailR, s.trail);
        z.w = w; z.tick = 0;
        w.lx = p.x; w.ly = p.y; w.trailT = 0.45;
      }
    }
    if (w.fireT > 0) {
      w.fireT -= dt; w.tick -= dt;
      const half = (s.angle * Math.PI) / 360;
      flameParticles(w, p.x, p.y - 4, w.dir, half, s.range, dt);
      if (w.tick <= 0) { w.tick = s.tick; flameHit(w, s, p.x, p.y, w.dir, half); }
    } else {
      w.cd -= dt;
      if (w.cd <= 0) { w.cd = s.cd * p.cdMul; w.fireT = s.dur; w.tick = 0; Sound.play('fire'); }
    }
  },
});
function flameHit(w, s, x, y, dir, half) {
  const n = query(x, y, s.range);
  for (let k = 0; k < n; k++) {
    const e = QR[k];
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    if (Math.abs(angleDiff(dir, Math.atan2(dy, dx))) > half + Math.asin(Math.min(1, e.r / d))) continue;
    e.burnT = 2; e.burnW = w;
    if (s.burn > e.burnDps) e.burnDps = s.burn;
    hurtEnemy(e, s.dmg, w, dx / d, dy / d, 25, F_NOFLASH);
  }
}
function flameParticles(w, x, y, dir, half, range, dt) {
  w.pacc += dt * 120;
  while (w.pacc >= 1) {
    w.pacc -= 1;
    const a = dir + rand(-half, half) * 0.9, sp = (range / 0.36) * rand(0.7, 1.05);
    const q = addPart(P_GLOW, x + Math.cos(dir) * 10, y + Math.sin(dir) * 10, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.4), rand(0.32, 0.46));
    if (q) { q.drag = 1.2; q.grow = 2.2; q.fire = 1; }
  }
}

// ---- 胡椒炸弹 ----
defWeapon({
  id: 'pepper', name: '胡椒炸弹', color: '#9a93a8',
  desc: '定时往敌人最密集的地方扔胡椒罐，炸开后击退，并让敌人打喷嚏眩晕。',
  labels: { dmg: '伤害', radius: '范围', cd: ['间隔', '秒'], count: '数量', stun: ['眩晕', '秒'] },
  init(w) { w.cd = 1.2; },
  update(w, s, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const p = state.player;
    let last = null, thrown = 0;
    for (let i = 0; i < s.count; i++) {
      const t = findCluster(s.radius, last);
      if (!t) break;
      last = t; thrown++;
      const b = spawnBullet('shaker', w, p.x, p.y - 6, 0, 0);
      b.a = p.x; b.b = p.y - 6; b.tx = t.x; b.ty = t.y; b.life = 0.55; b.spin = 12 * (i % 2 ? -1 : 1);
    }
    w.cd = thrown ? s.cd * p.cdMul : 0.3;
    if (thrown) Sound.play('whoosh');
  },
});
// 在屏幕内随机抽几个敌人，挑周围敌人最多的那个当落点
function findCluster(radius, avoid) {
  const list = state.enemies;
  if (!list.length) return null;
  let best = null, bestN = -1;
  for (let k = 0; k < 14; k++) {
    const e = list[(Math.random() * list.length) | 0];
    if (e.dead || !onScreen(e.x, e.y, -30)) continue;
    if (avoid && (e.x - avoid.x) ** 2 + (e.y - avoid.y) ** 2 < radius * radius * 1.4) continue;
    const n = query(e.x, e.y, radius * 0.8) + (e.elite || e.boss ? 4 : 0);
    if (n > bestN) { bestN = n; best = e; }
  }
  return best ? { x: best.x, y: best.y } : null;
}
function pepperBoom(x, y, s, w) {
  const n = query(x, y, s.radius);
  let sneezes = 0;
  for (let k = 0; k < n; k++) {
    const e = QR[k];
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    hurtEnemy(e, s.dmg, w, dx / d, dy / d, s.kb);
    if (!e.boss) e.stun = Math.max(e.stun, s.stun * (e.elite ? 0.5 : 1));
    if (!e.dead && sneezes < 3 && Math.random() < 0.5) { sneezes++; floatText(e.x, e.y - e.r - 10, '阿嚏！', '#f3ead2', 13, 0.8); }
  }
  explosionFx(x, y, s.radius, 'pepper');
  shake(0.12);
  Sound.play('boom');
}

// ---- 擀面杖回旋 ----
defWeapon({
  id: 'pin', name: '擀面杖回旋', color: '#e0a868',
  desc: '像回旋镖一样扔出擀面杖，去程和回程都能打到敌人。',
  labels: { dmg: '伤害', count: '数量', dist: '飞行距离', cd: ['冷却', '秒'] },
  init(w) { w.cd = 0.5; w.tg = []; },
  update(w, s, dt) {
    w.cd -= dt;
    if (w.cd > 0) return;
    const p = state.player;
    const base = nearestEnemies(p.x, p.y, 600, 1, w.tg) ? Math.atan2(w.tg[0].y - p.y, w.tg[0].x - p.x) : Math.atan2(p.facey, p.facex);
    for (let i = 0; i < s.count; i++) {
      const a = base + (i * TAU) / s.count;
      const b = spawnBullet('pin', w, p.x, p.y - 4, Math.cos(a), Math.sin(a));
      b.r = 13; b.dmg = s.dmg; b.kb = s.kb; b.a = 0.5; b.b = (2 * s.dist) / 0.5; b.c = s.hitCd; b.spin = 16; b.life = 5;
    }
    w.cd = s.cd * p.cdMul;
    Sound.play('whoosh');
  },
});

// ---- 冰箱冷气 ----
defWeapon({
  id: 'frost', name: '冰箱冷气', color: '#8fe3ff',
  desc: '身边环绕一圈冷气，范围内的敌人被减速并持续冻伤。',
  labels: { dmg: '冻伤', radius: '半径', slow: ['减速', '%', 100] },
  init(w) { w.tick = 0; w.vis = 0; w.sacc = 0; },
  update(w, s, dt) {
    const p = state.player;
    w.vis = Math.min(1, w.vis + dt * 3);
    w.sacc += dt * s.radius * 0.12;
    while (w.sacc >= 1) {
      w.sacc -= 1;
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * s.radius;
      const q = addPart(P_GLOW, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, rand(-10, 10), rand(-25, -8), rand(0.6, 1), rand(0.1, 0.2), 0, SPR.glowC);
      if (q) q.drag = 0.5;
    }
    w.tick -= dt;
    if (w.tick > 0) return;
    w.tick = s.tick;
    const n = query(p.x, p.y, s.radius);
    for (let k = 0; k < n; k++) {
      const e = QR[k];
      e.slowT = s.tick + 0.2; e.slow = e.boss ? s.slow * 0.5 : s.slow;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      hurtEnemy(e, s.dmg, w, dx / d, dy / d, 0, F_NOFLASH);
    }
  },
  drawGround(w, s) {
    const p = state.player, R = s.radius * w.vis;
    setWorld();
    const g = ctx.createRadialGradient(p.x, p.y, R * 0.15, p.x, p.y, R);
    g.addColorStop(0, 'rgba(140,220,255,0.03)'); g.addColorStop(0.7, 'rgba(140,220,255,0.09)'); g.addColorStop(1, 'rgba(190,238,255,0.26)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
    ctx.setLineDash([10, 9]); ctx.lineDashOffset = -state.t * 26;
    ctx.strokeStyle = 'rgba(205,242,255,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = state.t * 0.5 + (i * TAU) / 6;
      drawSpr(SPR.snow, p.x + Math.cos(a) * R * 0.86, p.y + Math.sin(a) * R * 0.86, 0.75, 0.75, state.t * 1.4 + i);
    }
  },
});

// =====================================================================
// 被动道具数据：{ id, name, desc, label, total(lv), apply(player, lv) }
// =====================================================================
const PASSIVES = {};
const PASSIVE_ORDER = [];
function defPassive(def) { PASSIVES[def.id] = def; PASSIVE_ORDER.push(def.id); }
const PC = CONFIG.passives;
defPassive({
  id: 'whetstone', name: '磨刀石', flavor: '刀磨得越快，菜切得越碎。', desc: `所有伤害 +${PC.whetstone.might * 100}%`, label: '伤害加成',
  total: (lv) => `+${Math.round(lv * PC.whetstone.might * 100)}%`,
  apply: (p, lv) => { p.might += lv * PC.whetstone.might; },
});
defPassive({
  id: 'shoes', name: '跑鞋', flavor: '跑得快，才能活得久。', desc: `移动速度 +${PC.shoes.speed * 100}%`, label: '移速加成',
  total: (lv) => `+${Math.round(lv * PC.shoes.speed * 100)}%`,
  apply: (p, lv) => { p.spdMul += lv * PC.shoes.speed; },
});
defPassive({
  id: 'apron', name: '围裙', flavor: '系上围裙，越战越勇。', desc: `最大生命 +${PC.apron.hp}，每秒回复 ${PC.apron.regen} 生命`, label: '生命/回复',
  total: (lv) => `+${lv * PC.apron.hp} / ${fmtNum(lv * PC.apron.regen)}每秒`,
  apply: (p, lv) => { p.maxHp += lv * PC.apron.hp; p.regen += lv * PC.apron.regen; },
});
defPassive({
  id: 'magnet', name: '大磁铁', flavor: '调料晶会自己飞过来。', desc: `拾取范围 +${PC.magnet.pickup * 100}%`, label: '拾取范围',
  total: (lv) => `+${Math.round(lv * PC.magnet.pickup * 100)}%`,
  apply: (p, lv) => { p.pickupMul += lv * PC.magnet.pickup; },
});
defPassive({
  id: 'clock', name: '闹钟', flavor: '叮铃铃！厨具出手更勤快。', desc: `武器冷却 -${PC.clock.cd * 100}%`, label: '冷却缩减',
  total: (lv) => `-${Math.round(lv * PC.clock.cd * 100)}%`,
  apply: (p, lv) => { p.cdMul -= lv * PC.clock.cd; },
});
defPassive({
  id: 'wrap', name: '保鲜膜', flavor: '裹上一层，挨打没那么疼。', desc: `受到的伤害 -${PC.wrap.armor}（固定减伤）`, label: '减伤',
  total: (lv) => `-${lv * PC.wrap.armor}`,
  apply: (p, lv) => { p.armor += lv * PC.wrap.armor; },
});

// =====================================================================
// 进化表：武器满级 + 持有对应被动 → 下一次升级必出进化卡
// =====================================================================
const EVOLUTIONS = [
  { weapon: 'knife', passive: 'whetstone', name: '料理旋风', desc: '刀数翻倍，转圈半径一伸一缩，刀光拖出残影。' },
  { weapon: 'spatula', passive: 'clock', name: '铁锅暴雨', desc: '锅铲照扔，另外每秒向全屏随机砸下 8 口铁锅。' },
  { weapon: 'chili', passive: 'apron', name: '地狱火锅', desc: '火焰更猛更宽，脚下留下一条燃烧 3 秒的红油。' },
  { weapon: 'pepper', passive: 'magnet', name: '黑胡椒风暴', desc: '先把敌人卷到中心，再一口气炸开。' },
];
const wName = (w) => (w.evo ? EVOLUTIONS.find((ev) => ev.weapon === w.id).name : w.def.name);

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
BULLET_UPDATE.shaker = (b, dt) => {
  const k = Math.min(1, b.t / b.life);
  b.x = lerp(b.a, b.tx, k); b.y = lerp(b.b, b.ty, k); b.c = Math.sin(k * Math.PI) * 70;
  b.rot += b.spin * dt;
  if (k >= 1) { b.dead = true; pepperLand(b.w, b.tx, b.ty); }
};
function pepperLand(w, x, y) {
  if (!w.evo) { pepperBoom(x, y, wStats(w), w); return; }
  const s = wStats(w), z = addZone('vortex', x, y, s.pullR, s.pullTime);
  z.w = w; z.tick = 0;
  Sound.play('vortex');
}
// 黑胡椒风暴：把敌人往中心吸
ZONE_UPDATE.vortex = (z, dt) => {
  const s = wStats(z.w), n = query(z.x, z.y, z.r);
  z.tick -= dt;
  const tick = z.tick <= 0;
  if (tick) z.tick = 0.25;
  for (let k = 0; k < n; k++) {
    const e = QR[k];
    if (e.boss) continue;
    const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1;
    const pull = Math.min(d * 0.9, s.pullSpeed * dt * (0.45 + 0.55 * (1 - d / z.r)) * (e.elite ? 0.5 : 1));
    // 一边往里吸一边打转
    e.x += (dx / d) * pull - (dy / d) * pull * 0.5; e.y += (dy / d) * pull + (dx / d) * pull * 0.5;
    if (tick) hurtEnemy(e, s.tickDmg, z.w, 0, 0, 0, F_NOFLASH | F_NOCRIT);
  }
  z.pacc = (z.pacc || 0) + dt * 40;
  while (z.pacc >= 1) {
    z.pacc -= 1;
    const a = Math.random() * TAU, r = z.r * rand(0.7, 1);
    const q = addPart(P_SMOKE, z.x + Math.cos(a) * r, z.y + Math.sin(a) * r, -Math.cos(a) * 180 - Math.sin(a) * 160, -Math.sin(a) * 180 + Math.cos(a) * 160, 0.6, rand(0.4, 0.7), 0, SPR.smoke);
    if (q) q.drag = 1;
  }
};
ZONE_END.vortex = (z) => {
  const s = wStats(z.w);
  pepperBoom(z.x, z.y, s, z.w);
  explosionFx(z.x, z.y, s.radius, 'pepper');
  shake(0.25);
};
ZONE_DRAW.vortex = (z, a) => {
  setWorld();
  const k = z.t / z.life;
  ctx.globalAlpha = a * 0.85;
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.beginPath();
    for (let s = 0; s <= 1.0001; s += 0.08) {
      const r = z.r * (1 - s) * (1 - k * 0.3), ang = -z.t * 7 + (arm * TAU) / 3 + s * 4.2;
      ctx.lineTo(z.x + Math.cos(ang) * r, z.y + Math.sin(ang) * r * 0.85);
    }
    ctx.strokeStyle = 'rgba(45,34,52,0.55)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,200,190,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.lineCap = 'butt';
  const s = (z.r / 24) * (0.3 + k * 0.4);
  drawSpr(SPR.smoke, z.x, z.y, s, s * 0.85);
  ctx.globalAlpha = 1;
};

// 地狱火锅：燃烧的红油
ZONE_UPDATE.fire = (z, dt) => {
  z.tick -= dt;
  if (Math.random() < dt * 5) { const q = addPart(P_GLOW, z.x + rand(-z.r, z.r) * 0.6, z.y + rand(-z.r, z.r) * 0.4, 0, rand(-60, -30), 0.5, 0.3); if (q) { q.fire = 1; q.drag = 1; q.grow = 1; } }
  if (z.tick > 0) return;
  const s = wStats(z.w);
  z.tick = s.trailTick;
  const n = query(z.x, z.y, z.r);
  for (let k = 0; k < n; k++) {
    const e = QR[k];
    if (e.hitCd[SRC.fire] > state.t) continue;
    e.hitCd[SRC.fire] = state.t + s.trailTick * 0.9;
    e.burnT = 2; e.burnW = z.w;
    if (s.burn > e.burnDps) e.burnDps = s.burn;
    hurtEnemy(e, s.trailDmg, z.w, 0, 0, 0, F_NOFLASH);
  }
};
ZONE_DRAW.fire = (z, a) => {
  setWorld();
  const fl = 1 + Math.sin(z.t * 13 + z.x) * 0.06;
  ctx.globalAlpha = a * 0.6;
  ctx.fillStyle = '#b3160c';
  ctx.beginPath(); ctx.ellipse(z.x, z.y, z.r * fl, z.r * 0.62 * fl, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = a;
  ctx.globalCompositeOperation = 'lighter';
  drawSpr(SPR.glowO, z.x, z.y, (z.r / 24) * fl, (z.r / 24) * 0.6 * fl);
  ctx.globalCompositeOperation = 'source-over';
  setWorld();
  ctx.strokeStyle = 'rgba(255,190,90,0.8)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 2; i++) {
    const ph = (z.t * 1.6 + i * 0.5 + z.x * 0.01) % 1;
    ctx.beginPath(); ctx.arc(z.x + Math.cos(i * 2.4 + z.y) * z.r * 0.4, z.y + Math.sin(i * 2.4 + z.x) * z.r * 0.25, 1 + ph * 3.5, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
};
BULLET_UPDATE.pin = (b, dt) => {
  const p = state.player;
  b.rot += b.spin * dt;
  if (b.mode === 0) { // 去程：匀减速
    const v = b.b * Math.max(0, 1 - b.t / b.a);
    b.x += b.vx * v * dt; b.y += b.vy * v * dt;
    if (b.t >= b.a) { b.mode = 1; b.tx = 0; }
  } else { // 回程：加速追回主角
    b.tx = Math.min(b.b * 1.25, b.tx + b.b * 2.4 * dt);
    const dx = p.x - b.x, dy = p.y - 4 - b.y, d = Math.hypot(dx, dy) || 1;
    if (d < 18 || b.t > b.life) { b.dead = true; return; }
    const st = Math.min(d, b.tx * dt);
    b.x += (dx / d) * st; b.y += (dy / d) * st;
  }
  const n = query(b.x, b.y, b.r);
  for (let k = 0; k < n; k++) {
    const e = QR[k];
    if (e.hitCd[SRC.pin] > state.t) continue;
    e.hitCd[SRC.pin] = state.t + b.c;
    const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1;
    hurtEnemy(e, b.dmg, b.w, dx / d, dy / d, b.kb);
  }
};
const BULLET_DRAW = {
  spatula(b) { drawSpr(SPR.spatula, b.x, b.y, 1, 1, b.rot); },
  pin(b) { drawSpr(SPR.pin, b.x, b.y, 1.1, 1.1, b.rot); },
  shaker(b) {
    drawShadow(b.x, b.y + 6, 7, 3, 0.25);
    drawSpr(SPR.shaker, b.x, b.y - b.c, 1, 1, b.rot);
  },
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
  e.flash = -1; e.stun = 0; e.slowT = 0; e.slow = 0; e.burnT = 0; e.burnDps = 0; e.burnAcc = 0; e.burnW = null;
  e.hitCd.fill(0);
  e.elite = false; e.boss = false; e.dash = false; e.scale = 1; e.t = 0; e.phase = Math.random() * TAU;
  e.face = x < state.player.x ? 1 : -1; e.rot = 0; e.mode = 0; e.modeT = 0; e.shootT = rand(1, 2.5); e.dirx = 0; e.diry = 0;
  state.enemies.push(e);
  return e;
}
function makeElite(e) {
  const E = CONFIG.elite;
  e.elite = true; e.scale = E.scale; e.r *= E.scale;
  e.hp = e.maxHp = e.maxHp * E.hpMul; e.dmg *= E.dmgMul; e.speed *= E.speedMul; e.mass *= E.massMul;
  return e;
}
function spawnBoss(x, y, half, hp) {
  const B = CONFIG.boss, e = spawnEnemy('boss', x, y);
  e.boss = true; e.half = half; e.speed = B.speed * (half ? B.halfSpeedMul : 1);
  e.scale = half ? B.halfScale : 1; e.r = CONFIG.enemies.boss.r * e.scale;
  if (hp) e.hp = e.maxHp = hp;
  e.baseDmg = e.dmg * (half ? 0.8 : 1); e.dmg = e.baseDmg;
  e.mode = half ? 3 : 0; e.modeT = half ? 0.6 : 2.5;
  return e;
}

// ---- 敌人子弹（对象池） ----
const ebPool = new Pool(() => ({}));
function spawnEBullet(kind, x, y, vx, vy, r, dmg, life) {
  const b = ebPool.get();
  b.dead = false; b.kind = kind; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.r = r; b.dmg = dmg; b.life = life; b.t = 0; b.rot = 0;
  state.ebullets.push(b);
  return b;
}

// ---- 地面区域：催泪雾等 ----
const zonePool = new Pool(() => ({}));
function addZone(kind, x, y, r, life) {
  const z = zonePool.get();
  z.dead = false; z.kind = kind; z.x = x; z.y = y; z.r = r; z.life = life; z.t = 0; z.tick = 0; z.w = null; z.a = 0;
  state.zones.push(z);
  return z;
}

// ---- 掉落物：宝箱、包子、磁铁 ----
function spawnPickup(kind, x, y) {
  state.pickups.push({ kind, x, y, t: 0, dead: false, attract: false, spd: 0, phase: Math.random() * TAU });
}
// =====================================================================
// 游戏状态
// =====================================================================
const game = {
  phase: 'title', // title | play | pause | levelup | over | win
  time: 0,        // 真实时间（界面动画用）
  settings: Object.assign({ shake: true, muted: false, numbers: true }, store.get('kr_settings', {})),
  debug: /[?&]debug=1/.test(location.search),
  best: store.get('kr_best', null),
  stats: store.get('kr_stats', { runs: 0, wins: 0 }),
  btns: [],
  confirmRestart: 0,
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
    enemies: [], bullets: [], gems: [], fx: [], parts: [], ebullets: [], zones: [], pickups: [], texts: [],
    banners: [], timers: [], evIdx: 0, warn: null, dark: 0, darkTarget: 0, siren: 0,
    bossPhase: false, bossMax: 1, bossShown: null, won: false, winT: 0,
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
  // 本地最佳成绩：通关 > 未通关；同类比较存活时间/击杀
  const rec = { time: Math.floor(state.t), kills: state.kills, level: state.level, win, evo: state.evolutions || 0 };
  const score = (r) => (r.win ? 1e9 + r.kills : r.time * 1e5 + r.kills);
  game.newBest = !game.best || score(rec) > score(game.best);
  if (game.newBest) game.best = rec;
  game.stats.runs++;
  if (win) game.stats.wins++;
  store.set('kr_best', game.best);
  store.set('kr_stats', game.stats);
  game.ranking = state.player.weapons.map((w) => ({ id: w.id, name: wName(w), evo: w.evo, lv: w.lv, dmg: w.dmg })).sort((a, b) => b.dmg - a.dmg);
  if (!win) Sound.play('lose');
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
function currentWeights() {
  const W = CONFIG.spawnWeights;
  let w = W[0][1];
  for (const [t, ws] of W) if (state.t >= t) w = ws;
  return w;
}
function pickEnemyType() {
  const w = currentWeights();
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = Math.random() * sum;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'broccoli';
}
function spawnOne() {
  const type = pickEnemyType();
  const [x, y] = edgePoint(CONFIG.spawn.margin);
  if (type === 'chili') { // 小辣椒成群出现
    const n = randInt(...CONFIG.enemies.chili.pack);
    for (let i = 0; i < n; i++) spawnEnemy('chili', x + rand(-34, 34), y + rand(-34, 34));
    state.spawnAcc -= n - 1;
  } else spawnEnemy(type, x, y);
}

// ---- 时间线事件 ----
function showBanner(text, sub, color = '#ffd166', dur = 3) {
  state.banners.push({ text, sub, color, t: 0, dur });
  Sound.play('warn');
}
function later(delay, fn) { state.timers.push({ at: state.t + delay, fn }); }
function updateTimeline() {
  const evs = CONFIG.events;
  while (state.evIdx < evs.length && state.t >= evs[state.evIdx].t) runEvent(evs[state.evIdx++]);
  const tm = state.timers;
  for (let i = tm.length - 1; i >= 0; i--) if (state.t >= tm[i].at) { const f = tm[i].fn; tm.splice(i, 1); f(); }
}
function runEvent(ev) {
  const p = state.player;
  switch (ev.type) {
    case 'banner': showBanner(ev.text, ev.sub, ev.color); break;
    case 'chiliRush': {
      const ang = Math.random() * TAU;
      state.warn = { ang, until: state.t + ev.warn };
      showBanner('辣椒冲锋！', '一排小辣椒正从箭头方向冲过来', '#ff5e57');
      later(ev.warn, () => {
        const c = Math.cos(ang), s = Math.sin(ang), dist = Math.max(view.ww, view.wh) / 2 + 60;
        for (let i = 0; i < ev.count; i++) {
          const row = i % 2, off = (Math.floor(i / 2) - ev.count / 4) * 30 + row * 15;
          const x = state.player.x + c * (dist + row * 34) - s * off, y = state.player.y + s * (dist + row * 34) + c * off;
          const e = spawnEnemy('chili', x, y);
          e.dash = true; e.dirx = -c; e.diry = -s; e.speed = ev.speed;
        }
        Sound.play('rush');
      });
      break;
    }
    case 'elite': {
      const w = currentWeights(), types = Object.keys(w).filter((k) => k !== 'chili');
      const [x, y] = edgePoint(CONFIG.spawn.margin);
      makeElite(spawnEnemy(pick(types.length ? types : ['broccoli']), x, y));
      showBanner('精英出现！', '击败它必掉宝箱', '#ffd23f');
      break;
    }
    case 'ring': {
      const R = Math.max(view.ww, view.wh) * 0.56;
      for (let i = 0; i < ev.count; i++) {
        const a = (i / ev.count) * TAU;
        spawnEnemy(i % 3 === 2 ? 'onion' : 'broccoli', p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
      }
      showBanner('包围圈！', '趁圈子还没收紧，撕开一个缺口', '#ff7eb6');
      break;
    }
    case 'horde': {
      for (let i = 0; i < ev.burst && state.enemies.length < 400; i++) spawnOne();
      showBanner('大潮来袭！', '食材从四面八方涌来，撑住！', '#ff5e57');
      break;
    }
    case 'boss': {
      const e = spawnBoss(p.x, p.y - view.wh / 2 - 120, false);
      state.bossPhase = true; state.bossMax = e.maxHp; state.noSpawn = false;
      state.darkTarget = 0.28;
      showBanner('西瓜大王 登场！', '地上出现红色预警时快躲开它的滚动冲撞', '#ff5e57', 4);
      shake(0.5);
      Sound.play('boss');
      break;
    }
    case 'clear': {
      for (const e of state.enemies) if (!e.dead) { chips(e.x, e.y, 3, CONFIG.enemies[e.type].colors, 120, 4); killEnemy(e); }
      for (const b of state.ebullets) b.dead = true;
      state.noSpawn = true;
      state.darkTarget = 0.62;
      state.siren = 4;
      showBanner('警告', '西瓜大王正在接近……', '#ff3b3b', 4.5);
      shake(0.4);
      Sound.play('siren');
      break;
    }
  }
}
function updateSpawning(dt) {
  if (state.noSpawn) return;
  const B = CONFIG.boss.adds;
  const c = state.bossPhase ? [0, B.rate, B.max] : curveAt(CONFIG.spawn.curve, state.t);
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
const F_NOCRIT = 1, F_NOFLASH = 2, F_BURN = 4;
function hurtEnemy(e, base, w, dx, dy, kb, flags = 0) {
  if (e.dead) return 0;
  let dmg = base * state.player.might;
  let crit = false;
  if (!(flags & F_NOCRIT) && Math.random() < CONFIG.combat.critChance) { dmg *= CONFIG.combat.critMul; crit = true; }
  e.hp -= dmg;
  if (!(flags & F_NOFLASH) && e.flash < -CONFIG.combat.flashGap) e.flash = CONFIG.combat.hitFlash; // 闪白有间隔，被围殴的大怪不会一直是白的
  if (kb && !e.boss) { const k = kb / e.mass; e.kx += dx * k; e.ky += dy * k; }
  if (w) w.dmg += dmg;
  onEnemyHit(e, dmg, crit, flags);
  if (e.hp <= 0) killEnemy(e, w);
  return dmg;
}
function onEnemyHit(e, dmg, crit, flags) {
  if (!(flags & F_BURN)) Sound.play('hit');
  if (!game.settings.numbers) return;
  const v = Math.round(dmg);
  if (v < 1 || (!crit && state.texts.length >= CONFIG.fx.maxTexts * 0.8)) return;
  floatText(e.x + rand(-7, 7), e.y - e.r * e.scale - 6, String(v), crit ? '#ffd23f' : flags & F_BURN ? '#ff9a4d' : '#ffffff', crit ? 21 : 13, crit ? 0.8 : 0.55, crit);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  state.kills++;
  Sound.play('kill');
  dropGems(e);
  const C = CONFIG.enemies[e.type];
  if (!e.boss) chips(e.x, e.y - e.r * 0.3, e.elite ? 18 : CONFIG.fx.killChips, C.colors, e.elite ? 280 : 150, e.elite ? 6 : 4.2);
  if (e.type === 'egg') { // 碎成小蛋黄继续追
    for (let k = 0; k < C.split; k++) {
      const a = (k / C.split) * TAU + rand(-0.4, 0.4);
      const y = spawnEnemy('yolk', e.x + Math.cos(a) * 6, e.y + Math.sin(a) * 6);
      y.kx = Math.cos(a) * 230; y.ky = Math.sin(a) * 230;
    }
    chips(e.x, e.y, 6, ['#ffffff', '#f3e6cc'], 170, 4);
  } else if (e.type === 'onion') {
    addZone('gas', e.x, e.y, C.gasR * (e.elite ? 1.5 : 1), C.gasLife);
  }
  if (e.boss) {
    for (let k = 0; k < CONFIG.boss.redGems; k++) spawnGem(e.x + rand(-30, 30), e.y + rand(-30, 30), CONFIG.gems.values[2]);
    juiceBurst(e.x, e.y, 1);
    shake(0.6);
  } else if (e.elite) {
    spawnPickup('chest', e.x, e.y);
    for (let k = 0; k < CONFIG.elite.redGems; k++) spawnGem(e.x + rand(-10, 10), e.y + rand(-10, 10), CONFIG.gems.values[2]);
    shake(0.3);
  } else if (!e.dash) {
    const P = CONFIG.pickups;
    if (Math.random() < P.bunChance && state.pickups.filter((q) => q.kind === 'bun').length < P.maxBuns) spawnPickup('bun', e.x, e.y);
    else if (Math.random() < P.magnetChance) spawnPickup('magnet', e.x, e.y);
  }
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
  const C = CONFIG.enemies[e.type], n = C.gems || 1;
  if (C.gemChance && Math.random() > C.gemChance) return;
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

// ---- 粒子（对象池） ----
const P_CHIP = 0, P_GLOW = 1, P_SMOKE = 2, P_SPARK = 3;
const partPool = new Pool(() => ({}));
function addPart(type, x, y, vx, vy, life, size, color, spr) {
  if (state.parts.length >= CONFIG.fx.maxParticles) return null;
  const q = partPool.get();
  q.dead = false; q.type = type; q.x = x; q.y = y; q.vx = vx; q.vy = vy; q.life = q.max = life; q.size = size;
  q.color = color || '#fff'; q.spr = spr || null; q.z = 0; q.vz = 0; q.drag = 3; q.grow = 0; q.fire = 0;
  state.parts.push(q);
  return q;
}
// 碎屑：会往上弹再落地
function chips(x, y, n, colors, speed = 160, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = rand(0.35, 1) * speed;
    const q = addPart(P_CHIP, x, y, Math.cos(a) * s, Math.sin(a) * s * 0.7, rand(0.45, 0.8), size * rand(0.6, 1.2), colors[(Math.random() * colors.length) | 0]);
    if (q) { q.vz = rand(120, 260); q.z = rand(0, 8); q.drag = 2.2; }
  }
}
function explosionFx(x, y, r, style) {
  if (style === 'pepper') {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU, s = rand(40, 150) * (r / 90);
      const q = addPart(P_SMOKE, x + Math.cos(a) * 8, y + Math.sin(a) * 8, Math.cos(a) * s, Math.sin(a) * s, rand(0.55, 0.9), rand(0.7, 1.3) * (r / 90), 0, SPR.smoke);
      if (q) { q.drag = 2.5; q.grow = 0.8; }
    }
    chips(x, y, 10, ['#2b1d2e', '#5a4632', '#7a6a58'], 220, 3.5);
    const g = addPart(P_GLOW, x, y, 0, 0, 0.18, (r / 48) * 2, 0, SPR.glowO); if (g) g.grow = 0.4;
    addRing(x, y, r, 0.35, 'rgba(230,214,180,0.85)', 5);
  }
}
// 伤害/提示飘字（第 8 步扩展）
const textPool = new Pool(() => ({}));
function floatText(x, y, str, color, size, life, big) {
  if (state.texts.length >= CONFIG.fx.maxTexts) return;
  const t = textPool.get();
  t.dead = false; t.x = x; t.y = y; t.str = str; t.color = color; t.size = size; t.life = t.max = life;
  t.vx = rand(-18, 18); t.vy = big ? -80 : -60; t.big = !!big;
  state.texts.push(t);
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
  floatText(p.x, p.y - 34, `-${Math.round(dmg)}`, '#ff5e57', 17, 0.7, true);
  if (p.hp <= 0) {
    p.hp = 0;
    state.dying = 0.55;
    state.slowmo = 1.6; state.slowmoScale = 0.3;
    shake(0.6);
    chips(p.x, p.y, 14, ['#ffffff', '#ef4b3f', '#ffd9b8'], 220, 5);
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
  let spd = CONFIG.player.speed * p.spdMul;
  if (p.gasT > 0) { // 催泪雾：减速 + 流眼泪
    p.gasT -= dt;
    spd *= 1 - CONFIG.enemies.onion.gasSlow;
    if (Math.random() < dt * 10) { const q = addPart(P_CHIP, p.x + p.flip * 5 + rand(-3, 3), p.y - 12, rand(-30, 30), rand(10, 30), 0.5, 2.6, '#8fd8ff'); if (q) { q.vz = 60; q.z = 6; } }
  }
  const tx = ix * spd, ty = iy * spd;
  const acc = (spd / CONFIG.player.accelTime) * dt;
  const dx = tx - p.vx, dy = ty - p.vy, dl = Math.hypot(dx, dy);
  if (dl <= acc) { p.vx = tx; p.vy = ty; } else { p.vx += (dx / dl) * acc; p.vy += (dy / dl) * acc; }
  p.x += p.vx * dt; p.y += p.vy * dt;
  const sp = Math.hypot(p.vx, p.vy);
  p.moving = sp > 10;
  p.walkT += dt * (sp / spd) * 2.2;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.hp > 0 && p.hp < p.maxHp * CONFIG.player.lowHp) { // 低血量心跳
    p.heartT = (p.heartT || 0) - dt;
    if (p.heartT <= 0) { p.heartT = CONFIG.audio.heartbeat; Sound.play('heart'); }
  }
  if (p.regen > 0 && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
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

function updateParts(dt) {
  const ps = state.parts;
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i];
    q.life -= dt;
    if (q.life <= 0) { q.dead = true; continue; }
    const f = Math.exp(-q.drag * dt);
    q.vx *= f; q.vy *= f;
    q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.type === P_CHIP) {
      q.vz -= 900 * dt; q.z += q.vz * dt;
      if (q.z < 0) { q.z = 0; q.vz *= -0.35; q.vx *= 0.6; q.vy *= 0.6; }
    }
  }
  compact(ps, partPool);
}

function updateTexts(dt) {
  const ts = state.texts;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    t.life -= dt;
    if (t.life <= 0) { t.dead = true; continue; }
    t.x += t.vx * dt; t.y += t.vy * dt;
    t.vy *= Math.exp(-dt * 4); t.vx *= Math.exp(-dt * 4);
  }
  compact(ts, textPool);
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
    if (e.flash > -1) e.flash -= dt;
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
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.burnAcc += e.burnDps * dt;
      if (Math.random() < dt * 6) { const q = addPart(P_GLOW, e.x + rand(-6, 6), e.y - e.r * 0.5, rand(-8, 8), rand(-50, -25), 0.4, 0.25); if (q) { q.fire = 1; q.drag = 1; q.grow = 1; } }
      if (e.burnAcc >= 4 || (e.burnT <= 0 && e.burnAcc > 0)) {
        const a = e.burnAcc; e.burnAcc = 0;
        hurtEnemy(e, a, e.burnW, 0, 0, 0, F_NOCRIT | F_NOFLASH | F_BURN);
        if (e.dead) continue;
      }
      if (e.burnT <= 0) e.burnDps = 0;
    }
    let mvx = 0, mvy = 0;
    if (e.stun > 0) e.stun -= dt;
    else if (e.dash) { mvx = e.dirx * spd; mvy = e.diry * spd; }
    else if (e.boss) { bossAI(e, dt, dx, dy, d, spd); mvx = e.vx; mvy = e.vy; }
    else if (e.type === 'potato') { potatoAI(e, dt, dx, dy, d, spd); mvx = e.vx; mvy = e.vy; }
    else { mvx = (dx / d) * spd; mvy = (dy / d) * spd; }
    e.vx = mvx; e.vy = mvy;
    e.x += (mvx + e.kx) * dt; e.y += (mvy + e.ky) * dt;
    e.kx *= kd; e.ky *= kd;
    if (e.type === 'chili') { // 小辣椒头朝着前进方向
      if (mvx || mvy) {
        let r = Math.atan2(mvy, mvx);
        if (Math.cos(r) < 0) { e.face = -1; r -= Math.PI; } else e.face = 1;
        e.rot += angleDiff(e.rot, r) * Math.min(1, dt * 12);
      }
    } else if (Math.abs(dx) > 3) e.face = dx > 0 ? 1 : -1;
    // 接触伤害 + 不让敌人叠进主角身体里
    const ex = e.x - p.x, ey = e.y - p.y, ed2 = ex * ex + ey * ey;
    const cr = e.r + p.r * 0.75;
    if (ed2 < cr * cr) {
      hurtPlayer(e.dmg);
      const minD = (e.r + p.r) * 0.82, ed = Math.sqrt(ed2) || 1;
      if (ed < minD) {
        if (e.boss) { p.x = e.x - (ex / ed) * minD; p.y = e.y - (ey / ed) * minD; } // 被 Boss 顶开
        else { e.x = p.x + (ex / ed) * minD; e.y = p.y + (ey / ed) * minD; }
      }
    }
  }
  separate();
}

// 西瓜大王：追击 → 蓄力（地上红色预警）→ 滚动冲撞 → 喷西瓜籽喘口气
function bossAI(e, dt, dx, dy, d, spd) {
  const B = CONFIG.boss;
  e.modeT -= dt;
  e.dmg = e.baseDmg;
  switch (e.mode) {
    case 0:
      e.vx = (dx / d) * spd; e.vy = (dy / d) * spd;
      e.rot += angleDiff(e.rot, 0) * Math.min(1, dt * 5);
      if (e.modeT <= 0) { e.mode = 1; e.modeT = B.windup; e.dirx = dx / d; e.diry = dy / d; Sound.play('bossWarn'); }
      break;
    case 1: {
      e.vx = 0; e.vy = 0;
      if (e.modeT > B.windup * 0.45) { // 前半段还会微调方向
        const k = Math.min(1, dt * 5);
        e.dirx = lerp(e.dirx, dx / d, k); e.diry = lerp(e.diry, dy / d, k);
        const l = Math.hypot(e.dirx, e.diry) || 1; e.dirx /= l; e.diry /= l;
      }
      e.rot = Math.sin(e.t * 40) * 0.08;
      if (e.modeT <= 0) { e.mode = 2; e.modeT = B.rollTime; shake(0.25); Sound.play('roll'); }
      break;
    }
    case 2: {
      const rs = B.rollSpeed * (e.half ? B.halfSpeedMul : 1) * (e.slowT > 0 ? 1 - e.slow : 1);
      e.vx = e.dirx * rs; e.vy = e.diry * rs;
      e.dmg = B.rollDmg * (e.half ? 0.8 : 1);
      e.rot += ((rs / e.r) * dt) * (e.dirx >= 0 ? 1 : -1);
      if (Math.random() < dt * 30) chips(e.x - e.dirx * e.r * 0.6, e.y + e.r * 0.8, 1, ['#8d7a6a', '#b8a898'], 80, 4);
      if (e.modeT <= 0) { e.mode = 3; e.modeT = B.recover; spitSeeds(e); }
      break;
    }
    default:
      e.vx = 0; e.vy = 0;
      e.rot += angleDiff(e.rot, 0) * Math.min(1, dt * 6);
      if (e.modeT <= 0) { e.mode = 0; e.modeT = rand(...B.chaseTime) / (e.half ? B.halfSpeedMul : 1); }
  }
  // 血量过半：裂成两个小西瓜
  if (!e.half && e.hp <= e.maxHp * B.split) splitBoss(e);
}
function spitSeeds(e) {
  const B = CONFIG.boss, n = e.half ? B.halfSeeds : B.seeds, off = Math.random() * TAU;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU;
    spawnEBullet('seed', e.x + Math.cos(a) * e.r * 0.7, e.y + Math.sin(a) * e.r * 0.7, Math.cos(a) * B.seedSpeed, Math.sin(a) * B.seedSpeed, 6, B.seedDmg, 4);
  }
  Sound.play('spit');
}
function splitBoss(e) {
  e.dead = true;
  const hp = Math.max(1, e.hp) / 2;
  for (const s of [-1, 1]) {
    const h = spawnBoss(e.x + s * 45, e.y, true, hp);
    h.kx = s * 380;
  }
  juiceBurst(e.x, e.y, 1.3);
  shake(0.7);
  state.slowmo = 0.6; state.slowmoScale = 0.3;
  showBanner('西瓜大王裂开了！', '两个小西瓜跑得更快了', '#ff7eb6', 3);
  Sound.play('split');
}
// 西瓜汁飞溅
function juiceBurst(x, y, k) {
  chips(x, y, Math.round(26 * k), ['#e8344a', '#ff6b81', '#2e7d32', '#9be07a', '#231a26'], 340 * k, 6);
  for (let i = 0; i < 16 * k; i++) {
    const a = Math.random() * TAU, sp = rand(80, 260) * k;
    const q = addPart(P_GLOW, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.4, 0.7), rand(0.5, 0.9), 0, SPR.glowR);
    if (q) q.drag = 3;
  }
  addRing(x, y, 160 * k, 0.5, 'rgba(255,107,129,0.9)', 8);
}

// 打败 Boss：庆祝一下再结算
function checkWin(dt) {
  if (!state.bossPhase) return;
  if (!state.won) {
    for (const e of state.enemies) if (e.boss && !e.dead) return;
    state.won = true; state.winT = 1.4;
    state.noSpawn = true; state.vacuum = true; state.darkTarget = 0;
    state.slowmo = 1.2; state.slowmoScale = 0.35;
    state.player.invuln = 99;
    for (const e of state.enemies) if (!e.dead) { chips(e.x, e.y, 3, CONFIG.enemies[e.type].colors, 120, 4); killEnemy(e); }
    for (const b of state.ebullets) b.dead = true;
    showBanner('通关！', '西瓜大王被打败了，厨房保住了！', '#ffd23f', 3);
    Sound.play('win');
    return;
  }
  state.winT -= dt;
  state.vacuum = true;
  if (Math.random() < dt * 14) { // 烟花
    const x = cam.x + rand(-0.4, 0.4) * view.ww, y = cam.y + rand(-0.4, 0.3) * view.wh, spr = pick([SPR.glowG, SPR.glowR, SPR.glowC, SPR.glowP]);
    for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, sp = rand(140, 220); const q = addPart(P_GLOW, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.8, 0.3, 0, spr); if (q) q.drag = 2.2; }
  }
  if (state.winT <= 0) endRun(true);
}

// 土豆炮手：停在远处吐土豆
function potatoAI(e, dt, dx, dy, d, spd) {
  const C = CONFIG.enemies.potato;
  if (e.mode === 1) { // 蓄力
    e.vx = 0; e.vy = 0; e.modeT -= dt;
    if (e.modeT <= 0) {
      e.mode = 0; e.shootT = C.shootCd * rand(0.85, 1.15);
      const B = C.bullet, p = state.player, lead = (d / B.speed) * 0.3;
      const ang = Math.atan2(p.y + p.vy * lead - e.y, p.x + p.vx * lead - e.x);
      spawnEBullet('potato', e.x, e.y + 4, Math.cos(ang) * B.speed, Math.sin(ang) * B.speed, B.r * (e.elite ? 1.4 : 1), B.dmg * (e.elite ? 1.5 : 1), B.life);
      e.kx -= Math.cos(ang) * 60; e.ky -= Math.sin(ang) * 60;
      Sound.play('spit');
    }
    return;
  }
  const ux = dx / d, uy = dy / d;
  if (d > C.keep + 30) { e.vx = ux * spd; e.vy = uy * spd; }
  else if (d < C.keep - 60) { e.vx = -ux * spd * 0.8; e.vy = -uy * spd * 0.8; }
  else { const s = Math.sin(e.phase + e.t * 0.3) > 0 ? 1 : -1; e.vx = -uy * spd * 0.45 * s; e.vy = ux * spd * 0.45 * s; }
  e.shootT -= dt;
  if (e.shootT <= 0 && d < C.keep + 140 && onScreen(e.x, e.y, -10)) { e.mode = 1; e.modeT = C.windup; }
}

function updateEBullets(dt) {
  const p = state.player, list = state.ebullets;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    b.t += dt;
    if (b.t > b.life) { b.dead = true; continue; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.rot += dt * 9;
    const dx = b.x - p.x, dy = b.y - p.y, rs = b.r + p.r * 0.7;
    if (dx * dx + dy * dy < rs * rs && p.hp > 0) {
      b.dead = true;
      hurtPlayer(b.dmg);
      chips(b.x, b.y, 5, ['#c69060', '#8d5f38'], 120, 3.5);
    }
  }
  compact(list, ebPool);
}

function updateZones(dt) {
  const p = state.player, zs = state.zones;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    z.t += dt;
    if (z.t >= z.life) { z.dead = true; if (ZONE_END[z.kind]) ZONE_END[z.kind](z); continue; }
    if (z.kind === 'gas') {
      const dx = p.x - z.x, dy = p.y - z.y;
      if (dx * dx + dy * dy < z.r * z.r * 0.8) p.gasT = 0.12;
    } else ZONE_UPDATE[z.kind](z, dt);
  }
  compact(zs, zonePool);
}


function updatePickups(dt) {
  const p = state.player, pr = CONFIG.player.pickup * p.pickupMul;
  for (const q of state.pickups) {
    if (q.dead) continue;
    q.t += dt;
    const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
    if (!q.attract && d < pr) { q.attract = true; q.spd = -80; }
    if (q.attract) {
      q.spd += 1600 * dt;
      const st = q.spd * dt;
      if (d < p.r + 10 || st >= d) { collectPickup(q); continue; }
      q.x += (dx / d) * st; q.y += (dy / d) * st;
    }
  }
  state.pickups = state.pickups.filter((q) => !q.dead);
}
function collectPickup(q) {
  q.dead = true;
  const p = state.player, P = CONFIG.pickups;
  if (q.kind === 'bun') {
    p.hp = Math.min(p.maxHp, p.hp + P.bunHeal);
    floatText(p.x, p.y - 40, `+${P.bunHeal}`, '#7dff9a', 18, 1);
    Sound.play('heal');
  } else if (q.kind === 'magnet') {
    state.vacuum = true;
    floatText(p.x, p.y - 40, '全吸过来！', '#ff8a8a', 16, 1);
    Sound.play('magnet');
  } else if (q.kind === 'chest') {
    p.hp = Math.min(p.maxHp, p.hp + P.chestHeal);
    Sound.play('chest');
    game.flashAt = game.time;
    addRing(q.x, q.y, 120, 0.5, 'rgba(255,214,102,0.9)', 6);
    openLevelUp('chest');
  }
}

function updateBanners(dt) {
  const bs = state.banners;
  if (bs.length) { bs[0].t += dt; if (bs[0].t >= bs[0].dur) bs.shift(); }
  if (state.siren > 0) state.siren -= dt;
  state.dark += (state.darkTarget - state.dark) * Math.min(1, dt * 1.2);
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
    updateTimeline();
    updateSpawning(dt);
  }
  updateBullets(dt);
  updateEnemies(dt);
  updateEBullets(dt);
  updateZones(dt);
  if (state.dying <= 0) updatePickups(dt);
  updateBanners(dt);
  if (state.dying <= 0) checkWin(dt);
  if (state.dying <= 0) updateGems(dt);
  updateParts(dt);
  updateTexts(dt);
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
    if (e.elite) { // 精英光环
      const pulse = 1 + Math.sin(state.t * 5 + e.phase) * 0.12;
      ctx.globalCompositeOperation = 'lighter';
      drawSpr(SPR.glowG, e.x, e.y, (e.r / 15) * pulse, (e.r / 15) * pulse * 0.9);
      ctx.globalCompositeOperation = 'source-over';
      setWorld();
      ctx.strokeStyle = `rgba(255,214,90,${0.55 + Math.sin(state.t * 6) * 0.25})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.9, e.r * 1.25 * pulse, e.r * 0.5 * pulse, 0, 0, TAU); ctx.stroke();
    }
    const charging = e.mode === 1 && e.type === 'potato' && ((e.modeT * 16) | 0) % 2 === 0;
    const v = e.flash > 0 ? art.w : e.burnT > 0 || charging ? art.b : e.slowT > 0 ? art.f : art.n;
    const ph = e.stun > 0 ? e.phase : e.t * ENEMY_ART[e.type].anim + e.phase;
    const sq = Math.sin(ph) * 0.07, sc = e.scale;
    drawSpr(v, e.x, e.y, sc * (1 + sq) * e.face, sc * (1 - sq), e.rot + Math.sin(ph * 0.5) * 0.07);
  }
  // 眩晕：头顶转圈的小星星
  setWorld();
  ctx.fillStyle = '#ffe066';
  ctx.beginPath();
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.stun <= 0 || !onScreen(e.x, e.y, m)) continue;
    for (let j = 0; j < 2; j++) {
      const a = state.t * 7 + j * Math.PI + e.phase;
      const x = e.x + Math.cos(a) * e.r * 0.75, y = e.y - e.r * 1.2 * e.scale + Math.sin(a) * 3;
      ctx.moveTo(x + 2.4, y); ctx.arc(x, y, 2.4, 0, TAU);
    }
  }
  ctx.fill();
}

function drawEBullets() {
  for (const b of state.ebullets) {
    if (!onScreen(b.x, b.y, 30)) continue;
    drawShadow(b.x, b.y + 9, b.r * 0.8, b.r * 0.3, 0.22);
    if (b.kind === 'potato') drawSpr(SPR.potatoB, b.x, b.y, b.r / 6.5, b.r / 6.5, b.rot);
    else drawSpr(SPR.seed, b.x, b.y, 1, 1, Math.atan2(b.vy, b.vx));
  }
}

function drawZones() {
  for (const z of state.zones) {
    if (!onScreen(z.x, z.y, z.r + 20)) continue;
    const a = Math.min(1, z.t / 0.3, (z.life - z.t) / 0.8);
    if (z.kind === 'gas') {
      for (let i = 0; i < 6; i++) {
        const ang = i * 1.05 + z.t * 0.4, rr2 = z.r * (0.25 + (i % 3) * 0.2);
        const s = (z.r / 24) * (0.55 + (i % 2) * 0.2) * (1 + Math.sin(z.t * 2 + i) * 0.08);
        ctx.globalAlpha = a * 0.5;
        drawSpr(SPR.glowP, z.x + Math.cos(ang) * rr2, z.y + Math.sin(ang) * rr2 * 0.7, s, s * 0.8);
      }
      ctx.globalAlpha = 1;
    } else if (ZONE_DRAW[z.kind]) ZONE_DRAW[z.kind](z, a);
  }
}
// Boss 冲撞预警：地上的红色通道
function drawBossTelegraph() {
  for (const e of state.enemies) {
    if (!e.boss || e.dead || e.mode !== 1) continue;
    const B = CONFIG.boss, len = B.rollSpeed * (e.half ? B.halfSpeedMul : 1) * B.rollTime, w = e.r * 2;
    const ang = Math.atan2(e.diry, e.dirx), k = 1 - e.modeT / B.windup;
    const co = Math.cos(ang), si = Math.sin(ang);
    ctx.setTransform(K * co, K * si, -K * si, K * co, OX + e.x * K, OY + e.y * K);
    ctx.fillStyle = `rgba(255,40,40,${0.12 + k * 0.18 + Math.sin(state.t * 30) * 0.05})`;
    ctx.fillRect(0, -w / 2, len, w);
    ctx.fillStyle = `rgba(255,60,60,${0.5 + k * 0.4})`;
    ctx.fillRect(0, -w / 2, len * k, 3); ctx.fillRect(0, w / 2 - 3, len * k, 3);
    ctx.strokeStyle = `rgba(255,120,100,${0.5 + k * 0.4})`; ctx.lineWidth = 5;
    for (let i = 1; i <= 4; i++) {
      const x = ((i / 5 + state.t * 0.8) % 1) * len;
      ctx.beginPath(); ctx.moveTo(x - 12, -16); ctx.lineTo(x + 6, 0); ctx.lineTo(x - 12, 16); ctx.stroke();
    }
  }
}

function drawPickups() {
  for (const q of state.pickups) {
    if (!onScreen(q.x, q.y, 40)) continue;
    const bob = Math.sin(state.t * 3 + q.phase) * 3;
    const spr = q.kind === 'chest' ? SPR.chest : q.kind === 'bun' ? SPR.bun : SPR.magnet;
    ctx.globalCompositeOperation = 'lighter';
    drawSpr(q.kind === 'chest' ? SPR.glowG : q.kind === 'bun' ? SPR.glowW : SPR.glowR, q.x, q.y, q.kind === 'chest' ? 1.6 : 0.9, q.kind === 'chest' ? 1.4 : 0.8);
    ctx.globalCompositeOperation = 'source-over';
    drawShadow(q.x, q.y + 13, 12, 4, 0.25);
    const s = q.kind === 'chest' ? 1 : 0.75;
    drawSpr(spr, q.x, q.y - 4 + bob, s, s, q.kind === 'chest' ? Math.sin(state.t * 4) * 0.05 : 0);
  }
}

function drawEliteBars() {
  setUI();
  for (const e of state.enemies) {
    if (!e.elite || !onScreen(e.x, e.y, 0)) continue;
    const x = toSX(e.x), y = toSY(e.y - e.r * 1.6) , w = 44 * view.zoom, h = 5 * view.zoom;
    rr(ctx, x - w / 2 - 1.5, y - 1.5, w + 3, h + 3, 3); ctx.fillStyle = 'rgba(20,14,26,0.85)'; ctx.fill();
    rr(ctx, x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), h, 2); ctx.fillStyle = '#ffd23f'; ctx.fill();
  }
}

function drawParts(additive) {
  const ps = state.parts;
  setWorld();
  if (additive) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < ps.length; i++) {
    const q = ps[i];
    const isAdd = q.type === P_GLOW || q.type === P_SPARK;
    if (isAdd !== additive || !onScreen(q.x, q.y, 60)) continue;
    const k = q.life / q.max;
    if (q.type === P_CHIP) {
      ctx.globalAlpha = Math.min(1, k * 2.5);
      ctx.fillStyle = q.color;
      const s = q.size;
      ctx.fillRect(q.x - s / 2, q.y - q.z - s / 2, s, s);
    } else if (q.type === P_SPARK) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = q.color; ctx.lineWidth = q.size;
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.vx * 0.04, q.y - q.vy * 0.04); ctx.stroke();
    } else {
      const spr = q.fire ? (k > 0.62 ? SPR.glowY : k > 0.32 ? SPR.glowO : SPR.glowR) : q.spr || SPR.glowW;
      const s = q.size * (1 + q.grow * (1 - k));
      ctx.globalAlpha = q.type === P_SMOKE ? Math.min(1, k * 1.6) * 0.75 : Math.min(1, k * 1.8);
      drawSpr(spr, q.x, q.y, s, s);
      setWorld();
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawTexts() {
  const ts = state.texts;
  if (!ts.length) return;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let lastSize = 0;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (!onScreen(t.x, t.y, 40)) continue;
    const age = t.max - t.life;
    const pop = age < 0.1 ? 1 + (1 - age / 0.1) * (t.big ? 0.8 : 0.4) : 1;
    ctx.setTransform(K * pop, 0, 0, K * pop, OX + t.x * K, OY + t.y * K);
    if (t.size !== lastSize) { ctx.font = font(t.size, '900'); lastSize = t.size; }
    ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.4));
    ctx.fillStyle = 'rgba(30,16,32,0.9)';
    ctx.fillText(t.str, 1.2, 1.6);
    ctx.fillStyle = t.color;
    ctx.fillText(t.str, 0, 0);
  }
  ctx.globalAlpha = 1;
}

function drawWeapons(ground) {
  const ws = state.player.weapons;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const fn = ground ? w.def.drawGround : w.def.draw;
    if (fn) fn(w, wStats(w));
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
  drawZones();
  drawBossTelegraph();
  if (state.player.hp > 0) drawWeapons(true);
  drawGems();
  drawPickups();
  drawEnemies();
  drawParts(false);
  drawPlayer();
  if (state.player.hp > 0) drawWeapons(false);
  drawBullets();
  drawEBullets();
  drawParts(true);
  drawFx();
  drawTexts();
  drawEliteBars();
  // 7:30 之后屏幕变暗，只留主角周围一圈光
  if (state.dark > 0.01) {
    setUI();
    const px = toSX(state.player.x), py = toSY(state.player.y);
    const g = ctx.createRadialGradient(px, py, 90 * view.zoom, px, py, Math.max(view.w, view.h) * 0.75);
    g.addColorStop(0, 'rgba(6,3,14,0)');
    g.addColorStop(1, `rgba(6,3,14,${state.dark})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  }
  // 暗角
  setUI();
  ctx.drawImage(SPR.vignette, 0, 0, view.w, view.h);
  // 受击红闪 + 低血量时屏幕边缘泛红
  const p = state.player;
  let red = p.hurtT > 0 ? (p.hurtT / 0.35) * 0.5 : 0;
  if (p.hp > 0 && p.hp < p.maxHp * CONFIG.player.lowHp) red = Math.max(red, 0.28 + Math.sin(game.time * 7) * 0.14);
  if (red > 0.01) {
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.32, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.72);
    g.addColorStop(0, 'rgba(255,20,40,0)'); g.addColorStop(1, `rgba(255,20,40,${red})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  }
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

function slotBox(x, y, s, border) {
  rr(ctx, x, y, s, s, 7 * view.ui);
  ctx.fillStyle = 'rgba(18,14,28,0.72)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = border; ctx.stroke();
}
function renderInventory() {
  const u = view.ui, s = 34 * u, g = 5 * u, x0 = 12 * u, y0 = 26 * u, p = state.player;
  for (let row = 0; row < 2; row++) {
    const items = row === 0 ? p.weapons : p.passives;
    for (let i = 0; i < 6; i++) {
      const x = x0 + i * (s + g), y = y0 + row * (s + g), it = items[i];
      slotBox(x, y, s, it ? (it.evo ? '#ffd23f' : 'rgba(255,255,255,0.2)') : 'rgba(255,255,255,0.06)');
      if (!it) continue;
      drawIcon(it.id, x + s / 2, y + s / 2, s * 0.88);
      textO(it.evo ? '★' : String(it.lv), x + s - 4 * u, y + s - 7 * u, 12 * u, it.evo ? '#ffd23f' : '#ffffff', OL, 3 * u, 'right');
    }
  }
}

// 屏幕边缘的方向箭头（宝箱、精英、Boss 在屏幕外时）
function edgeArrow(wx, wy, color, iconId, label) {
  const u = view.ui, m = 34 * u;
  const x = toSX(wx), y = toSY(wy), cx = view.w / 2, cy = view.h / 2;
  if (x > m * 0.4 && x < view.w - m * 0.4 && y > m * 0.4 && y < view.h - m * 0.4) return;
  const ang = Math.atan2(y - cy, x - cx);
  const hw = view.w / 2 - m, hh = view.h / 2 - m;
  const t = Math.min(hw / (Math.abs(Math.cos(ang)) || 1e-6), hh / (Math.abs(Math.sin(ang)) || 1e-6));
  const ax = cx + Math.cos(ang) * t, ay = cy + Math.sin(ang) * t;
  const pulse = 1 + Math.sin(game.time * 6) * 0.1;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.beginPath(); ctx.arc(0, 0, 17 * u * pulse, 0, TAU);
  ctx.fillStyle = 'rgba(20,14,30,0.8)'; ctx.fill(); ctx.lineWidth = 2.5 * u; ctx.strokeStyle = color; ctx.stroke();
  ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(26 * u * pulse, 0); ctx.lineTo(17 * u, -7 * u); ctx.lineTo(17 * u, 7 * u); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();
  if (iconId) drawIcon(iconId, ax, ay, 26 * u);
  else if (label) text(label, ax, ay + 1, 13 * u, color);
}

function renderBossBar() {
  const u = view.ui, w = Math.min(560 * u, view.w - 40 * u), h = 16 * u, x = view.w / 2 - w / 2, y = view.h - 54 * u;
  let hp = 0;
  for (const e of state.enemies) if (e.boss && !e.dead) hp += Math.max(0, e.hp);
  const f = clamp(hp / state.bossMax, 0, 1);
  state.bossShown = state.bossShown == null ? f : lerp(state.bossShown, f, 0.08);
  rr(ctx, x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, 9 * u); ctx.fillStyle = 'rgba(20,12,24,0.85)'; ctx.fill();
  rr(ctx, x, y, w * state.bossShown, h, 6 * u); ctx.fillStyle = '#ffd0d0'; ctx.fill();
  rr(ctx, x, y, w * f, h, 6 * u); ctx.fillStyle = lg(ctx, x, 0, x + w, 0, ['#ff5e57', '#ff2e63']); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x + 4 * u, y + 2 * u, Math.max(0, w * f - 8 * u), h * 0.3);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + w * CONFIG.boss.split, y - 2 * u); ctx.lineTo(x + w * CONFIG.boss.split, y + h + 2 * u); ctx.stroke();
  textO('西瓜大王', view.w / 2, y - 14 * u, 18 * u, '#ffd0d0', OL, 5 * u);
}

function renderBanners() {
  const b = state.banners[0], u = view.ui;
  if (b) {
    const k = b.t / b.dur, a = Math.min(1, b.t / 0.25, (b.dur - b.t) / 0.5);
    const y = 150 * u - (1 - easeOutBack(Math.min(1, b.t / 0.4))) * 40 * u;
    ctx.globalAlpha = a;
    const w = 520 * u;
    ctx.fillStyle = lg(ctx, view.w / 2 - w / 2, 0, view.w / 2 + w / 2, 0, ['rgba(20,12,28,0)', 'rgba(20,12,28,0.72)', 'rgba(20,12,28,0)']);
    ctx.fillRect(view.w / 2 - w / 2, y - 34 * u, w, 82 * u);
    textO(b.text, view.w / 2, y, 40 * u, b.color, OL, 8 * u);
    if (b.sub) text(b.sub, view.w / 2, y + 34 * u, 16 * u, '#f3e9ff', 'center', 'normal');
    ctx.globalAlpha = 1;
    void k;
  }
  // 辣椒冲锋来袭方向
  if (state.warn && state.t < state.warn.until && ((game.time * 6) | 0) % 2 === 0) {
    const p = state.player;
    edgeArrow(p.x + Math.cos(state.warn.ang) * 5000, p.y + Math.sin(state.warn.ang) * 5000, '#ff4d4d', null, '!!');
  }
  // 警报红光
  if (state.siren > 0) {
    const a = (0.5 + Math.sin(game.time * 9) * 0.5) * Math.min(1, state.siren) * 0.45;
    const g = ctx.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.3, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
    g.addColorStop(0, 'rgba(255,0,0,0)'); g.addColorStop(1, `rgba(255,30,30,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, view.w, view.h);
  }
}

function renderHUD() {
  setUI();
  const u = view.ui;
  renderXpBar();
  renderInventory();
  for (const q of state.pickups) if (q.kind === 'chest') edgeArrow(q.x, q.y, '#ffd23f', 'chest');
  for (const e of state.enemies) if (e.elite) edgeArrow(e.x, e.y, '#ffb84d', null, '精');
  for (const e of state.enemies) if (e.boss) edgeArrow(e.x, e.y, '#ff5e57', null, '王');
  if (state.bossPhase && !state.won) renderBossBar();
  renderBanners();
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
  // 围着小厨师蹦跶的食材
  const foes = ['broccoli', 'chili', 'egg', 'onion', 'potato', 'yolk'];
  foes.forEach((f, i) => {
    const s = SPR.enemy[f].n, side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const x = cx + side * (120 + row * 70) * u, y = cy - 6 * u + (row - 1) * 26 * u - Math.abs(Math.sin(game.time * 5 + i)) * 10 * u;
    const sc = (1.5 * u) / sprRes;
    ctx.save(); ctx.translate(x, y); ctx.scale(-side * sc, sc); ctx.rotate(Math.sin(game.time * 3 + i) * 0.1);
    ctx.drawImage(s.c, -s.ax * sprRes, -s.ay * sprRes);
    ctx.restore();
  });
  const rows = [['WASD / 方向键', '移动'], ['1 / 2 / 3 或鼠标', '升级时选卡（R 重抽）'], ['P / Esc', '暂停（查看属性与设置）'], ['M / V / N', '静音 / 屏幕震动 / 伤害数字'], ['R', '死亡或通关后重开']];
  const pw = 440 * u, ph = (rows.length * 28 + 26) * u, px = cx - pw / 2, py = cy + 66 * u;
  panel(px, py, pw, ph, 14 * u);
  rows.forEach(([k, v], i) => {
    const y = py + (26 + i * 28) * u;
    text(k, cx - 16 * u, y, 16 * u, '#ffd166', 'right');
    text(v, cx + 16 * u, y, 16 * u, '#e9e2f5', 'left', 'normal');
  });
  if (Math.sin(game.time * 5) > -0.3) textO('按 空格 开始', cx, py + ph + 40 * u, 28 * u, '#ffffff', OL, 6 * u);
  const b = game.best;
  if (b) text(`最佳：${b.win ? '已通关 · ' : ''}存活 ${fmtTime(b.time)} · 击杀 ${b.kills} · Lv ${b.level}    累计 ${game.stats.runs} 局 / 通关 ${game.stats.wins} 次`, cx, view.h - 22 * u, 14 * u, 'rgba(240,230,255,0.6)', 'center', 'normal');
}

// 可点击按钮（本帧绘制，下一帧响应点击）
function button(x, y, w, h, label, action, opt = {}) {
  const m = input.mouse, hot = m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = hot ? opt.hot || 'rgba(255,255,255,0.24)' : opt.bg || 'rgba(255,255,255,0.1)';
  ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
  text(label, x + w / 2, y + h / 2 + 1, opt.size || 15 * view.ui, opt.color || '#ffffff');
  game.btns.push({ x, y, w, h, action });
}
function fmtBig(n) { return n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '万' : String(Math.round(n)); }
function statLine(w) {
  const s = wStats(w), d = w.def;
  return Object.keys(d.labels).filter((k) => s[k] != null).slice(0, 3).map((k) => `${labelOf(d, k)} ${fmtStat(d, k, s[k])}`).join(' · ');
}
function togglesRow(cx, y) {
  const u = view.ui, S = game.settings, bw = 132 * u, bh = 36 * u, gap = 10 * u;
  const items = [
    [`屏幕震动：${S.shake ? '开' : '关'}（V）`, () => { S.shake = !S.shake; saveSettings(); }],
    [`伤害数字：${S.numbers ? '开' : '关'}（N）`, () => { S.numbers = !S.numbers; saveSettings(); }],
    [`音效：${S.muted ? '关' : '开'}（M）`, () => { Sound.unlock(); Sound.setMuted(!S.muted); saveSettings(); }],
  ];
  const x0 = cx - (items.length * bw + (items.length - 1) * gap) / 2;
  items.forEach(([l, a], i) => button(x0 + i * (bw + gap), y, bw, bh, l, a, { size: 13 * u }));
}

function renderPause() {
  dim(0.66);
  const u = view.ui, cx = view.w / 2, p = state.player;
  const pw = Math.min(900 * u, view.w - 24 * u), ph = Math.min(560 * u, view.h - 24 * u);
  const px = cx - pw / 2, py = view.h / 2 - ph / 2;
  panel(px, py, pw, ph, 18 * u, 'rgba(26,21,38,0.94)');
  textO('暂停', cx, py + 38 * u, 34 * u, '#fff7ec', OL, 7 * u);
  text(`${fmtTime(state.t)} · Lv ${state.level} · 击杀 ${state.kills}${state.gold ? ' · 金币 ' + state.gold : ''}`, cx, py + 72 * u, 15 * u, '#cbbfe0', 'center', 'normal');
  const colW = (pw - 60 * u) / 2, lx = px + 24 * u, rx = lx + colW + 12 * u;
  let y = py + 104 * u;
  text('武器', lx, y, 17 * u, '#ffc94d', 'left');
  text('造成伤害', lx + colW - 6 * u, y, 13 * u, '#9d92b3', 'right', 'normal');
  y += 24 * u;
  for (const w of p.weapons) {
    rr(ctx, lx, y, colW, 44 * u, 10 * u); ctx.fillStyle = w.evo ? 'rgba(255,210,63,0.12)' : 'rgba(255,255,255,0.05)'; ctx.fill();
    drawIcon(w.id, lx + 24 * u, y + 22 * u, 34 * u);
    text(`${wName(w)}  ${w.evo ? '★进化' : 'Lv ' + w.lv}`, lx + 48 * u, y + 14 * u, 15 * u, w.evo ? '#ffe680' : '#ffffff', 'left');
    text(statLine(w), lx + 48 * u, y + 32 * u, 12 * u, '#bfb3d6', 'left', 'normal');
    text(fmtBig(w.dmg), lx + colW - 10 * u, y + 22 * u, 15 * u, '#ffd9a8', 'right');
    y += 50 * u;
  }
  y = py + 104 * u;
  text('道具', rx, y, 17 * u, '#63e6be', 'left');
  y += 24 * u;
  const pcw = (colW - 8 * u) / 2;
  p.passives.forEach((ps, i) => {
    const x = rx + (i % 2) * (pcw + 8 * u), yy = y + Math.floor(i / 2) * 50 * u;
    rr(ctx, x, yy, pcw, 44 * u, 10 * u); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    drawIcon(ps.id, x + 22 * u, yy + 22 * u, 32 * u);
    text(`${ps.def.name} Lv ${ps.lv}`, x + 44 * u, yy + 14 * u, 14 * u, '#ffffff', 'left');
    text(`${ps.def.label} ${ps.def.total(ps.lv)}`, x + 44 * u, yy + 32 * u, 11.5 * u, '#bfb3d6', 'left', 'normal');
  });
  y += 3 * 50 * u + 8 * u;
  text('属性', rx, y, 17 * u, '#8fd8ff', 'left');
  y += 26 * u;
  const stats = [
    ['生命', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['生命回复', `${fmtNum(p.regen)}/秒`],
    ['移动速度', `${Math.round(CONFIG.player.speed * p.spdMul)}`], ['伤害加成', `+${Math.round((p.might - 1) * 100)}%`],
    ['冷却缩减', `${Math.round((1 - p.cdMul) * 100)}%`], ['拾取范围', `${Math.round(CONFIG.player.pickup * p.pickupMul)}`],
    ['固定减伤', `${p.armor}`], ['暴击率', `${Math.round(CONFIG.combat.critChance * 100)}% ×${CONFIG.combat.critMul}`],
  ];
  stats.forEach(([k, v], i) => {
    const x = rx + (i % 2) * (pcw + 8 * u), yy = y + Math.floor(i / 2) * 24 * u;
    text(k, x + 4 * u, yy, 14 * u, '#9d92b3', 'left', 'normal');
    text(v, x + pcw - 6 * u, yy, 14 * u, '#ffffff', 'right');
  });
  // 底部按钮
  const by = py + ph - 52 * u;
  togglesRow(cx, by);
  button(px + pw - 150 * u, by, 126 * u, 36 * u, game.confirmRestart > game.time ? '再按一次确认' : '重新开始（R）', () => askRestart(), { bg: 'rgba(255,94,87,0.25)', hot: 'rgba(255,94,87,0.5)', size: 13 * u });
  button(px + 24 * u, by, 126 * u, 36 * u, '继续（P / Esc）', () => { game.phase = 'play'; }, { bg: 'rgba(126,99,255,0.6)', hot: 'rgba(126,99,255,0.9)', size: 13 * u });
}
function askRestart() {
  if (game.confirmRestart > game.time) { game.confirmRestart = 0; startGame(); }
  else game.confirmRestart = game.time + 2;
}

// 结算界面：存活时间、击杀、等级、各武器伤害排行
function renderResults() {
  const t = game.time - game.endAt, k = clamp(t / 0.5, 0, 1), u = view.ui, cx = view.w / 2, win = game.phase === 'win';
  dim(0.78 * k);
  if (t < 0.25) return;
  const a = (d) => clamp((t - d) / 0.35, 0, 1);
  const pw = Math.min(700 * u, view.w - 24 * u), ph = Math.min(600 * u, view.h - 20 * u);
  const px = cx - pw / 2, py = view.h / 2 - ph / 2;
  ctx.globalAlpha = a(0.25);
  panel(px, py, pw, ph, 20 * u, 'rgba(26,21,38,0.95)', win ? 'rgba(255,210,63,0.5)' : 'rgba(255,255,255,0.12)');
  const ts = easeOutBack(a(0.3));
  ctx.save(); ctx.translate(cx, py + 50 * u); ctx.scale(ts, ts);
  textO(win ? '厨房保卫成功！' : '你被食材淹没了……', 0, 0, 38 * u, win ? '#ffd23f' : '#ff8a7a', OL, 8 * u);
  ctx.restore();
  if (game.newBest) {
    const s = 1 + Math.sin(game.time * 6) * 0.06;
    ctx.save(); ctx.translate(cx, py + 88 * u); ctx.scale(s, s);
    textO('★ 新纪录！★', 0, 0, 17 * u, '#ffe680', OL, 4 * u);
    ctx.restore();
  } else text(win ? '西瓜大王被你做成了果盘' : '别灰心，再来一局试试别的搭配', cx, py + 88 * u, 15 * u, '#bfb3d6', 'center', 'normal');
  // 四个数据块
  const tiles = [['存活时间', fmtTime(state.t)], ['击杀', String(state.kills)], ['等级', `Lv ${state.level}`], ['进化', `${state.evolutions || 0} 次`]];
  const tw = (pw - 48 * u - 3 * 12 * u) / 4;
  tiles.forEach(([l, v], i) => {
    ctx.globalAlpha = a(0.4 + i * 0.08);
    const x = px + 24 * u + i * (tw + 12 * u), y = py + 112 * u;
    rr(ctx, x, y, tw, 70 * u, 12 * u); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    text(l, x + tw / 2, y + 20 * u, 13 * u, '#9d92b3', 'center', 'normal');
    text(v, x + tw / 2, y + 47 * u, 24 * u, '#ffffff');
  });
  // 伤害排行
  ctx.globalAlpha = a(0.7);
  let y = py + 210 * u;
  text('武器伤害排行', px + 24 * u, y, 16 * u, '#ffc94d', 'left');
  y += 20 * u;
  const R = game.ranking || [], max = R.length ? Math.max(1, R[0].dmg) : 1;
  let total = 0;
  for (const r of R) total += r.dmg;
  R.forEach((r, i) => {
    const ra = a(0.8 + i * 0.1);
    ctx.globalAlpha = ra;
    const yy = y + i * 40 * u, bx = px + 196 * u, bw = pw - 196 * u - 120 * u;
    if (i === 0) { rr(ctx, px + 18 * u, yy + 2 * u, pw - 36 * u, 36 * u, 10 * u); ctx.fillStyle = 'rgba(255,210,63,0.08)'; ctx.fill(); }
    text(String(i + 1), px + 34 * u, yy + 20 * u, 15 * u, i === 0 ? '#ffd23f' : '#9d92b3');
    drawIcon(r.id, px + 62 * u, yy + 20 * u, 30 * u, ra);
    text(r.name, px + 84 * u, yy + 20 * u, 15 * u, r.evo ? '#ffe680' : '#ffffff', 'left');
    rr(ctx, bx, yy + 13 * u, bw, 14 * u, 7 * u); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    const f = (r.dmg / max) * easeOutCubic(clamp((t - 0.9 - i * 0.1) / 0.8, 0, 1));
    if (f > 0.01) { rr(ctx, bx, yy + 13 * u, Math.max(14 * u, bw * f), 14 * u, 7 * u); ctx.fillStyle = lg(ctx, bx, 0, bx + bw, 0, i === 0 ? ['#ffb340', '#ffd23f'] : ['#7c6cff', '#45c6ff']); ctx.fill(); }
    text(`${fmtBig(r.dmg)}  ${total ? Math.round((r.dmg / total) * 100) : 0}%`, px + pw - 26 * u, yy + 20 * u, 14 * u, '#ffd9a8', 'right');
  });
  // 最佳记录与按钮
  ctx.globalAlpha = a(1.2);
  const b = game.best;
  if (b) text(`最佳：${b.win ? '已通关 · ' : ''}存活 ${fmtTime(b.time)} · 击杀 ${b.kills} · Lv ${b.level}    累计 ${game.stats.runs} 局 / 通关 ${game.stats.wins} 次`, cx, py + ph - 82 * u, 13 * u, '#9d92b3', 'center', 'normal');
  const by = py + ph - 56 * u, bw2 = 170 * u;
  button(cx - bw2 - 8 * u, by, bw2, 40 * u, '再来一局（R）', () => startGame(), { bg: 'rgba(126,99,255,0.7)', hot: 'rgba(126,99,255,1)', size: 15 * u });
  button(cx + 8 * u, by, bw2, 40 * u, '回到标题（Esc）', () => { game.phase = 'title'; }, { size: 15 * u });
  ctx.globalAlpha = 1;
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
function evolveWeapon(ev) {
  const w = findWeapon(ev.weapon), p = state.player;
  w.evo = true;
  w.def.init(w);
  state.slowmo = 0.5; state.slowmoScale = 0.25; // 慢动作 0.5 秒
  shake(0.7);
  game.flashAt = game.time;
  showBanner(`进化！${ev.name}`, `${WEAPONS[ev.weapon].name} + ${PASSIVES[ev.passive].name}`, '#ffd23f', 3.2);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU, sp = rand(160, 360);
    const q = addPart(P_GLOW, p.x, p.y - 6, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 0.9), rand(0.25, 0.45), 0, SPR.glowG);
    if (q) q.drag = 2.5;
  }
  addRing(p.x, p.y, 260, 0.6, 'rgba(255,214,90,0.95)', 9);
  state.evolutions = (state.evolutions || 0) + 1;
  Sound.play('evolve');
}

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
      return { tag: '新道具', color: '#4fd1c5', name: d.name, icon: ch.id, lv: 0, lines: [d.desc], flavor: d.flavor };
    }
    case 'pup': {
      const ps = findPassive(ch.id), d = ps.def;
      return { tag: '道具升级', color: '#63e6be', name: d.name, icon: ch.id, lv: ps.lv, lines: [d.desc, `总计  ${d.total(ps.lv)} → ${d.total(ps.lv + 1)}`] };
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
  if (info.flavor) for (const seg of wrapText(info.flavor, w - 40 * u, 13 * u)) { text(seg, icx, ly + 2 * u, 13 * u, '#a99cc4', 'center', 'normal'); ly += 18 * u; }
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

function renderDebug() {
  setUI();
  const lines = [`FPS ${game.fps.toFixed(0)}`, `更新 ${game.upMs.toFixed(2)}ms  绘制 ${game.drawMs.toFixed(2)}ms`];
  if (state) lines.push(`敌人 ${state.enemies.length}  子弹 ${state.bullets.length}  晶体 ${state.gems.length}`);
  if (state) lines.push(`粒子 ${state.parts.length}  ${game.god ? '无敌中' : ''}  L升级 T快进 G无敌`);
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
  if (pressed('KeyV')) { game.settings.shake = !game.settings.shake; saveSettings(); }
  if (pressed('KeyN')) { game.settings.numbers = !game.settings.numbers; saveSettings(); }
  // 点击按钮
  if (input.mouse.click && game.phase !== 'levelup') {
    const m = input.mouse;
    for (const b of game.btns) {
      if (m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h) { Sound.play('select'); b.action(); input.mouse.click = false; return; }
    }
  }
  switch (game.phase) {
    case 'title':
      if (pressed(...KEYS.start) || input.mouse.click) startGame();
      break;
    case 'play':
      if (pressed(...KEYS.pause)) { game.phase = 'pause'; game.confirmRestart = 0; }
      if (game.debug && pressed('KeyL')) { state.xp = xpNeed(state.level); gainXp(0); }
      if (game.debug && pressed('KeyT')) state.t += 30;
      if (game.debug && pressed('KeyG')) game.god = !game.god;
      break;
    case 'pause':
      if (pressed(...KEYS.pause)) game.phase = 'play';
      if (pressed(...KEYS.restart)) askRestart();
      break;
    case 'levelup':
      handleLevelUpInput();
      break;
    case 'over':
    case 'win':
      if (pressed(...KEYS.restart) && game.time - game.endAt > 0.4) startGame();
      else if (pressed('Escape') && game.time - game.endAt > 0.4) game.phase = 'title';
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
  game.btns.length = 0;
  if (game.phase === 'title') { renderTitle(); return; }
  computeTransform();
  renderWorld();
  renderHUD();
  if (game.phase === 'pause') renderPause();
  else if (game.phase === 'over' || game.phase === 'win') renderResults();
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
