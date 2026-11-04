'use strict';
// =====================================================================
// 美术：所有贴图在运行时用代码画出来（像素图元 + 自动描边），不用外部图片
// 角色 16x16，Boss 更大；头像 32x32；地砖按区域生成
// =====================================================================
const COL = {
  ink: '#120e1a', d1: '#1c1828', d2: '#2a2438', d3: '#3b3350', d4: '#544a6b', g1: '#7a7090', g2: '#a69cb8', g3: '#d6cfe0', wht: '#f4efe6',
  skin: '#f1c9a0', skinD: '#c99068', blush: '#e88f86',
  red: '#c8443c', redD: '#7e2a2e', redL: '#e86a4f', org: '#e9823a', yel: '#ffd166', yelL: '#fff1b0', gold: '#e7b53d', goldD: '#a8781f',
  brn: '#7a4e33', brnD: '#4b2f22', tan: '#b98552', tanL: '#dcae74',
  grn: '#4f9a5c', grnD: '#2d5c3d', grnL: '#8ccf6e', bam: '#5e9b4e', bamD: '#33663a', bamL: '#a6d873', leaf: '#3f7a43',
  teal: '#3e8f8a', tealL: '#74c7b5', tealD: '#265e5c',
  blu: '#3a6ea8', bluD: '#243f6e', ice: '#a9dff0', iceL: '#e4f8fc', iceD: '#5f9fc4', wat: '#1f4a73', watD: '#14304f', watL: '#3f7fae',
  pur: '#7a4fa8', purD: '#45305f', purL: '#b48ce0',
  sha: '#2a2140', shaL: '#463a62', shaD: '#17112a', eye: '#ffe27a', eyeR: '#ff5a4f', eyeB: '#8fe6ff',
  lava: '#ff6a2a', lavaL: '#ffc24a', lavaD: '#a3271f', rock: '#33262a', rockL: '#55403e', rockD: '#1f1619', brick: '#8a4b3a', brickL: '#a8644d', ash: '#3d3436', ashL: '#574c4c',
  por: '#e3ecf2', porB: '#3e6fa8', porD: '#9fb3c6',
  sto: '#5d5a6e', stoL: '#8d89a0', stoD: '#3a374a', stoDD: '#262433',
  wood: '#8a5a3a', woodD: '#5a3a26', woodL: '#b07a4f',
  pap: '#ecdcb6', papD: '#c3ab80', snow: '#dfe7f0', snowD: '#a9b7c9', snowL: '#f6fbff',
};

// ---------- 像素图元（整数坐标，不抗锯齿） ----------
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function R(x, px, py, w, h, col) { x.fillStyle = col; x.fillRect(Math.round(px), Math.round(py), Math.round(w), Math.round(h)); }
function P(x, px, py, col) { x.fillStyle = col; x.fillRect(Math.round(px), Math.round(py), 1, 1); }
function Ci(x, cx, cy, r, col) { x.fillStyle = col; const rr = r * r + r * 0.8; for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) if (i * i + j * j <= rr) x.fillRect(Math.round(cx + i), Math.round(cy + j), 1, 1); }
function El(x, cx, cy, rx, ry, col) { x.fillStyle = col; for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) if ((i * i) / (rx * rx + 0.6) + (j * j) / (ry * ry + 0.6) <= 1) x.fillRect(Math.round(cx + i), Math.round(cy + j), 1, 1); }
function Ln(x, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; x.fillStyle = col;
  for (;;) { x.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}
function rng(seed) { return function () { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// 给不透明像素外围加 1 像素描边
function outline(cv, col = COL.ink) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, d = x.getImageData(0, 0, w, h), a = d.data, src = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) src[i] = a[i * 4 + 3] > 0 ? 1 : 0;
  const [r, g, b] = hexRgb(col);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (src[k]) continue;
    if ((i > 0 && src[k - 1]) || (i < w - 1 && src[k + 1]) || (j > 0 && src[k - w]) || (j < h - 1 && src[k + w])) { a[k * 4] = r; a[k * 4 + 1] = g; a[k * 4 + 2] = b; a[k * 4 + 3] = 255; }
  }
  x.putImageData(d, 0, 0); return cv;
}
function flipH(cv) { const [c, x] = mk(cv.width, cv.height); x.translate(cv.width, 0); x.scale(-1, 1); x.drawImage(cv, 0, 0); return c; }
// 纯色剪影（受击闪白、影子、残影）
function solid(cv, col, alpha = 1) { const [c, x] = mk(cv.width, cv.height); x.drawImage(cv, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height); return c; }
function dither(x, px, py, w, h, col, density, r) { x.fillStyle = col; for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (r() < density) x.fillRect(px + i, py + j, 1, 1); }
// 一组朝右的帧 → {R:[...], L:[...]}
function pair(frames) { return { R: frames, L: frames.map(flipH) }; }

// =====================================================================
// 角色：Q 版小人生成器（朝右）
// =====================================================================
function chibi(o, frame, pose) {
  const [cv, x] = mk(16, 16);
  const bob = pose === 'walk' ? (frame % 2) : pose === 'idle' ? frame : 0;
  const by = bob;
  // 腿
  if (pose !== 'sit') {
    const legs = pose === 'walk' ? [[6, 9], [5, 10], [6, 9], [7, 8]][frame % 4] : [6, 9];
    const lh = o.small ? 1 : 2;
    R(x, legs[0], 13 - (o.small ? 0 : 0), 2, lh, o.pants); R(x, legs[1], 13, 2, lh, o.pants);
    R(x, legs[0], 14, 2, 1, o.shoe || COL.d1); R(x, legs[1], 14, 2, 1, o.shoe || COL.d1);
  }
  // 身体
  const bt = 9 + by;
  R(x, 5, bt, 6, 4 - by, o.cloth); R(x, 5, bt + 3 - by, 6, 1, o.cloth2 || o.cloth);
  R(x, 5, bt, 1, 4 - by, o.cloth2 || o.cloth);
  if (o.apron) R(x, 7, bt + 1, 3, 3 - by, o.apron);
  if (o.robe) { R(x, 4, bt + 1, 8, 4 - by, o.cloth); R(x, 4, 13, 8, 1, o.cloth2); }
  // 手臂（朝右那只在前面）
  R(x, 10, bt + 1, 2, 2, o.cloth2 || o.cloth); P(x, 11, bt + 2, o.skin);
  // 头
  const hy = 5 + by;
  Ci(x, 8, hy, 4, o.skin);
  // 头发
  const hc = o.hair, hs = o.hairStyle;
  if (hs !== 'bald') {
    R(x, 4, hy - 4, 9, 3, hc); R(x, 4, hy - 1, 3, 4, hc); P(x, 7, hy - 1, hc); P(x, 9, hy - 1, hc); P(x, 12, hy - 1, hc); P(x, 12, hy, hc);
    Ci(x, 8, hy - 2, 3, hc);
  }
  if (hs === 'spiky') { P(x, 5, hy - 5, hc); P(x, 8, hy - 5, hc); P(x, 11, hy - 5, hc); P(x, 13, hy - 2, hc); P(x, 3, hy - 1, hc); }
  if (hs === 'buns') { Ci(x, 5, hy - 4, 1.4, hc); Ci(x, 11, hy - 4, 1.4, hc); P(x, 12, hy + 1, hc); }
  if (hs === 'long') { R(x, 3, hy - 1, 3, 6, hc); R(x, 4, hy + 4, 2, 3, hc); }
  if (o.band) R(x, 4, hy - 2, 9, 1, o.band);
  if (o.hat === 'bamboo') { El(x, 8, hy - 3, 7, 1.6, COL.tan); R(x, 6, hy - 6, 5, 2, COL.tanL); P(x, 8, hy - 7, COL.tanL); }
  if (o.hat === 'scarf') { R(x, 4, hy - 4, 9, 3, o.hatCol); R(x, 3, hy - 1, 3, 4, o.hatCol); }
  if (o.hat === 'cap') { R(x, 5, hy - 4, 7, 2, o.hatCol); R(x, 11, hy - 3, 3, 1, o.hatCol); }
  // 脸
  if (!o.noFace) {
    P(x, 9, hy, o.eye || COL.ink); P(x, 11, hy, o.eye || COL.ink);
    if (o.eyeGlow) { P(x, 9, hy, o.eyeGlow); P(x, 11, hy, o.eyeGlow); }
    if (o.blush) { P(x, 10, hy + 2, o.blush); }
  }
  if (o.beard) { R(x, 8, hy + 2, 5, 2, o.beard); P(x, 9, hy + 4, o.beard); P(x, 11, hy + 4, o.beard); }
  if (o.scarf) { R(x, 6, bt - 1, 6, 1, o.scarf); R(x, 4, bt, 2, 2, o.scarf); P(x, 3, bt + 2 - by, o.scarf); }
  if (o.sword) { Ln(x, 3, bt - 3, 6, bt + 2, COL.g2); P(x, 3, bt - 4, COL.wht); }
  return outline(cv, o.ol || COL.ink);
}
function shadowize(cv) { const s = solid(cv, COL.sha); const x = s.getContext('2d'); return s; }

