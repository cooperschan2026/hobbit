'use strict';
// =====================================================================
// 引擎：画布、输入、地砖、房间、实体、交互、房间切换、镜头、存档
// =====================================================================
const TS = CFG.TILE, VW = CFG.W, VH = CFG.H, TAU = Math.PI * 2;
const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Zen Hei",sans-serif';
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---------------- 画布：整数倍放大，像素清晰 ----------------
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const V = { S: 2, ox: 0, oy: 0, dpr: 1, w: 0, h: 0 };
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.floor(window.innerWidth * dpr)), h = Math.max(180, Math.floor(window.innerHeight * dpr));
  cv.width = w; cv.height = h; cv.style.width = window.innerWidth + 'px'; cv.style.height = window.innerHeight + 'px';
  V.dpr = dpr; V.w = w; V.h = h;
  V.S = Math.max(1, Math.floor(Math.min(w / VW, h / VH)));
  V.ox = Math.floor((w - VW * V.S) / 2); V.oy = Math.floor((h - VH * V.S) / 2);
  ctx.imageSmoothingEnabled = false;
}
function setView() { ctx.setTransform(V.S, 0, 0, V.S, V.ox, V.oy); ctx.imageSmoothingEnabled = false; }

// ---------------- 输入 ----------------
const IN = { down: Object.create(null), hit: Object.create(null), mx: VW / 2, my: VH / 2, lmb: false, lhit: false, lup: false, rhit: false, wheel: 0, moved: false };
const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1', 'F2', 'F3']);
window.addEventListener('keydown', (e) => {
  const k = e.code;
  if (!IN.down[k]) IN.hit[k] = true;
  IN.down[k] = true;
  if (PREVENT.has(k)) e.preventDefault();
  Snd.unlock();
});
window.addEventListener('keyup', (e) => { IN.down[e.code] = false; });
window.addEventListener('blur', () => { for (const k in IN.down) IN.down[k] = false; IN.lmb = false; if (G.scene === 'game' && !G.ui.menu && !G.script) openMenu('pause'); });
function mousePos(e) { IN.mx = (e.clientX * V.dpr - V.ox) / V.S; IN.my = (e.clientY * V.dpr - V.oy) / V.S; IN.moved = true; }
cv.addEventListener('mousemove', mousePos);
cv.addEventListener('mousedown', (e) => { mousePos(e); cv.focus(); Snd.unlock(); if (e.button === 0) { IN.lmb = true; IN.lhit = true; } else if (e.button === 2) IN.rhit = true; e.preventDefault(); });
window.addEventListener('mouseup', (e) => { if (e.button === 0) { IN.lmb = false; IN.lup = true; } });
cv.addEventListener('wheel', (e) => { IN.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
const keyHit = (...c) => c.some((k) => IN.hit[k]);
const keyDown = (...c) => c.some((k) => IN.down[k]);
function clearInput() { IN.hit = Object.create(null); IN.lhit = false; IN.lup = false; IN.rhit = false; IN.wheel = 0; }

// ---------------- 全局状态 ----------------
const SAVE_KEY = 'jindeng_save_v1', SET_KEY = 'jindeng_settings_v1';
const G = {
  scene: 'title', S: null, room: null, P: null,
  parts: [], projs: [], texts: [],
  t: 0, rt: 0, hitstop: 0, slowT: 0, slowScale: 1, shakeV: 0,
  fade: { v: 1, to: 0, speed: 3, cb: null }, trans: false,
  ui: { menu: null, hint: null, hintT: 0, toasts: [], banner: null, prompt: null, dlg: null, boss: null, letter: null },
  script: null, bars: 0, barsTo: 0, lockExits: false, bossFight: null, camFocus: null,
  god: false, debug: CFG.debug, fps: 60, playStart: 0,
  set: Object.assign({ master: 0.8, music: 0.55, sfx: 0.8, shake: true, textSpeed: 1 }, loadJSON(SET_KEY) || {}),
};
function loadJSON(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function saveJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function saveSettings() { saveJSON(SET_KEY, G.set); Snd.vol = { master: G.set.master, music: G.set.music, sfx: G.set.sfx }; Snd.applyVol(); }

function newSave() {
  const P = CFG.player;
  return {
    v: 1, room: 't_home', x: 11 * TS + 8, y: 6 * TS + 8, light: null,
    hearts: P.hearts, hp: P.hearts * P.hpPerHeart, pieces: 0, oilMax: P.oil, oil: P.oil, soupMax: P.soup, soup: P.soup, wicks: 0,
    abil: { dash: false, hook: false, fire: false }, cur: 0,
    equip: { shade: 'shade_old', charm: null }, items: { shade_old: 1 }, letters: 0,
    flags: {}, lit: {}, braz: {}, taken: {}, dead: {}, killed: {}, visited: {}, vents: {}, bought: {},
    drop: null, stats: { time: 0, deaths: 0 }, hints: {},
  };
}
function saveGame() {
  if (!G.S) return false;
  G.S.stats.time += (G.rt - G.playStart); G.playStart = G.rt;
  return saveJSON(SAVE_KEY, G.S);
}
function hasSave() { const s = loadJSON(SAVE_KEY); return !!(s && s.v === 1 && MAPS[s.room]); }
function playTime() { return G.S.stats.time + (G.rt - G.playStart); }

// 条件表达式：'a&&!b'、'q_cat>=1'、'oil>=50'
function condVal(name) {
  const S = G.S;
  if (name === 'oil') return S.oil;
  if (name === 'three_lit') return MAIN_LIGHTS.every((id) => S.lit[id]) ? 1 : 0;
  if (name === 'hidden_ok') return S.flags.saved_ice && S.flags.told_truth && S.letters >= 4 ? 1 : 0;
  if (name === 'letters') return S.letters;
  const v = S.flags[name];
  return v === true ? 1 : v | 0;
}
function cond(str) {
  if (!str) return true;
  if (typeof str === 'function') return !!str();
  return str.split('||').some((part) => part.split('&&').every((term) => {
    term = term.trim();
    const m = /^(\w+)\s*(>=|<=|==|>|<)\s*(-?\d+)$/.exec(term);
    if (m) { const a = condVal(m[1]), b = +m[3]; return m[2] === '>=' ? a >= b : m[2] === '<=' ? a <= b : m[2] === '==' ? a === b : m[2] === '>' ? a > b : a < b; }
    if (term[0] === '!') return !condVal(term.slice(1));
    return !!condVal(term);
  }));
}

// ---------------- 地砖 ----------------
const TL = { FLOOR: 0, WALL: 1, DECO: 2, PIT: 3, WATER: 4, ICE: 5, LAVA: 6, VINE: 7, BRIDGE: 8, GATE: 9, BW: 10, BI: 11, COOL: 12, DOOR: 13, FLOOR2: 14, PATH: 15, MOON: 16, VENT: 17, HOUSE: 18 };
const CHAR_TILE = { '#': TL.WALL, '.': TL.FLOOR, ',': TL.FLOOR2, ':': TL.PATH, 'T': TL.DECO, '^': TL.PIT, '~': TL.WATER, '_': TL.ICE, 'L': TL.LAVA, 'v': TL.VINE, '=': TL.BRIDGE, 'X': TL.GATE, 'w': TL.BW, 'i': TL.BI, 'D': TL.DOOR, 'M': TL.MOON, 'V': TL.VENT, 'H': TL.HOUSE };
function gateClosed(R) {
  const g = R.def.gate;
  if (!g) return false;
  if (g === 'boss') return !!G.bossFight;
  return !G.S.flags[g.flag];
}
function tileSolid(R, c) { return c === TL.WALL || c === TL.DECO || c === TL.VINE || c === TL.HOUSE || (c === TL.GATE && gateClosed(R)); }
function tileWater(R, c) { return c === TL.WATER || (c === TL.BW && R.bell === 0) || (c === TL.BI && R.bell === 1); }
function tilePit(R, c) { return c === TL.PIT || c === TL.LAVA || c === TL.VENT || tileWater(R, c); }
function tileIce(R, c) { return c === TL.ICE || (c === TL.BW && R.bell === 1) || (c === TL.BI && R.bell === 0); }
function tileAt(tx, ty) { const R = G.room; if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return TL.WALL; return R.t[ty * R.w + tx]; }
function setTile(tx, ty, c) { const R = G.room; if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return; R.t[ty * R.w + tx] = c; R.dirty = true; }
function walkable(tx, ty) { const R = G.room; if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return false; const c = R.t[ty * R.w + tx]; return !tileSolid(R, c) && !tilePit(R, c) && !R.blk[ty * R.w + tx]; }
// 出界只允许从出口开口走出去
function exitOpen(tx, ty) {
  const R = G.room, ex = R.def.exits;
  if (tx < 0 && ex.w && ty >= 0 && ty < R.h) return !tileSolid(R, R.t[ty * R.w]);
  if (tx >= R.w && ex.e && ty >= 0 && ty < R.h) return !tileSolid(R, R.t[ty * R.w + R.w - 1]);
  if (ty < 0 && ex.n && tx >= 0 && tx < R.w) return !tileSolid(R, R.t[tx]);
  if (ty >= R.h && ex.s && tx >= 0 && tx < R.w) return !tileSolid(R, R.t[(R.h - 1) * R.w + tx]);
  return false;
}
function solidAt(px, py, pitSolid, isPlayer) {
  const R = G.room, tx = Math.floor(px / TS), ty = Math.floor(py / TS);
  if (tx < 0 || ty < 0 || tx >= R.w || ty >= R.h) return !(isPlayer && exitOpen(tx, ty));
  const i = ty * R.w + tx, c = R.t[i];
  if (R.blk[i]) return true;
  if (tileSolid(R, c)) return true;
  if (pitSolid && tilePit(R, c)) return true;
  return false;
}
// 盒子碰撞移动（x、y 分开），玩家有拐角滑移
function moveBox(o, dx, dy, pitSolid, isPlayer) {
  const hw = o.hw, hh = o.hh;
  o.hitX = o.hitY = false;
  if (dx) {
    o.x += dx;
    const ex = dx > 0 ? o.x + hw : o.x - hw;
    const a = solidAt(ex, o.y - hh + 0.5, pitSolid, isPlayer), b = solidAt(ex, o.y + hh - 0.5, pitSolid, isPlayer);
    if (a || b) {
      o.x = dx > 0 ? Math.floor(ex / TS) * TS - hw - 0.01 : (Math.floor(ex / TS) + 1) * TS + hw + 0.01;
      o.hitX = true;
      if (isPlayer && a !== b) { const ty = Math.floor((a ? o.y + hh : o.y - hh) / TS); const edge = a ? ty * TS + hh + 0.01 : (ty + 1) * TS - hh - 0.01; if (Math.abs(edge - o.y) < 5) o.y += Math.sign(edge - o.y) * Math.min(Math.abs(dx), Math.abs(edge - o.y)); }
    }
  }
  if (dy) {
    o.y += dy;
    const ey = dy > 0 ? o.y + hh : o.y - hh;
    const a = solidAt(o.x - hw + 0.5, ey, pitSolid, isPlayer), b = solidAt(o.x + hw - 0.5, ey, pitSolid, isPlayer);
    if (a || b) {
      o.y = dy > 0 ? Math.floor(ey / TS) * TS - hh - 0.01 : (Math.floor(ey / TS) + 1) * TS + hh + 0.01;
      o.hitY = true;
      if (isPlayer && a !== b) { const tx = Math.floor((a ? o.x + hw : o.x - hw) / TS); const edge = a ? tx * TS + hw + 0.01 : (tx + 1) * TS - hw - 0.01; if (Math.abs(edge - o.x) < 5) o.x += Math.sign(edge - o.x) * Math.min(Math.abs(dy), Math.abs(edge - o.x)); }
    }
  }
}
// 两点之间有没有墙（视线、钩索）
function lineClear(x0, y0, x1, y1) {
  const n = Math.ceil(dist(x0, y0, x1, y1) / 4);
  for (let i = 1; i < n; i++) { const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n); const tx = Math.floor(x / TS), ty = Math.floor(y / TS); const c = tileAt(tx, ty); if (tileSolid(G.room, c)) return false; }
  return true;
}

// ---------------- 房间 ----------------
const EK = {}; // 实体种类：{ update, draw, interact, label, light }
function addEnt(R, k, x, y, p) { const e = Object.assign({ k, x, y, t: 0, dead: false }, p || {}); R.ents.push(e); if (EK[k] && EK[k].init) EK[k].init(e, R); return e; }
function blockTile(R, tx, ty, v = 1) { if (tx >= 0 && ty >= 0 && tx < R.w && ty < R.h) R.blk[ty * R.w + tx] += v; }
function loadRoom(id) {
  const def = MAPS[id], g = def.grid, h = g.length, w = g[0].length;
  const R = { id, def, w, h, t: new Uint8Array(w * h), blk: new Uint8Array(w * h), region: def.region, bell: 0, ents: [], anim: [], lava: [], dirty: true, layer: null, enemyIdx: 0 };
  const S = G.S;
  let ci = 0, pi = 0, hi = 0, si = 0, ni = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = g[y][x];
    let tile = CHAR_TILE[ch];
    if (tile === undefined) { const l = x > 0 ? CHAR_TILE[g[y][x - 1]] : undefined, r = x < w - 1 ? CHAR_TILE[g[y][x + 1]] : undefined; tile = l === TL.ICE || r === TL.ICE ? TL.ICE : l === TL.PATH && r === TL.PATH ? TL.PATH : TL.FLOOR; }
    R.t[y * w + x] = tile;
    const cx = x * TS + 8, cy = y * TS + 8;
    switch (ch) {
      case 'G': { const lh = def.lh; addEnt(R, 'lh', x * TS + 16, y * TS + 16, { id: lh.id, name: lh.name, lhdef: lh, tx: x, ty: y }); for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) blockTile(R, x + i, y + j); break; }
      case '+': case '*': { const key = `${id}:${x},${y}`; addEnt(R, 'braz', cx, cy, { key, lit: ch === '*' || !!S.braz[key], frozen: !!def.frozenBraz, tx: x, ty: y }); blockTile(R, x, y); break; }
      case 'P': addEnt(R, 'post', cx, cy, { tx: x, ty: y }); blockTile(R, x, y); break;
      case 'J': addEnt(R, 'jar', cx, cy, { tx: x, ty: y }); blockTile(R, x, y); break;
      case 'B': addEnt(R, 'bell', cx, cy, { tx: x, ty: y }); blockTile(R, x, y); break;
      case 'C': { const c = def.chests[ci++]; addEnt(R, 'chest', cx, cy, { def: c, open: !!S.taken[c.id], tx: x, ty: y }); blockTile(R, x, y); break; }
      case 'p': { const c = def.picks[pi++]; if (!S.taken[c.id]) addEnt(R, 'pick', cx, cy, { def: c }); break; }
      case '$': addEnt(R, 'sign', cx, cy, { text: def.signs[si++], tx: x, ty: y }); blockTile(R, x, y); break;
      case 'N': { const n = def.npcs[ni++]; if (cond(n.cond)) { addEnt(R, 'npc', cx, cy, { id: n.id, tx: x, ty: y }); blockTile(R, x, y); } break; }
      case 'H': { const hid = def.houses[hi++]; addEnt(R, 'house', cx, cy, { id: hid, tx: x, ty: y }); if (S.flags['dl_' + hid] && walkable(x, y + 1)) addEnt(R, 'npc', cx, cy + TS, { id: 'villager', house: hid }); break; }
      case 'u': addEnt(R, 'frozen', cx, cy, { tx: x, ty: y, free: !!S.flags.saved_ice }); if (!S.flags.ice_refused && !S.flags.saved_ice) blockTile(R, x, y); break;
      case 'F': for (let i = 0; i < 3; i++) addEnt(R, 'fly', cx + rand(-20, 20), cy + rand(-20, 20), { hx: cx, hy: cy, ph: Math.random() * TAU }); break;
      case 'S': addEnt(R, 'svent', cx, cy, { cd: rand(0, 2) }); break;
      case 'Q': R.bossX = cx; R.bossY = cy; break;
      case '@': R.spawnX = cx; R.spawnY = cy; break;
      case 'D': break;
      default:
        if (ENEMY_CHARS[ch]) {
          const uid = `${id}:${R.enemyIdx++}`;
          const isElite = ch === 'E';
          if (isElite && S.killed[def.elite.id]) break;
          if (S.dead[uid]) break;
          spawnEnemy(R, ENEMY_CHARS[ch], cx, cy, { uid, elite: isElite ? def.elite : null });
        }
    }
    if (tile === TL.LAVA && (x + y) % 3 === 0) R.lava.push([cx, cy]);
    if (tile === TL.WATER || tile === TL.LAVA || tile === TL.BW || tile === TL.BI) R.anim.push(y * w + x);
  }
  // 额外实体（有条件出现的人物、猫……）
  for (const e of def.ents) {
    if (!cond(e.cond)) continue;
    if (e.k === 'npc') { addEnt(R, 'npc', e.x * TS + 8, e.y * TS + 8, { id: e.id }); }
    else if (e.k === 'cat') addEnt(R, 'cat', e.x * TS + 8, e.y * TS + 8, {});
  }
  // 已经堵上的熔岩口
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (R.t[y * w + x] === TL.VENT && S.vents[`${id}:${x},${y}`]) coolVent(R, x, y, true);
  // 遗落的灯芯
  if (S.drop && S.drop.room === id) addEnt(R, 'drop', S.drop.x, S.drop.y, { n: S.drop.n });
  return R;
}
const ENEMY_CHARS = { s: 'shade', h: 'hound', g: 'ghost', k: 'spike', r: 'frog', o: 'lamp', t: 'clay', z: 'lizard', y: 'smoke', E: 'elite' };

