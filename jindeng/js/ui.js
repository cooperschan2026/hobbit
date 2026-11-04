'use strict';
// =====================================================================
// 界面：HUD、对话框与剧情脚本、菜单（暂停/灯塔/传送/商店/调试）、标题、结局
// 文字直接按设备分辨率绘制，所以中文在像素画面上也清晰
// =====================================================================
function txt(s, x, y, size = 8, col = '#f4efe6', align = 'left', bold = false, base = 'alphabetic') {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function txtO(s, x, y, size, col, align = 'left', bold = true, oc = '#120e1a') {
  ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = oc; for (const [dx, dy] of [[-0.6, 0], [0.6, 0], [0, -0.6], [0, 0.6]]) ctx.fillText(s, x + dx, y + dy);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
// 中文按宽度折行
function wrap(s, w, size) {
  ctx.font = `${size}px ${FONT}`;
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const ch of para) { const t = line + ch; if (line && ctx.measureText(t).width > w && !'，。、！？；：）”…'.includes(ch)) { out.push(line); line = ch; } else line = t; }
    out.push(line);
  }
  return out;
}
// 像素风面板
function panel(x, y, w, h, fill = 'rgba(18,14,26,0.92)', edge = '#544a6b') {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = edge; ctx.fillRect(x + 1, y, w - 2, 1); ctx.fillRect(x + 1, y + h - 1, w - 2, 1); ctx.fillRect(x, y + 1, 1, h - 2); ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
}
const inBox = (x, y, w, h) => IN.mx >= x && IN.mx <= x + w && IN.my >= y && IN.my <= y + h;
// 可点击按钮（本帧画，本帧判定点击）
function btn(label, x, y, w, h, opt = {}) {
  const hot = !opt.disabled && (inBox(x, y, w, h) || opt.sel);
  panel(x, y, w, h, opt.disabled ? 'rgba(30,26,40,0.7)' : hot ? 'rgba(90,70,40,0.95)' : 'rgba(28,24,40,0.95)', hot ? '#e7b53d' : '#544a6b');
  txt(label, x + w / 2, y + h / 2 + 0.5, opt.size || 8, opt.disabled ? '#6b6080' : hot ? '#fff1b0' : '#e6dff0', 'center', false, 'middle');
  const clicked = !opt.disabled && IN.lhit && inBox(x, y, w, h);
  if (clicked) { Snd.play('select'); IN.lhit = false; }
  return clicked;
}