const CHAR_DEF = {
  jin: { hair: '#1f1b33', hairStyle: 'spiky', skin: COL.skin, cloth: COL.brn, cloth2: COL.brnD, pants: COL.d2, scarf: COL.red, blush: COL.blush },
  man: { hair: '#4a2a1e', hairStyle: 'buns', skin: COL.skin, cloth: COL.teal, cloth2: COL.tealD, pants: COL.tealD, apron: COL.pap, blush: COL.blush },
  feng: { hair: COL.g2, hairStyle: 'short', skin: COL.skinD, cloth: COL.g1, cloth2: COL.d4, pants: COL.d3, apron: COL.brn, beard: COL.g3, band: COL.red },
  qi: { hair: '#1a1424', hairStyle: 'short', skin: COL.skin, cloth: COL.blu, cloth2: COL.bluD, pants: COL.d2, small: true, hat: 'cap', hatCol: COL.red, blush: COL.blush },
  ke: { hair: '#1a1424', hairStyle: 'short', skin: COL.skin, cloth: COL.d3, cloth2: COL.d2, pants: COL.d1, hat: 'bamboo', sword: true },
  zhu: { hair: COL.g3, hairStyle: 'long', skin: COL.skinD, cloth: COL.redD, cloth2: '#57202a', pants: COL.d2, beard: COL.wht, robe: true },
  cunA: { hair: '#2b1d1a', hairStyle: 'short', skin: COL.skin, cloth: COL.pur, cloth2: COL.purD, pants: COL.d2, hat: 'scarf', hatCol: COL.blu },
  cunB: { hair: COL.g2, hairStyle: 'short', skin: COL.skinD, cloth: COL.grn, cloth2: COL.grnD, pants: COL.d3, beard: COL.g2 },
  cunC: { hair: '#3a2418', hairStyle: 'buns', skin: COL.skin, cloth: COL.org, cloth2: COL.redD, pants: COL.d2, small: true, blush: COL.blush },
  cunD: { hair: '#222', hairStyle: 'short', skin: COL.skin, cloth: COL.tan, cloth2: COL.brn, pants: COL.d3, hat: 'cap', hatCol: COL.grnD },
  cunE: { hair: COL.g1, hairStyle: 'long', skin: COL.skinD, cloth: COL.bluD, cloth2: '#1b2f52', pants: COL.d2 },
};
function charSet(def) {
  const idle = [0, 1].map((f) => chibi(def, f, 'idle'));
  const walk = [0, 1, 2, 3].map((f) => chibi(def, f, 'walk'));
  return { idle: pair(idle), walk: pair(walk) };
}
// 主角的翻滚、受伤、倒地、喝汤帧
function playerExtra() {
  const d = CHAR_DEF.jin;
  const roll = [0, 1].map((f) => {
    const [cv, x] = mk(16, 16);
    Ci(x, 8, 10, 5, d.cloth); Ci(x, 8, 9, 3.5, d.hair); R(x, 4, 11, 8, 1, d.scarf);
    if (f) { P(x, 5, 8, d.scarf); P(x, 12, 12, d.cloth2); } else { P(x, 11, 7, d.scarf); P(x, 4, 12, d.cloth2); }
    return outline(cv);
  });
  const dead = (() => { const [cv, x] = mk(16, 16); R(x, 3, 11, 10, 3, d.cloth); Ci(x, 12, 11, 3, d.skin); R(x, 12, 8, 3, 3, d.hair); R(x, 2, 12, 2, 2, d.pants); R(x, 6, 10, 4, 1, d.scarf); return outline(cv); })();
  const soup = (() => { const c = chibi(d, 0, 'idle'); const x = c.getContext('2d'); R(x, 10, 6, 4, 2, COL.wht); R(x, 11, 5, 2, 1, COL.org); return c; })();
  return { roll: pair(roll), dead: pair([dead]), soup: pair([soup]) };
}

// =====================================================================
// 敌人（朝右）
// =====================================================================
function enemyShade(frame, crouch) {
  const [cv, x] = mk(16, 16);
  const ry = crouch ? 4 : 5, cy = crouch ? 10 : 8;
  El(x, 8, cy, 5, ry, COL.sha);
  for (let i = 0; i < 5; i++) { const xx = 4 + i * 2, h = ((i + frame) % 2) ? 2 : 3; R(x, xx, cy + ry - 1, 1, h, COL.sha); }
  El(x, 7, cy - 2, 2, 2, COL.shaL);
  const ec = crouch ? COL.eyeR : COL.eye;
  P(x, 9, cy - 1, ec); P(x, 11, cy - 1, ec); if (!crouch) { P(x, 9, cy, ec); P(x, 11, cy, ec); }
  return outline(cv, COL.shaD);
}
function enemyHound(frame, lunge) {
  const [cv, x] = mk(16, 16);
  El(x, 7, 10, 5, 2.5, COL.sha); Ci(x, 12, 8, 2.4, COL.sha); P(x, 11, 5, COL.sha); P(x, 13, 5, COL.sha);
  R(x, 14, 9, 2, 1, COL.sha); P(x, 13, 8, COL.eyeR);
  Ln(x, 2, 8, 0, lunge ? 6 : 7, COL.sha);
  const lf = frame % 2;
  R(x, 4 + lf, 12, 1, 2, COL.sha); R(x, 6 - lf, 12, 1, 2, COL.sha); R(x, 9 + lf, 12, 1, 2, COL.sha); R(x, 11 - lf, 12, 1, 2, COL.sha);
  R(x, 4, 9, 6, 1, COL.shaL);
  if (lunge) { R(x, 13, 10, 2, 1, COL.wht); }
  return outline(cv, COL.shaD);
}
function enemyGhost(frame) {
  const [cv, x] = mk(16, 16);
  const b = frame;
  for (let i = 0; i < 4; i++) P(x, 6 + i + (i % 2 ? b : -b) * 0, 13 + (i % 2), COL.g2);
  El(x, 8, 7 + b, 5, 5, COL.pap); R(x, 3, 7 + b, 11, 1, COL.papD); R(x, 4, 4 + b, 9, 1, COL.papD); R(x, 4, 10 + b, 9, 1, COL.papD);
  R(x, 6, 1 + b, 5, 2, COL.d2); R(x, 6, 12 + b, 5, 1, COL.d2);
  Ci(x, 9, 7 + b, 1.6, COL.ink); P(x, 9, 6 + b, COL.eyeB); P(x, 11, 9 + b, COL.red); P(x, 11, 10 + b, COL.red);
  return outline(cv);
}
function enemySpike(state) { // 0 藏着 1 预警 2 戳出
  const [cv, x] = mk(16, 16);
  El(x, 8, 13, 6, 2, COL.brnD); R(x, 4, 13, 9, 1, COL.brn);
  if (state === 0) { P(x, 6, 11, COL.bam); P(x, 10, 12, COL.bam); }
  if (state === 1) { Ln(x, 4, 12, 12, 14, COL.ink); P(x, 7, 10, COL.bamL); P(x, 9, 10, COL.bamL); }
  if (state === 2) {
    for (const [sx, h] of [[5, 9], [8, 12], [11, 8]]) { R(x, sx, 14 - h, 2, h, COL.bam); P(x, sx, 14 - h, COL.bamL); R(x, sx + 1, 14 - h, 1, h, COL.bamD); P(x, sx, 13 - h, COL.bamL); }
  }
  return outline(cv);
}
function enemyFrog(state) { // 0 待机 1 蓄力 2 跳
  const [cv, x] = mk(16, 16);
  const cy = state === 1 ? 11 : state === 2 ? 8 : 10, ry = state === 1 ? 3 : state === 2 ? 5 : 4;
  El(x, 8, cy, 6, ry, COL.iceD); El(x, 8, cy + 1, 4, ry - 1.5, COL.ice);
  Ci(x, 5, cy - ry, 1.8, COL.iceD); Ci(x, 11, cy - ry, 1.8, COL.iceD); P(x, 5, cy - ry, COL.wht); P(x, 11, cy - ry, COL.wht); P(x, 6, cy - ry, COL.ink); P(x, 12, cy - ry, COL.ink);
  R(x, 2, cy + ry - 1, 3, 1, COL.iceD); R(x, 11, cy + ry - 1, 3, 1, COL.iceD);
  P(x, 7, cy - 1, COL.iceL); P(x, 4, cy, COL.iceL);
  return outline(cv, '#16304a');
}
function enemyLamp(frame) {
  const [cv, x] = mk(16, 16);
  const b = frame;
  R(x, 7, 1 + b, 2, 2, COL.d3);
  El(x, 8, 7 + b, 4, 4, COL.ice); R(x, 4, 7 + b, 9, 1, COL.iceD); R(x, 5, 4 + b, 7, 1, COL.iceD);
  Ci(x, 8, 7 + b, 1.6, COL.blu); P(x, 9, 7 + b, COL.wht);
  R(x, 7, 11 + b, 2, 1, COL.d3); P(x, 7, 13 + b, COL.iceD); P(x, 9, 14 + b, COL.iceD);
  return outline(cv, '#16304a');
}
function enemyClay(frame, noShield) {
  const [cv, x] = mk(16, 16);
  const lf = frame % 2;
  R(x, 5 + lf, 13, 2, 2, COL.brnD); R(x, 9 - lf, 13, 2, 2, COL.brnD);
  R(x, 4, 7, 8, 6, COL.brick); R(x, 4, 7, 8, 1, COL.brickL); R(x, 5, 9, 6, 1, COL.brnD); R(x, 5, 11, 6, 1, COL.brnD);
  Ci(x, 8, 4, 3, COL.brickL); R(x, 5, 1, 7, 2, COL.brn); P(x, 8, 0, COL.red); P(x, 9, 4, COL.ink); P(x, 11, 4, COL.ink);
  if (!noShield) { R(x, 11, 6, 4, 8, COL.porD); R(x, 11, 6, 4, 1, COL.por); R(x, 12, 8, 2, 4, COL.porB); P(x, 12, 9, COL.por); }
  return outline(cv);
}
function enemyLizard(frame, dash) {
  const [cv, x] = mk(16, 16);
  El(x, 8, 10, 5, 2.5, COL.lavaD); Ci(x, 13, 9, 2.2, COL.lavaD);
  Ln(x, 3, 10, 0, dash ? 10 : 8 + frame, COL.lavaD);
  R(x, 5, 9, 6, 1, COL.lava); P(x, 7, 10, COL.lavaL); P(x, 10, 10, COL.lavaL); P(x, 13, 8, COL.yel);
  const lf = frame % 2;
  P(x, 5 + lf, 13, COL.lavaD); P(x, 10 - lf, 13, COL.lavaD); P(x, 6 - lf, 12, COL.lavaD); P(x, 11 + lf, 12, COL.lavaD);
  P(x, 7, 7, COL.lavaL); P(x, 9, 6, COL.yel); P(x, 8, 7, COL.lava);
  return outline(cv, '#2a0d0d');
}
function enemySmoke(frame) {
  const [cv, x] = mk(16, 16);
  const b = frame;
  Ci(x, 6, 8 + b, 4, COL.g1); Ci(x, 10, 7 - b, 4, COL.g1); Ci(x, 8, 10, 4, COL.g1); Ci(x, 7, 6, 3, COL.g2);
  R(x, 8, 7, 1, 2, COL.ink); R(x, 11, 7, 1, 2, COL.ink); R(x, 9, 11, 2, 1, COL.ink);
  return outline(cv, COL.d2);
}
function enemyElite(frame, wind) {
  const [cv, x] = mk(24, 24);
  const b = frame;
  // 披风
  El(x, 11, 15, 8, 6, COL.shaD);
  for (let i = 0; i < 7; i++) R(x, 4 + i * 2, 19, 1, (i + b) % 2 ? 3 : 4, COL.shaD);
  // 身体铠甲
  R(x, 7, 9, 10, 9, COL.sha); R(x, 7, 9, 10, 2, COL.shaL); R(x, 8, 13, 8, 1, COL.purD);
  Ci(x, 12, 6, 4, COL.sha); R(x, 8, 2, 8, 3, COL.purD); P(x, 7, 1, COL.purD); P(x, 16, 1, COL.purD); P(x, 6, 0, COL.purL); P(x, 17, 0, COL.purL);
  P(x, 13, 6, COL.eyeR); P(x, 15, 6, COL.eyeR);
  // 大刀
  if (wind) { Ln(x, 17, 10, 22, 1, COL.g2); Ln(x, 18, 10, 23, 2, COL.g3); }
  else { Ln(x, 17, 14, 23, 20, COL.g2); Ln(x, 17, 15, 22, 21, COL.g3); }
  R(x, 16, 12, 2, 3, COL.shaL);
  return outline(cv, COL.ink);
}
function enemyCat(frame) {
  const [cv, x] = mk(16, 16);
  El(x, 7, 11, 4, 2.5, COL.org); Ci(x, 11, 9, 2.4, COL.org); P(x, 10, 6, COL.org); P(x, 12, 6, COL.org);
  P(x, 11, 9, COL.ink); P(x, 13, 9, COL.ink); Ln(x, 3, 10, 2, 7 - frame, COL.org); R(x, 5, 10, 3, 1, COL.wht);
  return outline(cv);
}

