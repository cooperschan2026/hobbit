'use strict';
// =====================================================================
// 战斗：主角、副能力、敌人 AI、Boss、投射物、预警
// =====================================================================
G.tele = [];   // 地面预警（红线、红圈）
function abilList() { return ['dash', 'hook', 'fire'].filter((a) => G.S.abil[a]); }
function curAbil() { const L = abilList(); if (!L.length) return null; G.S.cur = ((G.S.cur % L.length) + L.length) % L.length; return L[G.S.cur]; }
function makePlayer() {
  const C = CFG.player;
  return { x: 0, y: 0, vx: 0, vy: 0, hw: C.box[0], hh: C.box[1], state: 'move', st: 0, face: 0, dir: 1, inv: 0, combo: 0, comboT: 0, buffered: false,
    rollCd: 0, abilCd: 0, charge: 0, chargeLock: false, walkT: 0, safeX: 0, safeY: 0, starve: 0, pushT: 0, pushCd: 0, lx: 0, ly: 0,
    ghosts: [], perfectUsed: false, dead: false, slowT: 0, swing: null, hookE: null, inSmoke: false };
}
const shadeIs = (id) => G.S.equip.shade === id;
const charmIs = (id) => G.S.equip.charm === id;
function swingTiming() { const k = shadeIs('shade_long') ? 1.25 : 1; const C = CFG.combo; return { w: C.windup * k, a: C.active * k, r: C.recover * k }; }
function playerDmg(base) { let d = base + (shadeIs('shade_iron') ? 1 : 0); if (charmIs('charm_rage') && G.S.hp <= 4) d = Math.ceil(d * 1.5); return d; }

// ---------------- 主角 ----------------
function updatePlayer(dt) {
  const p = G.P, S = G.S;
  if (p.dead) { p.st += dt; if (p.st > 1.4 && p.st < 50) { p.st = 99; fadeTo(1, 0.7, respawn); } return; }
  const wx = IN.mx + CAM.ox, wy = IN.my + CAM.oy;
  p.face = Math.atan2(wy - (p.y - 5), wx - p.x);
  if (Math.abs(wx - p.x) > 2 && p.state !== 'roll' && p.state !== 'dash') p.dir = wx > p.x ? 1 : -1;
  p.inv = Math.max(0, p.inv - dt); p.rollCd -= dt; p.abilCd -= dt; p.pushCd -= dt; p.slowT -= dt; p.comboT -= dt;
  for (const g of p.ghosts) g.t += dt; p.ghosts = p.ghosts.filter((g) => g.t < 0.25);
  const ctrl = !G.script && !G.ui.menu && !G.trans;
  let ix = 0, iy = 0;
  if (ctrl) { if (keyDown('KeyA', 'ArrowLeft')) ix -= 1; if (keyDown('KeyD', 'ArrowRight')) ix += 1; if (keyDown('KeyW', 'ArrowUp')) iy -= 1; if (keyDown('KeyS', 'ArrowDown')) iy += 1; }
  const il = Math.hypot(ix, iy); if (il) { ix /= il; iy /= il; }
  // 蓄力光爆：按住左键 1 秒
  if (ctrl && IN.lmb && S.flags.got_lantern && !p.chargeLock && (p.state === 'move' || p.state === 'attack')) {
    p.charge += dt;
    if (p.charge > 0.3 && Math.random() < 0.4) part(p.lx + rand(-6, 6), p.ly + rand(-6, 6), (p.lx - p.lx) * 0, -20, 0.4, '#fff1b0', 1);
    if (p.charge >= CFG.burst.hold) { p.chargeLock = true; p.charge = 0; lightBurst(); }
  } else { if (!IN.lmb) p.chargeLock = false; p.charge = 0; }
  const tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS), tcode = tileAt(tx, ty), onIce = tileIce(G.room, tcode);
  switch (p.state) {
    case 'move': case 'attack': case 'soup': {
      let spd = CFG.player.speed * (p.charge > 0.25 ? 0.5 : 1) * (p.slowT > 0 ? 0.55 : 1);
      if (p.state === 'soup') spd *= 0.3;
      if (p.state === 'attack') spd *= 0.35;
      const acc = (onIce ? CFG.player.iceAccel : CFG.player.accel);
      const k = Math.min(1, dt / acc);
      p.vx += (ix * spd - p.vx) * k; p.vy += (iy * spd - p.vy) * k;
      if (p.state === 'attack' && p.swing && p.swing.lunge > 0) { p.vx += Math.cos(p.face) * p.swing.lunge; p.vy += Math.sin(p.face) * p.swing.lunge; p.swing.lunge = 0; }
      moveBox(p, p.vx * dt, p.vy * dt, false, true);
      if (p.hitX && onIce) p.vx *= -0.2; if (p.hitY && onIce) p.vy *= -0.2;
      if (ctrl && (ix || iy) && (p.hitX || p.hitY) && (Math.abs(ix) < 0.1 || Math.abs(iy) < 0.1)) tryPushJar(Math.round(ix), Math.round(iy)); else p.pushT = 0;
      const sp = Math.hypot(p.vx, p.vy); p.walkT += dt * (sp / 60);
      if (p.state === 'attack') updateSwing(p, dt);
      if (p.state === 'soup') { p.st += dt; if (p.st >= CFG.player.soupTime) { const heal = CFG.player.soupHeal + (charmIs('charm_soup') ? 4 : 0); S.hp = Math.min(S.hearts * 4, S.hp + heal); Snd.play('heal'); burst(p.x, p.y - 8, 10, ['#ff9db5', '#fff1b0'], 30, 0.7, 1, -30); ftext(p.x, p.y - 22, `+${heal / 4} 颗心`, '#ff9db5'); p.state = 'move'; } }
      if (ctrl && p.state === 'move') {
        if (keyHit('Space') && p.rollCd <= 0) startRoll(p, ix, iy);
        else if (IN.lhit && S.flags.got_lantern) startSwing(p);
        else if (IN.rhit) useAbility(p);
        else if (keyHit('KeyF')) drinkSoup(p);
      } else if (ctrl && p.state === 'attack') {
        if (IN.lhit) p.buffered = true;
        if (keyHit('Space') && p.rollCd <= 0 && p.swing.ph === 'r') startRoll(p, ix, iy);
      }
      break;
    }
    case 'roll': {
      p.st += dt;
      const R = CFG.roll, sp = R.dist / R.time;
      moveBox(p, p.rdx * sp * dt, p.rdy * sp * dt, false, true);
      if (Math.random() < 0.6) part(p.x + rand(-3, 3), p.y + 2, rand(-10, 10), rand(-10, 0), 0.3, '#8c86a0', 1);
      if (((p.st * 100) | 0) % 6 === 0) p.ghosts.push({ x: p.x, y: p.y, t: 0, dir: p.dir });
      if (p.st >= R.time) { p.state = 'move'; p.rollCd = R.cd; p.vx = p.rdx * 40; p.vy = p.rdy * 40; }
      break;
    }
    case 'dash': {
      p.st += dt;
      const D = CFG.abil.dash, sp = (p.dashLen || D.dist) / D.time;
      moveBox(p, p.rdx * sp * dt, p.rdy * sp * dt, false, true);
      p.ghosts.push({ x: p.x, y: p.y, t: 0, dir: p.dir, dash: true });
      if (charmIs('charm_flame') && Math.random() < 0.6) spawnProj({ kind: 'flame', owner: 'p', x: p.x, y: p.y, life: 1.6, r: 7, dmg: 2, glow: 14 });
      if (p.st >= D.time || p.hitX || p.hitY) { p.state = 'move'; p.vx = p.rdx * 60; p.vy = p.rdy * 60; }
      break;
    }
    case 'hook': { p.st += dt; p.vx *= 0.8; p.vy *= 0.8; if (!G.projs.includes(p.hookE) || p.st > 0.7) p.state = 'move'; break; }
    case 'pull': {
      const e = p.pullTo, d = dist(p.x, p.y, e.x, e.y + 4);
      const s = Math.min(d, CFG.abil.hook.pull * dt);
      p.x += ((e.x - p.x) / d) * s; p.y += ((e.y + 4 - p.y) / d) * s;
      p.ghosts.push({ x: p.x, y: p.y, t: 0, dir: p.dir, dash: true });
      if (d < 15) { landNear(p, e); p.state = 'move'; p.inv = Math.max(p.inv, 0.15); }
      break;
    }
    case 'fall': {
      p.st += dt;
      if (p.st > 0.5) {
        p.x = p.safeX; p.y = p.safeY; p.state = 'move'; p.vx = p.vy = 0;
        // 安全点后来被熔岩淹了（窑神二阶段）：换到最近的安全地面，不能原地再掉一次
        if (!walkable(Math.floor(p.x / TS), Math.floor(p.y / TS))) { nearestWalkable(p); p.safeX = p.x; p.safeY = p.y; }
        if (!G.god) { S.hp -= CFG.player.fallDmg; Snd.play('hurt'); shake(0.25); }
        p.inv = 1;
        if (S.hp <= 0) killPlayer();
      }
      break;
    }
    case 'hurt': { p.st += dt; moveBox(p, p.vx * dt, p.vy * dt, false, true); p.vx *= 0.85; p.vy *= 0.85; if (p.st > 0.18) p.state = 'move'; break; }
  }
  // 掉坑判定（冲刺和被钩索拉着时不会掉）
  if (p.state !== 'dash' && p.state !== 'pull' && p.state !== 'fall' && !p.dead) {
    const c = tileAt(Math.floor(p.x / TS), Math.floor(p.y / TS));
    if (tilePit(G.room, c)) { p.state = 'fall'; p.st = 0; Snd.play(tileWater(G.room, c) ? 'splash' : 'fall'); if (c === TL.LAVA || c === TL.VENT) burst(p.x, p.y, 14, ['#ff6a2a', '#ffc24a'], 60, 0.6, 1, -40); hint('pit'); }
    else if (p.state === 'move') {
      let safe = true;
      for (const [ddx, ddy] of [[-7, 0], [7, 0], [0, -6], [0, 6]]) if (tilePit(G.room, tileAt(Math.floor((p.x + ddx) / TS), Math.floor((p.y + ddy) / TS)))) safe = false;
      if (safe) { p.safeX = p.x; p.safeY = p.y; }
    }
  }
  // 灯笼的位置（随走路轻轻摇晃，挥击时跟着弧线走）
  const sway = Math.sin(p.walkT * 9) * 2;
  if (p.state === 'attack' && p.swing) { const a = p.swing.a, r = 12; p.lx = p.x + Math.cos(a) * r; p.ly = p.y - 5 + Math.sin(a) * r; }
  else { p.lx = p.x + p.dir * 6 + sway * 0.4; p.ly = p.y - 1 + Math.abs(sway) * 0.3; }
  p.inSmoke = G.room.ents.some((e) => e.k === 'smoke' && !e.dead && dist(e.x, e.y, p.x, p.y) < e.r);
  if (p.state !== 'fall') checkExit();
  if (G.S.flags.got_lantern) updateOil(dt);
}
function updateOil(dt) {
  const S = G.S, p = G.P;
  if (G.script || G.room.region === 'home' || G.room.region === 'tea') return;
  const lit = inLight(p.x, p.y - 4);
  p.inLightNow = lit;
  if (lit) S.oil = Math.min(S.oilMax, S.oil + CFG.oil.lightRegen * dt);
  else S.oil = Math.max(0, S.oil - CFG.oil.darkDrain * (charmIs('charm_oil') ? 0.7 : 1) * dt);
  if (S.oil <= 0) {
    p.starve += dt; hint('starve');
    if (p.starve >= CFG.oil.starveEvery) { p.starve = 0; hurtPlayer(1, p.x, p.y, { noKb: true, starve: true }); }
  } else p.starve = 0;
  if (S.oil < 20 && ((G.t * 2) | 0) % 6 === 0 && Math.random() < 0.02) Snd.play('oilLow');
  if (!lit && G.room.region !== 'town') hint('oil');
}
function startRoll(p, ix, iy) {
  let dx = ix, dy = iy;
  if (!dx && !dy) { dx = Math.cos(p.face); dy = Math.sin(p.face); }
  p.state = 'roll'; p.st = 0; p.rdx = dx; p.rdy = dy; p.perfectUsed = false; p.swing = null;
  if (Math.abs(dx) > 0.2) p.dir = dx > 0 ? 1 : -1;
  Snd.play('roll'); hint('perfect');
}
function startSwing(p) {
  if (p.comboT <= 0) p.combo = 0;
  const n = p.combo % 3;
  const T = swingTiming();
  const side = n === 1 ? -1 : 1, half = CFG.combo.arc / 2;
  p.swing = { n, t: 0, ph: 'w', T, side, a: p.face - side * half, a0: p.face - side * half, a1: p.face + side * half, base: p.face, hit: new Set(), lunge: CFG.combo.lunge[n] };
  p.state = 'attack'; p.buffered = false;
  Snd.play('swing', n);
}
function updateSwing(p, dt) {
  const s = p.swing; s.t += dt;
  const T = s.T;
  if (s.ph === 'w') { s.a = s.a0; if (s.t >= T.w) { s.ph = 'a'; s.t = 0; swingHit(p, s); } }
  else if (s.ph === 'a') { s.a = lerp(s.a0, s.a1, Math.min(1, s.t / T.a)); if (s.t >= T.a) { s.ph = 'r'; s.t = 0; } }
  else {
    s.a = s.a1;
    if (s.t >= T.r) {
      p.combo = s.n + 1;
      if (p.buffered && p.combo < 3) { p.comboT = CFG.combo.window; startSwing(p); return; }
      p.state = 'move'; p.swing = null; p.comboT = p.combo < 3 ? CFG.combo.window : 0;
      if (p.combo >= 3) { p.combo = 0; p.comboT = 0; }
    }
  }
  s.trail = s.ph === 'a' || (s.ph === 'r' && s.t < 0.1);
}
function swingHit(p, s) {
  const C = CFG.combo, range = C.range + (shadeIs('shade_long') ? 10 : 0), cx = p.x, cy = p.y - 5;
  let any = false;
  for (const e of G.room.ents) {
    if (e.dead) continue;
    if (e.k === 'bell') { if (dist(cx, cy, e.x, e.y) < range + 6) ringBell(e); continue; }
    const H = EK[e.k];
    if (!H || !H.hurt) continue;
    const ex = e.x, ey = e.y - (e.hh || 4), d = dist(cx, cy, ex, ey) - (e.rad || 6);
    if (d > range) continue;
    if (d > 6 && Math.abs(angDiff(s.base, Math.atan2(ey - cy, ex - cx))) > C.arc / 2 + 0.25) continue;
    const dmg = playerDmg(C.dmg[s.n]);
    const r = H.hurt(e, dmg, { src: 'swing', third: s.n === 2, kb: C.knock[s.n], dx: Math.cos(s.base), dy: Math.sin(s.base) });
    if (r) { any = true; if (shadeIs('shade_qing') && r === true) { G.S.oil = Math.min(G.S.oilMax, G.S.oil + 2); } }
  }
  // 挥击能打掉黑色光球
  for (const pr of G.projs) if (pr.owner === 'e' && pr.kind === 'orb' && dist(cx, cy, pr.x, pr.y) < range + 4) { pr.dead = true; burst(pr.x, pr.y, 8, ['#7a4fa8', '#2a2140'], 50, 0.5, 1); any = true; }
  if (any) { hitstop(C.hitstop[s.n]); shake(s.n === 2 ? 0.25 : 0.12); }
}
function lightBurst() {
  const p = G.P, S = G.S, B = CFG.burst;
  if (S.oil < B.cost) { ftext(p.x, p.y - 20, '灯油不够', '#ff8a7a'); Snd.play('deny'); return; }
  S.oil -= B.cost;
  G.flashes.push({ x: p.x, y: p.y - 4, r: B.radius * 1.5, t: 0, dur: 0.7 });
  Snd.play('burst'); shake(0.3); hitstop(0.06);
  for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; part(p.x, p.y - 4, Math.cos(a) * 160, Math.sin(a) * 160, 0.5, i % 2 ? '#fff1b0' : '#ffd166', 1); }
  for (const e of G.room.ents) {
    if (e.dead) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    if (e.k === 'braz' && d < B.radius + 8) igniteBrazier(e, false);
    if ((e.k === 'enemy' || e.k === 'boss' || e.k === 'clone') && d < B.radius) {
      const H = EK[e.k];
      if (H.burst) H.burst(e, d);
    }
    if (e.k === 'smoke' && d < B.radius) e.life = Math.min(e.life, e.t + 1);
  }
}
function drinkSoup(p) {
  const S = G.S;
  if (S.soup <= 0) { ftext(p.x, p.y - 20, '暖汤喝完了', '#ff8a7a'); Snd.play('deny'); return; }
  if (S.hp >= S.hearts * 4) { ftext(p.x, p.y - 20, '还不用喝', '#d6cfe0'); return; }
  S.soup--; p.state = 'soup'; p.st = 0; Snd.play('soup');
}
function useAbility(p) {
  const a = curAbil();
  if (!a) return;
  if (p.abilCd > 0) return;
  const S = G.S;
  if (a === 'dash') {
    // 冲刺距离 = 到鼠标的距离（限制在 40~74 像素），指哪冲到哪
    const D = CFG.abil.dash, wx = IN.mx + CAM.ox, wy = IN.my + CAM.oy;
    p.dashLen = clamp(dist(p.x, p.y - 5, wx, wy), D.minDist, D.dist);
    p.state = 'dash'; p.st = 0; p.rdx = Math.cos(p.face); p.rdy = Math.sin(p.face); p.abilCd = D.cd; p.inv = Math.max(p.inv, D.time + 0.05);
    Snd.play('dash');
  } else if (a === 'hook') {
    const H = CFG.abil.hook;
    p.hookE = spawnProj({ kind: 'hook', owner: 'p', x: p.x, y: p.y - 6, vx: Math.cos(p.face) * H.speed, vy: Math.sin(p.face) * H.speed, life: (H.range * 1.1) / H.speed, r: 3, sx: p.x, sy: p.y - 6 });
    p.state = 'hook'; p.st = 0; p.abilCd = H.cd; Snd.play('hookShoot');
  } else if (a === 'fire') {
    const F = CFG.abil.fire;
    if (S.oil < F.cost) { ftext(p.x, p.y - 20, '灯油不够', '#ff8a7a'); Snd.play('deny'); return; }
    S.oil -= F.cost;
    const wx = IN.mx + CAM.ox, wy = IN.my + CAM.oy;
    let d = Math.min(F.range, dist(p.x, p.y - 6, wx, wy));
    const tx = p.x + Math.cos(p.face) * d, ty = p.y - 6 + Math.sin(p.face) * d;
    spawnProj({ kind: 'seed', owner: 'p', x: p.x, y: p.y - 6, sx: p.x, sy: p.y - 6, tx, ty, life: Math.max(0.18, F.time * (d / F.range)), r: 3, glow: 24, envLight: false });
    p.abilCd = F.cd; Snd.play('fireThrow');
  }
}
// 钩索把人拉到灯柱旁边，落在不是坑的格子上
function landNear(p, post) {
  const d = dist(p.x, p.y, post.x, post.y) || 1, ux = (p.x - post.x) / d, uy = (p.y - post.y) / d;
  for (let r = 14; r <= 30; r += 4) { const x = post.x + ux * r, y = post.y + 4 + uy * r; if (walkable(Math.floor(x / TS), Math.floor(y / TS))) { p.x = x; p.y = y; return; } }
  const tx = Math.floor(post.x / TS), ty = Math.floor(post.y / TS);
  let best = null, bd = 1e9;
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (walkable(tx + i, ty + j)) { const x = (tx + i) * TS + 8, y = (ty + j) * TS + 8, dd = dist(x, y, p.x, p.y); if (dd < bd) { bd = dd; best = [x, y]; } }
  if (best) { p.x = best[0]; p.y = best[1]; }
}
function hurtPlayer(dmg, sx, sy, o = {}) {
  const p = G.P, S = G.S;
  if (p.dead || G.script || G.trans) return false;
  if (p.state === 'roll' && p.st < CFG.roll.iframe && !o.starve) { perfectDodge(p); return false; }
  if (p.state === 'dash' || p.state === 'pull' || p.state === 'fall') return false;
  if (p.inv > 0 && !o.starve) return false;
  if (G.god) return false;
  if (o.shadow && !inLight(sx, sy)) { dmg = Math.ceil(dmg * CFG.shadowDarkBonus); hint('dark'); }
  if (shadeIs('shade_paper') && !o.starve) dmg += 1;
  S.hp -= dmg;
  p.inv = o.starve ? 0.2 : CFG.player.hurtInvuln;
  Snd.play('hurt'); shake(o.starve ? 0.1 : 0.35);
  if (!o.noKb) { const d = dist(p.x, p.y, sx, sy) || 1; p.vx = ((p.x - sx) / d) * CFG.player.hurtKnock; p.vy = ((p.y - sy) / d) * CFG.player.hurtKnock; p.state = 'hurt'; p.st = 0; p.swing = null; }
  burst(p.x, p.y - 6, 8, ['#ff5a4f', '#f4efe6'], 50, 0.4, 1);
  if (S.hp <= S.hearts * 2 && S.soup > 0) hint('soup');
  if (S.hp <= 0) killPlayer();
  return true;
}
function perfectDodge(p) {
  if (p.perfectUsed) return;
  p.perfectUsed = true;
  const P = CFG.perfect;
  if (charmIs('charm_slow')) slowmo(P.charmSlow, P.charmScale); else slowmo(P.slow, P.scale);
  Snd.play('perfect'); ftext(p.x, p.y - 22, '完美闪避', '#bfe9ff');
  burst(p.x, p.y - 6, 10, ['#bfe9ff', '#ffffff'], 60, 0.5, 1);
}
function killPlayer() {
  const p = G.P;
  if (p.dead) return;
  G.S.hp = 0; p.dead = true; p.st = 0; p.state = 'dead'; p.deathX = p.safeX || p.x; p.deathY = p.safeY || p.y;
  Snd.play('death'); shake(0.5); slowmo(0.8, 0.4);
  burst(p.x, p.y - 6, 20, ['#ffd166', '#f4efe6', '#463a62'], 60, 1, 1, -20);
}