// 推罐子堵住熔岩口：相连的熔岩全部冷却
function coolVent(R, x, y, silent) {
  const w = R.w, q = [[x, y]], seen = new Set([y * w + x]);
  R.t[y * w + x] = TL.COOL;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, i = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= R.h || seen.has(i)) continue;
      if (R.t[i] === TL.LAVA) { seen.add(i); R.t[i] = TL.COOL; q.push([nx, ny]); if (!silent && Math.random() < 0.3) burst(nx * TS + 8, ny * TS + 8, 2, ['#555', '#888'], 30, 0.8, 2, -20); }
    }
  }
  R.lava = R.lava.filter(([lx, ly]) => R.t[Math.floor(ly / TS) * w + Math.floor(lx / TS)] === TL.LAVA);
  R.dirty = true;
  if (!silent) { Snd.play('lava'); toast('熔岩冷却了'); }
}

// 预渲染房间静态层
function renderLayer(R) {
  if (!R.layer) { const c = document.createElement('canvas'); c.width = R.w * TS; c.height = R.h * TS; R.layer = c; }
  const c = R.layer.getContext('2d'); c.imageSmoothingEnabled = false;
  c.clearRect(0, 0, R.layer.width, R.layer.height);
  const T = ART.tiles(R.region);
  const at = (x, y) => (x < 0 || y < 0 || x >= R.w || y >= R.h ? TL.WALL : R.t[y * R.w + x]);
  const floorAt = (x, y) => { const v = hash(x, y); c.drawImage(v < 0.55 ? T.floor[0] : v < 0.75 ? T.floor[1] : v < 0.92 ? T.floor[2] : T.floor[3], x * TS, y * TS); };
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) {
    const code = at(x, y), px = x * TS, py = y * TS;
    switch (code) {
      case TL.WALL: c.drawImage(T.wallTop, px, py); if (at(x, y + 1) !== TL.WALL) c.drawImage(T.wallFace, 0, 0, 16, 12, px, py + 4, 16, 12); break;
      case TL.FLOOR2: c.drawImage(T.floor2, px, py); break;
      case TL.PATH: c.drawImage(T.path, px, py); break;
      case TL.PIT: c.drawImage(tilePit(R, at(x, y - 1)) ? T.pit : T.pitEdge, px, py); break;
      case TL.ICE: c.drawImage(T.ice[(x + y) & 1], px, py); break;
      case TL.VINE: floorAt(x, y); c.drawImage(T.vine, px, py); break;
      case TL.BRIDGE: c.drawImage(T.bridge, px, py); break;
      case TL.GATE: floorAt(x, y); if (gateClosed(R)) { if (R.def.gateLook === 'ice') { c.fillStyle = '#9fd8ec'; c.fillRect(px, py, 16, 16); c.fillStyle = '#e4f8fc'; c.fillRect(px + 2, py + 2, 3, 12); } else c.drawImage(T.gate, px, py); } break;
      case TL.COOL: c.drawImage(T.cool, px, py); break;
      case TL.DOOR: c.drawImage(T.door, px, py); break;
      case TL.HOUSE: c.drawImage(T.house[G.S.flags['dl_' + houseIdAt(R, x, y)] ? 1 : 0], px, py); break;
      case TL.MOON: floorAt(x, y); break;
      case TL.VENT: c.drawImage(T.vent, px, py); break;
      case TL.WATER: case TL.LAVA: case TL.BW: case TL.BI: break; // 动画层画
      default: floorAt(x, y);
    }
  }
  // 装饰物（16x24，比格子高，按行从上到下画）
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (at(x, y) === TL.DECO) { floorAt(x, y); }
  for (let y = 0; y < R.h; y++) for (let x = 0; x < R.w; x++) if (at(x, y) === TL.DECO) c.drawImage(T.deco, x * TS, y * TS - 8);
  R.dirty = false;
}
function houseIdAt(R, x, y) { const e = R.ents.find((q) => q.k === 'house' && q.tx === x && q.ty === y); return e ? e.id : ''; }
// 每帧画会动的地砖（水、熔岩、钟控冰水）
function drawAnimTiles(ox, oy) {
  const R = G.room, T = ART.tiles(R.region), f = Math.floor(G.t * 2.5);
  for (const i of R.anim) {
    const x = i % R.w, y = (i / R.w) | 0, px = x * TS - ox, py = y * TS - oy;
    if (px < -16 || py < -16 || px > VW || py > VH) continue;
    const c = R.t[i];
    if (c === TL.LAVA) ctx.drawImage(T.lava[(f + x + y) % 3], px, py);
    else if (tileWater(R, c)) { ctx.drawImage(T.water[(f + x) & 1], px, py); const up = y > 0 ? R.t[i - R.w] : TL.WALL; if (!tileWater(R, up) && up !== TL.WALL) ctx.drawImage(T.waterEdge, px, py); }
    else if (tileIce(R, c)) { ctx.drawImage(T.ice[(x + y) & 1], px, py); if (c !== TL.ICE && ((G.t * 2 + x) | 0) % 7 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px + 4, py + 6, 6, 1); } }
    else if (c === TL.COOL) ctx.drawImage(T.cool, px, py);
  }
}