// =====================================================================
// Boss
// =====================================================================
function bossKe(pose, frame) { // 竹中客（影）24x24：0 待机 1 举刀 2 突进
  const [cv, x] = mk(24, 24);
  const b = pose === 0 ? frame : 0;
  El(x, 12, 16 + b, 5, 5, COL.sha);
  for (let i = 0; i < 5; i++) R(x, 8 + i * 2, 20 + b, 1, (i + frame) % 2 ? 2 : 3, COL.sha);
  Ci(x, 12, 9 + b, 3.5, COL.sha);
  El(x, 12, 6 + b, 9, 2, COL.tanL); R(x, 9, 3 + b, 6, 2, COL.tan); P(x, 12, 2 + b, COL.tan);
  R(x, 13, 9 + b, 3, 1, COL.eye);
  R(x, 9, 13 + b, 6, 1, COL.shaL);
  if (pose === 1) { Ln(x, 16, 13, 22, 2, COL.wht); Ln(x, 17, 13, 23, 3, COL.g2); }
  else if (pose === 2) { Ln(x, 15, 15, 23, 13, COL.wht); Ln(x, 15, 16, 23, 14, COL.g2); }
  else { Ln(x, 16, 16 + b, 20, 22, COL.g3); }
  return outline(cv, COL.shaD);
}
function bossCarp(frame, open) { // 溺钟 40x28
  const [cv, x] = mk(40, 28);
  El(x, 19, 15, 15, 9, COL.watD); El(x, 19, 17, 13, 6, COL.wat);
  for (let i = 0; i < 6; i++) El(x, 10 + i * 4, 12, 1.5, 1, COL.watL);
  // 尾巴
  const t = frame ? 2 : 0;
  for (let j = -6; j <= 6; j++) R(x, 1 + Math.abs(j) / 2 + t, 15 + j, 4, 1, COL.watD);
  // 头
  El(x, 31, 15, 6, 7, COL.watD); P(x, 33, 12, COL.eyeB); P(x, 34, 12, COL.eyeB); P(x, 33, 13, COL.wht);
  if (open) { R(x, 35, 16, 4, 3, COL.ink); R(x, 35, 16, 4, 1, COL.redD); } else { R(x, 34, 17, 4, 1, COL.ink); }
  Ln(x, 36, 18, 39, 22, COL.watL); Ln(x, 36, 17, 39, 15, COL.watL);
  // 头上嵌着的铜钟
  R(x, 21, 2, 8, 2, COL.goldD); El(x, 25, 6, 4, 4, COL.gold); R(x, 21, 8, 9, 2, COL.goldD); P(x, 24, 5, COL.yelL);
  // 鳍
  El(x, 19, 23, 4, 2, COL.watL); El(x, 14, 6, 3, 3, COL.wat);
  return outline(cv, '#0a1522');
}
function bossFin() { const [cv, x] = mk(12, 10); for (let j = 0; j < 8; j++) R(x, 5 - j / 2, 9 - j, 2 + j / 1.5, 1, COL.watD); P(x, 4, 3, COL.watL); return outline(cv, '#0a1522'); }
function bossKiln(frame, exposed) { // 窑神身体 48x48（瓷甲另画）
  const [cv, x] = mk(48, 48);
  const b = frame;
  R(x, 15, 38, 6, 8, COL.rock); R(x, 27, 38, 6, 8, COL.rock);
  El(x, 24, 28 + b, 14, 12, COL.rock); El(x, 24, 27 + b, 12, 10, COL.rockL);
  for (let i = 0; i < 10; i++) { const r2 = rng(i + 3); Ln(x, 14 + r2() * 20, 20 + r2() * 16, 16 + r2() * 20, 22 + r2() * 16, COL.lavaD); }
  Ci(x, 24, 12 + b, 7, COL.rock); Ci(x, 24, 12 + b, 6, COL.rockL);
  R(x, 20, 11 + b, 2, 2, COL.lavaL); R(x, 26, 11 + b, 2, 2, COL.lavaL);
  El(x, 8, 26 + b, 5, 9, COL.rock); El(x, 40, 26 + b, 5, 9, COL.rock);
  if (exposed) { Ci(x, 24, 28 + b, 5, COL.lava); Ci(x, 24, 28 + b, 3, COL.lavaL); Ci(x, 24, 28 + b, 1.5, COL.yelL); }
  else { Ci(x, 24, 28 + b, 3, COL.lavaD); }
  return outline(cv, COL.rockD);
}
function bossPlate(i) { // 瓷甲：0 头 1 胸 2 左臂 3 右臂
  const sz = [[14, 10], [18, 14], [10, 16], [10, 16]][i];
  const [cv, x] = mk(sz[0], sz[1]);
  El(x, sz[0] / 2 - 0.5, sz[1] / 2 - 0.5, sz[0] / 2 - 1, sz[1] / 2 - 1, COL.por);
  const r2 = rng(i * 7 + 1);
  for (let k = 0; k < 5; k++) { const px = 2 + r2() * (sz[0] - 4), py = 2 + r2() * (sz[1] - 4); P(x, px, py, COL.porB); P(x, px + 1, py, COL.porB); P(x, px, py + 1, COL.blu); }
  Ln(x, 2, sz[1] / 2, sz[0] - 3, sz[1] / 2 - 1, COL.porD);
  P(x, 3, 2, COL.wht);
  return outline(cv, '#1d2a3a');
}
function bossZhu(pose, frame, dark) { // 师父·烛 24x28：半人半灯
  const [cv, x] = mk(24, 28);
  const b = frame;
  El(x, 12, 20, 7, 6, COL.redD); R(x, 6, 22, 12, 4, '#57202a');
  Ci(x, 12, 10 + b, 4, COL.skinD); R(x, 7, 5 + b, 5, 9, COL.g3); R(x, 9, 13 + b, 4, 4, COL.wht);
  P(x, 11, 9 + b, COL.ink);
  // 右半边是灯
  R(x, 13, 4 + b, 7, 12, COL.pap); R(x, 13, 7 + b, 7, 1, COL.papD); R(x, 13, 11 + b, 7, 1, COL.papD);
  R(x, 14, 2 + b, 5, 2, COL.d2); R(x, 14, 16 + b, 5, 1, COL.d2);
  Ci(x, 16, 9 + b, 2, COL.yel); P(x, 16, 8 + b, COL.yelL);
  if (pose === 1) { Ln(x, 18, 18, 23, 12, COL.org); Ci(x, 23, 11, 1.5, COL.yel); }
  let c = outline(cv, '#1a0d10');
  if (dark) c = solid(c, COL.shaD);
  return c;
}
function bossNight(frame) { // 长夜 64x48
  const [cv, x] = mk(64, 48);
  const r2 = rng(99);
  El(x, 32, 26, 26, 18, COL.shaD); El(x, 32, 24, 22, 15, COL.sha);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + frame * 0.2; Ln(x, 32 + Math.cos(a) * 18, 26 + Math.sin(a) * 12, 32 + Math.cos(a) * 30, 26 + Math.sin(a) * 22, COL.shaD); }
  for (let i = 0; i < 7; i++) { const ex = 14 + r2() * 36, ey = 14 + r2() * 20; El(x, ex, ey, 2.5, 1.5, COL.eyeR); P(x, ex, ey, COL.yelL); }
  El(x, 32, 20, 5, 3, COL.eye); R(x, 31, 18, 2, 5, COL.ink);
  return outline(cv, COL.ink);
}