function drawPlayer(ox, oy) {
  const p = G.P;
  if (!p) return;
  const set = ART.ch.jin, side = p.dir > 0 ? 'R' : 'L';
  for (const g of p.ghosts) { ctx.globalAlpha = (1 - g.t / 0.25) * 0.35; const im = set.walk[g.dir > 0 ? 'R' : 'L'][0]; ctx.drawImage(g.dash ? solid(im, '#bfe9ff') : im, Math.round(g.x - 8 - ox), Math.round(g.y - 9 - oy)); }
  ctx.globalAlpha = 1;
  const x = Math.round(p.x - 8 - ox), y = Math.round(p.y - 9 - oy);
  if (p.dead) { ctx.drawImage(ART.px.dead[side][0], x, y); return; }
  if (p.state === 'fall') { const k = 1 - Math.min(1, p.st / 0.45); if (k > 0) { ctx.save(); ctx.translate(p.x - ox, p.y - oy); ctx.scale(k, k); ctx.drawImage(set.idle[side][0], -8, -9); ctx.restore(); } return; }
  drawShadow(p.x - ox, p.y + 6 - oy, 5);
  const lanternFirst = Math.sin(p.face) < -0.35 && p.state === 'attack';
  if (lanternFirst) drawLantern(p, ox, oy);
  let im;
  const moving = Math.hypot(p.vx, p.vy) > 12;
  if (p.state === 'roll') im = ART.px.roll[side][Math.floor(p.st * 20) % 2];
  else if (p.state === 'soup') im = ART.px.soup[side][0];
  else if (moving) im = set.walk[side][Math.floor(p.walkT * 2.2) % 4];
  else im = set.idle[side][Math.floor(G.t * 2) % 2];
  const blink = p.inv > 0 && p.state !== 'roll' && p.state !== 'dash' && Math.floor(G.t * 20) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  if (p.state === 'dash' || p.state === 'pull') ctx.drawImage(solid(im, '#bfe9ff', 0.4), x, y); else ctx.drawImage(im, x, y);
  ctx.globalAlpha = 1;
  if (!lanternFirst) drawLantern(p, ox, oy);
  // 挥击弧形拖尾
  const s = p.swing;
  if (s && s.trail) {
    const range = CFG.combo.range + (shadeIs('shade_long') ? 10 : 0), cx = p.x - ox, cy = p.y - 5 - oy;
    const from = Math.min(s.a0, s.a), to = Math.max(s.a0, s.a);
    ctx.lineCap = 'round';
    ctx.strokeStyle = s.n === 2 ? 'rgba(255,190,90,0.75)' : 'rgba(255,220,150,0.55)'; ctx.lineWidth = s.n === 2 ? 5 : 3.5;
    ctx.beginPath(); ctx.arc(cx, cy, range - 3, from, to); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,240,0.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, range - 3, from, to); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  // 蓄力光圈
  if (p.charge > 0.25) {
    const k = Math.min(1, p.charge / CFG.burst.hold);
    ctx.strokeStyle = `rgba(255,241,176,${0.3 + k * 0.6})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.lx - ox, p.ly - oy, 4 + (1 - k) * 14, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.lx - ox, p.ly - oy, 3, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
  }
  // 钩索绳子
  const hk = p.hookE;
  if (hk && !hk.dead && (p.state === 'hook' || p.state === 'pull')) { ctx.strokeStyle = '#a69cb8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - ox, p.y - 6 - oy); ctx.lineTo(hk.x - ox, hk.y - oy); ctx.stroke(); }
  if (p.state === 'pull' && p.pullTo) { ctx.strokeStyle = '#a69cb8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x - ox, p.y - 6 - oy); ctx.lineTo(p.pullTo.x - ox, p.pullTo.y - 18 - oy); ctx.stroke(); }
}
function drawLantern(p, ox, oy) {
  if (!G.S.flags.got_lantern) return;
  const hx = p.x + p.dir * 4 - ox, hy = p.y - 4 - oy, lx = p.lx - ox, ly = p.ly - oy;
  ctx.strokeStyle = '#3b3350'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, Math.round(hy) + 0.5); ctx.lineTo(Math.round(lx) + 0.5, Math.round(ly - 4) + 0.5); ctx.stroke();
  ctx.drawImage(G.S.oil > 0 ? ART.lanternLit : ART.lantern, Math.round(lx - 4), Math.round(ly - 4));
}

// ---------------- 投射物 ----------------
function spawnProj(o) { const pr = Object.assign({ t: 0, vx: 0, vy: 0, r: 3, dmg: 2, life: 2, dead: false }, o); G.projs.push(pr); return pr; }
function updateProjs(dt) {
  const p = G.P;
  for (const pr of G.projs) {
    if (pr.dead) continue;
    pr.t += dt;
    if (pr.t >= pr.life) { pr.dead = true; projExpire(pr); continue; }
    if (pr.kind === 'seed') { const k = pr.t / pr.life; pr.x = lerp(pr.sx, pr.tx, k); pr.y = lerp(pr.sy, pr.ty, k); pr.h = Math.sin(k * Math.PI) * 18; if (Math.random() < 0.5) part(pr.x, pr.y - pr.h, rand(-5, 5), rand(-10, 0), 0.4, '#ffb347', 1); continue; }
    if (pr.kind === 'ring') { pr.rr = pr.r0 + (pr.r1 - pr.r0) * (pr.t / pr.life); const d = dist(p.x, p.y, pr.x, pr.y); if (!pr.hitP && Math.abs(d - pr.rr) < 6) { if (hurtPlayer(pr.dmg, pr.x, pr.y, { shadow: pr.shadow })) pr.hitP = true; } continue; }
    if (pr.kind === 'flame') { if (pr.owner === 'e') { if (dist(p.x, p.y, pr.x, pr.y) < pr.r + 3) hurtPlayer(pr.dmg, pr.x, pr.y); } else for (const e of G.room.ents) if ((e.k === 'enemy' || e.k === 'boss') && !e.dead && dist(e.x, e.y, pr.x, pr.y) < pr.r + 5 && (!e.fireCd || e.fireCd < G.t)) { e.fireCd = G.t + 0.5; EK[e.k].hurt(e, pr.dmg, { src: 'fire', kb: 0, dx: 0, dy: 0 }); } if (Math.random() < 0.3) part(pr.x + rand(-3, 3), pr.y, 0, -20, 0.4, Math.random() < 0.5 ? '#ff6a2a' : '#ffc24a', 1); continue; }
    if (pr.home) { const a = Math.atan2(p.y - 6 - pr.y, p.x - pr.x), cur = Math.atan2(pr.vy, pr.vx), sp = Math.hypot(pr.vx, pr.vy); const na = cur + clamp(angDiff(cur, a), -pr.home * dt, pr.home * dt); pr.vx = Math.cos(na) * sp; pr.vy = Math.sin(na) * sp; }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    if (pr.spin) pr.rot = (pr.rot || 0) + pr.spin * dt;
    // 钩索先判断有没有勾中灯柱（灯柱上半截画在墙格里，先撞墙会勾不到）
    if (pr.kind === 'hook') { const post = G.room.ents.find((e) => e.k === 'post' && !e.dead && Math.abs(pr.x - e.x) < 12 && pr.y > e.y - 30 && pr.y < e.y + 8); if (post) { pr.dead = true; p.state = 'pull'; p.pullTo = post; p.hookE = null; p.inv = Math.max(p.inv, 0.6); Snd.play('hookLatch'); continue; } }
    const tx = Math.floor(pr.x / TS), ty = Math.floor(pr.y / TS), c = tileAt(tx, ty);
    if (!pr.ghost && (tileSolid(G.room, c) || G.room.blk[ty * G.room.w + tx] && pr.kind !== 'hook')) { pr.dead = true; projExpire(pr, true); continue; }
    if (pr.owner === 'e') {
      if (dist(p.x, p.y - 5, pr.x, pr.y) < pr.r + 4) { if (hurtPlayer(pr.dmg, pr.x, pr.y, { shadow: pr.shadow })) { pr.dead = true; burst(pr.x, pr.y, 6, ['#fff', '#ccc'], 40, 0.3, 1); } }
    } else if (pr.kind === 'hook') {
      for (const e of G.room.ents) {
        if (e.dead) continue;
        if (e.k === 'post' && Math.abs(pr.x - e.x) < 12 && pr.y > e.y - 30 && pr.y < e.y + 8) { /* 整根灯柱都能勾 */ pr.dead = true; p.state = 'pull'; p.pullTo = e; p.hookE = null; p.inv = Math.max(p.inv, 0.6); Snd.play('hookLatch'); break; }
        if ((e.k === 'enemy') && dist(pr.x, pr.y, e.x, e.y - 4) < (e.rad || 6) + 4) {
          pr.dead = true; Snd.play('hookLatch');
          if (!e.D.big) { const d = dist(e.x, e.y, p.x, p.y) || 1; e.kbx = ((p.x - e.x) / d) * Math.min(260, d * 4); e.kby = ((p.y - e.y) / d) * Math.min(260, d * 4); e.stun = Math.max(e.stun, 0.7); } else e.stun = Math.max(e.stun, 0.3);
          EK.enemy.hurt(e, 1, { src: 'hook', kb: 0, dx: 0, dy: 0 });
          break;
        }
      }
    }
  }
  G.projs = G.projs.filter((q) => !q.dead);
}
function projExpire(pr, hitWall) {
  if (pr.kind === 'seed') fireExplode(pr.tx, pr.ty);
  else if (pr.kind === 'hook') { /* 收回 */ }
  else if (hitWall && pr.owner === 'e') burst(pr.x, pr.y, 4, ['#ddd', '#888'], 30, 0.3, 1);
}
function fireExplode(x, y) {
  const F = CFG.abil.fire, R = G.room;
  Snd.play('ignite'); burst(x, y, 16, ['#ff6a2a', '#ffc24a', '#fff1b0'], 70, 0.6, 1, -30);
  G.flashes.push({ x, y, r: 50, t: 0, dur: 0.45 });
  for (const e of R.ents) {
    if (e.dead) continue;
    if (e.k === 'braz' && dist(e.x, e.y, x, y) < F.radius + 10) igniteBrazier(e, true);
    if ((e.k === 'enemy' || e.k === 'boss' || e.k === 'clone') && dist(e.x, e.y - 4, x, y) < F.radius + (e.rad || 6)) EK[e.k].hurt(e, F.dmg, { src: 'fire', kb: 60, dx: (e.x - x) / 20, dy: (e.y - y) / 20, fx: x, fy: y });
  }
  // 烧藤蔓
  const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = tx + i, cy = ty + j;
    if (tileAt(cx, cy) === TL.VINE && dist(cx * TS + 8, cy * TS + 8, x, y) < 26) burnVine(cx, cy);
  }
}
function burnVine(tx, ty) {
  if (tileAt(tx, ty) !== TL.VINE) return;
  setTile(tx, ty, TL.FLOOR);
  burst(tx * TS + 8, ty * TS + 8, 10, ['#ff6a2a', '#ffc24a', '#4f9a5c'], 40, 0.8, 1, -30);
  later(0.12, () => { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (tileAt(tx + dx, ty + dy) === TL.VINE) burnVine(tx + dx, ty + dy); });
}
function drawProjs(ox, oy) {
  for (const pr of G.projs) {
    const x = Math.round(pr.x - ox), y = Math.round(pr.y - oy);
    switch (pr.kind) {
      case 'seed': drawShadow(x, y + 4, 3, 0.3); ctx.drawImage(ART.fx.seed, x - 3, Math.round(y - pr.h) - 3); break;
      case 'hook': ctx.drawImage(ART.fx.hook, x - 3, y - 3); break;
      case 'shard': ctx.drawImage(ART.fx.shard, x - 3, y - 3); break;
      case 'shuriken': ctx.save(); ctx.translate(x, y); ctx.rotate(pr.rot || 0); ctx.drawImage(ART.fx.star, -3, -3); ctx.restore(); break;
      case 'bullet': ctx.drawImage(ART.fx.bullet, x - 3, y - 3); break;
      case 'orb': ctx.drawImage(ART.fx.orb, x - 4, y - 4); break;
      case 'porcelain': ctx.fillStyle = '#e3ecf2'; ctx.fillRect(x - 2, y - 1, 4, 3); ctx.fillStyle = '#3e6fa8'; ctx.fillRect(x - 1, y, 2, 1); break;
      case 'flame': { const a = 1 - pr.t / pr.life; ctx.fillStyle = `rgba(255,106,42,${0.5 * a + 0.2})`; ctx.fillRect(x - 3, y - 2, 6, 4); ctx.fillStyle = `rgba(255,194,74,${a})`; ctx.fillRect(x - 1, y - 3 - (((G.t * 10) | 0) % 2), 2, 3); break; }
      case 'ring': { const a = 1 - pr.t / pr.life; ctx.strokeStyle = pr.col || `rgba(255,230,200,${a})`; ctx.globalAlpha = a; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y, pr.rr, pr.rr * 0.6, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; break; }
      case 'light': ctx.fillStyle = '#fff1b0'; ctx.fillRect(x - 2, y - 2, 4, 4); break;
    }
  }
}
// ---------------- 预警 ----------------
function tele(o) { const t = Object.assign({ t: 0 }, o); G.tele.push(t); return t; }
function updateTele(dt) { for (const t of G.tele) t.t += dt; G.tele = G.tele.filter((t) => t.t < t.dur); }
function drawTele(ox, oy) {
  for (const t of G.tele) {
    const k = t.t / t.dur, a = 0.25 + k * 0.45 + Math.sin(G.t * 30) * 0.08;
    if (t.type === 'line') {
      ctx.save(); ctx.translate(t.x - ox, t.y - oy); ctx.rotate(t.ang);
      ctx.fillStyle = `rgba(255,60,50,${a * 0.5})`; ctx.fillRect(0, -t.w / 2, t.len, t.w);
      ctx.fillStyle = `rgba(255,90,80,${a})`; ctx.fillRect(0, -t.w / 2, t.len * k, 1); ctx.fillRect(0, t.w / 2 - 1, t.len * k, 1);
      ctx.restore();
    } else if (t.type === 'circle') {
      ctx.fillStyle = `rgba(255,60,50,${a * 0.35})`; ctx.beginPath(); ctx.ellipse(t.x - ox, t.y - oy, t.r, t.r * 0.6, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,110,90,${a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(t.x - ox, t.y - oy, t.r * k, t.r * 0.6 * k, 0, 0, TAU); ctx.stroke();
    } else if (t.type === 'spark') {
      const s = 2 + Math.sin(G.t * 40) * 1.5; ctx.fillStyle = '#fff1b0'; ctx.fillRect(t.x - ox - s / 2, t.y - oy - s / 2, s, s); ctx.fillStyle = 'rgba(255,200,90,0.5)'; ctx.fillRect(t.x - ox - s, t.y - oy - 0.5, s * 2, 1); ctx.fillRect(t.x - ox - 0.5, t.y - oy - s, 1, s * 2);
    }
  }
}

// ---------------- 敌人 ----------------
function spawnEnemy(R, kind, x, y, o = {}) {
  const D = DATA.enemies[kind];
  if (kind === 'hound' && !o.packed) { // 影犬三只一群
    let first = null;
    for (let i = 0; i < 3; i++) { const uid = o.uid ? `${o.uid}_${i}` : null; if (uid && G.S.dead[uid]) continue; const e = spawnEnemy(R, kind, x + (i - 1) * 14, y + (i % 2) * 10, { uid, packed: true }); if (!first) first = e; }
    return first || { x, y };
  }
  const e = addEnt(R, 'enemy', x, y, { kind, D, hp: D.hp, maxHp: D.hp, hw: D.box[0], hh: D.box[1], rad: D.box[0] + 1, vx: 0, vy: 0, kbx: 0, kby: 0, st: 'idle', stT: rand(0.4, 1.4), flash: 0, stun: 0, dir: 1, uid: o.uid, elite: o.elite || null, side: Math.random() < 0.5 ? -1 : 1, faceA: Math.random() * TAU, hx: x, hy: y, inv: 0 });
  if (kind === 'elite') { e.hp = e.maxHp = D.hp; }
  if (kind === 'spike') e.st = 'hidden';
  return e;
}
const AI = {};
EK.enemy = {
  update(e, dt) {
    if (e.flash > 0) e.flash -= dt;
    e.inv = Math.max(0, e.inv - dt);
    const p = G.P;
    if (e.kbx || e.kby) { moveBox(e, e.kbx * dt, e.kby * dt, !e.D.fly, false); e.kbx *= 0.82; e.kby *= 0.82; if (Math.abs(e.kbx) < 3) e.kbx = 0; if (Math.abs(e.kby) < 3) e.kby = 0; }
    e.atk = null;
    if (e.stun > 0) { e.stun -= dt; return; }
    if (G.script || !p || p.dead) return;
    AI[e.kind](e, dt, p);
    if (e.atk && !e.atkHit) { const d = dist(p.x, p.y - 4, e.atk.x, e.atk.y); if (d < e.atk.r + 5) { if (hurtPlayer(e.atk.dmg || e.D.dmg, e.x, e.y, { shadow: e.D.shadow })) e.atkHit = true; } }
  },
  hurt(e, dmg, o) {
    if (e.dead || e.inv > 0) return false;
    if (e.kind === 'spike' && e.st === 'hidden') return false;
    if (e.kind === 'clay' && !e.broken) {
      if (o.src === 'fire') { e.broken = true; e.stun = 1.2; Snd.play('shatter'); burst(e.x, e.y - 6, 12, ['#e3ecf2', '#3e6fa8'], 60, 0.6, 1); ftext(e.x, e.y - 20, '盾碎了', '#bfe9ff'); }
      else {
        const hitFrom = Math.atan2(G.P.y - e.y, G.P.x - e.x);
        if (Math.abs(angDiff(e.faceA, hitFrom)) < 1.2) { Snd.play('block'); burst(e.x + Math.cos(e.faceA) * 8, e.y - 6, 5, ['#fff', '#a69cb8'], 50, 0.3, 1); e.kbx = Math.cos(hitFrom + Math.PI) * 40; e.kby = Math.sin(hitFrom + Math.PI) * 40; ftext(e.x, e.y - 20, '挡住了', '#d6cfe0'); return 'block'; }
      }
    }
    e.hp -= dmg; e.flash = 0.1;
    const kb = (o.kb || 0) / (e.D.big ? 3 : 1);
    e.kbx = (o.dx || 0) * kb; e.kby = (o.dy || 0) * kb;
    Snd.play('hit', o.third); burst(e.x, e.y - 6, o.third ? 10 : 6, ['#fff1b0', '#ffd166', '#ffffff'], 70, 0.25, 1);
    if (e.kind === 'ghost' && !e.dropped) { e.dropped = true; dropLoot(e.x, e.y, 'oil'); }
    if (e.st === 'tell' && o.third && !e.D.big) { e.st = 'rest'; e.stT = 0.5; }
    if (e.hp <= 0) killEnemy(e);
    return true;
  },
  burst(e, d) {
    const p = G.P, dd = d || 1;
    e.kbx = ((e.x - p.x) / dd) * CFG.burst.knock; e.kby = ((e.y - p.y) / dd) * CFG.burst.knock;
    if (e.D.shadow) { e.stun = Math.max(e.stun, e.D.big ? 1 : CFG.lightBurstStun); EK.enemy.hurt(e, CFG.burst.dmg, { src: 'burst', kb: 0 }); ftext(e.x, e.y - 18, '僵直', '#fff1b0'); }
  },
  draw(e, ox, oy) {
    const A = ART.en[e.kind], side = e.dir > 0 ? 'R' : 'L';
    let im;
    if (e.kind === 'spike') im = A.s[e.st === 'hidden' ? 0 : e.st === 'tell' ? 1 : 2];
    else if (e.kind === 'frog' && e.st === 'jump') im = A.jump[side][0];
    else if (e.kind === 'clay' && e.broken) im = A.bare[side][Math.floor(G.t * 4) % 2];
    else if ((e.st === 'tell' || e.st === 'lunge' || e.st === 'dash' || e.st === 'slash') && A.tell) im = A.tell[side][0];
    else im = A.idle[side][Math.floor(G.t * 4 + e.hx) % 2];
    const big = e.kind === 'elite', w = big ? 24 : 16;
    const hop = e.st === 'jump' ? Math.sin((e.stT0 - e.stT) / e.stT0 * Math.PI) * 18 : 0;
    if (!e.D.fly) drawShadow(e.x - ox, e.y + (big ? 8 : 5) - oy, big ? 9 : 5);
    else drawShadow(e.x - ox, e.y + 8 - oy, 4, 0.2);
    const fy = e.D.fly ? Math.sin(G.t * 3 + e.hx) * 2 : 0;
    const dx = Math.round(e.x - w / 2 - ox + (e.st === 'tell' ? rand(-0.8, 0.8) : 0)), dy = Math.round(e.y - (big ? 18 : 10) - oy - hop + fy);
    ctx.drawImage(e.flash > 0 ? solid(im, '#ffffff') : im, dx, dy);
    if (e.stun > 0) { for (let i = 0; i < 2; i++) { const a = G.t * 6 + i * Math.PI; ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(e.x - ox + Math.cos(a) * 5), Math.round(e.y - (big ? 22 : 13) - oy + Math.sin(a) * 2), 2, 2); } }
    if (e.st === 'tell' && e.kind !== 'spike') { ctx.fillStyle = '#ff5a4f'; ctx.fillRect(Math.round(e.x - ox), Math.round(e.y - (big ? 26 : 16) - oy), 2, 4); ctx.fillRect(Math.round(e.x - ox), Math.round(e.y - (big ? 21 : 11) - oy), 2, 1); }
    if (e.elite && e.hp < e.maxHp) { const bw = 24; ctx.fillStyle = '#120e1a'; ctx.fillRect(Math.round(e.x - bw / 2 - ox) - 1, Math.round(e.y - 24 - oy) - 1, bw + 2, 4); ctx.fillStyle = '#c8443c'; ctx.fillRect(Math.round(e.x - bw / 2 - ox), Math.round(e.y - 24 - oy), Math.round(bw * e.hp / e.maxHp), 2); }
  },
  light(e) { if (e.kind === 'ghost') return { x: e.x, y: e.y - 6, r: 22, cool: 1, env: false }; if (e.kind === 'lamp') return { x: e.x, y: e.y - 6, r: 20, cool: 1, env: false }; if (e.kind === 'lizard') return { x: e.x, y: e.y - 4, r: 18, warm: 1, env: false }; return null; },
  sortY(e) { return e.y + 4; },
};
function killEnemy(e) {
  e.dead = true;
  Snd.play('enemyDie');
  const cols = e.D.shadow ? ['#2a2140', '#463a62', '#7a7090'] : e.kind === 'clay' ? ['#8a4b3a', '#e3ecf2'] : e.kind === 'frog' || e.kind === 'lamp' ? ['#a9dff0', '#e4f8fc'] : e.kind === 'lizard' ? ['#ff6a2a', '#ffc24a'] : ['#7a7090', '#d6cfe0'];
  burst(e.x, e.y - 6, e.D.big ? 30 : 14, cols, e.D.big ? 90 : 60, 0.8, e.D.big ? 2 : 1, -20);
  if (e.D.shadow) for (let i = 0; i < 5; i++) part(e.x + rand(-4, 4), e.y - 4, rand(-6, 6), rand(-40, -20), 1.2, '#463a62', 2);
  if (e.uid) G.S.dead[e.uid] = true;
  const [a, b] = e.D.wick;
  if (Math.random() < CFG.wickDropChance || e.D.big) { let n = randi(a, b); if (charmIs('charm_luck')) n = Math.ceil(n * 1.5); for (let i = 0; i < Math.min(n, 8); i++) dropLoot(e.x, e.y, 'wick', i === 0 ? n - Math.min(n, 8) + 1 : 1); }
  if (Math.random() < CFG.oilDropChance) dropLoot(e.x, e.y, 'oil');
  if (e.kind === 'smoke') for (const s of G.room.ents) if (s.k === 'smoke' && s.owner === e) s.cleared = true;
  if (e.elite) {
    G.S.killed[e.elite.id] = true;
    addEnt(G.room, 'pick', e.x, e.y, { def: { id: e.elite.id + '_drop', item: e.elite.drop } });
    shake(0.4); hitstop(0.1);
  }
  checkClear();
}
function dropLoot(x, y, item, n = 1) { const a = Math.random() * TAU, s = rand(30, 70); addEnt(G.room, 'loot', x, y, { item, n, vx: Math.cos(a) * s, vy: Math.sin(a) * s }); }
function checkClear() {
  const R = G.room, oc = R.def.onClear;
  if (!oc || !cond(oc.cond)) return;
  if (R.ents.some((e) => e.k === 'enemy' && !e.dead)) return;
  later(0.6, () => { if (!G.script) runScript(oc.script); });
}
function faceTo(e, p) { if (Math.abs(p.x - e.x) > 2) e.dir = p.x > e.x ? 1 : -1; }
function chase(e, dt, tx, ty, spd) { const d = dist(e.x, e.y, tx, ty) || 1; if (d < 0.5) return; moveBox(e, ((tx - e.x) / d) * spd * dt, ((ty - e.y) / d) * spd * dt, !(e.D && e.D.fly), false); }
function wander(e, dt) { e.stT -= dt; if (e.stT <= 0) { e.stT = rand(1, 2.5); e.wx = e.hx + rand(-30, 30); e.wy = e.hy + rand(-20, 20); } if (e.wx != null && dist(e.x, e.y, e.wx, e.wy) > 3) chase(e, dt, e.wx, e.wy, e.D.speed * 0.4); }
// 普通近战：靠近 → 预兆 → 扑过去 → 休息
function meleeAI(e, dt, p, o) {
  const d = dist(e.x, e.y, p.x, p.y), D = e.D;
  switch (e.st) {
    case 'idle': wander(e, dt); if (d < (o.aggro || 140)) e.st = 'chase'; break;
    case 'chase': {
      faceTo(e, p);
      let tx = p.x, ty = p.y;
      if (o.flank) { const a = Math.atan2(e.y - p.y, e.x - p.x) + e.side * 0.9; tx = p.x + Math.cos(a) * 30; ty = p.y + Math.sin(a) * 30; }
      chase(e, dt, tx, ty, D.speed);
      if (d < (o.reach || 36)) { e.st = 'tell'; e.stT = D.tell; e.lx = p.x; e.ly = p.y; }
      if (d > 220) e.st = 'idle';
      break;
    }
    case 'tell': e.stT -= dt; faceTo(e, p); if (e.stT <= 0) { e.st = 'lunge'; e.stT = D.lungeTime; const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; e.atkHit = false; } break;
    case 'lunge': e.stT -= dt; moveBox(e, e.ldx * D.lunge * dt, e.ldy * D.lunge * dt, true, false); e.atk = { x: e.x + e.ldx * 4, y: e.y - 4, r: 7 }; if (e.stT <= 0) { e.st = 'rest'; e.stT = D.rest || 0.6; } break;
    case 'rest': e.stT -= dt; if (o.flank) chase(e, dt, e.x - (p.x - e.x), e.y - (p.y - e.y), D.speed * 0.4); if (e.stT <= 0) e.st = 'chase'; break;
  }
}
AI.shade = (e, dt, p) => meleeAI(e, dt, p, {});
AI.hound = (e, dt, p) => meleeAI(e, dt, p, { flank: true, reach: 42, aggro: 170 });
AI.ghost = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  faceTo(e, p);
  if (e.flee > 0) { e.flee -= dt; chase(e, dt, e.x + (e.x - p.x), e.y + (e.y - p.y), e.D.speed * 1.4); return; }
  if (d < 170) chase(e, dt, p.x, p.y - 4, e.D.speed); else wander(e, dt);
  if (d < 12 && (!e.stealCd || e.stealCd < G.t)) {
    e.stealCd = G.t + 2; e.flee = 2;
    const n = Math.min(G.S.oil, e.D.steal); G.S.oil -= n;
    Snd.play('steal'); ftext(p.x, p.y - 22, `灯油 -${Math.round(n)}`, '#8fe6ff');
    hurtPlayer(e.D.dmg, e.x, e.y, { shadow: true });
    for (let i = 0; i < 8; i++) part(p.lx, p.ly, (e.x - p.x) * 2 + rand(-20, 20), (e.y - p.y) * 2 + rand(-20, 20), 0.5, '#ffd166', 1);
  }
};
AI.spike = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  e.stT -= dt;
  if (e.st === 'hidden') { if (d < e.D.range && e.stT <= 0) { e.st = 'tell'; e.stT = e.D.tell; } }
  else if (e.st === 'tell') { if (Math.random() < 0.4) part(e.x + rand(-6, 6), e.y + 4, rand(-10, 10), -20, 0.3, '#7a4e33', 1); if (e.stT <= 0) { e.st = 'out'; e.stT = 1.1; e.atkHit = false; Snd.play('spikeOut'); } }
  else if (e.st === 'out') { if (e.stT > 0.85) e.atk = { x: e.x, y: e.y - 4, r: 10 }; if (e.stT <= 0) { e.st = 'hidden'; e.stT = 1.3; } }
};
AI.frog = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  e.stT -= dt; faceTo(e, p);
  if (e.st === 'idle') { if (d < 160 && e.stT <= 0) { e.st = 'tell'; e.stT = e.D.tell; } }
  else if (e.st === 'tell') { if (e.stT <= 0) { e.st = 'jump'; e.stT0 = e.stT = e.D.jump; e.jx = p.x; e.jy = p.y; e.sx = e.x; e.sy = e.y; tele({ type: 'circle', x: p.x, y: p.y, r: 22, dur: e.D.jump }); } }
  else if (e.st === 'jump') {
    const k = 1 - e.stT / e.stT0; const nx = lerp(e.sx, e.jx, k), ny = lerp(e.sy, e.jy, k); moveBox(e, nx - e.x, ny - e.y, false, false);
    if (e.stT <= 0) {
      e.st = 'rest'; e.stT = 1.0; Snd.play('frogLand'); burst(e.x, e.y, 12, ['#e4f8fc', '#a9dff0'], 60, 0.5, 1);
      if (tilePit(G.room, tileAt(Math.floor(e.x / TS), Math.floor(e.y / TS)))) { killEnemy(e); return; }
      if (dist(p.x, p.y, e.x, e.y) < 22) { if (hurtPlayer(e.D.dmg, e.x, e.y)) p.slowT = e.D.slow; }
    }
  } else if (e.st === 'rest') { if (e.stT <= 0) { e.st = 'idle'; e.stT = rand(0.2, 0.8); } }
};
AI.lamp = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  faceTo(e, p); e.stT -= dt;
  if (d < 220) {
    // 保持距离，喜欢躲到暗处
    let tx = e.x, ty = e.y;
    if (d < e.D.keep - 10) { tx = e.x + (e.x - p.x); ty = e.y + (e.y - p.y); } else if (d > e.D.keep + 20) { tx = p.x; ty = p.y; }
    if (inLight(e.x, e.y)) { tx += rand(-40, 40); ty += rand(-40, 40); }
    if (e.st !== 'tell') chase(e, dt, tx, ty, e.D.speed);
    if (e.st === 'idle' && e.stT <= 0 && d < 200) { e.st = 'tell'; e.stT = e.D.tell; }
    if (e.st === 'tell' && e.stT <= 0) {
      e.st = 'idle'; e.stT = rand(1.8, 2.6);
      const a = Math.atan2(p.y - 5 - e.y, p.x - e.x);
      for (const off of [-0.25, 0, 0.25]) spawnProj({ kind: 'shard', owner: 'e', x: e.x, y: e.y - 6, vx: Math.cos(a + off) * e.D.shard, vy: Math.sin(a + off) * e.D.shard, life: 3, dmg: e.D.dmg, r: 3, glow: 10, cold: true });
      Snd.play('shoot');
    }
  }
};
AI.clay = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y), target = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.st !== 'thrust') e.faceA += clamp(angDiff(e.faceA, target), -1.9 * dt, 1.9 * dt); // 转身慢，可以绕到背后
  e.dir = Math.cos(e.faceA) >= 0 ? 1 : -1;
  e.stT -= dt;
  if (e.st === 'idle') { wander(e, dt); if (d < 150) e.st = 'chase'; }
  else if (e.st === 'chase') { if (d > 22) chase(e, dt, p.x, p.y, e.D.speed); if (d < 30 && Math.abs(angDiff(e.faceA, target)) < 0.6) { e.st = 'tell'; e.stT = e.D.tell; } }
  else if (e.st === 'tell') { if (e.stT <= 0) { e.st = 'thrust'; e.stT = 0.22; e.atkHit = false; } }
  else if (e.st === 'thrust') { moveBox(e, Math.cos(e.faceA) * 90 * dt, Math.sin(e.faceA) * 90 * dt, true, false); e.atk = { x: e.x + Math.cos(e.faceA) * 14, y: e.y - 4 + Math.sin(e.faceA) * 10, r: 8 }; if (e.stT <= 0) { e.st = 'rest'; e.stT = 0.8; } }
  else if (e.st === 'rest') { if (e.stT <= 0) e.st = 'chase'; }
};
AI.lizard = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  e.stT -= dt;
  if (e.st === 'idle') { wander(e, dt); if (d < 150) e.st = 'chase'; }
  else if (e.st === 'chase') { faceTo(e, p); chase(e, dt, p.x, p.y, e.D.speed); if (d < 120 && e.stT <= 0) { e.st = 'tell'; e.stT = e.D.tell; const dd = d || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; tele({ type: 'line', x: e.x, y: e.y, ang: Math.atan2(e.ldy, e.ldx), len: e.D.dash * e.D.dashTime, w: 10, dur: e.D.tell }); } }
  else if (e.st === 'tell') { if (e.stT <= 0) { e.st = 'dash'; e.stT = e.D.dashTime; e.atkHit = false; Snd.play('flame'); } }
  else if (e.st === 'dash') {
    moveBox(e, e.ldx * e.D.dash * dt, e.ldy * e.D.dash * dt, true, false); e.atk = { x: e.x, y: e.y - 4, r: 7 };
    e.trailT = (e.trailT || 0) - dt;
    if (e.trailT <= 0) { e.trailT = 0.06; spawnProj({ kind: 'flame', owner: 'e', x: e.x, y: e.y, life: 1.6, r: 6, dmg: 2, glow: 14 }); }
    if (e.stT <= 0 || e.hitX || e.hitY) { e.st = 'rest'; e.stT = 1.1; }
  } else if (e.st === 'rest') { if (e.stT <= 0) { e.st = 'chase'; e.stT = 0.6; } }
};
AI.smoke = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y);
  faceTo(e, p);
  if (d < 200) { const tx = d > 60 ? p.x : e.x + (e.x - p.x) * 0.3, ty = d > 60 ? p.y : e.y; chase(e, dt, tx, ty, e.D.speed); }
  e.stT -= dt;
  if (e.stT <= 0 && d < 200) { e.stT = rand(2.5, 3.5); const s = addEnt(G.room, 'smoke', e.x, e.y, { r: 6, rmax: 30, life: 6, vx: rand(-8, 8), vy: rand(-8, 8) }); s.owner = e; Snd.play('smoke'); }
  if (d < 11) hurtPlayer(e.D.dmg, e.x, e.y);
};
AI.elite = (e, dt, p) => {
  const d = dist(e.x, e.y, p.x, p.y), D = e.D;
  e.stT -= dt;
  switch (e.st) {
    case 'idle': wander(e, dt); if (d < 160) e.st = 'chase'; break;
    case 'chase': faceTo(e, p); chase(e, dt, p.x, p.y, D.speed); if (d < 40 && e.stT <= 0) { e.st = 'tell'; e.stT = D.tell; e.combo = 0; } break;
    case 'tell': faceTo(e, p); if (e.stT <= 0) { e.st = 'slash'; e.stT = 0.28; e.atkHit = false; const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; Snd.play('swing', 2); } break;
    case 'slash':
      moveBox(e, e.ldx * (e.combo === 2 ? 150 : 90) * dt, e.ldy * (e.combo === 2 ? 150 : 90) * dt, true, false);
      e.atk = { x: e.x + e.ldx * 14, y: e.y - 6 + e.ldy * 10, r: e.combo === 2 ? 15 : 12, dmg: e.combo === 2 ? D.dmg + 2 : D.dmg };
      if (e.stT <= 0) { e.combo++; if (e.combo >= 3) { e.st = 'rest'; e.stT = 1.3; } else { e.st = 'tell'; e.stT = e.combo === 2 ? 0.45 : 0.3; } }
      break;
    case 'rest': if (e.stT <= 0) { e.st = 'chase'; e.stT = 0.4; } break;
  }
};

// =====================================================================
// Boss
// =====================================================================
function startBoss(kind) {
  const R = G.room, D = DATA.bosses[kind];
  const x = R.bossX || R.w * TS / 2, y = R.bossY || R.h * TS / 2;
  G.bossFight = { kind, phase: 1 };
  G.lockExits = true;
  // 门关上的时候人还站在门口：挪进场地里，免得一步就走出 Boss 房
  const p = G.P, ptx = Math.floor(p.x / TS), pty = Math.floor(p.y / TS);
  if (!walkable(ptx, pty) || ptx <= 0 || pty <= 0 || ptx >= R.w - 1 || pty >= R.h - 1) {
    p.x = clamp(p.x, TS * 1.5, R.w * TS - TS * 1.5); p.y = clamp(p.y, TS * 1.5, R.h * TS - TS * 1.5);
    nearestWalkable(p); p.safeX = p.x; p.safeY = p.y; p.vx = p.vy = 0;
  }
  const e = addEnt(R, 'boss', x, y, { kind, D, hp: D.hp, maxHp: D.hp, hw: 8, hh: 5, rad: 10, st: 'intro', stT: 1.0, flash: 0, dir: -1, inv: 0, phase: 1, vx: 0, vy: 0 });
  G.bossFight.e = e;
  G.ui.boss = { name: D.name, e }; G.ui.bossLine = null;
  R.dirty = true;
  BOSS[kind].init(e, R);
  Snd.music(kind === 'zhu' || kind === 'night' ? 'master' : 'boss'); Snd.play('roar'); shake(0.4);
  return e;
}
function bossLine(text) { G.ui.bossLine = { text, t: 0 }; Snd.play('phase'); shake(0.4); }
function bossDefeated(e) {
  const kind = e.kind, R = G.room;
  e.dead = true;
  for (const q of R.ents) if (q.k === 'clone' || q.k === 'bshadow') q.dead = true;
  G.projs = G.projs.filter((q) => q.owner === 'p'); G.tele = [];
  if (BOSS[kind].cleanup) BOSS[kind].cleanup(R);
  G.bossFight = null; G.ui.boss = null; G.ui.bossLine = null; R.dirty = true;
  Snd.play('victory'); slowmo(1.2, 0.3); shake(0.6);
  burst(e.x, e.y - 10, 50, ['#ffd166', '#fff1b0', '#463a62', '#2a2140'], 120, 1.4, 2, -10);
  G.S.flags['boss_' + kind] = true;
  Snd.music(REGION_MUSIC[R.region]);
  if (kind !== 'night' && kind !== 'zhu') for (let i = 0; i < 8; i++) dropLoot(e.x, e.y, 'wick', DATA.bossWicks / 8);
  startSettle(kind);
}
// Boss 战后结算：出口一直锁着，等奖励和战后台词全部放完才打开。
// 结算状态绑定在这个房间上，换房间（调试传送、死亡复活）就作废，回到这个房间时从头补放。
function startSettle(kind) {
  G.S.flags.after_pending = kind;
  G.settle = { kind, room: G.room.id, t: 1.6, started: false };
  G.lockExits = true;
}
function updateSettle(dt) {
  const s = G.settle;
  if (!s) return;
  if (!G.room || G.room.id !== s.room) { G.settle = null; return; }
  if (!s.started) {
    for (const q of G.room.ents) if (q.k === 'loot') q.magnet = true;
    s.t -= dt;
    if (s.t > 0 || G.script || G.P.dead) return;
    s.started = true;
    if (s.kind !== 'zhu' && s.kind !== 'night' && !G.S.flags['heart_' + s.kind]) { G.S.flags['heart_' + s.kind] = true; giveItem('heart'); }
    runScript(s.kind + '_after');
    return;
  }
  if (G.script || G.scene !== 'game') return;
  // 剧情里接着又开了一场 Boss 战（选灯芯 → 长夜）：门继续锁着；
  // after_pending 留着，万一死在长夜手里，回到台顶会重新放师父战后的选择
  if (G.bossFight) { G.settle = null; return; }
  // 台词放完了：把没捡的灯芯收进来，再开门
  for (const q of G.room.ents) if (q.k === 'loot' && !q.dead) { q.dead = true; if (q.item === 'wick') G.S.wicks += q.n; else G.S.oil = Math.min(G.S.oilMax, G.S.oil + CFG.oil.bottle); }
  delete G.S.flags.after_pending;
  G.settle = null; G.lockExits = false; G.room.dirty = true;
  if (G.room.def.gate === 'boss') { toast('出口打开了'); Snd.play('door'); }
}
EK.boss = {
  update(e, dt) { if (e.flash > 0) e.flash -= dt; e.inv = Math.max(0, e.inv - dt); if (e.dead || G.script || G.P.dead) return; BOSS[e.kind].update(e, dt, G.P); if (e.atk && !e.atkHit && dist(G.P.x, G.P.y - 4, e.atk.x, e.atk.y) < e.atk.r + 5) { if (hurtPlayer(e.atk.dmg || e.D.dmg, e.x, e.y, { shadow: e.kind === 'night' })) e.atkHit = true; } e.atk = null; },
  hurt(e, dmg, o) {
    if (e.dead) return false;
    const B = BOSS[e.kind];
    if (B.canHurt && !B.canHurt(e, o)) return 'block';
    if (e.inv > 0) return false;
    if (B.absorb) { const a = B.absorb(e, dmg, o); if (a) return a; } // 护甲先吃掉这一下
    if (B.dmgMul) dmg = Math.max(1, Math.round(dmg * B.dmgMul(e, o)));
    e.hp -= dmg; e.flash = 0.08;
    Snd.play('hit', o.third); burst(e.x, e.y - 12, 8, ['#fff1b0', '#ffd166', '#ffffff'], 80, 0.3, 1);
    B.onHurt && B.onHurt(e, dmg, o);
    if (e.phase === 1 && e.hp <= e.maxHp * (B.p2 || 0.5) && B.phase2) { e.phase = 2; G.bossFight.phase = 2; B.phase2(e); }
    if (e.hp <= 0) { if (B.onZero && B.onZero(e)) return true; bossDefeated(e); }
    return true;
  },
  burst(e, d) { const B = BOSS[e.kind]; if (B.onBurst) B.onBurst(e, d); },
  draw(e, ox, oy) { BOSS[e.kind].draw(e, ox, oy); },
  light(e) { return BOSS[e.kind].light ? BOSS[e.kind].light(e) : null; },
  sortY(e) { return e.y + 6; },
};
function bossSprite(im, e, ox, oy, w, h, yoff = 0, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.drawImage(e.flash > 0 ? solid(im, '#ffffff') : im, Math.round(e.x - w / 2 - ox), Math.round(e.y - h + yoff - oy));
  ctx.globalAlpha = 1;
}
const BOSS = {};
// ------------------- 竹中客：三连突进斩、扇形飞镖；二阶段三个分身 -------------------
BOSS.ke = {
  init(e) { e.hw = 7; e.hh = 5; },
  update(e, dt, p) {
    e.stT -= dt; faceTo(e, p);
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.st) {
      case 'intro': if (e.stT <= 0) { e.st = 'move'; e.stT = 1.2; } break;
      case 'stun': if (e.stT <= 0) { e.st = 'move'; e.stT = 0.8; } break;
      case 'move': {
        const a = Math.atan2(e.y - p.y, e.x - p.x) + 0.7 * dt * 3;
        const tx = p.x + Math.cos(a) * 80, ty = p.y + Math.sin(a) * 60;
        chase(e, dt, tx, ty, 70);
        if (e.stT <= 0) { if (Math.random() < 0.55 || d > 140) BOSS.ke.beginDash(e, p); else { e.st = 'fanTell'; e.stT = 0.5; } }
        break;
      }
      case 'dashTell': if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.22; e.atkHit = false; Snd.play('dash'); } break;
      case 'dash':
        moveBox(e, e.ldx * 330 * dt, e.ldy * 330 * dt, true, false);
        e.atk = { x: e.x, y: e.y - 6, r: 10, dmg: 3 };
        if (Math.random() < 0.8) part(e.x, e.y - 6, 0, 0, 0.3, '#463a62', 2);
        if (e.stT <= 0) { e.dashes--; if (e.dashes > 0) BOSS.ke.aim(e, p, 0.4); else { e.st = 'move'; e.stT = e.phase === 2 ? 1.2 : 1.5; } }
        break;
      case 'fanTell': if (e.stT <= 0) { BOSS.ke.fan(e, p, e.phase === 2 ? 7 : 5, 2); e.st = 'move'; e.stT = 1.5; } break;
    }
    if (e.phase === 2) { e.cloneT -= dt; if (e.cloneT <= 0 && !G.room.ents.some((q) => q.k === 'clone' && !q.dead)) BOSS.ke.clones(e, 2); }
  },
  beginDash(e, p) { e.dashes = e.phase === 2 ? 3 : 2; BOSS.ke.aim(e, p, 0.7); }, // 一阶段两段突进，二阶段三段
  aim(e, p, t) { const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; e.st = 'dashTell'; e.stT = t; tele({ type: 'line', x: e.x, y: e.y - 4, ang: Math.atan2(e.ldy, e.ldx), len: 330 * 0.22 + 10, w: 12, dur: t }); },
  fan(e, p, n, dmg) { const a0 = Math.atan2(p.y - 5 - e.y, p.x - e.x); for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.2; spawnProj({ kind: 'shuriken', owner: 'e', x: e.x, y: e.y - 8, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, life: 3, dmg, r: 3, spin: 18 }); } Snd.play('shoot'); },
  phase2(e) { bossLine('影子不止一个——你分得出哪个是我吗？'); BOSS.ke.clones(e); },
  clones(e, n = 3) {
    e.cloneT = 11;
    const R = G.room;
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU + Math.random(); const c = addEnt(R, 'clone', e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 40, { boss: e, st: 'move', stT: rand(0.5, 1.8), life: 7, hw: 7, hh: 5, rad: 9, dir: 1, kbx: 0, kby: 0 }); burst(c.x, c.y - 8, 10, ['#2a2140', '#463a62'], 40, 0.6, 1); }
    // 分身出现时，真身也换个位置
    const a = Math.random() * TAU; e.x = clamp(e.x + Math.cos(a) * 50, 40, R.w * TS - 40); e.y = clamp(e.y + Math.sin(a) * 40, 40, R.h * TS - 40);
  },
  onBurst(e) { e.st = 'stun'; e.stT = CFG.lightBurstStun; ftext(e.x, e.y - 30, '僵直', '#fff1b0'); for (const c of G.room.ents) if (c.k === 'clone' && !c.dead) EK.clone.hurt(c); },
  draw(e, ox, oy) {
    const A = ART.boss.ke, side = e.dir > 0 ? 'R' : 'L';
    const im = e.st === 'dash' ? A.dash[side][0] : e.st === 'dashTell' || e.st === 'fanTell' ? A.up[side][0] : A.idle[side][Math.floor(G.t * 3) % 2];
    drawShadow(e.x - ox, e.y + 6 - oy, 8, 0.55); // 真身脚下有影子
    bossSprite(im, e, ox, oy, 24, 24, 8);
    if (e.st === 'stun') for (let i = 0; i < 3; i++) { const a = G.t * 6 + i * 2.1; ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(e.x - ox + Math.cos(a) * 7), Math.round(e.y - 22 - oy + Math.sin(a) * 2), 2, 2); }
  },
};
// 分身：没有影子，一碰就散
EK.clone = {
  update(e, dt) {
    if (e.dead || G.script) return;
    const p = G.P, b = e.boss; e.stT -= dt; faceTo(e, p);
    if (b.dead) { e.dead = true; return; }
    e.life -= dt; if (e.life <= 0 && e.st === 'move') { e.dead = true; burst(e.x, e.y - 8, 12, ['#2a2140', '#463a62'], 40, 0.6, 1, -20); return; } // 分身撑不了多久
    if (e.st === 'move') { const a = Math.atan2(e.y - p.y, e.x - p.x) + dt * 2; chase(e, dt, p.x + Math.cos(a) * 90, p.y + Math.sin(a) * 70, 60); if (e.stT <= 0) { if (Math.random() < 0.5) { const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; e.st = 'tell'; e.stT = 0.7; tele({ type: 'line', x: e.x, y: e.y - 4, ang: Math.atan2(e.ldy, e.ldx), len: 75, w: 10, dur: 0.7 }); } else { e.st = 'fan'; e.stT = 0.6; } } }
    else if (e.st === 'tell') { if (e.stT <= 0) { e.st = 'dash'; e.stT = 0.22; e.atkHit = false; } }
    else if (e.st === 'dash') { moveBox(e, e.ldx * 320 * dt, e.ldy * 320 * dt, true, false); if (!e.atkHit && dist(p.x, p.y - 4, e.x, e.y - 6) < 13) { if (hurtPlayer(2, e.x, e.y)) e.atkHit = true; } if (e.stT <= 0) { e.st = 'move'; e.stT = rand(1.6, 2.6); } }
    else if (e.st === 'fan') { if (e.stT <= 0) { BOSS.ke.fan(e, p, 3, 2); e.st = 'move'; e.stT = rand(1.6, 2.6); } }
  },
  hurt(e) { if (e.dead) return false; e.dead = true; Snd.play('enemyDie'); burst(e.x, e.y - 8, 14, ['#2a2140', '#463a62', '#7a7090'], 60, 0.6, 1, -20); ftext(e.x, e.y - 22, '是分身', '#a69cb8'); return true; },
  burst(e) { EK.clone.hurt(e); },
  draw(e, ox, oy) { const A = ART.boss.ke, side = e.dir > 0 ? 'R' : 'L'; const im = e.st === 'dash' ? A.dash[side][0] : e.st === 'tell' || e.st === 'fan' ? A.up[side][0] : A.idle[side][Math.floor(G.t * 3) % 2]; ctx.globalAlpha = 0.92; ctx.drawImage(im, Math.round(e.x - 12 - ox), Math.round(e.y - 16 - oy)); ctx.globalAlpha = 1; },
  sortY(e) { return e.y + 6; },
};
// ------------------- 溺钟：冰下游动（背鳍预告）→ 破冰砸地；二阶段只剩浮冰 -------------------
const FLOES = [[2, 2, 5, 4], [9, 1, 5, 4], [16, 2, 5, 4], [23, 2, 5, 4], [3, 8, 5, 3], [11, 7, 7, 4], [21, 8, 5, 3], [2, 12, 5, 2], [9, 12, 5, 2], [16, 12, 5, 2], [23, 12, 5, 2]];
BOSS.carp = {
  init(e) { e.hw = 14; e.hh = 6; e.rad = 16; e.hidden = true; e.st = 'swim'; e.stT = 2.0; e.fx = e.x; e.fy = e.y; },
  update(e, dt, p) {
    e.stT -= dt;
    const fast = e.phase === 2 ? 1.35 : 1;
    switch (e.st) {
      case 'swim': {
        e.hidden = true;
        const d = dist(e.fx, e.fy, p.x, p.y) || 1;
        e.fx += ((p.x - e.fx) / d) * 78 * fast * dt; e.fy += ((p.y - e.fy) / d) * 78 * fast * dt;
        if (Math.random() < 0.5) part(e.fx + rand(-6, 6), e.fy + 3, rand(-8, 8), -6, 0.5, '#e4f8fc', 1);
        if (e.stT <= 0) { e.st = 'rise'; e.stT = 0.75 / Math.sqrt(fast); tele({ type: 'circle', x: e.fx, y: e.fy, r: 34, dur: e.stT }); Snd.play('iceCrack'); }
        break;
      }
      case 'rise': if (e.stT <= 0) { e.st = 'leap'; e.stT = 0.4; e.x = e.fx; e.y = e.fy; e.hidden = false; burst(e.x, e.y, 20, ['#e4f8fc', '#a9dff0', '#1f4a73'], 90, 0.7, 1, 60); } break;
      case 'leap': if (e.stT <= 0) {
        e.st = 'flop'; e.stT = (e.phase === 2 ? 1.8 : 2.2); Snd.play('slam'); shake(0.45);
        spawnProj({ kind: 'ring', owner: 'e', x: e.x, y: e.y, r0: 10, r1: 72, rr: 10, life: 0.55, dmg: 3 });
        for (let i = 0; i < (e.phase === 2 ? 8 : 6); i++) { const a = (i / (e.phase === 2 ? 8 : 6)) * TAU; spawnProj({ kind: 'shard', owner: 'e', x: e.x, y: e.y - 6, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 2.5, dmg: 2, r: 3, cold: true, glow: 8, ghost: true }); }
        if (dist(p.x, p.y, e.x, e.y) < 26) hurtPlayer(3, e.x, e.y);
      } break;
      case 'flop': if (Math.random() < 0.1) part(e.x + rand(-12, 12), e.y, 0, -20, 0.4, '#a9dff0', 1); if (e.stT <= 0) { e.st = 'dive'; e.stT = 0.4; } break;
      case 'dive': if (e.stT <= 0) { e.hidden = true; e.st = 'swim'; e.stT = rand(1.6, 2.2) / fast; e.fx = e.x; e.fy = e.y; burst(e.x, e.y, 14, ['#e4f8fc', '#1f4a73'], 60, 0.5, 1); Snd.play('splash'); } break;
    }
    if (!e.hidden && e.st === 'flop' && dist(p.x, p.y, e.x, e.y) < 14) e.atk = { x: e.x, y: e.y, r: 10, dmg: 2 };
  },
  canHurt(e) { return !e.hidden && (e.st === 'flop' || e.st === 'leap'); },
  phase2(e) {
    bossLine('嗡——当——！冰面碎了！冲刺跳到浮冰上！');
    const R = G.room;
    for (let y = 1; y < 14; y++) for (let x = 1; x < R.w - 1; x++) {
      if (R.t[y * R.w + x] !== TL.ICE) continue;
      const onFloe = FLOES.some(([fx, fy, fw, fh]) => x >= fx && x < fx + fw && y >= fy && y < fy + fh);
      if (!onFloe) { R.t[y * R.w + x] = TL.WATER; R.anim.push(y * R.w + x); (e.melted || (e.melted = [])).push(y * R.w + x); }
    }
    R.dirty = true; Snd.play('iceCrack'); shake(0.7);
    const p = G.P; if (tilePit(R, tileAt(Math.floor(p.x / TS), Math.floor(p.y / TS)))) { p.safeX = 14 * TS + 8; p.safeY = 14 * TS + 8; }
    hint('dash');
  },
  draw(e, ox, oy) {
    if (e.hidden) {
      if (e.st === 'swim' || e.st === 'rise') { const im = ART.boss.carp.fin; ctx.globalAlpha = 0.9; ctx.drawImage(im, Math.round(e.fx - 6 - ox), Math.round(e.fy - 9 - oy + Math.sin(G.t * 8) * 1)); ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(20,48,79,0.5)'; ctx.beginPath(); ctx.ellipse(e.fx - ox, e.fy + 1 - oy, 18, 5, 0, 0, TAU); ctx.fill(); }
      return;
    }
    const side = G.P.x > e.x ? 'R' : 'L', A = ART.boss.carp;
    const hop = e.st === 'leap' ? Math.sin((1 - e.stT / 0.4) * Math.PI) * 30 + (e.stT > 0.2 ? 10 : 0) : e.st === 'dive' ? -e.stT * 0 : 0;
    drawShadow(e.x - ox, e.y + 4 - oy, 16, 0.45);
    bossSprite(e.st === 'flop' ? A.open[side][0] : A.idle[side][Math.floor(G.t * 6) % 2], e, ox, oy + hop, 40, 28, 6);
  },
  light(e) { return { x: e.hidden ? e.fx : e.x, y: (e.hidden ? e.fy : e.y) - 10, r: 26, cool: 1, env: false }; },
  // 打完以后湖面重新冻上，不用再跳浮冰离开
  cleanup(R) {
    const e = G.bossFight && G.bossFight.e;
    if (!e || !e.melted) return;
    for (const i of e.melted) R.t[i] = TL.ICE;
    const set = new Set(e.melted); R.anim = R.anim.filter((i) => !set.has(i)); e.melted = null; R.dirty = true;
    later(0.3, () => { toast('湖面重新冻上了'); Snd.play('iceCrack'); });
  },
};
// ------------------- 窑神：先打碎四块瓷甲；二阶段熔岩顺着沟流下来，推罐子挡住 -------------------
// 瓷甲裂纹的形状（以瓷片中心为原点，-1~1）
const KILN_CRACKS = [[[-0.9, -0.5], [-0.2, 0], [0.1, 0.7]], [[0.8, -0.8], [0.2, -0.2], [0.6, 0.4]], [[-0.6, 0.9], [-0.1, 0.3], [-0.7, -0.1]], [[0.1, -0.9], [-0.2, -0.3], [0.5, 0.1], [0.9, 0.6]]];
function pixLine(x0, y0, x1, y1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1); }
BOSS.kiln = {
  init(e, R) { e.hw = 14; e.hh = 6; e.rad = 18; e.plateMax = e.D.plate; e.plates = [e.D.plate, e.D.plate, e.D.plate, e.D.plate]; e.cx0 = R.w * TS / 2; e.cy0 = R.h * TS / 2 + 10; e.st = 'walk'; e.stT = 1.5; e.flows = [0, 0, 0]; e.flowT = 0; e.flowPhase = 'off'; e.lavaSet = []; e.cols = []; for (let x = 0; x < R.w; x++) if (R.t[2 * R.w + x] === TL.VENT) e.cols.push(x); },
  exposed(e) { return e.plates.every((h) => h <= 0); },
  update(e, dt, p) {
    e.stT -= dt; faceTo(e, p);
    const d = dist(e.x, e.y, p.x, p.y);
    switch (e.st) {
      case 'walk': { const R = G.room; chase(e, dt, clamp(p.x, 72, R.w * TS - 72), clamp(p.y, 72, R.h * TS - 56), 20); } /* 不追进墙角 */ if (e.stT <= 0) { if (d < 90 && Math.random() < 0.6) { e.st = 'poundTell'; e.stT = 0.85; tele({ type: 'circle', x: e.x, y: e.y, r: 70, dur: 0.85 }); } else { e.st = 'shardTell'; e.stT = 0.55; } } break;
      case 'poundTell': if (e.stT <= 0) { e.st = 'rest'; e.stT = 1.0; Snd.play('slam'); shake(0.5); spawnProj({ kind: 'ring', owner: 'e', x: e.x, y: e.y, r0: 12, r1: 80, rr: 12, life: 0.6, dmg: 4, col: 'rgba(255,150,80,0.9)' }); if (d < 26) hurtPlayer(4, e.x, e.y); burst(e.x, e.y, 20, ['#55403e', '#ff6a2a'], 80, 0.6, 2, 40); } break;
      case 'shardTell': if (e.stT <= 0) { e.st = 'rest'; e.stT = 0.9; const n = e.phase === 2 ? 12 : 8, a0 = Math.random(); for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; spawnProj({ kind: 'porcelain', owner: 'e', x: e.x, y: e.y - 16, vx: Math.cos(a) * 105, vy: Math.sin(a) * 105, life: 3, dmg: 3, r: 3 }); } Snd.play('shatter'); } break;
      case 'stagger': if (Math.random() < 0.3) part(e.x + rand(-10, 10), e.y - rand(10, 30), rand(-10, 10), -20, 0.6, Math.random() < 0.5 ? '#ffd166' : '#ff8a3c', 1); if (e.stT <= 0) { e.st = 'walk'; e.stT = 1.0; ftext(e.x, e.y - 46, '站起来了', '#d6cfe0'); } break;
      case 'flinch': if (e.stT <= 0) { e.st = 'walk'; e.stT = 0.6; } break;
      case 'rest': if (e.stT <= 0) { e.st = 'walk'; e.stT = rand(1.2, 2.0); } break;
    }
    if (d < 20 && e.st !== 'stagger' && e.st !== 'flinch') e.atk = { x: e.x, y: e.y - 6, r: 14, dmg: 3 };
    if (e.phase === 2) BOSS.kiln.lavaFlow(e, dt);
  },
  // 熔岩沟：从顶上的熔岩口往下流，碰到罐子就停
  lavaFlow(e, dt) {
    const R = G.room;
    e.flowT -= dt;
    if (e.flowPhase === 'off' && e.flowT <= 0) { e.flowPhase = 'flow'; e.flows = e.cols.map(() => 0); e.flowT = 0; Snd.play('lava'); toast('熔岩流下来了！把陶罐推进熔岩沟'); }
    if (e.flowPhase === 'flow') {
      e.stepT = (e.stepT || 0) - dt;
      if (e.stepT <= 0) {
        e.stepT = 0.32; let moving = false;
        e.cols.forEach((cx, i) => {
          const y = 3 + e.flows[i];
          if (y >= R.h - 2 || e.flows[i] < 0) return;
          const idx = y * R.w + cx;
          if (R.blk[idx] || R.t[idx] === TL.COOL) { e.flows[i] = -1; return; }
          if (R.t[idx] === TL.FLOOR || R.t[idx] === TL.PATH) { R.t[idx] = TL.LAVA; R.anim.push(idx); e.lavaSet.push(idx); R.lava.push([cx * TS + 8, y * TS + 8]); R.dirty = true; }
          e.flows[i]++; moving = true;
        });
        if (!moving) { e.flowPhase = 'hold'; e.flowT = 6; }
      }
    } else if (e.flowPhase === 'hold' && e.flowT <= 0) { BOSS.kiln.cleanup(R); e.flowPhase = 'off'; e.flowT = 3.5; }
  },
  cleanup(R) {
    const e = G.bossFight ? G.bossFight.e : R.ents.find((q) => q.k === 'boss');
    if (!e || !e.lavaSet) return;
    for (const idx of e.lavaSet) if (R.t[idx] === TL.LAVA) R.t[idx] = TL.FLOOR;
    e.lavaSet = []; R.lava = []; R.anim = R.anim.filter((i) => R.t[i] !== TL.FLOOR); R.dirty = true;
  },
  // 瓷甲：每一下都算数（第三段 ×1.5，投火 4 点），打在离出手点最近的那块上。四块全碎后跪地硬直 4 秒。
  absorb(e, dmg, o) {
    if (BOSS.kiln.exposed(e)) return false;
    const p = G.P, sx = o.fx != null ? o.fx : p.x, sy = o.fy != null ? o.fy : p.y;
    let best = -1, bd = 1e9;
    e.plates.forEach((h, i) => { if (h <= 0) return; const [px, py] = BOSS.kiln.platePos(e, i); const dd = dist(px, py, sx, sy); if (dd < bd) { bd = dd; best = i; } });
    if (best < 0) return false;
    const d = o.src === 'fire' ? 4 : o.src === 'burst' ? 2 : Math.round(dmg * (o.third ? 1.5 : 1));
    e.plates[best] = Math.max(0, e.plates[best] - d); e.flash = 0.06; e.plateHit = best; e.plateHitT = 0.25;
    const [px, py] = BOSS.kiln.platePos(e, best);
    burst(px, py, o.third ? 10 : 5, ['#e3ecf2', '#3e6fa8', '#9fb3c6'], 60, 0.5, 1, 40);
    ftext(px + rand(-4, 4), py - 10, `-${d}`, '#bfe9ff');
    Snd.play(e.plates[best] > 0 ? 'hit' : 'shatter', o.third);
    if (e.plates[best] <= 0) {
      ftext(px, py - 20, '瓷甲碎了！', '#bfe9ff'); shake(0.3); hitstop(0.08);
      burst(px, py, 18, ['#e3ecf2', '#3e6fa8', '#9fb3c6', '#ffffff'], 90, 0.8, 2, 60);
      if (BOSS.kiln.exposed(e)) {
        e.st = 'stagger'; e.stT = 4; e.atk = null; G.tele = G.tele.filter((t) => t.type !== 'circle');
        ftext(e.x, e.y - 52, '瓷甲全碎！它跪下了，快打！', '#ffd166'); Snd.play('phase'); shake(0.5);
      } else if (e.st === 'walk' || e.st === 'rest') { e.st = 'flinch'; e.stT = 0.6; }
    }
    return true;
  },
  dmgMul(e) { return e.st === 'stagger' ? 1.25 : 1; },
  onBurst(e) { if (!BOSS.kiln.exposed(e)) BOSS.kiln.absorb(e, 2, { src: 'burst' }); },
  hud(e, x, y, w) {
    if (!BOSS.kiln.exposed(e)) {
      txt('瓷甲', x - 3, y + 4.5, 7, '#bfe9ff', 'right', true);
      const sw = (w - 9) / 4;
      e.plates.forEach((h, i) => {
        const sx = Math.round(x + i * (sw + 3));
        ctx.fillStyle = '#120e1a'; ctx.fillRect(sx - 1, y - 1, Math.round(sw) + 2, 5);
        ctx.fillStyle = '#1d2a3a'; ctx.fillRect(sx, y, Math.round(sw), 3);
        const hit = e.plateHit === i && e.plateHitT > 0;
        ctx.fillStyle = hit ? '#ffffff' : '#9fd3f0'; ctx.fillRect(sx, y, Math.round(sw * h / e.plateMax), 3);
      });
    } else if (e.st === 'stagger') {
      txt('硬直', x - 3, y + 4.5, 7, '#ffd166', 'right', true);
      ctx.fillStyle = '#120e1a'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x, y, Math.round(w * clamp(e.stT / 4, 0, 1)), 3);
    }
  },
  platePos(e, i) { return [[e.x, e.y - 36], [e.x, e.y - 20], [e.x - 16, e.y - 22], [e.x + 16, e.y - 22]][i]; },
  phase2(e) {
    bossLine('窑火……还没熄！又烧出了瓷甲，熔岩也要流下来了！');
    e.flowT = 2.5; hint('jar');
    // 头和胸重新长出瓷甲：再打碎一次，它会再跪一次
    e.plates[0] = e.plates[1] = e.plateMax;
    if (e.st === 'stagger') e.stT = Math.min(e.stT, 0.6);
    burst(e.x, e.y - 30, 24, ['#e3ecf2', '#9fb3c6', '#ff8a3c'], 70, 0.8, 1, -20);
  },
  draw(e, ox, oy) {
    const A = ART.boss.kiln, f = Math.floor(G.t * 2) % 2;
    drawShadow(e.x - ox, e.y + 4 - oy, 18, 0.5);
    const ex = BOSS.kiln.exposed(e);
    const shake2 = e.st === 'poundTell' ? rand(-1, 1) : 0;
    ctx.drawImage(e.flash > 0 && ex ? solid(A.core[f], '#fff') : (ex ? A.core[f] : A.body[f]), Math.round(e.x - 24 - ox + shake2), Math.round(e.y - 44 - oy + (e.st === 'stagger' ? 3 : 0)));
    const off = [[-7, -5], [-9, -7], [-5, -8], [-5, -8]];
    if (e.plateHitT > 0) e.plateHitT -= 1 / 60;
    const kneel = e.st === 'stagger' ? 3 : 0;
    e.plates.forEach((h, i) => {
      if (h <= 0) return;
      const [px, py] = BOSS.kiln.platePos(e, i), im = A.plates[i], hit = e.plateHit === i && e.plateHitT > 0;
      const jx = hit ? Math.round(rand(-1, 1)) : 0;
      const bx = Math.round(px + off[i][0] - ox + shake2 + jx), by = Math.round(py + off[i][1] - oy + kneel);
      ctx.drawImage(hit && e.plateHitT > 0.18 ? solid(im, '#fff') : im, bx, by);
      // 裂纹：越伤越多
      const lv = Math.ceil((1 - h / e.plateMax) * 4);
      const hx = im.width / 2, hy = im.height / 2;
      ctx.fillStyle = '#16202e';
      for (let k = 0; k < lv; k++) {
        const C = KILN_CRACKS[(k + i) % KILN_CRACKS.length];
        for (let j = 0; j < C.length - 1; j++) pixLine(bx + hx + C[j][0] * hx * 0.8, by + hy + C[j][1] * hy * 0.8, bx + hx + C[j + 1][0] * hx * 0.8, by + hy + C[j + 1][1] * hy * 0.8);
      }
      if (lv >= 3 && Math.random() < 0.04) part(px + rand(-4, 4), py + 4, rand(-10, 10), 10, 0.5, '#9fb3c6', 1);
    });
    if (e.st === 'stagger') for (let i = 0; i < 3; i++) { const a = G.t * 5 + i * 2.1; ctx.fillStyle = '#ffe27a'; ctx.fillRect(Math.round(e.x - ox + Math.cos(a) * 12), Math.round(e.y - 48 - oy + Math.sin(a) * 3), 2, 2); }
  },
  light(e) { return { x: e.x, y: e.y - 20, r: BOSS.kiln.exposed(e) ? 44 : 26, warm: 1, env: false }; },
};
// ------------------- 师父·烛：灯火弹幕 → 三个 Boss 的影子 → 全黑中偷袭 -------------------
BOSS.zhu = {
  p2: 2 / 3,
  init(e) { e.hw = 7; e.hh = 5; e.rad = 9; e.st = 'idle'; e.stT = 1.2; e.spin = 0; e.summonI = 0; },
  update(e, dt, p) {
    e.stT -= dt; faceTo(e, p);
    const R = G.room;
    if (e.phase < 3) {
      switch (e.st) {
        case 'idle': { const a = G.t * 0.6; chase(e, dt, R.w * TS / 2 + Math.cos(a) * 90, R.h * TS / 2 - 10 + Math.sin(a) * 40, 50); if (e.stT <= 0) BOSS.zhu.pick(e, p); break; }
        case 'ring': if (e.stT <= 0) { const n = 12, a0 = Math.random(); for (let i = 0; i < n; i++) { const a = a0 + (i / n) * TAU; spawnProj({ kind: 'bullet', owner: 'e', x: e.x, y: e.y - 12, vx: Math.cos(a) * 68, vy: Math.sin(a) * 68, life: 4, dmg: 2, r: 3, glow: 12, ghost: true }); } Snd.play('shoot'); e.reps--; e.stT = 0.5; if (e.reps <= 0) { e.st = 'idle'; e.stT = e.phase === 2 ? 1.6 : 1.1; } } break;
        case 'spiral': e.spin += dt * 3.2; e.emitT = (e.emitT || 0) - dt; if (e.emitT <= 0) { e.emitT = 0.13; for (const k of [0, Math.PI]) { const a = e.spin + k; spawnProj({ kind: 'bullet', owner: 'e', x: e.x, y: e.y - 12, vx: Math.cos(a) * 72, vy: Math.sin(a) * 72, life: 4, dmg: 2, r: 3, glow: 12, ghost: true }); } } if (e.stT <= 0) { e.st = 'idle'; e.stT = 1.3; } break;
        case 'aim': if (e.stT <= 0) { const a = Math.atan2(p.y - 5 - e.y + 12, p.x - e.x); for (const o of [-0.18, 0, 0.18]) spawnProj({ kind: 'bullet', owner: 'e', x: e.x, y: e.y - 12, vx: Math.cos(a + o) * 115, vy: Math.sin(a + o) * 115, life: 3, dmg: 2, r: 3, glow: 12, ghost: true }); Snd.play('shoot'); e.reps--; e.stT = 0.35; if (e.reps <= 0) { e.st = 'idle'; e.stT = 1.0; } } break;
        case 'blinkTell': if (e.stT <= 0) { burst(e.x, e.y - 10, 14, ['#ffd166', '#c8443c'], 60, 0.5, 1); e.x = e.bx; e.y = e.by; burst(e.x, e.y - 10, 14, ['#ffd166', '#c8443c'], 60, 0.5, 1); e.st = 'idle'; e.stT = 0.5; } break;
      }
      if (e.phase === 2) BOSS.zhu.summons(e, dt, p);
    } else BOSS.zhu.dark(e, dt, p);
  },
  pick(e, p) {
    const r = Math.random();
    if (r < 0.35) { e.st = 'ring'; e.reps = e.phase === 2 ? 2 : 3; e.stT = 0.6; tele({ type: 'circle', x: e.x, y: e.y, r: 20, dur: 0.6 }); }
    else if (r < 0.6) { e.st = 'spiral'; e.stT = 2.4; }
    else if (r < 0.85) { e.st = 'aim'; e.reps = 3; e.stT = 0.5; }
    else { e.st = 'blinkTell'; e.stT = 0.5; const R = G.room; e.bx = clamp(p.x + rand(-100, 100), 40, R.w * TS - 40); e.by = clamp(p.y + rand(-70, 70), 40, R.h * TS - 50); tele({ type: 'circle', x: e.bx, y: e.by, r: 16, dur: 0.5 }); }
  },
  // 二阶段：轮流召唤前面三个 Boss 的影子各出一招
  summons(e, dt, p) {
    e.sumT = (e.sumT || 3) - dt;
    if (e.sumT > 0 || G.room.ents.some((q) => q.k === 'bshadow' && !q.dead)) return;
    e.sumT = 5.5;
    const kind = ['ke', 'carp', 'kiln'][e.summonI++ % 3];
    const R = G.room, x = clamp(p.x + rand(-80, 80), 40, R.w * TS - 40), y = clamp(p.y + rand(-60, 60), 40, R.h * TS - 40);
    addEnt(R, 'bshadow', x, y, { kind, st: 'appear', stT: 0.6 });
  },
  dark(e, dt, p) {
    // 三阶段：全黑，他在暗处闪一下火光再突袭
    const R = G.room;
    e.spark = Math.max(0, (e.spark || 0) - dt);
    switch (e.st) {
      case 'hide': if (e.stT <= 0) { const a = Math.random() * TAU; e.x = clamp(p.x + Math.cos(a) * 72, 30, R.w * TS - 30); e.y = clamp(p.y + Math.sin(a) * 56, 30, R.h * TS - 30); e.st = 'sparkTell'; e.stT = 0.7; e.spark = 0.7; tele({ type: 'spark', x: e.x, y: e.y - 14, dur: 0.7 }); Snd.play('warn'); } break;
      case 'sparkTell': if (e.stT <= 0) { const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; e.st = 'strike'; e.stT = 0.32; e.atkHit = false; Snd.play('dash'); } break;
      case 'strike': moveBox(e, e.ldx * 340 * dt, e.ldy * 340 * dt, true, false); e.atk = { x: e.x, y: e.y - 6, r: 10, dmg: 3 }; if (Math.random() < 0.8) part(e.x, e.y - 8, 0, 0, 0.3, '#ff8a3c', 1); if (e.stT <= 0) { e.st = 'tired'; e.stT = 1.2; } break;
      case 'tired': if (e.stT <= 0) { e.st = 'hide'; e.stT = rand(0.6, 1.2); } break;
      case 'stun': if (e.stT <= 0) { e.st = 'hide'; e.stT = 0.5; } break;
      default: e.st = 'hide'; e.stT = 1;
    }
  },
  onHurt(e) {
    if (e.phase === 2 && e.hp <= e.maxHp / 3) {
      e.phase = 3; G.bossFight.phase = 3; G.bossFight.dark = true;
      bossLine('看不见了吧？在黑里，要找的不是我——是光。（看火光！）');
      for (const q of G.room.ents) { if (q.k === 'braz') q.lit = false; if (q.k === 'bshadow') q.dead = true; }
      G.projs = G.projs.filter((q) => q.owner === 'p');
      e.st = 'hide'; e.stT = 1.5;
    }
  },
  canHurt(e) { return e.phase < 3 || e.st === 'tired' || e.st === 'stun' || e.st === 'strike' || e.st === 'sparkTell'; },
  phase2(e) { bossLine('这些影子……都是被它吃掉的人。'); e.sumT = 1; },
  onBurst(e) { if (e.phase === 3) { e.st = 'stun'; e.stT = 1.6; e.spark = 1.6; ftext(e.x, e.y - 30, '照到了！', '#fff1b0'); } },
  draw(e, ox, oy) {
    const A = ART.boss.zhu, side = e.dir > 0 ? 'R' : 'L';
    if (e.phase === 3) {
      if (e.st === 'hide') return;
      const vis = e.st === 'tired' || e.st === 'stun' ? 0.75 : e.st === 'strike' ? 0.9 : 0.25;
      bossSprite(A.dark[side][0], e, ox, oy, 24, 28, 6, vis);
      return;
    }
    drawShadow(e.x - ox, e.y + 6 - oy, 8, 0.5);
    bossSprite(e.st === 'ring' || e.st === 'aim' || e.st === 'spiral' ? A.cast[side][0] : A.idle[side][Math.floor(G.t * 3) % 2], e, ox, oy, 24, 28, 6);
  },
  light(e) { return e.phase < 3 ? { x: e.x + 4, y: e.y - 16, r: 52, warm: 1, env: false } : null; },
};
// 师父二阶段召唤出来的 Boss 影子：各出一招就散
EK.bshadow = {
  update(e, dt) {
    if (e.dead || G.script) return;
    const p = G.P; e.stT -= dt;
    if (e.st === 'appear') { if (e.stT <= 0) { e.st = 'act'; e.stT = 0;
      if (e.kind === 'ke') { e.dashes = 3; e.sub = 'tell'; e.subT = 0.6; }
      else if (e.kind === 'carp') { e.sub = 'rise'; e.subT = 0.9; e.tx = p.x; e.ty = p.y; tele({ type: 'circle', x: p.x, y: p.y, r: 34, dur: 0.9 }); }
      else { e.sub = 'pound'; e.subT = 0.9; tele({ type: 'circle', x: e.x, y: e.y, r: 72, dur: 0.9 }); }
    } return; }
    e.subT -= dt;
    if (e.kind === 'ke') {
      if (e.sub === 'tell' && e.subT <= 0) { e.sub = 'dash'; e.subT = 0.22; e.atkHit = false; }
      else if (e.sub === 'tell' && e.subT > 0 && !e.lined) { const dd = dist(e.x, e.y, p.x, p.y) || 1; e.ldx = (p.x - e.x) / dd; e.ldy = (p.y - e.y) / dd; tele({ type: 'line', x: e.x, y: e.y - 4, ang: Math.atan2(e.ldy, e.ldx), len: 80, w: 12, dur: e.subT }); e.lined = true; }
      else if (e.sub === 'dash') { moveBox(e, e.ldx * 330 * dt, e.ldy * 330 * dt, true, false); if (!e.atkHit && dist(p.x, p.y - 4, e.x, e.y - 6) < 13) { if (hurtPlayer(3, e.x, e.y, { shadow: true })) e.atkHit = true; } if (e.subT <= 0) { e.dashes--; e.lined = false; if (e.dashes > 0) { e.sub = 'tell'; e.subT = 0.35; } else e.dead = true; } }
    } else if (e.kind === 'carp') {
      if (e.sub === 'rise' && e.subT <= 0) { e.x = e.tx; e.y = e.ty; e.sub = 'slam'; e.subT = 0.5; Snd.play('slam'); shake(0.4); spawnProj({ kind: 'ring', owner: 'e', x: e.x, y: e.y, r0: 10, r1: 70, rr: 10, life: 0.55, dmg: 3, shadow: true }); if (dist(p.x, p.y, e.x, e.y) < 24) hurtPlayer(3, e.x, e.y, { shadow: true }); }
      else if (e.sub === 'slam' && e.subT <= 0) e.dead = true;
    } else {
      if (e.sub === 'pound' && e.subT <= 0) { Snd.play('slam'); shake(0.4); spawnProj({ kind: 'ring', owner: 'e', x: e.x, y: e.y, r0: 12, r1: 80, rr: 12, life: 0.6, dmg: 3, col: 'rgba(255,150,80,0.9)' }); e.sub = 'end'; e.subT = 0.6; }
      else if (e.sub === 'end' && e.subT <= 0) e.dead = true;
    }
    if (e.dead) burst(e.x, e.y - 10, 16, ['#2a2140', '#463a62'], 50, 0.7, 1, -20);
  },
  draw(e, ox, oy) {
    ctx.globalAlpha = e.st === 'appear' ? 1 - e.stT / 0.6 * 0.8 : 0.85;
    let im, w, h;
    if (e.kind === 'ke') { im = solid(ART.boss.ke.idle.R[0], '#2a2140'); w = 24; h = 24; }
    else if (e.kind === 'carp') { if (e.sub === 'rise') { ctx.globalAlpha = 1; return; } im = solid(ART.boss.carp.idle.R[0], '#2a2140'); w = 40; h = 28; }
    else { im = solid(ART.boss.kiln.body[0], '#2a2140'); w = 48; h = 48; }
    ctx.drawImage(im, Math.round(e.x - w / 2 - ox), Math.round(e.y - h + 6 - oy));
    ctx.globalAlpha = 1;
  },
  sortY(e) { return e.y + 6; },
};
// ------------------- 长夜（隐藏 Boss）：只有被光照着时才怕痛；师父在旁边帮你点火盆 -------------------
BOSS.night = {
  init(e, R) {
    e.hw = 20; e.hh = 8; e.rad = 22; e.st = 'drift'; e.stT = 2; e.tx = e.x; e.ty = e.y; e.vulnT = 0;
    for (const q of R.ents) if (q.k === 'braz') q.lit = false;
    e.ally = addEnt(R, 'npc', R.w * TS / 2, R.h * TS - 60, { id: 'zhu', ally: true, cd: 0.6, shot: 2.5 });
  },
  // 被照亮：在亮着的火盆旁边，或者刚被光爆 / 师父的光弹照到
  lit(e) { return e.vulnT > 0 || !!BOSS.night.litBraz(e, CFG.light.brazier * 1.1); },
  litBraz(e, r) { let best = null, bd = r; for (const q of G.room.ents) if (q.k === 'braz' && q.lit && !q.dead) { const d = dist(q.x, q.y, e.x, e.y); if (d < bd) { bd = d; best = q; } } return best; },
  update(e, dt, p) {
    e.stT -= dt; e.vulnT -= dt;
    const R = G.room, fast = e.phase === 2 ? 1.25 : 1;
    if (e.st === 'devour') {
      // 吞光：趴在火盆上不动，几秒后把它吹灭。这段时间它一直被火光照着
      const b = e.prey;
      if (!b || !b.lit) { e.st = 'drift'; e.stT = 1.2; e.prey = null; }
      else {
        chase(e, dt, b.x, b.y + 4, 10);
        if (Math.random() < 0.6) { const a = Math.random() * TAU; part(b.x + Math.cos(a) * 14, b.y - 8 + Math.sin(a) * 10, (e.x - b.x) * 0.9, (e.y - 14 - b.y) * 0.9, 0.5, Math.random() < 0.5 ? '#ffd166' : '#2a2140', 1); }
        if (e.stT <= 0) { b.lit = false; burst(b.x, b.y - 8, 14, ['#2a2140', '#463a62'], 50, 0.7, 1); Snd.play('phase'); e.st = 'drift'; e.stT = 1.0 / fast; e.prey = null; }
      }
    } else {
      // 它想要光：有亮着的火盆，就慢慢飘过去吞掉
      const prey = BOSS.night.litBraz(e, 1e9);
      if (prey) {
        chase(e, dt, prey.x, prey.y + 4, 30 * fast);
        if (dist(e.x, e.y, prey.x, prey.y) < 40 && !e.tent) {
          e.st = 'devour'; e.stT = e.phase === 2 ? 4.5 : 5.5; e.prey = prey;
          ftext(prey.x, prey.y - 28, '它在吞光！趁现在打！', '#fff1b0'); Snd.play('warn');
        }
      } else {
        if (dist(e.x, e.y, e.tx, e.ty) < 8 || !e.retarget || e.retarget < G.t) { e.tx = clamp(p.x + rand(-110, 110), 60, R.w * TS - 60); e.ty = clamp(p.y + rand(-70, 50), 56, R.h * TS - 70); e.retarget = G.t + 3; }
        chase(e, dt, e.tx, e.ty, 26 * fast);
      }
      if (e.stT <= 0 && e.st !== 'devour') {
        if (Math.random() < 0.5) { // 伸出触手
          const ang = Math.atan2(p.y - e.y, p.x - e.x) + rand(-0.25, 0.25), sx = e.x, sy = e.y - 10;
          tele({ type: 'line', x: sx, y: sy, ang, len: 260, w: 14, dur: 0.9 / fast });
          e.tent = { ang, sx, sy, t: 0.9 / fast };
          e.stT = 2.2 / fast;
        } else { // 追踪的黑球（能用挥击打掉）
          const n = e.phase === 2 ? 4 : 3;
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; spawnProj({ kind: 'orb', owner: 'e', x: e.x + Math.cos(a) * 20, y: e.y - 10 + Math.sin(a) * 14, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 5, dmg: 3, r: 4, home: 1.5, ghost: true, shadow: true }); }
          Snd.play('shoot'); e.stT = 2.6 / fast;
        }
      }
    }
    if (e.tent) {
      e.tent.t -= dt;
      if (e.tent.t <= 0) {
        const T = e.tent, dx = Math.cos(T.ang), dy = Math.sin(T.ang);
        const px = p.x - T.sx, py = p.y - 4 - T.sy, along = px * dx + py * dy, perp = Math.abs(-px * dy + py * dx);
        if (along > 0 && along < 260 && perp < 10) hurtPlayer(4, T.sx, T.sy, { shadow: true });
        for (let i = 0; i < 30; i++) part(T.sx + dx * i * 9, T.sy + dy * i * 9, rand(-10, 10), rand(-10, 10), 0.5, '#2a2140', 2);
        Snd.play('slam'); shake(0.3); e.tent = null;
      }
    }
    if (dist(p.x, p.y, e.x, e.y) < 22 && e.st !== 'devour') e.atk = { x: e.x, y: e.y - 8, r: 16, dmg: 3 };
    // 师父：一直帮你点火盆（先点离你近的），隔一会儿朝长夜打一发光弹
    const al = e.ally;
    if (al && !al.dead) {
      if (al.target && !al.walkTo) { igniteBrazier(al.target, true); al.target = null; al.cd = 2.2; } // 先点火，再挑下一个
      al.cd -= dt;
      if (!al.target && al.cd <= 0) {
        let b = null, bd = 1e9;
        for (const q of R.ents) if (q.k === 'braz' && !q.lit && q !== (e.prey || null)) { const d = dist(q.x, q.y, p.x, p.y); if (d < bd) { bd = d; b = q; } }
        if (b) { al.walkTo = [b.x, b.y + 14]; al.target = b; al.walkSpeed = 90; }
      }
      if (al.target && al.target.lit) { al.target = null; al.walkTo = null; al.cd = 0.3; } // 你自己点亮了，换下一个
      al.shot -= dt;
      if (al.shot <= 0) { al.shot = 3; const a = Math.atan2(e.y - 10 - al.y, e.x - al.x); spawnProj({ kind: 'light', owner: 'p', x: al.x, y: al.y - 10, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 3, dmg: 0, r: 3, glow: 16, ghost: true, allyShot: true }); }
    }
    // 师父的光弹打中长夜：让它在光里待一会儿
    for (const pr of G.projs) if (pr.allyShot && !pr.dead && dist(pr.x, pr.y, e.x, e.y - 10) < 22) { pr.dead = true; e.vulnT = Math.max(e.vulnT, 2.5); burst(pr.x, pr.y, 10, ['#fff1b0', '#ffd166'], 60, 0.5, 1); EK.boss.hurt(e, 2, { src: 'ally' }); }
  },
  dmgMul(e, o) { return o.src === 'ally' ? 1 : BOSS.night.lit(e) ? 1 : 0.34; },
  onHurt(e) { if (!BOSS.night.lit(e) && (!e.hintT || e.hintT < G.t)) { e.hintT = G.t + 2.5; ftext(e.x, e.y - 46, '没被照亮，只吃三分之一伤害', '#a69cb8'); } },
  onBurst(e) { e.vulnT = Math.max(e.vulnT, 5); ftext(e.x, e.y - 46, '照亮了！', '#fff1b0'); },
  phase2(e) { bossLine('……光……不……够……'); G.bossFight.extraDark = 0.04; },
  hud(e, x, y, w) {
    if (BOSS.night.lit(e)) {
      txt('被照亮', x - 3, y + 4.5, 7, '#fff1b0', 'right', true);
      const t = e.st === 'devour' ? e.stT / (e.phase === 2 ? 4.5 : 5.5) : e.vulnT > 0 ? e.vulnT / 5 : 1;
      ctx.fillStyle = '#120e1a'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
      ctx.fillStyle = '#ffd166'; ctx.fillRect(x, y, Math.round(w * clamp(t, 0, 1)), 3);
      txt('全伤害', x + w + 3, y + 4.5, 7, '#ffd166', 'left');
    } else { txt('在暗处', x - 3, y + 4.5, 7, '#8c86a0', 'right', true); txt('伤害只有 1/3 —— 光爆，或者等它去吞火盆', x, y + 4.5, 7, '#8c86a0', 'left'); }
  },
  draw(e, ox, oy) {
    const f = Math.floor(G.t * 3) % 2, lit = BOSS.night.lit(e), im = ART.boss.night[f];
    const bx = Math.round(e.x - 32 - ox), by = Math.round(e.y - 44 - oy + Math.sin(G.t * 2) * 2);
    ctx.globalAlpha = lit ? 1 : 0.75;
    ctx.drawImage(e.flash > 0 ? solid(im, '#fff') : im, bx, by);
    ctx.globalAlpha = 1;
    e.drawAt = [bx + ox, by + oy];
  },
  // 被照亮时的金色轮廓：画在黑罩上面，再黑也看得清
  emissive(e, ox, oy) {
    if (!e.drawAt || !BOSS.night.lit(e)) return;
    const f = Math.floor(G.t * 3) % 2, ol = rimImage(ART.boss.night[f], '#ffe9a0');
    ctx.globalAlpha = 0.75 + Math.sin(G.t * 8) * 0.2;
    ctx.drawImage(ol, Math.round(e.drawAt[0] - ox) - 2, Math.round(e.drawAt[1] - oy) - 2);
    ctx.globalAlpha = 1;
  },
  light(e) { return BOSS.night.lit(e) ? { x: e.x, y: e.y - 16, r: 46, warm: 1, env: false } : null; },
  cleanup(R) { for (const q of R.ents) if (q.k === 'npc' && q.ally) q.dead = true; },
};
// 只有外轮廓的图（给“被照亮”用），按原图缓存
const RIM_CACHE = new Map();
function rimImage(im, col) {
  const key = im; let c = RIM_CACHE.get(key);
  if (c) return c;
  const w = im.width + 4, h = im.height + 4, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'), sil = solid(im, col);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && (dx || dy)) x.drawImage(sil, 2 + dx, 2 + dy);
  x.globalCompositeOperation = 'destination-out'; x.drawImage(im, 2, 2);
  RIM_CACHE.set(key, cv);
  return cv;
}

// 暗处发光的眼睛：画在黑罩上面，影子在黑里也看得见
function drawEmissive(ox, oy) {
  const eye = (x, y, col, w = 1) => { const sx = Math.round(x - ox), sy = Math.round(y - oy); ctx.fillStyle = col; ctx.fillRect(sx, sy, w, 1); ctx.globalAlpha = 0.25; ctx.fillRect(sx - 1, sy - 1, w + 2, 3); ctx.globalAlpha = 1; };
  for (const e of G.room.ents) {
    if (e.dead) continue;
    if (e.k === 'enemy') {
      const d = e.dir, fy = e.D.fly ? Math.sin(G.t * 3 + e.hx) * 2 : 0, tell = e.st === 'tell' || e.st === 'lunge';
      const col = tell ? '#ff5a4f' : '#ffe27a';
      if (e.kind === 'shade') { const cy = e.st === 'tell' ? -1 : -3; eye(e.x + d * 1 - (d < 0 ? 1 : 0), e.y + cy, col); eye(e.x + d * 3 - (d < 0 ? 1 : 0), e.y + cy, col); }
      else if (e.kind === 'hound') eye(e.x + d * 5 - (d < 0 ? 1 : 0), e.y - 3, '#ff5a4f');
      else if (e.kind === 'elite') { eye(e.x + d * 1, e.y - 12, '#ff5a4f'); eye(e.x + d * 3, e.y - 12, '#ff5a4f'); }
      else if (e.kind === 'ghost') eye(e.x + d * 1, e.y - 3 + fy, '#8fe6ff');
      else if (e.kind === 'lamp') eye(e.x, e.y - 3 + fy, '#8fe6ff', 2);
      else if (e.kind === 'lizard') eye(e.x + d * 5, e.y - 1, '#ffd166');
      else if (e.kind === 'clay') { eye(e.x + d * 1, e.y - 6, '#ffb36a'); }
      else if (e.kind === 'smoke') { eye(e.x, e.y - 3, '#d6cfe0'); eye(e.x + 3, e.y - 3, '#d6cfe0'); }
      else if (e.kind === 'frog' && e.st !== 'jump') eye(e.x + d * 3, e.y - 5, '#e4f8fc');
    } else if (e.k === 'boss' || e.k === 'clone') {
      if (e.k === 'boss' && e.kind === 'ke' || e.k === 'clone') eye(e.x + e.dir * 2, e.y - 7, e.k === 'clone' ? '#d6cfe0' : '#ffe27a', 3);
      if (e.k === 'boss' && BOSS[e.kind].emissive) BOSS[e.kind].emissive(e, ox, oy);
      if (e.k === 'boss' && e.kind === 'night') { for (let i = 0; i < 5; i++) eye(e.x - 16 + i * 8, e.y - 26 + Math.sin(G.t * 2 + i) * 3, '#ff5a4f', 2); }
      if (e.k === 'boss' && e.kind === 'zhu' && e.phase === 3 && (e.st === 'tired' || e.st === 'stun')) eye(e.x + 3, e.y - 14, '#ffd166', 2);
    } else if (e.k === 'npc' && e.id === 'qiS') { eye(e.x + 1, e.y - 4, '#ffe27a'); eye(e.x + 3, e.y - 4, '#ffe27a'); }
  }
}