// ---------------- 通用实体（道具、装置、人物） ----------------
function drawShadow(x, y, rw, a = 0.35) { ctx.fillStyle = `rgba(5,3,10,${a})`; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), rw, rw * 0.38, 0, 0, TAU); ctx.fill(); }
EK.lh = {
  draw(e, ox, oy) { const lit = !!G.S.lit[e.id]; ctx.drawImage(ART.prop.lh[lit ? 1 : 0], Math.round(e.x - 16 - ox), Math.round(e.y + 16 - 48 - oy)); },
  label(e) { return G.S.lit[e.id] ? '灯塔：休息 / 传送' : '点亮灯塔'; },
  interact(e) { if (G.S.lit[e.id]) openMenu('lighthouse', { lh: e }); else lightLighthouse(e); },
  light(e) { return G.S.lit[e.id] ? { x: e.x, y: e.y - 18, r: CFG.light.lighthouse, warm: 1, env: true } : null; },
  sortY(e) { return e.y + 14; },
};
EK.braz = {
  draw(e, ox, oy) { const im = e.lit ? ART.prop.braz[1 + (Math.floor(G.t * 8 + e.x) % 3)] : ART.prop.braz[0]; ctx.drawImage(im, Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy)); if (e.lit && Math.random() < 0.15) part(e.x + rand(-2, 2), e.y - 10, rand(-5, 5), rand(-30, -15), 0.6, Math.random() < 0.5 ? '#ffb347' : '#ffd166', 1); },
  light(e) { return e.lit ? { x: e.x, y: e.y - 6, r: CFG.light.brazier * (1 + Math.sin(G.t * 9 + e.x) * 0.04), warm: 1, env: true } : null; },
};
function igniteBrazier(e, byFire) {
  if (e.lit) return false;
  if (e.frozen && !byFire) { ftext(e.x, e.y - 18, '冻住了，要用火', '#bfe9ff'); return false; }
  e.lit = true; G.S.braz[e.key] = true;
  Snd.play('ignite'); burst(e.x, e.y - 8, 12, ['#ffd166', '#ff8a3c', '#fff1b0'], 60, 0.6, 1, -40);
  const R = G.room;
  if (R.def.brazFlag && R.ents.filter((q) => q.k === 'braz').every((q) => q.lit)) {
    G.S.flags[R.def.brazFlag] = true; R.dirty = true; Snd.play('iceCrack'); toast('冰墙化开了'); shake(0.3);
    for (let i = 0; i < R.w * R.h; i++) if (R.t[i] === TL.GATE) burst((i % R.w) * TS + 8, ((i / R.w) | 0) * TS + 8, 8, ['#e4f8fc', '#a9dff0'], 60, 0.7, 2, 40);
  }
  return true;
}
EK.post = {
  draw(e, ox, oy) { ctx.drawImage(ART.prop.post, Math.round(e.x - 8 - ox), Math.round(e.y + 8 - 32 - oy)); },
  light(e) { return { x: e.x + 3, y: e.y - 12, r: 16, warm: 0.6, env: false }; },
  sortY(e) { return e.y + 6; },
};
EK.jar = {
  draw(e, ox, oy) { const sx = e.px != null ? e.px : e.x, sy = e.py != null ? e.py : e.y; ctx.drawImage(ART.prop.jar, Math.round(sx - 8 - ox), Math.round(sy - 10 - oy)); },
  update(e, dt) {
    if (e.px == null) return;
    e.mt += dt / 0.18;
    const k = Math.min(1, e.mt);
    e.px = lerp(e.fx, e.x, k); e.py = lerp(e.fy, e.y, k);
    if (k >= 1) { e.px = e.py = null; }
  },
};
// 玩家顶着罐子走会推动它
function tryPushJar(dirx, diry) {
  const R = G.room, p = G.P;
  if (p.pushCd > 0) return;
  const tx = Math.floor((p.x + dirx * (p.hw + 2)) / TS), ty = Math.floor((p.y + diry * (p.hh + 2)) / TS);
  const jar = R.ents.find((e) => e.k === 'jar' && e.tx === tx && e.ty === ty && e.px == null);
  if (!jar) return;
  p.pushT += 1 / CFG.FPS;
  if (p.pushT < 0.22) return;
  p.pushT = 0;
  const nx = tx + dirx, ny = ty + diry;
  if (nx < 0 || ny < 0 || nx >= R.w || ny >= R.h) return;
  const c = R.t[ny * R.w + nx];
  const ok = !R.blk[ny * R.w + nx] && !tileSolid(R, c) && (!tilePit(R, c) || c === TL.VENT || (R.def.bossVents && c === TL.LAVA)) && !R.ents.some((q) => (q.k === 'enemy' || q.k === 'boss') && Math.floor(q.x / TS) === nx && Math.floor(q.y / TS) === ny);
  if (!ok) { Snd.play('block'); p.pushCd = 0.3; return; }
  blockTile(R, tx, ty, -1); blockTile(R, nx, ny, 1);
  jar.fx = jar.x; jar.fy = jar.y; jar.tx = nx; jar.ty = ny; jar.x = nx * TS + 8; jar.y = ny * TS + 8; jar.px = jar.fx; jar.py = jar.fy; jar.mt = 0;
  Snd.play('jar'); p.pushCd = 0.2;
  if (c === TL.VENT && !R.def.bossVents) { G.S.vents[`${R.id}:${nx},${ny}`] = true; setTimeout(() => { if (G.room === R) coolVent(R, nx, ny); }, 200); }
  if (R.def.bossVents && c === TL.LAVA) { R.t[ny * R.w + nx] = TL.COOL; R.dirty = true; }
}
EK.bell = {
  draw(e, ox, oy) { ctx.drawImage(ART.prop.bell[e.ring > 0 ? (Math.floor(G.t * 20) & 1) : 0], Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy)); },
  update(e, dt) { if (e.ring > 0) e.ring -= dt; },
  label() { return '敲钟'; },
  interact(e) { ringBell(e); },
};
function ringBell(e) {
  if (e.ring > 0) return;
  e.ring = 0.8; const R = G.room;
  R.bell = 1 - R.bell; R.dirty = true;
  Snd.play('bell'); setTimeout(() => Snd.play('iceCrack'), 250); shake(0.15);
  for (const i of R.anim) { const c = R.t[i]; if (c === TL.BW || c === TL.BI) burst((i % R.w) * TS + 8, ((i / R.w) | 0) * TS + 8, 2, ['#e4f8fc', '#a9dff0'], 40, 0.6, 1, 20); }
  hint('bell');
}
EK.chest = {
  draw(e, ox, oy) { ctx.drawImage(ART.prop.chest[e.open ? 1 : 0], Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy)); },
  label(e) { return e.open ? null : e.def.label || '打开宝箱'; },
  interact(e) {
    if (e.open) return;
    e.open = true; G.S.taken[e.def.id] = true;
    if (e.def.script) { runScript(e.def.script); return; }
    Snd.play('chest'); burst(e.x, e.y - 6, 14, ['#ffd166', '#fff1b0'], 70, 0.7, 1, 20);
    giveItem(e.def.item, e.def.n || 1, e.x, e.y - 12);
  },
};
EK.pick = {
  draw(e, ox, oy) {
    const b = Math.sin(G.t * 3 + e.x) * 2, ic = ART.icon[iconOf(e.def.item)];
    ctx.globalAlpha = 0.35 + Math.sin(G.t * 5) * 0.15; ctx.fillStyle = '#fff1b0'; ctx.beginPath(); ctx.arc(e.x - ox, e.y - 6 - oy + b, 8, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    if (ic) ctx.drawImage(ic, Math.round(e.x - 6 - ox), Math.round(e.y - 12 - oy + b));
  },
  light(e) { return { x: e.x, y: e.y - 6, r: 18, warm: 0.8, env: false }; },
  update(e) { const p = G.P; if (p && dist(p.x, p.y, e.x, e.y) < 15) { e.dead = true; G.S.taken[e.def.id] = true; giveItem(e.def.item, e.def.n || 1, e.x, e.y - 14); } },
};
EK.sign = {
  draw(e, ox, oy) { ctx.drawImage(ART.prop.sign, Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy)); },
  label() { return '看告示'; },
  interact(e) { runScript([['narr', e.text]]); },
};
EK.npc = {
  init(e) { e.dir = 1; e.frame = 0; },
  draw(e, ox, oy) {
    const set = npcSprite(e);
    if (!set) return;
    const p = G.P; if (p && Math.abs(p.x - e.x) > 4) e.dir = p.x > e.x ? 1 : -1;
    const frames = e.walking ? set.walk : set.idle, f = frames[e.dir > 0 ? 'R' : 'L'];
    const im = f[Math.floor(G.t * (e.walking ? 8 : 2)) % f.length];
    drawShadow(e.x - ox, e.y + 6 - oy, 5);
    ctx.globalAlpha = e.alpha == null ? 1 : e.alpha;
    ctx.drawImage(im, Math.round(e.x - 8 - ox), Math.round(e.y - 9 - oy));
    ctx.globalAlpha = 1;
  },
  update(e, dt) {
    if (e.walkTo) { const [tx, ty] = e.walkTo, d = dist(e.x, e.y, tx, ty); if (d < 1.5) { e.walkTo = null; e.walking = false; } else { const s = Math.min(d, 50 * dt); e.x += ((tx - e.x) / d) * s; e.y += ((ty - e.y) / d) * s; e.walking = true; e.dir = tx > e.x ? 1 : -1; } }
    if (e.id === 'qiS' && Math.random() < 0.08) part(e.x + rand(-4, 4), e.y - 4, 0, -12, 0.8, '#463a62', 1);
  },
  label(e) { return '对话'; },
  interact(e) {
    if (e.id === 'villager') { const hd = DATA.houses[e.house]; runScript([['say', 'villager:' + hd.who, 'h', hd.line]]); return; }
    const t = TALK[e.id];
    if (t) runScript(t());
  },
  light(e) { return e.id === 'man' && G.S.flags.lit_town ? null : null; },
};
function npcSprite(e) {
  const map = { man: 'man', feng: 'feng', granny: 'cunE', wang: 'cunA', ke: 'ke', qiS: 'qiS', qi2: 'qi', zhu: 'zhu' };
  if (e.id === 'villager') return ART.ch[['cunB', 'cunA', 'cunD', 'cunE', 'cunD'][(e.house || 'h1').charCodeAt(1) % 5]];
  return ART.ch[map[e.id] || 'cunB'];
}
EK.house = {
  draw() {},
  label(e) { return G.S.flags['dl_' + e.id] ? null : has('oilbottle') ? '放下灯油' : '敲门'; },
  interact(e) {
    if (G.S.flags['dl_' + e.id]) return;
    if (!has('oilbottle')) { runScript([['narr', '窗户黑着，屋里没有人应门。门缝里，好像有个影子缩在角落。']]); return; }
    const hd = DATA.houses[e.id];
    G.S.items.oilbottle--; G.S.flags['dl_' + e.id] = true; G.room.dirty = true;
    Snd.play('oil'); burst(e.x, e.y, 14, ['#ffd166', '#fff1b0'], 50, 0.8, 1, -20);
    const v = addEnt(G.room, 'npc', e.x, e.y + TS, { id: 'villager', house: e.id, alpha: 0 });
    runScript([['narr', '你把灯油放在门口。过了一会儿，窗户里亮起了一点光。'], ['call', 'fadeInNpc', v], ['narr', '门开了。走出来的不是影子，是一个人。'], ['say', 'villager:' + hd.who, 'h', hd.line], ['call', 'toast', `送油 ${deliveredCount()} / 5`]]);
  },
  light(e) { return G.S.flags['dl_' + e.id] ? { x: e.x, y: e.y, r: 44, warm: 1, env: true } : null; },
};
EK.frozen = {
  draw(e, ox, oy) { if (e.gone) return; ctx.globalAlpha = e.alpha == null ? 1 : e.alpha; ctx.drawImage(ART.prop.frozen[e.free ? 1 : 0], Math.round(e.x - 8 - ox), Math.round(e.y - 18 - oy)); ctx.globalAlpha = 1; },
  label(e) { return G.S.flags.ice_choice ? null : '查看冰块'; },
  interact() { runScript('ice_choice'); },
  init(e) { if (G.S.flags.ice_refused || G.S.flags.saved_ice) e.gone = true; },
};
EK.fly = {
  update(e, dt) {
    e.ph += dt;
    if (!e.tx || dist(e.x, e.y, e.tx, e.ty) < 4) { e.tx = e.hx + rand(-56, 56); e.ty = e.hy + rand(-40, 40); }
    const d = dist(e.x, e.y, e.tx, e.ty) || 1; e.x += ((e.tx - e.x) / d) * 14 * dt; e.y += ((e.ty - e.y) / d) * 14 * dt;
  },
  draw(e, ox, oy) { const a = 0.6 + Math.sin(e.ph * 5) * 0.4; ctx.fillStyle = `rgba(220,255,140,${a})`; ctx.fillRect(Math.round(e.x - ox), Math.round(e.y - oy - Math.sin(e.ph * 3) * 3), 2, 2); },
  light(e) { return { x: e.x, y: e.y, r: CFG.light.firefly * (0.85 + Math.sin(e.ph * 5) * 0.15), warm: 0.2, green: 1, env: true }; },
  noSort: true,
};
EK.svent = {
  update(e, dt) {
    e.cd -= dt;
    if (e.cd <= 0) { e.cd = rand(3.5, 5); addEnt(G.room, 'smoke', e.x, e.y, { r: 6, rmax: rand(26, 34), life: rand(5, 7), vx: rand(-6, 6), vy: rand(-6, 4) }); Snd.play('smoke'); }
    if (Math.random() < 0.1) part(e.x + rand(-3, 3), e.y, 0, -15, 0.8, '#6a6070', 1);
  },
  draw(e, ox, oy) { ctx.fillStyle = '#1f1619'; ctx.beginPath(); ctx.ellipse(e.x - ox, e.y - oy, 6, 3, 0, 0, TAU); ctx.fill(); },
  noSort: true,
};
EK.smoke = {
  update(e, dt) { e.t += dt; e.r = Math.min(e.rmax, e.r + 14 * dt); e.x += e.vx * dt; e.y += e.vy * dt; if (e.t > e.life || e.cleared) e.dead = true; },
  draw(e, ox, oy) {
    const a = Math.min(1, e.t / 0.8, (e.life - e.t) / 1.2) * 0.55;
    for (let i = 0; i < 4; i++) { const ang = i * 1.7 + e.t * 0.3; ctx.fillStyle = `rgba(90,82,96,${a * 0.7})`; ctx.beginPath(); ctx.arc(e.x + Math.cos(ang) * e.r * 0.4 - ox, e.y + Math.sin(ang) * e.r * 0.3 - oy, e.r * 0.6, 0, TAU); ctx.fill(); }
  },
  noSort: true, over: true,
};
EK.drop = {
  draw(e, ox, oy) { ctx.drawImage(ART.prop.wicks, Math.round(e.x - 8 - ox), Math.round(e.y - 10 - oy + Math.sin(G.t * 3) * 1.5)); },
  light(e) { return { x: e.x, y: e.y, r: 20, warm: 1, env: false }; },
  update(e) { const p = G.P; if (p && dist(p.x, p.y, e.x, e.y) < 12) { e.dead = true; G.S.wicks += e.n; G.S.drop = null; Snd.play('piece'); ftext(e.x, e.y - 14, `找回灯芯 +${e.n}`, '#ffd166'); } },
};
EK.loot = {
  update(e, dt) {
    e.t += dt; const p = G.P; if (!p) return;
    e.vx *= 0.92; e.vy *= 0.92; e.x += e.vx * dt; e.y += e.vy * dt;
    const d = dist(p.x, p.y, e.x, e.y);
    if (e.t > 0.4 && d < 44) { const s = (1 - d / 44) * 260 * dt + 40 * dt; e.x += ((p.x - e.x) / d) * s; e.y += ((p.y - 4 - e.y) / d) * s; }
    if (d < 8) { e.dead = true; if (e.item === 'wick') { G.S.wicks += e.n; Snd.play('pickup'); } else { G.S.oil = Math.min(G.S.oilMax, G.S.oil + CFG.oil.bottle); Snd.play('oil'); ftext(p.x, p.y - 20, '+灯油', '#ffd166'); } }
    if (e.t > 25) e.dead = true;
  },
  draw(e, ox, oy) { const b = Math.sin(G.t * 6 + e.x) * 1; if (e.item === 'wick') { ctx.fillStyle = '#ecdcb6'; ctx.fillRect(Math.round(e.x - ox), Math.round(e.y - oy - 3 + b), 1, 4); ctx.fillStyle = '#e9823a'; ctx.fillRect(Math.round(e.x - ox), Math.round(e.y - oy - 4 + b), 1, 1); } else ctx.drawImage(ART.icon.oilbottle, Math.round(e.x - 6 - ox), Math.round(e.y - 10 - oy + b)); },
  noSort: true,
};
EK.cat = {
  draw(e, ox, oy) { const f = ART.ch.cat.idle.R; ctx.drawImage(f[Math.floor(G.t * 2) % 2], Math.round(e.x - 8 - ox), Math.round(e.y - 9 - oy)); },
  label() { return G.room.id === 't_tea' ? '摸摸猫' : '抱起小猫'; },
  interact() { if (G.room.id === 't_tea') runScript([['narr', '团子眯着眼睛，咕噜咕噜地叫。']]); else runScript('cat_pick'); },
};