// =====================================================================
// 剧情脚本解释器
// =====================================================================
G.scriptQ = [];
function runScript(src, cont) {
  const cmds = typeof src === 'string' ? STORY[src] : src;
  if (!cmds) { console.warn('没有这段剧情', src); return; }
  if (G.script) { G.scriptQ.push({ cmds, room: G.room && G.room.id }); return; }
  if (!cont) dropHints(); // 对话开始：之前排着的提示都过期了
  G.script = { cmds, pc: 0, wait: 0, chain: null, block: null };
  stepScript();
}
function endScript() {
  const chain = G.script && G.script.chain;
  G.script = null; G.ui.dlg = null; G.barsTo = 0;
  if (chain) { runScript(chain, true); return; }
  // 排队的剧情只在原来的房间里放
  G.scriptQ = G.scriptQ.filter((q) => !G.room || q.room === G.room.id);
  if (G.scriptQ.length) runScript(G.scriptQ.shift().cmds, true);
}
function labelAt(cmds, name) { return cmds.findIndex((c) => c[0] === 'label' && c[1] === name); }
function speakerName(who) {
  if (who.startsWith('villager:')) return who.slice(9);
  const s = SPEAKERS[who]; if (!s) return who;
  return typeof s.name === 'function' ? s.name() : s.name;
}
function stepScript() {
  const sc = G.script;
  while (sc && G.script === sc) {
    if (sc.pc >= sc.cmds.length) { endScript(); return; }
    const c = sc.cmds[sc.pc++], op = c[0];
    switch (op) {
      case 'say': G.ui.dlg = { who: c[1], expr: c[2], text: c[3], shown: 0, t: 0 }; sc.block = 'dlg'; return;
      case 'narr': G.ui.dlg = { who: null, text: c[1], shown: 0, t: 0 }; sc.block = 'dlg'; return;
      case 'ask': {
        const opts = c[1].filter((o) => cond(o[2]));
        if (!G.ui.dlg) G.ui.dlg = { who: 'jin', expr: 'n', text: '……', shown: 99, t: 0 };
        G.ui.dlg.shown = 999; G.ui.dlg.choices = opts; G.ui.dlg.sel = 0; G.ui.dlg.armT = 0.25; sc.block = 'ask'; return;
      }
      case 'label': break;
      case 'goto': sc.pc = labelAt(sc.cmds, c[1]) + 1; break;
      case 'if': if (cond(c[1])) sc.pc = labelAt(sc.cmds, c[2]) + 1; break;
      case 'end': endScript(); return;
      case 'set': G.S.flags[c[1]] = c.length > 2 ? c[2] : true; break;
      case 'give': giveItem(c[1], c[2] || 1); break;
      case 'take': G.S.items[c[1]] = Math.max(0, (G.S.items[c[1]] | 0) - (c[2] || 1)); break;
      case 'oil': G.S.oil = clamp(G.S.oil + c[1], 0, G.S.oilMax); break;
      case 'bars': G.barsTo = c[1] ? 1 : 0; break;
      case 'wait': sc.wait = c[1]; sc.block = 'wait'; return;
      case 'sfx': Snd.play(c[1]); break;
      case 'music': Snd.music(c[1]); break;
      case 'hint': hint(c[1]); break;
      case 'letter': G.ui.letter = { n: c[1], t: 0 }; sc.block = 'letter'; Snd.play('chest'); return;
      case 'call': { const f = HOOK[c[1]]; if (f) f(...c.slice(2)); break; }
      case 'boss': endScript(); startBoss(c[1]); return;
      case 'ending': G.script = null; G.ui.dlg = null; startEnding(c[1]); return;
      case 'shop': endScript(); openMenu('shop'); return;
    }
  }
}
function advanceKey() { return keyHit('KeyE', 'Space', 'Enter', 'NumpadEnter') || IN.lhit; }
function updateScript(dt) {
  const sc = G.script;
  if (!sc) return;
  if (sc.block === 'wait') { sc.wait -= dt; if (sc.wait <= 0) { sc.block = null; stepScript(); } return; }
  if (sc.block === 'letter') { G.ui.letter.t += dt; if (G.ui.letter.t > 0.4 && advanceKey()) { G.ui.letter = null; sc.block = null; stepScript(); } return; }
  const d = G.ui.dlg;
  if (!d) return;
  if (sc.block === 'dlg') {
    const speed = 38 * G.set.textSpeed;
    if (d.shown < d.text.length) {
      const before = Math.floor(d.shown);
      d.shown = Math.min(d.text.length, d.shown + speed * dt);
      if (Math.floor(d.shown) !== before && before % 2 === 0) { const s = d.who && (d.who.startsWith('villager') ? 640 : SPEAKERS[d.who] && SPEAKERS[d.who].blip); Snd.play('blip', s || 500); }
      if (advanceKey()) d.shown = d.text.length;
    } else if (advanceKey()) { sc.block = null; stepScript(); }
  } else if (sc.block === 'ask') {
    d.armT -= dt;
    const n = d.choices.length;
    if (keyHit('KeyW', 'ArrowUp')) { d.sel = (d.sel + n - 1) % n; Snd.play('menu'); }
    if (keyHit('KeyS', 'ArrowDown')) { d.sel = (d.sel + 1) % n; Snd.play('menu'); }
    for (let i = 0; i < Math.min(4, n); i++) if (keyHit('Digit' + (i + 1))) { d.sel = i; pickChoice(i); return; }
    if (d.armT <= 0 && (keyHit('KeyE', 'Space', 'Enter'))) { pickChoice(d.sel); return; }
    const L = choiceLayout(d);
    L.forEach((b, i) => { if (inBox(b.x, b.y, b.w, b.h)) { if (d.sel !== i && IN.moved) d.sel = i; if (IN.lhit && d.armT <= 0) { IN.lhit = false; pickChoice(i); } } });
  }
}
function pickChoice(i) {
  const d = G.ui.dlg, sc = G.script, ch = d.choices[i];
  Snd.play('select');
  d.choices = null;
  sc.pc = labelAt(sc.cmds, ch[1]) + 1; sc.block = null;
  G.ui.dlg = null;
  stepScript();
}
function choiceLayout(d) {
  const n = d.choices.length, w = 200, h = 15, x = VW - w - 12, y0 = VH - 84 - n * (h + 3);
  return d.choices.map((c, i) => ({ x, y: y0 + i * (h + 3), w, h }));
}
function drawDialog() {
  const d = G.ui.dlg;
  if (!d) return;
  const x = 10, y = VH - 72, w = VW - 20, h = 64;
  panel(x, y, w, h, 'rgba(14,11,22,0.94)', '#7a7090');
  let tx = x + 10;
  if (d.who) {
    const sp = d.who.startsWith('villager') ? { por: 'cun' } : SPEAKERS[d.who] || { por: 'cun' };
    const por = ART.por[sp.por] && (ART.por[sp.por][d.expr] || ART.por[sp.por].n);
    panel(x + 6, y + 6, 52, 52, 'rgba(40,32,56,0.95)', '#544a6b');
    if (por) ctx.drawImage(por, x + 8, y + 8, 48, 48);
    tx = x + 66;
    txtO(speakerName(d.who), tx, y + 14, 9, d.who === 'jin' ? '#ffd166' : '#bfe9ff', 'left', true);
  }
  const shown = d.text.slice(0, Math.floor(d.shown));
  const lines = wrap(shown, w - (tx - x) - 12, 9);
  lines.forEach((l, i) => txt(l, tx, y + (d.who ? 28 : 20) + i * 13, 9, d.who ? '#f4efe6' : '#d6cfe0'));
  if (!d.choices && d.shown >= d.text.length && Math.sin(G.rt * 6) > 0) { ctx.fillStyle = '#ffd166'; ctx.fillRect(x + w - 14, y + h - 10, 5, 3); ctx.fillRect(x + w - 13, y + h - 7, 3, 1); }
  if (d.choices) {
    choiceLayout(d).forEach((b, i) => {
      const hot = i === d.sel;
      panel(b.x, b.y, b.w, b.h, hot ? 'rgba(90,70,40,0.96)' : 'rgba(22,18,32,0.95)', hot ? '#e7b53d' : '#544a6b');
      txt(`${i + 1}. ${d.choices[i][0]}`, b.x + 8, b.y + b.h / 2 + 0.5, 8.5, hot ? '#fff1b0' : '#e6dff0', 'left', false, 'middle');
    });
  }
}
function drawLetter() {
  const L = G.ui.letter;
  if (!L) return;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VW, VH);
  const w = 260, h = 170, x = (VW - w) / 2, y = (VH - h) / 2 - 10;
  ctx.fillStyle = '#e8d9b5'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#c3ab80'; ctx.fillRect(x, y + h - 3, w, 3); ctx.fillRect(x + w - 3, y, 3, h);
  for (let i = 0; i < 8; i++) { ctx.fillStyle = 'rgba(150,120,80,0.15)'; ctx.fillRect(x + 10, y + 26 + i * 16, w - 20, 1); }
  txt(L.n === 3 ? '补全的信' : `师父的信 · 第 ${L.n} 页`, x + w / 2, y + 16, 9, '#7a4e33', 'center', true);
  wrap(LETTERS[L.n], w - 30, 9).forEach((l, i) => txt(l, x + 15, y + 36 + i * 14, 9, '#3a2418'));
  if (L.t > 0.4) txt('点击继续', x + w - 8, y + h - 8, 7, '#7a4e33', 'right');
}

