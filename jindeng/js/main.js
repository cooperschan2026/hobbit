'use strict';
// =====================================================================
// 主循环：固定 60 帧逻辑 + 每帧绘制；场景：标题 / 游戏 / 结局
// =====================================================================
G.hintQ = [];
G.lockT = 0;
G.amb = [];

function newGame() {
  G.S = newSave();
  G.P = makePlayer();
  resetRun();
  G.scene = 'game';
  enterRoom('t_home', { at: [11, 6] });
  G.ui.banner = null;
  fadeTo(0, 1.2);
}
function continueGame() {
  const s = loadJSON(SAVE_KEY);
  if (!s) return;
  const base = newSave();
  G.S = Object.assign(base, s);
  for (const k of ['abil', 'equip', 'items', 'flags', 'lit', 'braz', 'taken', 'dead', 'killed', 'visited', 'vents', 'bought', 'stats', 'hints']) G.S[k] = Object.assign(base[k] || {}, s[k] || {});
  G.P = makePlayer();
  resetRun();
  G.scene = 'game';
  const room = G.S.light ? lighthouseRoom(G.S.light) : G.S.room;
  enterRoom(MAPS[room] ? room : 't_home', G.S.light ? { lh: G.S.light } : { at: [11, 6] });
  fadeTo(0, 0.8);
}
function resetRun() {
  G.playStart = G.rt; G.script = null; G.scriptQ = []; G.ui.dlg = null; G.ui.menu = null; G.ui.letter = null; G.ui.boss = null; G.ui.toasts = []; G.ui.hint = null; G.hintQ = []; G.settle = null; G.paused = false; G.ui.bossLine = null; G.ui.banner = null;
  G.bossFight = null; G.lockExits = false; G.camFocus = null; G.bars = 0; G.barsTo = 0; G.projs = []; G.parts = []; G.tele = []; G.flashes = []; G.hitstop = 0; G.slowT = 0; G.room = null; G.fade.v = 1;
}
function toTitle() { G.scene = 'title'; G.S = null; G.P = null; G.room = null; G.script = null; G.ui.menu = null; G.ui.dlg = null; TITLE.confirm = false; Snd.music('title'); fadeTo(0, 0.6); }


// ---------------- 游戏逻辑一步 ----------------
function updateGame(dt) {
  updateHints(dt);
  if (G.ui.menu) { updateMenu(dt); return; }
  if (keyHit('Escape') && !G.script && !G.trans && !G.P.dead) { openMenu('pause'); return; }
  const hadScript = !!G.script;
  if (G.script) updateScript(dt);
  if (hadScript && !G.script) G.lockT = 0.2;
  G.lockT -= dt;
  if (G.lockT > 0) { IN.lhit = false; IN.rhit = false; IN.hit = Object.create(null); }
  if (G.hitstop > 0) { G.hitstop -= dt; updateCam(dt); return; }
  let sdt = dt;
  if (G.slowT > 0) { G.slowT -= dt; sdt *= G.slowScale; }
  G.t += sdt;
  gatherLights();
  updatePlayer(sdt);
  const R = G.room;
  for (const e of R.ents) if (!e.dead && EK[e.k] && EK[e.k].update) EK[e.k].update(e, sdt);
  R.ents = R.ents.filter((e) => !e.dead || e.k === 'jar');
  for (const e of R.ents) if (e.dead && e.k === 'jar') e.dead = false;
  updateProjs(sdt); updateTele(sdt); updateFx(sdt); updateFlashes(sdt); updateAmbient(sdt);
  if (G.room === R) updateLater(sdt);
  updateSettle(dt);
  if (G.room === R) { updateInteract(); updateTriggers(); }
  updateCam(sdt);
  // 滚轮切换副能力
  if (IN.wheel && !G.script) { const L = abilList(); if (L.length > 1) { G.S.cur = (G.S.cur + Math.sign(IN.wheel) + L.length) % L.length; G.ui.abilSwap = 0.2; Snd.play('menu'); } }
  if (G.ui.abilSwap > 0) G.ui.abilSwap -= dt;
  // 第一次看到敌人出手前的预兆，提示翻滚
  if (!G.S.hints.roll && R.ents.some((e) => e.k === 'enemy' && e.st === 'tell' && dist(e.x, e.y, G.P.x, G.P.y) < 70)) hint('roll');
  // 被打断而没看到的操作提示，条件还满足时补上
  if (!G.script && !G.bossFight && !G.settle) {
    if (!G.S.hints.menu && G.S.flags.lit_town) hint('menu', { delay: 1 });
    if (!G.S.hints.wheel && abilList().length > 1) hint('wheel', { delay: 2 });
  }
}
// 房间里的剧情触发区
function updateTriggers() {
  const R = G.room, p = G.P;
  if (G.script || G.trans || p.dead || G.bossFight) return;
  const tx = p.x / TS, ty = p.y / TS;
  for (const tr of R.def.triggers) if (tx >= tr.x && tx < tr.x + tr.w && ty >= tr.y && ty < tr.y + tr.h && cond(tr.cond)) { runScript(tr.script); return; }
}
// 区域环境细节：竹叶飘、雪、窑烟火星、山顶的光尘
function updateAmbient(dt) {
  const reg = G.room.region, r = { bamboo: 3, lake: 6, kiln: 5, summit: 2, town: 1 }[reg] || 0;
  for (let i = 0; i < r * dt * 4; i++) if (Math.random() < 0.5) {
    const x = CAM.ox + Math.random() * VW, y = CAM.oy + (reg === 'kiln' ? VH + 4 : -4);
    if (reg === 'bamboo') G.amb.push({ x, y, vx: rand(-8, 4), vy: rand(10, 18), t: 0, col: Math.random() < 0.5 ? '#5e9b4e' : '#a6d873', w: 2, h: 1, sway: rand(0, 6) });
    else if (reg === 'lake') G.amb.push({ x, y, vx: rand(-6, 2), vy: rand(10, 20), t: 0, col: '#e4f8fc', w: 1, h: 1, sway: 0 });
    else if (reg === 'kiln') G.amb.push({ x, y, vx: rand(-4, 4), vy: rand(-26, -12), t: 0, col: Math.random() < 0.7 ? '#ff8a3c' : '#6a6070', w: 1, h: 1, sway: rand(0, 6) });
    else if (reg === 'summit') G.amb.push({ x, y: CAM.oy + Math.random() * VH, vx: rand(-3, 3), vy: rand(-6, -2), t: 0, col: '#fff1b0', w: 1, h: 1, sway: 0, life: 3 });
    else G.amb.push({ x, y: CAM.oy + Math.random() * VH, vx: rand(4, 9), vy: 0, t: 0, col: 'rgba(160,150,190,0.25)', w: 6, h: 2, sway: 0, life: 4 });
  }
  for (const a of G.amb) { a.t += dt; a.x += (a.vx + Math.sin(a.t * 2 + a.sway) * 6) * dt; a.y += a.vy * dt; }
  G.amb = G.amb.filter((a) => a.t < (a.life || 14) && a.y < CAM.oy + VH + 10 && a.y > CAM.oy - 20);
  if (G.amb.length > 220) G.amb.splice(0, G.amb.length - 220);
}