// =====================================================================
// 道具、装置
// =====================================================================
function propLighthouse(lit) {
  const [cv, x] = mk(32, 48);
  R(x, 4, 40, 24, 7, COL.stoD); R(x, 5, 40, 22, 2, COL.sto);
  for (let i = 0; i < 4; i++) R(x, 6 + i * 6, 43, 4, 1, COL.stoDD);
  // 塔身（上窄下宽）
  for (let j = 0; j < 22; j++) { const w = 12 + j / 3; R(x, 16 - w / 2, 18 + j, w, 1, j % 6 === 0 ? COL.stoL : COL.g3); }
  R(x, 13, 30, 6, 10, COL.woodD); R(x, 14, 31, 4, 9, COL.wood);
  // 灯室
  R(x, 9, 9, 14, 10, COL.d2);
  R(x, 11, 10, 10, 8, lit ? COL.yel : COL.d3);
  if (lit) { R(x, 13, 11, 6, 6, COL.yelL); R(x, 15, 12, 2, 4, COL.wht); }
  R(x, 15, 10, 2, 8, COL.d2);
  R(x, 8, 18, 16, 2, COL.stoD);
  // 屋顶
  for (let j = 0; j < 7; j++) R(x, 16 - (3 + j * 1.6), 2 + j, (3 + j * 1.6) * 2, 1, j % 2 ? COL.redD : COL.red);
  R(x, 15, 0, 2, 2, COL.gold);
  return outline(cv);
}
function propBrazier(lit, f) {
  const [cv, x] = mk(16, 16);
  Ln(x, 5, 15, 7, 11, COL.d4); Ln(x, 11, 15, 9, 11, COL.d4); P(x, 8, 15, COL.d4); R(x, 8, 12, 1, 3, COL.d4);
  El(x, 8, 10, 5, 2, COL.sto); R(x, 3, 9, 11, 1, COL.stoL);
  if (lit) {
    const h = [5, 6, 5][f % 3];
    El(x, 8, 9 - h / 2, 3, h / 2 + 1, COL.org); El(x, 8, 9 - h / 2 + 1, 2, h / 2, COL.yel); P(x, 8, 9 - h + (f % 2), COL.yelL);
    P(x, 6 + (f % 2), 9 - h, COL.org);
  } else { R(x, 6, 8, 5, 1, COL.d2); P(x, 7, 7, COL.g1); }
  return outline(cv);
}
function propPost() { // 灯柱（钩索点）16x32
  const [cv, x] = mk(16, 32);
  R(x, 5, 28, 6, 3, COL.stoD); R(x, 7, 6, 2, 22, COL.woodD); R(x, 7, 6, 1, 22, COL.wood);
  R(x, 7, 5, 6, 2, COL.woodD); Ln(x, 11, 7, 11, 9, COL.d4);
  El(x, 11, 12, 2.5, 3, COL.pap); R(x, 9, 12, 5, 1, COL.papD); R(x, 10, 9, 3, 1, COL.d2); R(x, 10, 15, 3, 1, COL.d2);
  Ci(x, 8, 4, 2, COL.gold); P(x, 8, 4, COL.d2);
  return outline(cv);
}
function propJar() {
  const [cv, x] = mk(16, 16);
  El(x, 8, 9, 6, 5, COL.por); R(x, 5, 3, 6, 2, COL.porD); R(x, 6, 2, 4, 1, COL.por);
  R(x, 3, 9, 11, 1, COL.porB); P(x, 5, 7, COL.porB); P(x, 8, 6, COL.porB); P(x, 11, 7, COL.porB); P(x, 6, 11, COL.blu); P(x, 10, 11, COL.blu);
  P(x, 4, 6, COL.wht);
  return outline(cv, '#1d2a3a');
}
function propBell(hit) {
  const [cv, x] = mk(16, 16);
  R(x, 2, 2, 12, 2, COL.woodD); R(x, 2, 2, 2, 13, COL.woodD); R(x, 12, 2, 2, 13, COL.woodD);
  const o = hit ? 1 : 0;
  R(x, 7 + o, 4, 2, 2, COL.goldD); El(x, 8 + o, 8, 3, 3, COL.gold); R(x, 4 + o, 10, 9, 2, COL.goldD); P(x, 7 + o, 7, COL.yelL);
  return outline(cv);
}
function propChest(open) {
  const [cv, x] = mk(16, 16);
  R(x, 2, 7, 12, 7, COL.wood); R(x, 2, 7, 12, 1, COL.woodL); R(x, 2, 10, 12, 1, COL.woodD);
  if (open) { R(x, 2, 3, 12, 3, COL.woodD); R(x, 3, 6, 10, 1, COL.ink); }
  else { R(x, 2, 4, 12, 3, COL.woodL); R(x, 2, 4, 12, 1, COL.tanL); }
  R(x, 7, 6, 2, 3, COL.gold); R(x, 2, 4, 1, 10, COL.gold); R(x, 13, 4, 1, 10, COL.gold);
  return outline(cv);
}
function propSign() { const [cv, x] = mk(16, 16); R(x, 7, 9, 2, 6, COL.woodD); R(x, 2, 3, 12, 7, COL.wood); R(x, 2, 3, 12, 1, COL.woodL); R(x, 4, 5, 8, 1, COL.woodD); R(x, 4, 7, 6, 1, COL.woodD); return outline(cv); }
function propFrozen(free) {
  const [cv, x] = mk(16, 24);
  if (!free) { R(x, 1, 2, 14, 21, COL.ice); R(x, 1, 2, 14, 2, COL.iceL); R(x, 2, 5, 1, 14, COL.iceL); }
  El(x, 8, 12, 4, 5, free ? COL.sha : '#3a4a6a'); Ci(x, 8, 7, 3, free ? COL.sha : '#3a4a6a'); P(x, 9, 7, COL.eye); P(x, 11, 7, COL.eye);
  if (!free) { R(x, 4, 10, 9, 1, 'rgba(255,255,255,0.35)'); P(x, 12, 4, COL.wht); }
  return outline(cv, '#16304a');
}
function propOilDrop() { const [cv, x] = mk(10, 12); El(x, 5, 7, 3, 3, COL.yel); R(x, 4, 2, 2, 3, COL.yel); P(x, 5, 1, COL.yel); P(x, 4, 6, COL.yelL); return outline(cv); }
function propWickPile() { const [cv, x] = mk(16, 16); for (let i = 0; i < 5; i++) { R(x, 4 + i * 2, 10 - (i % 2) * 2, 1, 4 + (i % 2) * 2, COL.pap); P(x, 4 + i * 2, 9 - (i % 2) * 2, COL.org); } El(x, 8, 14, 5, 1, COL.d3); return outline(cv); }

