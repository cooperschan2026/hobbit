'use strict';
// =====================================================================
// 光照：整个画面盖一层黑，在光源位置挖出渐变的圆；再叠一层暖色泛光
// “亮区”判定只算环境光（灯塔、火盆、萤火虫、月光、点亮的人家），不算自己的灯笼
// =====================================================================
const LC = document.createElement('canvas');
LC.width = VW / 2; LC.height = VH / 2;
const lctx = LC.getContext('2d');
const LIGHTS = [];
G.flashes = [];

function lanternRadius() {
  const S = G.S, O = CFG.oil;
  let r = O.rMin + (O.rMax - O.rMin) * clamp(S.oil / O.fullAt, 0, 1);
  if (S.equip.shade === 'shade_paper') r *= 1.3;
  r *= 1 + Math.sin(G.t * 2.2) * 0.035 + Math.sin(G.t * 13.7) * 0.012; // 光圈“呼吸”和轻微闪烁
  if (G.P && G.P.inSmoke) r *= 0.55;
  if (G.P && G.P.charge > 0.25) r *= 1 + Math.min(1, G.P.charge) * 0.25;
  return r;
}
function gatherLights() {
  LIGHTS.length = 0;
  const R = G.room, p = G.P, dark = G.bossFight && G.bossFight.dark;
  if (p && !p.dead && G.S.flags.got_lantern) LIGHTS.push({ x: p.lx, y: p.ly, r: lanternRadius(), warm: 1, env: false, player: true });
  else if (p && !p.dead) LIGHTS.push({ x: p.x, y: p.y - 6, r: 30, warm: 0, env: false });
  if (!dark) {
    for (const e of R.ents) { if (e.dead) continue; const f = EK[e.k] && EK[e.k].light; if (f) { const L = f(e); if (L) LIGHTS.push(L); } }
    for (const [x, y] of R.lava) LIGHTS.push({ x, y, r: CFG.light.lava, warm: 0.5, env: false, lava: true, i: 0.6 });
    if (!R.moon) { R.moon = []; for (let i = 0; i < R.w * R.h; i++) if (R.t[i] === TL.MOON) R.moon.push([(i % R.w) * TS + 8, ((i / R.w) | 0) * TS + 8]); }
    for (const [x, y] of R.moon) LIGHTS.push({ x, y, r: CFG.light.moon, cool: 1, env: true });
  } else {
    // 全黑阶段：只有自己的灯笼，和偶尔闪一下的火光
    for (const e of R.ents) if (e.k === 'boss' && e.spark > 0) LIGHTS.push({ x: e.x, y: e.y - 10, r: 22, warm: 1, env: false });
  }
  for (const pr of G.projs) if (pr.glow) LIGHTS.push({ x: pr.x, y: pr.y, r: pr.glow, warm: pr.cold ? 0 : 1, cool: pr.cold ? 1 : 0, env: !!pr.envLight });
  for (const f of G.flashes) { const k = f.t / f.dur; LIGHTS.push({ x: f.x, y: f.y, r: f.r * (0.3 + 0.7 * Math.sin(Math.min(1, k * 1.4) * Math.PI / 2)), warm: 1, env: true, i: 1 - k * 0.6 }); }
}
function inLight(x, y) {
  for (const L of LIGHTS) if (L.env && (L.x - x) * (L.x - x) + (L.y - y) * (L.y - y) < (L.r * CFG.oil.lightThreshold) ** 2) return true;
  return false;
}
function ambientDark() {
  const R = G.room;
  if (G.bossFight && G.bossFight.dark) return 0.97;
  let a = R.def.ambient != null ? R.def.ambient : CFG.light.ambient[R.region];
  if (G.bossFight && G.bossFight.extraDark) a = Math.min(0.96, a + G.bossFight.extraDark);
  return a;
}
function renderLight() {
  const s = 0.5, ox = CAM.ox, oy = CAM.oy, W = LC.width, H = LC.height;
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, W, H);
  lctx.fillStyle = `rgba(4,3,12,${ambientDark()})`;
  lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of LIGHTS) {
    const x = (L.x - ox) * s, y = (L.y - oy) * s, r = L.r * s;
    if (x < -r || y < -r || x > W + r || y > H + r || r <= 0) continue;
    const a = L.i == null ? 1 : L.i;
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(0.45, `rgba(0,0,0,${a * 0.9})`); g.addColorStop(0.8, `rgba(0,0,0,${a * 0.35})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g; lctx.beginPath(); lctx.arc(x, y, r, 0, TAU); lctx.fill();
  }
  // 烟挡光
  lctx.globalCompositeOperation = 'source-over';
  for (const e of G.room.ents) {
    if (e.k !== 'smoke' || e.dead) continue;
    const a = Math.min(1, e.t / 0.8, (e.life - e.t) / 1.2) * 0.7;
    const x = (e.x - ox) * s, y = (e.y - oy) * s, r = e.r * s * 1.2;
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(10,8,14,${a})`); g.addColorStop(1, 'rgba(10,8,14,0)');
    lctx.fillStyle = g; lctx.beginPath(); lctx.arc(x, y, r, 0, TAU); lctx.fill();
  }
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(LC, 0, 0, VW, VH);
  ctx.imageSmoothingEnabled = false;
  // 暖色/冷色泛光
  ctx.globalCompositeOperation = 'lighter';
  for (const L of LIGHTS) {
    if (L.lava) continue;
    const x = L.x - ox, y = L.y - oy, r = L.r * 0.8;
    if (x < -r || y < -r || x > VW + r || y > VH + r) continue;
    const col = L.green ? '160,255,120' : L.cool ? '120,170,255' : '255,160,70';
    const k = (L.warm || L.cool || L.green ? 1 : 0.5) * (L.player ? 0.13 : 0.1);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${col},${k})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  // 熔岩的红光
  for (const [lx, ly] of G.room.lava) {
    const x = lx - ox, y = ly - oy;
    if (x < -30 || y < -30 || x > VW + 30 || y > VH + 30) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, 'rgba(255,90,30,0.13)'); g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 26, y - 26, 52, 52);
  }
  ctx.globalCompositeOperation = 'source-over';
}
function updateFlashes(dt) { for (const f of G.flashes) f.t += dt; G.flashes = G.flashes.filter((f) => f.t < f.dur); }