// ---------------- 物品 ----------------
function iconOf(item) { return { heartpiece: 'heartpiece', letter: 'letter', oilmax: 'oilmax', heart: 'heart', lantern: 'oil' }[item] || item; }
function itemName(id) { const d = DATA.items[id]; if (d) return d.name; return { heartpiece: '心之碎片', letter: '信的碎片', oilmax: '灯油上限 +20', soupmax: '暖汤上限 +1', heart: '一颗完整的心', lantern: '师父的旧灯笼', wicks: '灯芯' }[id] || id; }
function giveItem(id, n = 1, x, y) {
  const S = G.S; let msg = '获得：' + itemName(id);
  switch (id) {
    case 'wicks': S.wicks += n; msg = `灯芯 +${n}`; break;
    case 'heartpiece': S.pieces += n; msg = `心之碎片（${S.pieces % 4 === 0 ? 4 : S.pieces % 4} / 4）`; if (S.pieces % 4 === 0) { S.hearts++; S.hp = S.hearts * 4; msg = '四片心之碎片拼成了一颗心！生命上限 +1'; } Snd.play('piece'); break;
    case 'heart': S.hearts++; S.hp = S.hearts * 4; msg = '一颗完整的心！生命上限 +1'; Snd.play('piece'); break;
    case 'letter': S.letters += n; msg = `信的碎片（${S.letters} / 4）：${LETTER_BITS[Math.min(3, S.letters - 1)]}`; Snd.play('piece'); break;
    case 'oilmax': S.oilMax += 20; S.oil = S.oilMax; Snd.play('piece'); break;
    case 'soupmax': S.soupMax++; S.soup = Math.min(S.soupMax, S.soup + 1); break;
    case 'lantern': S.flags.got_lantern = true; break;
    default: S.items[id] = (S.items[id] | 0) + n; if (DATA.items[id] && DATA.items[id].slot) Snd.play('piece');
  }
  toast(msg);
  if (x != null) ftext(x, y, msg.length > 12 ? itemName(id) : msg, '#fff1b0');
}