// ---------------- 绘制 ----------------
function drawGame(dt) {
  const R = G.room;
  if (R.dirty) renderLayer(R);
  const ox = CAM.ox, oy = CAM.oy;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, VH);
  ctx.drawImage(R.layer, -ox, -oy);
  drawAnimTiles(ox, oy);
  drawTele(ox, oy);
  // 实体按脚底 y 排序
  const list = [];
  for (const e of R.ents) { if (e.dead) continue; const H = EK[e.k]; if (!H || H.over) continue; list.push(e); }
  list.push(G.P);
  const sy = (e) => (e === G.P ? e.y + 4 : EK[e.k].sortY ? EK[e.k].sortY(e) : e.y);
  list.sort((a, b) => sy(a) - sy(b));
  for (const e of list) { if (e === G.P) drawPlayer(ox, oy); else EK[e.k].draw(e, ox, oy); }
  drawProjs(ox, oy);
  drawFx(ox, oy);
  for (const a of G.amb) { ctx.fillStyle = a.col; ctx.fillRect(Math.round(a.x - ox), Math.round(a.y - oy), a.w, a.h); }
  for (const e of R.ents) if (!e.dead && EK[e.k] && EK[e.k].over) EK[e.k].draw(e, ox, oy);
  renderLight();
  drawEmissive(ox, oy);
  drawTexts(ox, oy);
  if (G.debug) drawDebugWorld(ox, oy);
  drawHUD();
  drawOverlays(dt);
  drawDialog();
  drawLetter();
  drawMenu();
}
function drawDebugWorld(ox, oy) {
  ctx.lineWidth = 1;
  const box = (x, y, hw, hh, c) => { ctx.strokeStyle = c; ctx.strokeRect(Math.round(x - hw - ox) + 0.5, Math.round(y - hh - oy) + 0.5, hw * 2, hh * 2); };
  box(G.P.x, G.P.y, G.P.hw, G.P.hh, '#0f0');
  for (const e of G.room.ents) if (!e.dead && (e.k === 'enemy' || e.k === 'boss' || e.k === 'clone')) { box(e.x, e.y, e.hw || 6, e.hh || 4, '#f44'); if (e.atk) { ctx.strokeStyle = '#ff0'; ctx.beginPath(); ctx.arc(e.atk.x - ox, e.atk.y - oy, e.atk.r, 0, TAU); ctx.stroke(); } }
  for (const pr of G.projs) { ctx.strokeStyle = pr.owner === 'e' ? '#f0f' : '#0ff'; ctx.beginPath(); ctx.arc(pr.x - ox, pr.y - oy, pr.r, 0, TAU); ctx.stroke(); }
}
function drawDebugInfo() {
  const s = `FPS ${G.fps.toFixed(0)}  ${G.room ? G.room.id : ''}  实体 ${G.room ? G.room.ents.length : 0}  粒子 ${G.parts.length}${G.god ? '  无敌' : ''}`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(VW - 190, VH - 12, 190, 12);
  txt(s, VW - 4, VH - 4, 7, '#9fffa8', 'right');
}