// =====================================================================
// 菜单
// =====================================================================
function openMenu(type, data = {}) { G.ui.menu = Object.assign({ type, t: 0, sel: 0, tab: 0 }, data); Snd.play('menu'); }
function closeMenu() { G.ui.menu = null; Snd.play('menu'); }
const TABS = ['装备', '物品', '地图', '任务', '设置'];
function updateMenu(dt) {
  const m = G.ui.menu;
  if (!m) return;
  m.t += dt;
  if (keyHit('Escape') && m.t > 0.1) { if (m.type === 'teleport') openMenu('lighthouse', { lh: m.lh }); else closeMenu(); return; }
  if (m.type === 'pause') { if (keyHit('KeyQ', 'ArrowLeft')) { m.tab = (m.tab + 4) % 5; Snd.play('menu'); } if (keyHit('KeyE', 'ArrowRight', 'Tab')) { m.tab = (m.tab + 1) % 5; Snd.play('menu'); } }
}
function drawMenu() {
  const m = G.ui.menu;
  if (!m) return;
  ctx.fillStyle = 'rgba(6,4,12,0.72)'; ctx.fillRect(0, 0, VW, VH);
  if (m.type === 'pause') drawPause(m);
  else if (m.type === 'lighthouse') drawLighthouseMenu(m);
  else if (m.type === 'teleport') drawTeleport(m);
  else if (m.type === 'shop') drawShop(m);
  else if (m.type === 'debug') drawDebugMenu(m);
  else if (m.type === 'settings') { panel(90, 30, 300, 210); txtO('设置', VW / 2, 50, 12, '#ffd166', 'center'); drawSettings(110, 64, 260); if (btn('返回', VW / 2 - 40, 210, 80, 18)) closeMenu(); }
}
function drawPause(m) {
  const x = 20, y = 14, w = VW - 40, h = VH - 28;
  panel(x, y, w, h, 'rgba(16,13,24,0.96)', '#7a7090');
  TABS.forEach((t, i) => { if (btn(t, x + 10 + i * 62, y + 8, 58, 17, { sel: m.tab === i })) m.tab = i; });
  txt('Q / E 切换分页，Esc 返回游戏', x + w - 10, y + 20, 7, '#7a7090', 'right');
  const cx = x + 12, cy = y + 34, cw = w - 24;
  [drawEquipTab, drawItemTab, drawMapTab, drawQuestTab, () => drawSettings(cx + 30, cy + 6, cw - 60, true)][m.tab](cx, cy, cw, m);
}
function drawEquipTab(x, y, w) {
  const S = G.S;
  for (const [si, slot, title] of [[0, 'shade', '灯罩（改变攻击方式）'], [1, 'charm', '护符（被动效果）']]) {
    const bx = x + si * (w / 2), bw = w / 2 - 8;
    txtO(title, bx, y + 10, 9, '#ffd166');
    const owned = Object.keys(DATA.items).filter((k) => DATA.items[k].slot === slot && (S.items[k] | 0) > 0);
    if (!owned.length) txt('还没有。', bx, y + 28, 8, '#7a7090');
    owned.forEach((k, i) => {
      const yy = y + 18 + i * 22, eq = S.equip[slot] === k;
      const hot = inBox(bx, yy, bw, 20);
      panel(bx, yy, bw, 20, eq ? 'rgba(90,70,40,0.9)' : hot ? 'rgba(50,42,70,0.9)' : 'rgba(26,22,36,0.9)', eq ? '#e7b53d' : '#544a6b');
      const ic = ART.icon[k]; if (ic) ctx.drawImage(ic, bx + 4, yy + 4);
      txt(DATA.items[k].name + (eq ? '（装备中）' : ''), bx + 20, yy + 9, 8, eq ? '#fff1b0' : '#e6dff0', 'left', true, 'middle');
      txt(DATA.items[k].desc, bx + 20, yy + 16, 6.5, '#a69cb8', 'left', false, 'middle');
      if (hot && IN.lhit) { IN.lhit = false; if (slot === 'charm' && eq) S.equip.charm = null; else S.equip[slot] = k; Snd.play('select'); }
    });
  }
  txt('点击切换装备。护符再点一次可以卸下。', x, y + 205, 7, '#7a7090');
}
function drawItemTab(x, y, w) {
  const S = G.S, rows = [
    ['soup', `暖汤 ${S.soup} / ${S.soupMax}`, '按 F 喝，回 2 颗心。在灯塔休息会补满。'],
    ['oil', `灯油 ${Math.round(S.oil)} / ${S.oilMax}`, '暗处会慢慢烧掉。灯光下会回来。'],
    ['wick', `灯芯 ${S.wicks}`, '打影子掉的。去老枫的灯铺换东西。'],
    ['heartpiece', `心之碎片 ${S.pieces} / 8`, `四片拼一颗心。现在生命上限 ${S.hearts} 颗心。`],
    ['letter', `信的碎片 ${S.letters} / 4`, S.letters ? LETTER_BITS.slice(0, S.letters).join(' ') : '散落在各处的、师父的笔迹。'],
  ];
  for (const k of ['mat_bamboo', 'mat_ice', 'mat_glaze', 'oilbottle', 'cat']) if ((S.items[k] | 0) > 0) rows.push([k, `${DATA.items[k].name}${S.items[k] > 1 ? ' ×' + S.items[k] : ''}`, DATA.items[k].desc]);
  rows.forEach(([ic, name, desc], i) => {
    const col = i % 2, row = Math.floor(i / 2), bx = x + col * (w / 2), yy = y + row * 26;
    if (ART.icon[ic]) ctx.drawImage(ART.icon[ic], bx, yy + 2);
    txt(name, bx + 16, yy + 9, 8, '#f4efe6', 'left', true);
    wrap(desc, w / 2 - 24, 6.5).slice(0, 2).forEach((l, j) => txt(l, bx + 16, yy + 17 + j * 7, 6.5, '#a69cb8'));
  });
  const ab = abilList();
  txtO('副能力', x, y + 170, 9, '#ffd166');
  if (!ab.length) txt('还没有。打倒 Boss 就能得到新能力。', x, y + 184, 7.5, '#7a7090');
  ab.forEach((a, i) => { ctx.drawImage(ART.icon[a], x + i * 140, y + 178); txt(DATA.abilities[a].name, x + 16 + i * 140, y + 186, 8, '#f4efe6', 'left', true); wrap(DATA.abilities[a].desc, 120, 6.5).slice(0, 2).forEach((l, j) => txt(l, x + 16 + i * 140, y + 195 + j * 7, 6.5, '#a69cb8')); });
}
function drawMapTab(x, y, w) {
  const S = G.S, cell = 22, rowH = 19;
  let x0 = 99, x1 = -99, y0 = 99, y1 = -99;
  for (const id in MAPS) { const m = MAPS[id].map; if (!m) continue; x0 = Math.min(x0, m[0]); x1 = Math.max(x1, m[0]); y0 = Math.min(y0, m[1]); y1 = Math.max(y1, m[1]); }
  const gw = (x1 - x0 + 1) * cell, gh = (y1 - y0 + 1) * rowH, ox = Math.round(x + (w - gw) / 2), oy = y + 4;
  ctx.fillStyle = 'rgba(30,26,44,0.6)'; ctx.fillRect(ox - 6, oy - 4, gw + 12, gh + 8);
  for (const id in MAPS) {
    const r = MAPS[id]; if (!r.map || !S.visited[id]) continue;
    const px = ox + (r.map[0] - x0) * cell, py = oy + (r.map[1] - y0) * rowH;
    const col = { town: '#6a5f7a', bamboo: '#3f7a43', lake: '#5f9fc4', kiln: '#a8644d', summit: '#8c86a0' }[r.region] || '#555';
    ctx.fillStyle = col; ctx.fillRect(px + 2, py + 2, cell - 4, rowH - 4);
    const dirs = { n: [cell / 2 - 2, -1, 4, 3], s: [cell / 2 - 2, rowH - 3, 4, 3], w: [-1, rowH / 2 - 2, 3, 4], e: [cell - 2, rowH / 2 - 2, 3, 4] };
    for (const d in r.exits) { const q = dirs[d]; ctx.fillRect(px + q[0], py + q[1], q[2], q[3]); }
    if (r.lh) { ctx.fillStyle = S.lit[r.lh.id] ? '#ffd166' : '#3b3350'; ctx.fillRect(px + 4, py + 4, 4, 6); }
    if (r.boss) { ctx.fillStyle = S.flags['boss_' + r.boss] ? '#7a7090' : '#ff5a4f'; ctx.fillRect(px + cell - 9, py + 4, 5, 5); }
    const here = G.room.id === id || (G.room.def.map == null && id === 't_street');
    if (here && Math.sin(G.rt * 8) > 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px + cell / 2 - 2, py + rowH / 2 - 2, 4, 4); }
  }
  txt('黄块：点亮的灯塔　红块：没打过的 Boss　闪烁白点：你在这里（只显示去过的地方）', x + w / 2, oy + gh + 16, 7, '#a69cb8', 'center');
}
function drawQuestTab(x, y, w) {
  const Q = questLog();
  let yy = y + 6;
  for (const q of Q) {
    txtO((q.done ? '✓ ' : '◆ ') + q.title, x, yy + 8, 9, q.done ? '#8ccf6e' : '#ffd166');
    const lines = wrap(q.text, w - 10, 8);
    lines.forEach((l, i) => txt(l, x + 10, yy + 20 + i * 11, 8, '#e6dff0'));
    yy += 26 + lines.length * 11;
  }
  txt(`游玩时间 ${fmtTime(playTime())}　死亡 ${G.S.stats.deaths} 次　收集率 ${collectRate()}%`, x, y + 210, 7.5, '#a69cb8');
}
function drawSettings(x, y, w, inGame) {
  const S = G.set;
  const row = (i, label, val, dec, inc) => {
    const yy = y + i * 24;
    txt(label, x, yy + 10, 9, '#e6dff0', 'left', false, 'middle');
    if (btn('－', x + w - 110, yy, 22, 18)) dec();
    txt(val, x + w - 55, yy + 10, 9, '#ffd166', 'center', true, 'middle');
    if (btn('＋', x + w - 22, yy, 22, 18)) inc();
  };
  const vol = (k) => [Math.round(S[k] * 10) + ' / 10', () => { S[k] = Math.max(0, Math.round(S[k] * 10 - 1) / 10); saveSettings(); }, () => { S[k] = Math.min(1, Math.round(S[k] * 10 + 1) / 10); saveSettings(); }];
  row(0, '总音量', ...vol('master'));
  row(1, '音乐', ...vol('music'));
  row(2, '音效', ...vol('sfx'));
  row(3, '屏幕震动', S.shake ? '开' : '关', () => { S.shake = !S.shake; saveSettings(); }, () => { S.shake = !S.shake; saveSettings(); });
  const sp = ['慢', '中', '快'], si = S.textSpeed < 0.9 ? 0 : S.textSpeed > 1.4 ? 2 : 1;
  row(4, '文字速度', sp[si], () => { S.textSpeed = [0.6, 0.6, 1][si]; saveSettings(); }, () => { S.textSpeed = [1, 2, 2][si]; saveSettings(); });
  if (inGame) {
    if (btn('回到标题画面（进度只保存到上次休息的灯塔）', x, y + 132, w, 18)) { closeMenu(); toTitle(); }
  }
}
function drawLighthouseMenu(m) {
  const e = m.lh, w = 200, x = (VW - w) / 2, y = 70;
  panel(x, y, w, 120, 'rgba(16,13,24,0.96)', '#e7b53d');
  txtO(e.name, VW / 2, y + 18, 11, '#ffd166', 'center');
  txt('灯火很暖。在这里歇一会儿吧。', VW / 2, y + 32, 7.5, '#a69cb8', 'center');
  if (btn('休息（存档、回满，敌人会重新出现）', x + 12, y + 42, w - 24, 18)) { closeMenu(); fadeTo(1, 0.3, () => { restAt(e); fadeTo(0, 0.5); }); }
  if (btn('传送到其他灯塔', x + 12, y + 64, w - 24, 18)) openMenu('teleport', { lh: e });
  if (btn('离开', x + 12, y + 86, w - 24, 18)) closeMenu();
}
function drawTeleport(m) {
  const list = LIGHTHOUSES.filter((id) => G.S.lit[id] && id !== m.lh.id), w = 200, x = (VW - w) / 2, y = 40;
  panel(x, y, w, 40 + Math.max(1, list.length) * 21, 'rgba(16,13,24,0.96)', '#e7b53d');
  txtO('传送到……', VW / 2, y + 16, 10, '#ffd166', 'center');
  if (!list.length) txt('还没有点亮别的灯塔。', VW / 2, y + 34, 8, '#a69cb8', 'center');
  list.forEach((id, i) => { const r = lighthouseRoom(id); if (btn(MAPS[r].lh.name + '　·　' + REGION_NAME[MAPS[r].region], x + 12, y + 26 + i * 21, w - 24, 18)) { closeMenu(); restAt(m.lh, true); teleport(id); } });
  txt('Esc 返回', VW / 2, y + 36 + Math.max(1, list.length) * 21, 7, '#7a7090', 'center');
}
function shopPrice(it) { const n = G.S.bought[it.id] | 0; return Array.isArray(it.price) ? it.price[Math.min(n, it.price.length - 1)] : it.price; }
function shopAvail(it) {
  const S = G.S, n = S.bought[it.id] | 0;
  if (it.max && n >= it.max) return '卖完了';
  if (DATA.items[it.id] && (S.items[it.id] | 0) > 0) return '已拥有';
  if (it.id === 'soup' && S.soup >= S.soupMax) return '已满';
  return null;
}
function drawShop(m) {
  const S = G.S, x = 40, y = 20, w = VW - 80;
  panel(x, y, w, VH - 40, 'rgba(16,13,24,0.96)', '#e7b53d');
  txtO('老枫灯铺', x + 12, y + 18, 11, '#ffd166');
  ctx.drawImage(ART.icon.wick, x + w - 70, y + 8); txt(`灯芯 ${S.wicks}`, x + w - 54, y + 17, 9, '#fff1b0', 'left', true);
  DATA.shop.forEach((it, i) => {
    const yy = y + 28 + i * 25, why = shopAvail(it), price = shopPrice(it), afford = S.wicks >= price;
    panel(x + 10, yy, w - 20, 22, 'rgba(26,22,36,0.9)', '#544a6b');
    const ic = ART.icon[it.id] || ART.icon[it.id === 'soupmax' ? 'soup' : it.id === 'oilmax' ? 'oilmax' : 'soup'];
    if (ic) ctx.drawImage(ic, x + 15, yy + 5);
    txt(it.name, x + 32, yy + 9, 8.5, '#f4efe6', 'left', true, 'middle');
    txt(it.desc, x + 32, yy + 17, 7, '#a69cb8', 'left', false, 'middle');
    if (why) txt(why, x + w - 50, yy + 11, 8, '#7a7090', 'center', false, 'middle');
    else if (btn(`${price} 灯芯`, x + w - 86, yy + 3, 70, 16, { disabled: !afford })) buy(it, price);
  });
  if (btn('离开', x + w / 2 - 40, y + VH - 66, 80, 18)) closeMenu();
}
function buy(it, price) {
  const S = G.S;
  S.wicks -= price; S.bought[it.id] = (S.bought[it.id] | 0) + 1;
  if (it.id === 'soup') S.soup = Math.min(S.soupMax, S.soup + 1);
  else giveItem(it.id);
  Snd.play('buy');
}
function drawDebugMenu(m) {
  panel(16, 10, VW - 32, VH - 20, 'rgba(16,13,24,0.97)', '#ff5a4f');
  txtO('调试：传送到任意房间（F1 关闭）', 26, 24, 9, '#ff8a7a');
  const ids = Object.keys(MAPS);
  ids.forEach((id, i) => {
    const col = i % 6, row = Math.floor(i / 6), bx = 24 + col * 72, by = 32 + row * 21;
    const r = MAPS[id], label = (r.boss ? '★' : r.lh ? '◆' : '') + r.name;
    if (btn(label, bx, by, 68, 18, { size: 7 })) { closeMenu(); G.bossFight = null; G.ui.boss = null; G.script = null; G.ui.dlg = null; goRoom(id, {}); }
  });
  txt('★ Boss 房　◆ 有灯塔　F2 获得全部能力　F3 无敌', 26, VH - 16, 7.5, '#a69cb8');
}