// ---------- 图标（12x12） ----------
function icon(draw) { const [cv, x] = mk(12, 12); draw(x); return outline(cv); }
const ICON_DRAW = {
  soup: (x) => { El(x, 6, 7, 5, 3, COL.wht); R(x, 1, 5, 11, 2, COL.por); R(x, 2, 5, 9, 1, COL.org); P(x, 4, 2, COL.g3); P(x, 7, 1, COL.g3); P(x, 5, 3, COL.g3); },
  wick: (x) => { R(x, 5, 3, 2, 8, COL.pap); P(x, 5, 3, COL.papD); El(x, 6, 2, 1.5, 2, COL.org); P(x, 6, 1, COL.yel); },
  oil: (x) => { El(x, 6, 7, 4, 4, COL.yel); R(x, 5, 1, 2, 3, COL.yel); P(x, 5, 6, COL.yelL); },
  oilbottle: (x) => { R(x, 4, 4, 5, 7, COL.iceD); R(x, 5, 6, 3, 4, COL.yel); R(x, 5, 1, 3, 3, COL.woodL); P(x, 5, 5, COL.iceL); },
  heartpiece: (x) => { Ci(x, 4, 4, 2.4, COL.red); Ci(x, 8, 4, 2.4, COL.red); for (let j = 0; j < 5; j++) R(x, 2 + j, 6 + j, 9 - j * 2, 1, COL.red); R(x, 6, 1, 1, 10, COL.ink); P(x, 3, 3, COL.redL); },
  heart: (x) => { Ci(x, 4, 4, 2.4, COL.red); Ci(x, 8, 4, 2.4, COL.red); for (let j = 0; j < 5; j++) R(x, 2 + j, 6 + j, 9 - j * 2, 1, COL.red); P(x, 3, 3, COL.redL); },
  letter: (x) => { R(x, 2, 2, 8, 9, COL.pap); R(x, 3, 4, 6, 1, COL.papD); R(x, 3, 6, 5, 1, COL.papD); R(x, 3, 8, 6, 1, COL.papD); Ln(x, 9, 2, 6, 11, COL.ink); },
  mat_bamboo: (x) => { for (let i = 0; i < 3; i++) Ln(x, 2 + i * 3, 10, 5 + i * 3, 1, i % 2 ? COL.bamL : COL.bam); },
  mat_ice: (x) => { for (let j = 0; j < 9; j++) R(x, 6 - j / 2.2, 1 + j, 1 + j / 1.1, 1, COL.ice); P(x, 5, 3, COL.iceL); P(x, 6, 6, COL.wht); },
  mat_glaze: (x) => { El(x, 6, 6, 4, 4, COL.tealL); P(x, 4, 4, COL.wht); P(x, 7, 7, COL.teal); P(x, 5, 8, COL.teal); },
  oilmax: (x) => { R(x, 3, 3, 6, 8, COL.yel); R(x, 4, 1, 4, 2, COL.woodL); R(x, 5, 5, 2, 4, COL.wht); R(x, 4, 6, 4, 2, COL.wht); },
  dash: (x) => { for (let i = 0; i < 3; i++) R(x, 1 + i, 3 + i * 3, 6, 1, COL.iceL); Ln(x, 7, 2, 11, 6, COL.wht); Ln(x, 11, 6, 7, 10, COL.wht); },
  hook: (x) => { Ln(x, 1, 11, 7, 5, COL.g3); Ln(x, 7, 5, 10, 2, COL.g2); Ln(x, 10, 2, 11, 5, COL.g2); Ln(x, 7, 5, 4, 2, COL.g2); },
  fire: (x) => { El(x, 6, 7, 4, 4, COL.org); R(x, 5, 1, 2, 5, COL.org); El(x, 6, 8, 2, 2, COL.yel); P(x, 6, 7, COL.yelL); P(x, 8, 3, COL.org); },
  cat: (x) => { El(x, 6, 7, 4, 3, COL.org); P(x, 3, 3, COL.org); P(x, 8, 3, COL.org); R(x, 3, 4, 6, 2, COL.org); P(x, 4, 5, COL.ink); P(x, 7, 5, COL.ink); },
  map: (x) => { R(x, 1, 2, 10, 8, COL.pap); Ln(x, 4, 2, 4, 9, COL.papD); Ln(x, 7, 2, 7, 9, COL.papD); P(x, 9, 4, COL.red); },
};
function shadeIcon(c1, c2) { return icon((x) => { R(x, 5, 1, 2, 2, COL.d3); El(x, 6, 6, 4, 4, c1); R(x, 2, 6, 9, 1, c2); R(x, 3, 3, 7, 1, c2); R(x, 3, 9, 7, 1, c2); R(x, 5, 10, 2, 1, COL.d3); P(x, 6, 6, COL.yelL); }); }
function charmIcon(c1, sym) { return icon((x) => { R(x, 3, 1, 6, 10, COL.pap); R(x, 3, 1, 6, 1, COL.red); R(x, 5, 0, 2, 1, COL.red); sym(x, c1); }); }

// =====================================================================
// 头像 32x32（多种表情）
// =====================================================================
function portrait(id, ex) {
  const [cv, x] = mk(32, 32);
  const P2 = { jin: [COL.brn, '#1f1b33', COL.skin], man: [COL.teal, '#4a2a1e', COL.skin], feng: [COL.g1, COL.g2, COL.skinD], qi: [COL.sha, COL.sha, COL.sha], qi2: [COL.blu, '#1a1424', COL.skin], zhu: [COL.redD, COL.g3, COL.skinD], ke: [COL.d3, '#1a1424', COL.skin], cun: [COL.pur, '#2b1d1a', COL.skin], night: [COL.shaD, COL.shaD, COL.sha] }[id] || [COL.d3, COL.d1, COL.skin];
  const [cloth, hair, skin] = P2;
  // 肩膀
  El(x, 16, 31, 12, 6, cloth);
  if (id === 'jin') { R(x, 9, 25, 14, 3, COL.red); R(x, 7, 27, 4, 4, COL.red); }
  if (id === 'man') { R(x, 12, 25, 8, 6, COL.pap); }
  if (id === 'feng') { R(x, 11, 26, 10, 6, COL.brn); }
  if (id === 'night') {
    El(x, 16, 16, 14, 14, COL.shaD); El(x, 16, 15, 11, 11, COL.sha);
    for (const [ex2, ey] of [[10, 12], [22, 12], [16, 8], [12, 20], [20, 20]]) { El(x, ex2, ey, 2, 1, COL.eyeR); P(x, ex2, ey, COL.yelL); }
    return outline(cv);
  }
  // 头
  El(x, 16, 16, 8, 9, skin);
  if (id === 'qi') { El(x, 16, 16, 8, 9, COL.sha); for (let i = 0; i < 6; i++) R(x, 8 + i * 3, 24, 2, 3 + (i % 2), COL.sha); }
  // 头发
  const hairTop = () => { El(x, 16, 10, 9, 5, hair); R(x, 7, 10, 3, 9, hair); R(x, 23, 10, 3, 8, hair); };
  if (id === 'jin') { hairTop(); for (let i = 0; i < 5; i++) { P(x, 9 + i * 3, 4, hair); P(x, 10 + i * 3, 5, hair); } R(x, 10, 12, 3, 2, hair); R(x, 17, 12, 4, 2, hair); }
  if (id === 'man') { hairTop(); Ci(x, 8, 6, 3, hair); Ci(x, 24, 6, 3, hair); R(x, 6, 6, 4, 1, COL.red); R(x, 22, 6, 4, 1, COL.red); R(x, 11, 12, 10, 1, hair); }
  if (id === 'feng') { El(x, 16, 9, 8, 3, hair); R(x, 8, 9, 2, 6, hair); R(x, 22, 9, 2, 6, hair); R(x, 8, 10, 16, 2, COL.red); }
  if (id === 'qi2') { hairTop(); R(x, 9, 6, 15, 4, COL.red); R(x, 22, 9, 5, 2, COL.red); }
  if (id === 'zhu') { El(x, 16, 9, 9, 4, hair); R(x, 6, 9, 4, 16, hair); R(x, 22, 9, 4, 16, hair); }
  if (id === 'ke') { El(x, 16, 10, 15, 3, COL.tan); El(x, 16, 7, 8, 3, COL.tanL); R(x, 8, 13, 16, 2, 'rgba(0,0,0,0.35)'); }
  if (id === 'cun') { El(x, 16, 9, 10, 5, COL.blu); R(x, 6, 9, 4, 12, COL.blu); R(x, 22, 9, 4, 12, COL.blu); }
  // 表情
  const eyeY = 17, lx = 12, rx = 20;
  const ink = id === 'qi' ? COL.eye : COL.ink;
  if (ex === 'h') { Ln(x, lx - 1, eyeY, lx, eyeY - 1, ink); Ln(x, lx, eyeY - 1, lx + 1, eyeY, ink); Ln(x, rx - 1, eyeY, rx, eyeY - 1, ink); Ln(x, rx, eyeY - 1, rx + 1, eyeY, ink); }
  else if (ex === 'a') { R(x, lx - 1, eyeY, 3, 1, ink); R(x, rx - 1, eyeY, 3, 1, ink); Ln(x, lx - 2, eyeY - 3, lx + 1, eyeY - 2, ink); Ln(x, rx + 2, eyeY - 3, rx - 1, eyeY - 2, ink); }
  else if (ex === 'x') { R(x, lx - 1, eyeY - 1, 3, 3, ink); R(x, rx - 1, eyeY - 1, 3, 3, ink); if (id !== 'qi') { P(x, lx, eyeY - 1, COL.wht); P(x, rx, eyeY - 1, COL.wht); } }
  else if (ex === 's') { R(x, lx - 1, eyeY, 2, 2, ink); R(x, rx, eyeY, 2, 2, ink); Ln(x, lx - 2, eyeY - 2, lx + 1, eyeY - 3, ink); Ln(x, rx + 2, eyeY - 2, rx - 1, eyeY - 3, ink); if (id !== 'qi') { P(x, lx - 1, eyeY + 3, COL.eyeB); P(x, lx - 1, eyeY + 4, COL.eyeB); } }
  else { R(x, lx - 1, eyeY - 1, 2, 3, ink); R(x, rx, eyeY - 1, 2, 3, ink); if (id !== 'qi') { P(x, lx - 1, eyeY - 1, COL.wht); P(x, rx, eyeY - 1, COL.wht); } }
  if (id !== 'qi') {
    if (ex === 'h') { Ln(x, 14, 22, 16, 23, COL.ink); Ln(x, 16, 23, 18, 22, COL.ink); }
    else if (ex === 'x') { R(x, 15, 21, 2, 2, COL.ink); }
    else if (ex === 's') { Ln(x, 14, 23, 16, 22, COL.ink); Ln(x, 16, 22, 18, 23, COL.ink); }
    else R(x, 14, 22, 4, 1, COL.ink);
    if ((ex === 'h' || ex === 's' || ex === 'n') && (id === 'man' || id === 'jin' || id === 'qi2')) { R(x, 9, 20, 2, 1, COL.blush); R(x, 21, 20, 2, 1, COL.blush); }
  }
  if (id === 'feng' || id === 'zhu') { El(x, 16, 24, 6, 4, id === 'zhu' ? COL.wht : COL.g3); R(x, 13, 21, 6, 1, id === 'zhu' ? COL.wht : COL.g3); }
  if (id === 'ke') { Ln(x, 19, 19, 23, 23, COL.redD); }
  if (id === 'zhu' && ex === 'a') { El(x, 22, 17, 5, 7, 'rgba(255,209,102,0.85)'); P(x, 22, 17, COL.wht); }
  return outline(cv);
}