// ---------------- 主循环 ----------------
let lastT = performance.now(), acc = 0;
const STEP = 1 / CFG.FPS;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) dt = 0; if (dt > 0.25) dt = 0.25;
  G.rt += dt;
  if (dt > 0) G.fps = lerp(G.fps, 1 / dt, 0.05);
  Snd.tick();
  updateFade(dt);
  // 调试按键
  if (G.debug && G.scene === 'game') {
    if (keyHit('F1')) { if (G.ui.menu && G.ui.menu.type === 'debug') closeMenu(); else openMenu('debug'); }
    if (keyHit('F2')) { for (const a of ['dash', 'hook', 'fire']) G.S.abil[a] = true; toast('调试：获得全部能力'); }
    if (keyHit('F3')) { G.god = !G.god; toast(G.god ? '调试：无敌开' : '调试：无敌关'); }
  }
  const click = IN.lhit;
  let stepped = false;
  // 失焦暂停：点击或 Esc 继续，这次输入不传给游戏
  if (G.paused) {
    acc = 0;
    if (G.scene !== 'game') G.paused = false;
    else if (IN.lhit || keyHit('Escape')) { G.paused = false; Snd.unlock(); clearInput(); IN.lmb = false; for (const k in IN.down) IN.down[k] = false; G.lockT = 0.15; }
  }
  try {
    if (G.scene === 'game' && !G.paused) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 5) { updateGame(STEP); acc -= STEP; n++; stepped = true; clearEdge(); }
      if (n >= 5) acc = 0;
      if (stepped && G.ui.menu) IN.lhit = click; // 菜单按钮在绘制时处理点击
    }
  } catch (err) { console.error(err); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, V.w, V.h);
  setView();
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
  try {
    if (G.scene === 'title') drawTitle(dt);
    else if (G.scene === 'game' && G.room) { drawGame(G.paused ? 0 : dt); if (G.paused) drawPaused(); }
    else if (G.scene === 'ending') drawEnding(dt);
  } catch (err) { console.error(err); }
  if (G.scene === 'title' && G.ui.menu) updateMenu(dt);
  if (G.fade.v > 0) { ctx.fillStyle = `rgba(0,0,0,${G.fade.v})`; ctx.fillRect(0, 0, VW, VH); }
  if (G.scene !== 'ending') drawCrosshair();
  if (G.debug) drawDebugInfo();
  ctx.restore();
  if (G.scene !== 'game' || stepped || G.paused) { clearInput(); IN.moved = false; }
}
function drawPaused() {
  ctx.fillStyle = 'rgba(8,6,14,0.6)'; ctx.fillRect(0, 0, VW, VH);
  panel(VW / 2 - 90, VH / 2 - 24, 180, 44, 'rgba(18,14,26,0.95)', '#e7b53d');
  txtO('已暂停', VW / 2, VH / 2 - 6, 12, '#ffd166', 'center');
  txt('点击画面或按 Esc 继续', VW / 2, VH / 2 + 11, 8, '#d6cfe0', 'center');
}
// 一帧里多个逻辑步时，按键边沿只给第一步用
function clearEdge() { IN.hit = Object.create(null); IN.lhit = false; IN.lup = false; IN.rhit = false; IN.wheel = 0; }

function init() {
  resize();
  window.addEventListener('resize', resize);
  ART.init();
  Snd.vol = { master: G.set.master, music: G.set.music, sfx: G.set.sfx };
  G.scene = 'title';
  Snd.music('title');
  fadeTo(0, 1);
  requestAnimationFrame(frame);
}
init();

// 调试 / 自动化测试接口
if (G.debug) {
  window.JD = {
    G, CFG, MAPS, STORY, IN, CAM,
    newGame, continueGame, toTitle,
    warp(room, tx, ty) { G.bossFight = null; G.ui.boss = null; G.script = null; G.ui.dlg = null; G.ui.menu = null; enterRoom(room, tx != null ? { at: [tx, ty] } : {}); G.trans = false; G.fade.v = 0; G.fade.to = 0; },
    skip() { let n = 0; while (G.script && n++ < 500) { const sc = G.script; if (sc.block === 'ask') { pickChoice(0); continue; } if (sc.block === 'letter') { G.ui.letter = null; } sc.block = null; G.ui.dlg = null; stepScript(); } },
    choose(label) { const d = G.ui.dlg; if (!d || !d.choices) return false; const i = d.choices.findIndex((c) => c[1] === label); if (i < 0) return false; pickChoice(i); return true; },
    step(n = 1) { for (let i = 0; i < n; i++) { updateFade(STEP); if (G.scene === 'game') updateGame(STEP); clearEdge(); } },
  };
}