// ---------------- 粒子、飘字、震屏 ----------------
function part(x, y, vx, vy, life, col, size = 1, g = 0) { if (G.parts.length > 700) return; G.parts.push({ x, y, vx, vy, life, max: life, col, size, g }); }
function burst(x, y, n, cols, spd, life, size = 1, g = 0) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rand(0.3, 1) * spd; part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.1), cols[(Math.random() * cols.length) | 0], size, g); } }
function ftext(x, y, str, col = '#fff') { G.texts.push({ x, y, str, col, t: 0 }); }
function shake(v) { if (G.set.shake) G.shakeV = Math.min(1, G.shakeV + v); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }
function slowmo(t, scale) { G.slowT = Math.max(G.slowT, t); G.slowScale = scale; }
function toast(str) { G.ui.toasts.push({ str, t: 0 }); if (G.ui.toasts.length > 4) G.ui.toasts.shift(); }
function hint(id) { if (!G.S || G.S.hints[id] || !HINTS[id]) return; G.S.hints[id] = true; G.ui.hint = HINTS[id]; G.ui.hintT = CFG.hint.time; }
function updateFx(dt) {
  for (const p of G.parts) { p.life -= dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; }
  G.parts = G.parts.filter((p) => p.life > 0);
  for (const t of G.texts) t.t += dt;
  G.texts = G.texts.filter((t) => t.t < 1.1);
}
function drawFx(ox, oy) {
  for (const p of G.parts) { ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.6); ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x - ox), Math.round(p.y - oy), p.size, p.size); }
  ctx.globalAlpha = 1;
}
function drawTexts(ox, oy) {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold 7px ${FONT}`;
  for (const t of G.texts) { const y = t.y - oy - t.t * 14, a = Math.min(1, (1.1 - t.t) * 3); ctx.globalAlpha = a; ctx.fillStyle = '#120e1a'; ctx.fillText(t.str, t.x - ox + 0.5, y + 0.6); ctx.fillStyle = t.col; ctx.fillText(t.str, t.x - ox, y); }
  ctx.globalAlpha = 1;
}

// ---------------- 镜头 ----------------
const CAM = { x: VW / 2, y: VH / 2, ox: 0, oy: 0 };
function camTarget() {
  const R = G.room, p = G.P;
  let tx, ty;
  if (G.camFocus) { tx = G.camFocus.x; ty = G.camFocus.y; }
  else if (G.bossFight && R.w * TS <= VW + 1) { tx = R.w * TS / 2; ty = R.h * TS / 2; } // Boss 战：整个场地都在画面里（相当于拉远）
  else { tx = p.x + (IN.mx - VW / 2) * CFG.camera.mouseLead; ty = p.y - 6 + (IN.my - VH / 2) * CFG.camera.mouseLead; }
  const rw = R.w * TS, rh = R.h * TS;
  tx = rw <= VW ? rw / 2 : clamp(tx, VW / 2, rw - VW / 2);
  ty = rh <= VH ? rh / 2 : clamp(ty, VH / 2, rh - VH / 2);
  return [tx, ty];
}
function updateCam(dt, snap) {
  const [tx, ty] = camTarget();
  const k = snap ? 1 : 1 - Math.exp(-CFG.camera.follow * dt);
  CAM.x += (tx - CAM.x) * k; CAM.y += (ty - CAM.y) * k;
  G.shakeV = Math.max(0, G.shakeV - dt * 2.4);
  const s = G.shakeV * G.shakeV * CFG.camera.shakeMax;
  CAM.ox = Math.round(CAM.x - VW / 2 + (s ? rand(-s, s) : 0));
  CAM.oy = Math.round(CAM.y - VH / 2 + (s ? rand(-s, s) : 0));
}

// ---------------- 房间切换 ----------------
function fadeTo(v, time, cb) { G.fade.to = v; G.fade.speed = 1 / Math.max(0.01, time); G.fade.cb = cb || null; }
function updateFade(dt) {
  const f = G.fade;
  if (f.v !== f.to) { f.v += Math.sign(f.to - f.v) * f.speed * dt; if (Math.abs(f.to - f.v) < f.speed * dt + 1e-4) f.v = f.to; }
  if (f.v === f.to && f.cb) { const cb = f.cb; f.cb = null; cb(); }
}
function goRoom(id, opt) {
  if (G.trans) return;
  G.trans = true;
  fadeTo(1, 0.16, () => { enterRoom(id, opt); fadeTo(0, 0.22, () => { G.trans = false; }); });
}
function enterRoom(id, opt = {}) {
  const prevRegion = G.room ? G.room.region : null;
  G.room = loadRoom(id);
  const R = G.room, p = G.P;
  G.projs = []; G.parts = []; G.texts = [];
  placePlayer(opt);
  p.safeX = p.x; p.safeY = p.y; p.vx = p.vy = 0;
  G.S.room = id; G.S.visited[id] = true;
  renderLayer(R);
  updateCam(0, true);
  const reg = R.region, name = REGION_NAME[reg];
  if (opt.banner !== false && (prevRegion == null || REGION_NAME[prevRegion] !== name)) G.ui.banner = { title: name, sub: R.def.name, t: 0 };
  Snd.music(R.def.music === 'summit' && R.def.boss ? 'summit' : REGION_MUSIC[reg]);
  // 进房间时的剧情
  for (const oe of R.def.onEnter) if (cond(oe.cond)) { runScript(oe.script); break; }
  if (R.def.boss && !G.S.flags['boss_' + R.def.boss] && !G.script) runScript(R.def.boss + '_intro');
  if (reg === 'lake' && (R.id === 'l2')) hint('ice');
  if (reg === 'kiln' && R.id === 'k4') hint('smoke');
  if (R.id === 'l3') hint('bell');
  if (R.id === 'k3') hint('jar');
}
function placePlayer(opt) {
  const R = G.room, p = G.P;
  if (opt.lh) {
    const e = R.ents.find((q) => q.k === 'lh' && q.id === opt.lh);
    if (e) { p.x = e.x; p.y = e.y + 26; if (!walkable(Math.floor(p.x / TS), Math.floor(p.y / TS))) nearestWalkable(p); return; }
  }
  if (opt.at) { p.x = opt.at[0] * TS + 8; p.y = opt.at[1] * TS + 8; return; }
  if (opt.x != null && !opt.dir) { p.x = opt.x; p.y = opt.y; if (!walkable(Math.floor(p.x / TS), Math.floor(p.y / TS))) nearestWalkable(p); return; }
  if (opt.dir) {
    const d = opt.dir;
    if (d === 'w') { p.x = R.w * TS - 6; p.y = opt.y; edgeSnap(p, R.w - 1, null); }
    else if (d === 'e') { p.x = 6; p.y = opt.y; edgeSnap(p, 0, null); }
    else if (d === 'n') { p.y = R.h * TS - 6; p.x = opt.x; edgeSnap(p, null, R.h - 1); }
    else { p.y = 6; p.x = opt.x; edgeSnap(p, null, 0); }
    return;
  }
  if (R.spawnX) { p.x = R.spawnX; p.y = R.spawnY; return; }
  nearestWalkable(p);
}
// 在边缘一排/一列里找离当前坐标最近的可走格
function edgeSnap(p, col, row) {
  const R = G.room;
  let best = null, bd = 1e9;
  if (col != null) { for (let y = 0; y < R.h; y++) if (walkable(col, y)) { const d = Math.abs(y * TS + 8 - p.y); if (d < bd) { bd = d; best = y; } } if (best != null) p.y = best * TS + 8; }
  else { for (let x = 0; x < R.w; x++) if (walkable(x, row)) { const d = Math.abs(x * TS + 8 - p.x); if (d < bd) { bd = d; best = x; } } if (best != null) p.x = best * TS + 8; }
}
function nearestWalkable(p) {
  const tx0 = Math.floor(p.x / TS), ty0 = Math.floor(p.y / TS);
  for (let r = 0; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; if (walkable(tx0 + dx, ty0 + dy)) { p.x = (tx0 + dx) * TS + 8; p.y = (ty0 + dy) * TS + 8; return; } }
}
function checkExit() {
  const R = G.room, p = G.P;
  let dir = null;
  if (p.x < 0) dir = 'w'; else if (p.x >= R.w * TS) dir = 'e'; else if (p.y < 0) dir = 'n'; else if (p.y >= R.h * TS) dir = 's';
  if (!dir) {
    const tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS);
    if (tileAt(tx, ty) === TL.DOOR && !G.trans) {
      const door = R.def.doors.reduce((b, d) => (!b || dist(d.x, d.y, tx, ty) < dist(b.x, b.y, tx, ty) ? d : b), null);
      if (door) { Snd.play('door'); goRoom(door.to, { at: door.at }); }
    }
    return;
  }
  const to = R.def.exits[dir];
  if (!to || G.lockExits) {
    p.x = clamp(p.x, 2, R.w * TS - 2); p.y = clamp(p.y, 2, R.h * TS - 2);
    if (G.lockExits && !G.ui.toasts.length) toast('先打倒眼前的影子！');
    return;
  }
  goRoom(to, { dir, x: p.x, y: p.y });
}

// ---------------- 灯塔、存档、复活 ----------------
function lightLighthouse(e) {
  G.S.lit[e.id] = true; G.S.light = e.id;
  if (e.lhdef.flag) G.S.flags[e.lhdef.flag] = true;
  Snd.play('lighthouse'); shake(0.3);
  burst(e.x, e.y - 22, 30, ['#ffd166', '#fff1b0', '#ffffff'], 90, 1.2, 1, -10);
  restAt(e, true);
  if (e.lhdef.script) runScript(e.lhdef.script);
  else toast(`${e.name} 点亮了（已存档）`);
}
function restAt(e, silent) {
  const S = G.S;
  S.hp = S.hearts * 4; S.oil = S.oilMax; S.soup = S.soupMax; S.dead = {};
  S.light = e.id; S.room = G.room.id;
  const okSave = saveGame();
  if (!silent) { toast(okSave ? '休息了一会儿。伤好了，暖汤满了。（已存档）' : '休息了一会儿。（存档失败：浏览器不允许本地存储）'); Snd.play('heal'); }
  // 重新生成本房间的敌人
  const keep = G.room.ents.filter((q) => q.k !== 'enemy');
  const fresh = loadRoom(G.room.id);
  G.room.ents = keep.concat(fresh.ents.filter((q) => q.k === 'enemy'));
}
function lighthouseRoom(lhId) { for (const id in MAPS) if (MAPS[id].lh && MAPS[id].lh.id === lhId) return id; return null; }
function respawn() {
  const S = G.S;
  S.stats.deaths++;
  if (S.wicks > 0) { const n = Math.floor(S.wicks / 2); if (n > 0) { S.drop = { room: G.room.id, x: G.P.deathX || G.P.x, y: G.P.deathY || G.P.y, n }; S.wicks -= n; } }
  S.hp = S.hearts * 4; S.oil = S.oilMax; S.soup = S.soupMax; S.dead = {};
  G.bossFight = null; G.ui.boss = null; G.lockExits = false; G.camFocus = null;
  G.P.state = 'move'; G.P.inv = 1.5; G.P.dead = false;
  const room = S.light ? lighthouseRoom(S.light) : 't_home';
  saveGame();
  enterRoom(room, S.light ? { lh: S.light } : { at: [11, 6] });
  fadeTo(0, 0.6);
}
function teleport(lhId) { const room = lighthouseRoom(lhId); if (!room) return; G.S.light = lhId; goRoom(room, { lh: lhId }); }

// ---------------- 剧情里能调用的函数 ----------------
const HOOK = {
  spawnNpc(id, tx, ty) { if (G.room.ents.some((e) => e.k === 'npc' && e.id === id && !e.dead)) return; const e = addEnt(G.room, 'npc', tx * TS + 8, ty * TS + 8, { id, alpha: 0 }); HOOK.fadeInNpc(e); burst(e.x, e.y, 8, ['#463a62', '#2a2140'], 30, 0.6, 1); },
  fadeInNpc(e) { const t0 = G.t; const tick = () => { e.alpha = Math.min(1, (G.t - t0) / 0.4); if (e.alpha < 1 && !e.dead) requestAnimationFrame(tick); }; tick(); },
  removeNpc(id) { for (const e of G.room.ents) if (e.k === 'npc' && e.id === id) { e.dead = true; burst(e.x, e.y, 10, ['#463a62', '#8c86a0'], 40, 0.6, 1); } },
  removeEnt(k) { for (const e of G.room.ents) if (e.k === k) e.dead = true; },
  spawnEnemies(kind, list) { for (const [x, y] of list) { const e = spawnEnemy(G.room, kind, x * TS + 8, y * TS + 8, { uid: null }); burst(e.x, e.y, 10, ['#2a2140', '#463a62'], 40, 0.6, 1); } },
  lockExits(v) { G.lockExits = !!v; },
  refillSoup() { G.S.soup = G.S.soupMax; toast('暖汤满了'); },
  toast(s) { toast(s); },
  abilityGet(id) { G.S.abil[id] = true; G.S.cur = abilList().indexOf(id); G.ui.banner = { title: '获得新能力：' + DATA.abilities[id].name, sub: DATA.abilities[id].desc, t: 0, big: true }; Snd.play('ability'); hint(id); if (abilList().length > 1) setTimeout(() => hint('wheel'), 6500); },
  freeIce() { const e = G.room.ents.find((q) => q.k === 'frozen'); if (e) { e.free = true; burst(e.x, e.y - 8, 20, ['#e4f8fc', '#a9dff0'], 70, 0.8, 1); e.gone = true; blockTile(G.room, e.tx, e.ty, -1); HOOK.spawnNpc('wang', e.tx, e.ty); } },
  sinkIce() { const e = G.room.ents.find((q) => q.k === 'frozen'); if (e) { e.gone = true; blockTile(G.room, e.tx, e.ty, -1); burst(e.x, e.y, 12, ['#a9dff0', '#1f4a73'], 40, 0.8, 1); Snd.play('splash'); } },
  shake(v) { shake(v); },
  sealStatus() { const n = MAIN_LIGHTS.filter((id) => G.S.lit[id]).length; toast(`三座守夜灯塔：已点亮 ${n} / 3`); },
  runScript(id) { G.script.chain = id; },
};