// =====================================================================
// 地砖：按区域生成 16x16 贴图
// =====================================================================
const REGION_PAL = {
  town: { f: ['#3a3b4f', '#35364a', '#40425a'], f2: '#3c5a45', path: '#5b566e', wallTop: '#2c2a3c', wallFace: '#5a3d2e', wallFace2: '#3e2a20', deco: 'lamp', pit: '#0a0812' },
  home: { f: ['#6b4a32', '#634430', '#714f36'], f2: '#7d5a3d', path: '#7a5a40', wallTop: '#3a2a22', wallFace: '#8a6446', wallFace2: '#5a3e2c', deco: 'shelf', pit: '#0a0812' },
  tea: { f: ['#6a5040', '#62483a', '#705646'], f2: '#3e6b5c', path: '#7e6450', wallTop: '#3a2a22', wallFace: '#9a7a52', wallFace2: '#6a5038', deco: 'table', pit: '#0a0812' },
  bamboo: { f: ['#26332b', '#233029', '#2b3a30'], f2: '#2f4a33', path: '#4a4234', wallTop: '#1d3a24', wallFace: '#3e7a3e', wallFace2: '#2a5a2e', deco: 'bamboo', pit: '#05080a' },
  lake: { f: ['#7f8fa6', '#7889a0', '#8697ad'], f2: '#93a6bd', path: '#6e6458', wallTop: '#c7d4e3', wallFace: '#5b6d86', wallFace2: '#46566e', deco: 'rock', pit: '#0b1830' },
  kiln: { f: ['#3b3133', '#362d2f', '#413537'], f2: '#4a3a36', path: '#6a3e32', wallTop: '#2a1e20', wallFace: '#7a3f30', wallFace2: '#55291f', deco: 'pots', pit: '#120606' },
  summit: { f: ['#4a4658', '#454153', '#504c60'], f2: '#3f5a50', path: '#6a3a40', wallTop: '#2e2b3a', wallFace: '#7c7690', wallFace2: '#58536a', deco: 'pillar', pit: '#06050c' },
};
const TILE_CACHE = {};
function tileSet(region) {
  if (TILE_CACHE[region]) return TILE_CACHE[region];
  const p = REGION_PAL[region], T = {};
  T.floor = [0, 1, 2, 3].map((v) => {
    const [cv, x] = mk(16, 16); const r = rng(v * 31 + region.length * 7);
    R(x, 0, 0, 16, 16, p.f[v % 3]);
    if (region === 'town' || region === 'summit') { R(x, 0, 15, 16, 1, p.f[1]); R(x, 15, 0, 1, 16, p.f[1]); R(x, 0, 7, 16, 1, 'rgba(0,0,0,0.12)'); R(x, 8, 0, 1, 7, 'rgba(0,0,0,0.12)'); }
    if (region === 'home' || region === 'tea') { for (let j = 0; j < 4; j++) R(x, 0, j * 4 + 3, 16, 1, 'rgba(0,0,0,0.18)'); R(x, (v * 5) % 16, 0, 1, 4, 'rgba(0,0,0,0.12)'); }
    if (region === 'lake') { dither(x, 0, 0, 16, 16, COL.snowL, 0.04, r); }
    if (region === 'kiln') { dither(x, 0, 0, 16, 16, COL.ashL, 0.08, r); if (v === 2) { P(x, 4, 9, COL.lavaD); P(x, 11, 3, COL.lavaD); } }
    if (region === 'bamboo') { dither(x, 0, 0, 16, 16, '#334636', 0.12, r); if (v % 2) { P(x, 3, 11, COL.bamD); P(x, 4, 11, COL.leaf); P(x, 12, 5, COL.leaf); } }
    dither(x, 0, 0, 16, 16, 'rgba(0,0,0,0.18)', 0.06, r);
    return cv;
  });
  T.floor2 = (() => { const [cv, x] = mk(16, 16); const r = rng(77); R(x, 0, 0, 16, 16, p.f[0]); dither(x, 0, 0, 16, 16, p.f2, 0.45, r); for (let i = 0; i < 4; i++) { const px = 2 + r() * 12, py = 2 + r() * 12; Ln(x, px, py, px + 1, py - 2, region === 'lake' ? COL.snowL : region === 'kiln' ? COL.ashL : COL.grnL); } return cv; })();
  T.path = (() => { const [cv, x] = mk(16, 16); const r = rng(5); R(x, 0, 0, 16, 16, p.path); R(x, 0, 0, 16, 1, 'rgba(255,255,255,0.08)'); R(x, 0, 15, 16, 1, 'rgba(0,0,0,0.3)'); R(x, 0, 8, 16, 1, 'rgba(0,0,0,0.15)'); dither(x, 0, 0, 16, 16, 'rgba(0,0,0,0.2)', 0.08, r); return cv; })();
  T.wallTop = (() => {
    const [cv, x] = mk(16, 16); const r = rng(11); R(x, 0, 0, 16, 16, p.wallTop);
    if (region === 'bamboo') { for (let i = 0; i < 7; i++) Ci(x, r() * 16, r() * 16, 2 + r() * 2, i % 2 ? '#24502c' : '#163a1e'); dither(x, 0, 0, 16, 16, COL.leaf, 0.08, r); }
    else if (region === 'lake') { dither(x, 0, 0, 16, 16, COL.snowL, 0.25, r); dither(x, 0, 0, 16, 16, COL.snowD, 0.1, r); }
    else if (region === 'town') { for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) R(x, i * 4 + (j % 2) * 2, j * 4, 3, 3, j % 2 ? '#3a384e' : '#33314a'); }
    else if (region === 'kiln') { dither(x, 0, 0, 16, 16, COL.rockL, 0.15, r); if (r() < 0.5) Ln(x, 2, 12, 9, 6, COL.lavaD); }
    else dither(x, 0, 0, 16, 16, 'rgba(255,255,255,0.06)', 0.2, r);
    return cv;
  })();
  T.wallFace = (() => {
    const [cv, x] = mk(16, 16); const r = rng(13); R(x, 0, 0, 16, 16, p.wallFace);
    if (region === 'bamboo') { for (let i = 0; i < 4; i++) { R(x, i * 4 + 1, 0, 3, 16, i % 2 ? COL.bam : '#4a8a44'); R(x, i * 4 + 1, 0, 1, 16, COL.bamL); R(x, i * 4 + 1, 5 + i * 2, 3, 1, COL.bamD); } }
    else if (region === 'kiln' || region === 'summit') { for (let j = 0; j < 4; j++) { R(x, 0, j * 4, 16, 1, p.wallFace2); R(x, (j % 2) * 6 + 2, j * 4, 1, 4, p.wallFace2); R(x, (j % 2) * 6 + 9, j * 4, 1, 4, p.wallFace2); } }
    else if (region === 'town' || region === 'home' || region === 'tea') { R(x, 0, 0, 16, 2, p.wallFace2); R(x, 0, 14, 16, 2, p.wallFace2); R(x, 3, 4, 10, 7, '#2a1c16'); R(x, 4, 5, 8, 5, '#3a2a20'); R(x, 7, 4, 2, 7, p.wallFace2); R(x, 3, 7, 10, 1, p.wallFace2); }
    else if (region === 'lake') { dither(x, 0, 0, 16, 16, p.wallFace2, 0.3, r); R(x, 0, 0, 16, 2, COL.snow); dither(x, 0, 2, 16, 2, COL.snow, 0.5, r); }
    R(x, 0, 15, 16, 1, 'rgba(0,0,0,0.35)');
    return cv;
  })();
  T.deco = (() => {
    const [cv, x] = mk(16, 24); const r = rng(17);
    if (p.deco === 'bamboo') { for (let i = 0; i < 3; i++) { const bx = 3 + i * 4; R(x, bx, 2 + i, 3, 21 - i, i % 2 ? COL.bam : '#4a8a44'); R(x, bx, 2 + i, 1, 21 - i, COL.bamL); R(x, bx, 9 + i * 3, 3, 1, COL.bamD); R(x, bx, 16 - i, 3, 1, COL.bamD); } Ci(x, 6, 3, 3, COL.leaf); Ci(x, 11, 5, 3, '#2d5c30'); }
    else if (p.deco === 'rock') { El(x, 8, 17, 7, 6, '#5b6d86'); El(x, 8, 15, 6, 4, '#7d8fa8'); El(x, 7, 12, 5, 2, COL.snowL); P(x, 5, 15, COL.snowL); }
    else if (p.deco === 'pots') { El(x, 6, 18, 5, 5, COL.brick); El(x, 11, 14, 4, 5, COL.porD); R(x, 9, 10, 4, 1, COL.porB); El(x, 6, 18, 3, 1, COL.brickL); }
    else if (p.deco === 'pillar') { R(x, 3, 2, 10, 21, COL.stoL); R(x, 3, 2, 3, 21, COL.g3); R(x, 2, 1, 12, 2, COL.wht); R(x, 2, 21, 12, 2, COL.sto); }
    else if (p.deco === 'shelf') { R(x, 1, 3, 14, 20, COL.woodD); R(x, 2, 4, 12, 18, COL.wood); for (let j = 0; j < 3; j++) { R(x, 2, 9 + j * 6, 12, 1, COL.woodD); R(x, 3 + j * 3, 5 + j * 6, 3, 4, [COL.red, COL.yel, COL.teal][j]); R(x, 9, 6 + j * 6, 2, 3, COL.pap); } }
    else if (p.deco === 'table') { R(x, 2, 11, 12, 4, COL.woodL); R(x, 2, 15, 12, 2, COL.woodD); R(x, 3, 17, 2, 5, COL.woodD); R(x, 11, 17, 2, 5, COL.woodD); El(x, 6, 10, 2, 1, COL.wht); El(x, 10, 10, 2, 1, COL.por); }
    else { R(x, 7, 6, 2, 16, COL.stoD); R(x, 4, 20, 8, 3, COL.sto); R(x, 4, 2, 8, 5, COL.sto); R(x, 5, 3, 6, 3, COL.d2); P(x, 7, 4, COL.g1); R(x, 3, 1, 10, 1, COL.stoL); }
    return outline(cv);
  })();
  T.pitEdge = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 5, p.wallFace2); R(x, 0, 0, 16, 1, 'rgba(255,255,255,0.15)'); R(x, 0, 5, 16, 11, p.pit); return cv; })();
  T.pit = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, p.pit); return cv; })();
  T.water = [0, 1].map((f) => { const [cv, x] = mk(16, 16); const r = rng(40 + f); R(x, 0, 0, 16, 16, COL.wat); dither(x, 0, 0, 16, 16, COL.watD, 0.25, r); for (let i = 0; i < 2; i++) { const yy = (i * 7 + f * 3) % 16; R(x, (i * 5 + f * 4) % 12, yy, 4, 1, COL.watL); } return cv; });
  T.waterEdge = (() => { const [cv, x] = mk(16, 4); R(x, 0, 0, 16, 2, COL.iceL); R(x, 0, 2, 16, 2, COL.watL); return cv; })();
  T.ice = [0, 1].map((f) => { const [cv, x] = mk(16, 16); const r = rng(50 + f); R(x, 0, 0, 16, 16, '#8fcbe2'); dither(x, 0, 0, 16, 16, '#a8dcee', 0.2, r); Ln(x, 2 + f * 5, 13, 8 + f * 5, 7, COL.iceL); P(x, 12 - f * 6, 4, COL.wht); return cv; });
  T.lava = [0, 1, 2].map((f) => { const [cv, x] = mk(16, 16); const r = rng(60 + f); R(x, 0, 0, 16, 16, COL.lava); dither(x, 0, 0, 16, 16, COL.lavaL, 0.25, r); dither(x, 0, 0, 16, 16, COL.lavaD, 0.12, r); Ci(x, (f * 6 + 4) % 16, (f * 5 + 6) % 16, 1.5, COL.yelL); return cv; });
  T.cool = (() => { const [cv, x] = mk(16, 16); const r = rng(70); R(x, 0, 0, 16, 16, '#2a2224'); dither(x, 0, 0, 16, 16, '#3a2e2e', 0.3, r); Ln(x, 1, 8, 8, 4, COL.lavaD); Ln(x, 8, 4, 15, 9, COL.lavaD); return cv; })();
  T.vent = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, COL.rock); El(x, 8, 8, 6, 5, COL.rockD); El(x, 8, 8, 4, 3, COL.lava); P(x, 8, 7, COL.yelL); return outline(cv); })();
  T.vine = (() => { const [cv, x] = mk(16, 16); const r = rng(80); R(x, 0, 0, 16, 16, 'rgba(0,0,0,0)'); for (let i = 0; i < 6; i++) { let px = r() * 16, py = 0; for (let j = 0; j < 16; j++) { P(x, px, py + j, j % 3 ? COL.grnD : COL.grn); px += (r() - 0.5) * 2; } } for (let i = 0; i < 8; i++) P(x, r() * 16, r() * 16, COL.grnL); for (let i = 0; i < 5; i++) P(x, r() * 16, r() * 16, COL.ink); return cv; })();
  T.bridge = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, COL.watD); for (let j = 0; j < 4; j++) { R(x, 0, j * 4, 16, 3, COL.wood); R(x, 0, j * 4, 16, 1, COL.woodL); } R(x, 1, 0, 1, 16, COL.woodD); R(x, 14, 0, 1, 16, COL.woodD); return cv; })();
  T.gate = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, 'rgba(0,0,0,0)'); if (region === 'summit') { R(x, 0, 0, 16, 16, COL.sto); R(x, 0, 0, 16, 2, COL.stoL); Ci(x, 8, 8, 4, COL.gold); Ci(x, 8, 8, 2, COL.sto); P(x, 8, 8, COL.yel); } else { for (let i = 0; i < 4; i++) { R(x, i * 4 + 1, 0, 2, 16, COL.woodD); R(x, i * 4 + 1, 0, 1, 16, COL.wood); } R(x, 0, 3, 16, 2, COL.woodD); R(x, 0, 11, 16, 2, COL.woodD); } return cv; })();
  T.moon = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, 'rgba(200,220,255,0.10)'); return cv; })();
  T.door = (() => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, '#24180f'); R(x, 2, 0, 12, 16, COL.woodD); R(x, 3, 1, 10, 15, COL.wood); R(x, 7, 1, 2, 15, COL.woodD); P(x, 6, 8, COL.gold); P(x, 9, 8, COL.gold); return cv; })();
  T.house = [0, 1].map((lit) => { const [cv, x] = mk(16, 16); R(x, 0, 0, 16, 16, p.wallFace); R(x, 3, 3, 10, 13, COL.woodD); R(x, 4, 4, 8, 12, COL.wood); R(x, 5, 6, 6, 4, lit ? COL.yel : '#1c1410'); if (lit) R(x, 6, 7, 4, 2, COL.yelL); R(x, 7, 6, 2, 4, COL.woodD); return cv; });
  TILE_CACHE[region] = T;
  return T;
}