// =====================================================================
// HUD
// =====================================================================
function drawHeart(x, y, fill) {
  const ic = ART.icon.heart;
  ctx.globalAlpha = 0.35; ctx.drawImage(solid(ic, '#2a2140'), x, y); ctx.globalAlpha = 1;
  if (fill > 0) { const w = Math.ceil(12 * fill); ctx.drawImage(ic, 0, 0, w, 12, x, y, w, 12); }
}
function drawHUD() {
  const S = G.S, p = G.P;
  // 心
  for (let i = 0; i < S.hearts; i++) { const f = clamp((S.hp - i * 4) / 4, 0, 1); const lowShake = S.hp <= 4 && f > 0 ? Math.round(Math.sin(G.rt * 20 + i) * 0.6) : 0; drawHeart(6 + (i % 10) * 11, 6 + Math.floor(i / 10) * 11 + lowShake, f); }
  // 灯油
  if (S.flags.got_lantern) {
    const oy = 7 + Math.ceil(S.hearts / 10) * 11, bw = Math.round(S.oilMax * 0.6);
    ctx.drawImage(ART.icon.oil, 5, oy - 2);
    ctx.fillStyle = '#120e1a'; ctx.fillRect(18, oy + 1, bw + 2, 6);
    const low = S.oil < 20 && Math.sin(G.rt * 10) > 0;
    ctx.fillStyle = low ? '#ff5a4f' : '#e7b53d'; ctx.fillRect(19, oy + 2, Math.round(bw * S.oil / S.oilMax), 4);
    ctx.fillStyle = '#fff1b0'; ctx.fillRect(19, oy + 2, Math.round(bw * S.oil / S.oilMax), 1);
    if (p && p.inLightNow) txt('亮', 22 + bw, oy + 6, 6.5, '#fff1b0');
  }
  // 副能力
  const ab = abilList();
  if (ab.length) {
    const a = curAbil(), x = VW - 34, y = 6;
    panel(x, y, 28, 28, 'rgba(18,14,26,0.85)', '#7a7090');
    const sw = G.ui.abilSwap || 0, dy = sw > 0 ? Math.round((sw / 0.2) * 8) : 0;
    ctx.globalAlpha = 1 - sw * 3; ctx.drawImage(ART.icon[a], x + 8, y + 8 + dy, 12, 12); ctx.globalAlpha = 1;
    if (p.abilCd > 0) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; const maxCd = CFG.abil[a].cd; ctx.fillRect(x + 2, y + 2, 24, Math.round(24 * clamp(p.abilCd / maxCd, 0, 1))); }
    txt(DATA.abilities[a].name, x + 14, y + 37, 7, '#d6cfe0', 'center');
    if (ab.length > 1) txt('滚轮切换', x + 14, y + 45, 6, '#7a7090', 'center');
    txt('右键', x - 4, y + 16, 6.5, '#7a7090', 'right', false, 'middle');
  }
  // 暖汤、灯芯
  const by = VH - 16;
  ctx.drawImage(ART.icon.soup, 6, by - 2); txt(`${S.soup}/${S.soupMax}`, 20, by + 6, 8, '#f4efe6', 'left', true);
  txt('F', 44, by + 6, 6.5, '#7a7090');
  ctx.drawImage(ART.icon.wick, 56, by - 2); txt(`${S.wicks}`, 70, by + 6, 8, '#fff1b0', 'left', true);
  // Boss 血条：放在屏幕上方正中（左边是心和灯油，右边是副能力），不和底部的暖汤、对话框打架
  const B = G.ui.boss;
  if (B && B.e && !B.e.dead) {
    const w = 210, x = Math.round((VW - w) / 2), y = 15, e = B.e, f = clamp(e.hp / e.maxHp, 0, 1);
    B.shown = Math.max(f, (B.shown == null ? f : B.shown) - 0.25 / 60); // 掉血时有一段白色残影
    txtO(B.name, VW / 2, y - 3, 8.5, '#ffb3a8', 'center');
    ctx.fillStyle = '#120e1a'; ctx.fillRect(x - 1, y - 1, w + 2, 7);
    ctx.fillStyle = '#5a1f24'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = '#f4efe6'; ctx.fillRect(x, y, Math.round(w * B.shown), 5);
    ctx.fillStyle = '#e86a4f'; ctx.fillRect(x, y, Math.round(w * f), 5);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x, y, Math.round(w * f), 1);
    ctx.fillStyle = '#f4efe6';
    if (e.kind === 'zhu') { ctx.fillRect(x + Math.round(w / 3), y - 1, 1, 7); ctx.fillRect(x + Math.round(w * 2 / 3), y - 1, 1, 7); }
    else ctx.fillRect(x + Math.round(w / 2), y - 1, 1, 7);
    if (BOSS[e.kind].hud) BOSS[e.kind].hud(e, x, y + 9, w);
  }
  // Boss 台词
  const bl = G.ui.bossLine;
  if (bl) { bl.t += 1 / 60; const a = Math.min(1, bl.t * 4, (3.5 - bl.t) * 2); if (a <= 0) G.ui.bossLine = null; else { ctx.globalAlpha = a; panel(60, 84, VW - 120, 22, 'rgba(40,10,16,0.9)', '#e86a4f'); txt(bl.text, VW / 2, 95.5, 8.5, '#ffd0c8', 'center', true, 'middle'); ctx.globalAlpha = 1; } }
  // 交互提示
  const pr = G.ui.prompt;
  if (pr && !G.script && !G.ui.menu) {
    const sx = pr.x - CAM.ox, sy = pr.y - CAM.oy - 26, label = 'E  ' + pr.label;
    ctx.font = `bold 7.5px ${FONT}`; const w = ctx.measureText(label).width + 10;
    panel(sx - w / 2, sy - 7, w, 13, 'rgba(18,14,26,0.9)', '#e7b53d');
    txt(label, sx, sy, 7.5, '#fff1b0', 'center', true, 'middle');
  }
}
function drawOverlays(dt) {
  const S = G.S;
  // 灯油烧光：屏幕边缘伸出影子的手
  if (S.flags.got_lantern && S.oil <= 0 && !G.ui.menu) {
    const k = 0.6 + Math.sin(G.rt * 3) * 0.2;
    for (let i = 0; i < 10; i++) {
      const side = i % 4, t = G.rt * 0.8 + i * 1.7, len = 20 + Math.sin(t) * 10 + k * 14;
      ctx.fillStyle = 'rgba(8,4,14,0.9)';
      const pos = ((i * 53) % 100) / 100;
      let x, y, dx, dy;
      if (side === 0) { x = pos * VW; y = 0; dx = 0; dy = 1; } else if (side === 1) { x = pos * VW; y = VH; dx = 0; dy = -1; } else if (side === 2) { x = 0; y = pos * VH; dx = 1; dy = 0; } else { x = VW; y = pos * VH; dx = -1; dy = 0; }
      for (let j = 0; j < len; j += 2) { const wob = Math.sin(t * 3 + j * 0.3) * 2, w = 5 - j / len * 3; ctx.fillRect(Math.round(x + dx * j + dy * wob - w / 2), Math.round(y + dy * j + dx * wob - w / 2), w, w); }
      for (let f = -1; f <= 1; f++) ctx.fillRect(Math.round(x + dx * len + dy * f * 3), Math.round(y + dy * len + dx * f * 3), 2, 2);
    }
  }
  // 低血量红边
  if (S.hp <= 4 && S.hp > 0) { const a = 0.18 + Math.sin(G.rt * 6) * 0.08; const g = ctx.createRadialGradient(VW / 2, VH / 2, 80, VW / 2, VH / 2, 280); g.addColorStop(0, 'rgba(255,0,30,0)'); g.addColorStop(1, `rgba(255,0,30,${a})`); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH); }
  // 上下黑边（过场）
  G.bars += (G.barsTo - G.bars) * Math.min(1, dt * 6);
  if (G.bars > 0.01) { const h = Math.round(G.bars * 24); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, h); ctx.fillRect(0, VH - h, VW, h); }
  // 区域名
  const b = G.ui.banner;
  if (b) {
    b.t += dt; const dur = b.big ? 4 : 2.6, a = Math.min(1, b.t * 2, (dur - b.t) * 2);
    if (a <= 0) G.ui.banner = null;
    else { ctx.globalAlpha = a; if (b.big) { panel(70, 90, VW - 140, 46, 'rgba(30,22,10,0.92)', '#e7b53d'); txtO(b.title, VW / 2, 110, 12, '#ffd166', 'center'); txt(b.sub, VW / 2, 126, 8, '#f4efe6', 'center'); } else { txtO(b.title, VW / 2, 70, 16, '#f4efe6', 'center'); txt('—— ' + b.sub + ' ——', VW / 2, 84, 8, '#d6cfe0', 'center'); } ctx.globalAlpha = 1; }
  }
  // 提示
  const H = G.ui.hint;
  if (H && !hintBusy()) {
    const a = clamp(Math.min(H.t * 2, H.shown * 4), 0, 1);
    ctx.globalAlpha = a; ctx.font = `8.5px ${FONT}`; const w = ctx.measureText(H.text).width + 20, y = VH - 46;
    panel(VW / 2 - w / 2, y, w, 16, 'rgba(18,14,26,0.92)', '#7ac0e0'); txt(H.text, VW / 2, y + 8.5, 8.5, '#dff4ff', 'center', false, 'middle'); ctx.globalAlpha = 1;
  }
  // 小通知
  G.ui.toasts.forEach((t, i) => { t.t += dt; const a = Math.min(1, t.t * 4, (3 - t.t) * 2); if (a > 0) { ctx.globalAlpha = a; ctx.font = `bold 8px ${FONT}`; const w = ctx.measureText(t.str).width + 14; const ty = (G.ui.boss ? 36 : 20) + i * 15; panel(VW / 2 - w / 2, ty, w, 13, 'rgba(18,14,26,0.9)', '#e7b53d'); txt(t.str, VW / 2, ty + 6.5, 8, '#fff1b0', 'center', true, 'middle'); ctx.globalAlpha = 1; } });
  G.ui.toasts = G.ui.toasts.filter((t) => t.t < 3);
}
function drawCrosshair() {
  const x = Math.round(IN.mx), y = Math.round(IN.my);
  ctx.fillStyle = '#120e1a'; ctx.fillRect(x - 5, y - 1, 11, 3); ctx.fillRect(x - 1, y - 5, 3, 11);
  ctx.fillStyle = G.P && G.P.charge > 0.25 ? '#fff1b0' : '#ffd166';
  ctx.fillRect(x - 4, y, 3, 1); ctx.fillRect(x + 2, y, 3, 1); ctx.fillRect(x, y - 4, 1, 3); ctx.fillRect(x, y + 2, 1, 3);
}
function fmtTime(s) { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return (h ? h + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0'); }
function collectRate() {
  const S = G.S, gear = Object.keys(DATA.items).filter((k) => DATA.items[k].slot && k !== 'shade_old').filter((k) => (S.items[k] | 0) > 0).length;
  const quests = ((S.flags.q_cat | 0) >= 3) + ((S.flags.q_oil | 0) >= 2) + ((S.flags.q_shade | 0) >= 2);
  return Math.round(((Math.min(8, S.pieces) + S.letters + gear + quests) / (8 + 4 + 10 + 3)) * 100);
}

// =====================================================================
// 交互
// =====================================================================
function updateInteract() {
  const p = G.P, R = G.room;
  G.ui.prompt = null;
  if (G.script || G.ui.menu || p.dead || p.state !== 'move') return;
  let best = null, bd = 24;
  for (const e of R.ents) {
    if (e.dead) continue;
    const H = EK[e.k];
    if (!H || !H.interact) continue;
    const label = H.label ? H.label(e) : '交互';
    if (!label) continue;
    const ey = e.k === 'lh' ? e.y + 16 : e.y, d = dist(p.x, p.y, e.x, ey) - (e.k === 'lh' ? 8 : 0);
    if (d < bd) { bd = d; best = { e, label, x: e.x, y: e.k === 'lh' ? e.y - 20 : e.y }; }
  }
  const gd = R.def.gate;
  if (gd && gd.script) {
    for (let i = 0; i < R.w * R.h; i++) if (R.t[i] === TL.GATE) { const gx = (i % R.w) * TS + 8, gy = ((i / R.w) | 0) * TS + 8; const d = dist(p.x, p.y, gx, gy); if (d < 26 && d < bd) { bd = d; best = { gate: gd, label: G.S.flags[gd.flag] ? '石门' : gd.label, x: gx, y: gy }; } }
  }
  G.ui.prompt = best;
  if (best && keyHit('KeyE')) {
    if (best.gate) runScript(best.gate.script);
    else EK[best.e.k].interact(best.e);
  }
  if (best && !G.S.hints.interact) hint('interact');
  if (best && best.e && best.e.k === 'lh' && G.S.lit[best.e.id] && !G.S.hints.lighthouse) hint('lighthouse');
}

// =====================================================================
// 标题画面
// =====================================================================
const TITLE = { sel: 0, confirm: false, t: 0 };
function drawTitle(dt) {
  TITLE.t += dt;
  ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, VW, VH);
  // 远处的山城剪影
  ctx.fillStyle = '#0c0a18';
  for (let i = 0; i < VW; i++) { const h = 50 + Math.sin(i * 0.02) * 20 + Math.sin(i * 0.07) * 6; ctx.fillRect(i, VH - h, 1, h); }
  ctx.fillStyle = '#090814';
  for (let i = 0; i < 18; i++) { const hx = i * 28 + 4, hy = VH - 40 - (i % 3) * 6; ctx.fillRect(hx, hy, 18, 40); }
  // 摇晃的灯笼
  const ang = Math.sin(TITLE.t * 1.3) * 0.35, px = VW / 2 + 110, py = 40, L = 70;
  const lx = px + Math.sin(ang) * L, ly = py + Math.cos(ang) * L;
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 120 + Math.sin(TITLE.t * 2.2) * 6);
  g.addColorStop(0, 'rgba(255,190,90,0.35)'); g.addColorStop(0.4, 'rgba(255,140,60,0.12)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  ctx.strokeStyle = '#3b3350'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, py); ctx.lineTo(lx, ly - 10); ctx.stroke();
  ctx.save(); ctx.translate(Math.round(lx), Math.round(ly)); ctx.scale(3, 3); ctx.drawImage(ART.lanternLit, -4, -4); ctx.restore();
  // 雾
  for (let i = 0; i < 30; i++) { const x = (i * 97 + TITLE.t * (8 + (i % 5) * 3)) % (VW + 60) - 30, y = VH - 30 - (i % 7) * 8; ctx.fillStyle = 'rgba(120,110,150,0.05)'; ctx.beginPath(); ctx.ellipse(x, y, 30, 6, 0, 0, TAU); ctx.fill(); }
  // 标题
  txtO('烬 灯', 120, 92, 34, '#ffd166', 'center');
  txt('—— 长夜里，最后一个灯匠 ——', 120, 110, 8, '#a69cb8', 'center');
  const hasS = hasSave();
  const items = [['新的长夜', true], ['继续', hasS], ['设置', true]];
  if (TITLE.confirm) {
    panel(40, 130, 160, 70, 'rgba(18,14,26,0.96)', '#e86a4f');
    txt('开始新的长夜会覆盖旧存档。', 120, 146, 8, '#f4efe6', 'center');
    if (btn('确定', 54, 166, 60, 18)) { TITLE.confirm = false; newGame(); }
    if (btn('取消', 126, 166, 60, 18) || keyHit('Escape')) TITLE.confirm = false;
  } else {
    items.forEach(([label, en], i) => {
      if (btn(label, 70, 130 + i * 24, 100, 19, { disabled: !en, sel: TITLE.sel === i && !IN.moved })) choose(i);
      if (inBox(70, 130 + i * 24, 100, 19)) TITLE.sel = i;
    });
    if (keyHit('KeyW', 'ArrowUp')) { TITLE.sel = (TITLE.sel + 2) % 3; IN.moved = false; Snd.play('menu'); }
    if (keyHit('KeyS', 'ArrowDown')) { TITLE.sel = (TITLE.sel + 1) % 3; IN.moved = false; Snd.play('menu'); }
    if (keyHit('Enter', 'Space', 'KeyE') && items[TITLE.sel][1]) choose(TITLE.sel);
  }
  function choose(i) { Snd.unlock(); if (i === 0) { if (hasS) TITLE.confirm = true; else newGame(); } else if (i === 1) continueGame(); else openMenu('settings'); }
  txt('WASD 移动　鼠标瞄准　左键挥击（长按光爆）　右键副能力　空格翻滚　E 交互　F 暖汤　Esc 菜单', VW / 2, VH - 8, 6.5, '#6b6080', 'center');
  if (G.ui.menu) drawMenu();
}

// =====================================================================
// 结局
// =====================================================================
const ENDING = { kind: null, t: 0, scene: null };
function startEnding(kind) {
  G.S.flags.ending = kind; G.S.flags['ending_' + kind] = true;
  saveGame();
  ENDING.kind = kind; ENDING.t = 0;
  const [c, x] = mk(VW, VH); ART.drawScene(x, ENDINGS[kind].scene, 0); ENDING.scene = c;
  fadeTo(1, 1.2, () => { G.scene = 'ending'; G.bossFight = null; G.ui.boss = null; fadeTo(0, 1.5); Snd.music('ending'); });
}
function drawEnding(dt) {
  ENDING.t += dt;
  const E = ENDINGS[ENDING.kind], t = ENDING.t;
  ctx.drawImage(ENDING.scene, 0, 0);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, VW, VH);
  txtO(E.title, VW / 2, 30, 14, '#ffd166', 'center');
  const full = E.text, n = Math.floor(clamp((t - 1) * 22, 0, full.length));
  const lines = wrap(full.slice(0, n), 380, 9);
  lines.forEach((l, i) => txt(l, 50, 56 + i * 15, 9, '#f4efe6'));
  if (t > 1 + full.length / 22 + 0.8) {
    const S = G.S;
    panel(130, 200, 220, 46, 'rgba(18,14,26,0.85)', '#7a7090');
    txt(`游玩时间　${fmtTime(S.stats.time)}`, 145, 214, 8.5, '#e6dff0');
    txt(`死亡次数　${S.stats.deaths}`, 145, 227, 8.5, '#e6dff0');
    txt(`收集率　　${collectRate()}%`, 145, 240, 8.5, '#e6dff0');
    if (ENDING.kind !== 'wick') txt('（还有一个结局……也许你错过了什么）', 340, 240, 7, '#a69cb8', 'right');
    if (Math.sin(G.rt * 4) > -0.3) txt('点击或按 E 回到标题', VW / 2, VH - 10, 8, '#ffd166', 'center');
    if (advanceKey()) toTitle();
  } else if (advanceKey() && t > 1.5) ENDING.t = 1 + full.length / 22 + 0.8;
}