// =====================================================================
// 结局插画、标题（直接画在 480x270 的画布上）
// =====================================================================
function drawScene(x, kind, t) {
  const W = 480, H = 270, r = rng(kind.length * 13);
  // 天空
  const skyTop = kind === 'dawn' ? '#f2a65a' : kind === 'lit' ? '#141a3a' : '#0b0a18';
  const skyBot = kind === 'dawn' ? '#ffe0a8' : kind === 'lit' ? '#2a2f5a' : '#1b1730';
  const sky = x.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, skyTop); sky.addColorStop(1, skyBot); x.fillStyle = sky; x.fillRect(0, 0, W, H);
  if (kind !== 'dawn') for (let i = 0; i < 80; i++) P(x, r() * W, r() * H * 0.5, r() < 0.2 ? COL.yelL : COL.g2);
  if (kind === 'dawn') { Ci(x, 360, 120, 26, '#fff4d0'); Ci(x, 360, 120, 20, '#ffffff'); }
  // 远山
  for (let layer = 0; layer < 3; layer++) {
    const col = kind === 'dawn' ? ['#b8735a', '#8a4e45', '#5a3036'][layer] : ['#262244', '#1c1934', '#121024'][layer];
    x.fillStyle = col;
    for (let i = 0; i < W; i++) { const hgt = 60 + layer * 30 + Math.sin(i * 0.012 + layer * 2) * 30 + Math.sin(i * 0.05 + layer) * 8; x.fillRect(i, H - hgt - 40 + layer * 20, 1, hgt + 60); }
  }
  // 长明台
  const tx = 240;
  R(x, tx - 10, 40, 20, 110, kind === 'dawn' ? '#4a2c30' : '#2a2640'); R(x, tx - 16, 30, 32, 14, kind === 'dawn' ? '#5a3438' : '#332e4e');
  if (kind === 'lit') { x.globalAlpha = 0.25; x.fillStyle = COL.yelL; x.beginPath(); x.moveTo(tx, 36); x.lineTo(0, 0); x.lineTo(80, 0); x.fill(); x.beginPath(); x.moveTo(tx, 36); x.lineTo(480, 10); x.lineTo(480, 60); x.fill(); x.globalAlpha = 1; R(x, tx - 6, 32, 12, 10, COL.yelL); }
  else if (kind === 'dawn') { R(x, tx - 6, 32, 12, 10, COL.yel); }
  else R(x, tx - 6, 32, 12, 10, '#3a3450');
  // 山城房子
  for (let i = 0; i < 26; i++) {
    const hx = 10 + i * 18 + r() * 6, hy = 190 + Math.sin(i * 0.7) * 12 + r() * 10, hw = 14 + r() * 6;
    R(x, hx, hy, hw, 40, kind === 'dawn' ? '#3a2228' : '#16142a');
    for (let j = 0; j < 5; j++) R(x, hx - 2 + j, hy - 5 + j, hw + 4 - j * 2, 1, kind === 'dawn' ? '#5a2a30' : '#24203e');
    const lit = kind === 'lit' || (kind === 'night' && r() < 0.8) || (kind === 'dawn' && r() < 0.5);
    if (lit) { const gg = x.createRadialGradient(hx + 6, hy + 10, 0, hx + 6, hy + 10, 12); gg.addColorStop(0, 'rgba(255,200,100,0.35)'); gg.addColorStop(1, 'rgba(255,200,100,0)'); x.fillStyle = gg; x.fillRect(hx - 6, hy - 2, 24, 24); R(x, hx + 4, hy + 8, 5, 5, kind === 'night' ? COL.org : COL.yel); }
  }
  // 小灯笼与人影
  if (kind === 'night') {
    for (let i = 0; i < 14; i++) { const lx = 20 + r() * 440, ly = 220 + r() * 40; Ln(x, lx, ly, lx, ly - 6, COL.d4); El(x, lx, ly - 9, 2, 3, COL.red); P(x, lx, ly - 9, COL.yel); }
    for (let i = 0; i < 8; i++) { const sx = 40 + i * 55 + r() * 20; El(x, sx, 252, 4, 7, i % 2 ? COL.sha : '#3a2a3a'); Ci(x, sx, 242, 3, i % 2 ? COL.sha : COL.skinD); }
  }
  if (kind === 'dawn') {
    El(x, 222, 150, 5, 10, COL.redD); Ci(x, 222, 138, 4, COL.skinD); R(x, 218, 134, 8, 3, COL.g3);
    El(x, 250, 152, 4, 8, COL.brn); Ci(x, 250, 142, 3.5, COL.skin); R(x, 247, 138, 7, 3, '#1f1b33');
    Ln(x, 254, 150, 258, 146, COL.d4); El(x, 259, 150, 2, 3, COL.red); P(x, 259, 150, COL.yel);
  }
  if (kind === 'lit') { for (let i = 0; i < 30; i++) { const lx = r() * 480, ly = 120 + r() * 120; P(x, lx, ly, COL.yel); } }
  // 前景暗角
  x.globalAlpha = 0.5; R(x, 0, 255, 480, 15, '#000'); x.globalAlpha = 1;
}

// =====================================================================
// 汇总
// =====================================================================
const ART = {
  ready: false,
  init() {
    const C = {};
    for (const k in CHAR_DEF) C[k] = charSet(CHAR_DEF[k]);
    // 阿七的影子形态 + 小猫
    const qiS = CHAR_DEF.qi;
    const sh = (cv) => { const s = solid(cv, COL.sha); const x = s.getContext('2d'); P(x, 9, 5 + 0, COL.eye); P(x, 11, 5, COL.eye); return s; };
    C.qiS = { idle: pair([chibi(qiS, 0, 'idle'), chibi(qiS, 1, 'idle')].map(sh)), walk: pair([0, 1, 2, 3].map((f) => sh(chibi(qiS, f, 'walk')))) };
    void qiS;
    C.cat = { idle: pair([enemyCat(0), enemyCat(1)]), walk: pair([enemyCat(0), enemyCat(1)]) };
    this.ch = C;
    this.px = playerExtra();
    this.lantern = (() => { const [cv, x] = mk(8, 10); R(x, 3, 0, 2, 1, COL.d3); El(x, 4, 4, 3, 3.5, COL.red); R(x, 1, 4, 7, 1, COL.redD); R(x, 2, 2, 5, 1, COL.redD); R(x, 2, 7, 5, 1, COL.redD); P(x, 4, 4, COL.yel); R(x, 3, 8, 2, 1, COL.d3); return outline(cv); })();
    this.lanternLit = (() => { const c = this.lantern; const [cv, x] = mk(8, 10); x.drawImage(c, 0, 0); P(x, 3, 4, COL.yelL); P(x, 4, 3, COL.yelL); P(x, 4, 5, COL.yel); return cv; })();
    this.en = {
      shade: { idle: pair([enemyShade(0), enemyShade(1)]), tell: pair([enemyShade(0, true)]) },
      hound: { idle: pair([enemyHound(0), enemyHound(1)]), tell: pair([enemyHound(0, true)]) },
      ghost: { idle: pair([enemyGhost(0), enemyGhost(1)]), tell: pair([enemyGhost(1)]) },
      spike: { s: [enemySpike(0), enemySpike(1), enemySpike(2)] },
      frog: { idle: pair([enemyFrog(0), enemyFrog(0)]), tell: pair([enemyFrog(1)]), jump: pair([enemyFrog(2)]) },
      lamp: { idle: pair([enemyLamp(0), enemyLamp(1)]), tell: pair([enemyLamp(1)]) },
      clay: { idle: pair([enemyClay(0), enemyClay(1)]), tell: pair([enemyClay(0)]), bare: pair([enemyClay(0, true), enemyClay(1, true)]) },
      lizard: { idle: pair([enemyLizard(0), enemyLizard(1)]), tell: pair([enemyLizard(0, true)]) },
      smoke: { idle: pair([enemySmoke(0), enemySmoke(1)]), tell: pair([enemySmoke(1)]) },
      elite: { idle: pair([enemyElite(0), enemyElite(1)]), tell: pair([enemyElite(0, true)]) },
    };
    this.boss = {
      ke: { idle: pair([bossKe(0, 0), bossKe(0, 1)]), up: pair([bossKe(1, 0)]), dash: pair([bossKe(2, 0)]) },
      carp: { idle: pair([bossCarp(0, false), bossCarp(1, false)]), open: pair([bossCarp(0, true)]), fin: bossFin() },
      kiln: { body: [bossKiln(0, false), bossKiln(1, false)], core: [bossKiln(0, true), bossKiln(1, true)], plates: [0, 1, 2, 3].map(bossPlate) },
      zhu: { idle: pair([bossZhu(0, 0), bossZhu(0, 1)]), cast: pair([bossZhu(1, 0)]), dark: pair([bossZhu(0, 0, true)]) },
      night: [bossNight(0), bossNight(1)],
    };
    this.prop = {
      lh: [propLighthouse(false), propLighthouse(true)], braz: [propBrazier(false, 0), ...[0, 1, 2].map((f) => propBrazier(true, f))],
      post: propPost(), jar: propJar(), bell: [propBell(false), propBell(true)], chest: [propChest(false), propChest(true)], sign: propSign(),
      frozen: [propFrozen(false), propFrozen(true)], oil: propOilDrop(), wicks: propWickPile(),
    };
    this.icon = {};
    for (const k in ICON_DRAW) this.icon[k] = icon(ICON_DRAW[k]);
    this.icon.shade_old = shadeIcon(COL.red, COL.redD); this.icon.shade_iron = shadeIcon(COL.g2, COL.d4); this.icon.shade_paper = shadeIcon(COL.pap, COL.papD);
    this.icon.shade_long = shadeIcon(COL.org, COL.brn); this.icon.shade_qing = shadeIcon(COL.tealL, COL.teal);
    const sym = {
      charm_slow: (x, c) => { Ci(x, 6, 6, 2, c); P(x, 6, 5, COL.ink); P(x, 7, 6, COL.ink); },
      charm_rage: (x, c) => { Ln(x, 4, 9, 6, 3, c); Ln(x, 6, 3, 8, 9, c); },
      charm_oil: (x, c) => { El(x, 6, 7, 2, 2, c); P(x, 6, 4, c); },
      charm_soup: (x, c) => { R(x, 4, 6, 5, 2, c); P(x, 5, 4, c); P(x, 7, 3, c); },
      charm_flame: (x, c) => { El(x, 6, 7, 2, 3, c); P(x, 6, 3, c); P(x, 5, 6, COL.yel); },
      charm_luck: (x, c) => { Ci(x, 6, 6, 2, c); R(x, 5, 5, 2, 2, COL.pap); },
    };
    const symCol = { charm_slow: COL.blu, charm_rage: COL.red, charm_oil: COL.gold, charm_soup: COL.org, charm_flame: COL.lava, charm_luck: COL.goldD };
    for (const k in sym) this.icon[k] = charmIcon(symCol[k], sym[k]);
    // 头像
    this.por = {};
    for (const id of ['jin', 'man', 'feng', 'qi', 'qi2', 'zhu', 'ke', 'cun', 'night']) { this.por[id] = {}; for (const e of ['n', 'h', 's', 'a', 'x']) this.por[id][e] = portrait(id, e); }
    // 特效小图
    this.fx = {
      leaf: (() => { const [cv, x] = mk(4, 3); R(x, 0, 1, 3, 1, COL.bam); P(x, 3, 0, COL.bamL); return cv; })(),
      shard: (() => { const [cv, x] = mk(6, 6); Ln(x, 0, 5, 5, 0, COL.iceL); Ln(x, 1, 5, 5, 1, COL.ice); return cv; })(),
      star: (() => { const [cv, x] = mk(7, 7); Ln(x, 3, 0, 3, 6, COL.g3); Ln(x, 0, 3, 6, 3, COL.g3); P(x, 3, 3, COL.wht); return outline(cv); })(),
      seed: (() => { const [cv, x] = mk(6, 6); Ci(x, 3, 3, 2, COL.org); P(x, 3, 2, COL.yelL); return outline(cv); })(),
      hook: (() => { const [cv, x] = mk(7, 7); Ln(x, 1, 3, 5, 3, COL.g2); Ln(x, 5, 3, 6, 1, COL.g3); Ln(x, 5, 3, 6, 5, COL.g3); return outline(cv); })(),
      bullet: (() => { const [cv, x] = mk(7, 7); Ci(x, 3, 3, 2.5, COL.org); Ci(x, 3, 3, 1.5, COL.yelL); return cv; })(),
      orb: (() => { const [cv, x] = mk(9, 9); Ci(x, 4, 4, 3.5, COL.shaD); Ci(x, 4, 4, 2, COL.pur); P(x, 4, 4, COL.eyeR); return cv; })(),
      cross: (() => { const [cv, x] = mk(9, 9); Ln(x, 0, 0, 8, 8, COL.ink); Ln(x, 8, 0, 0, 8, COL.ink); return cv; })(),
    };
    this.ready = true;
  },
  tiles: tileSet,
  drawScene,
};
