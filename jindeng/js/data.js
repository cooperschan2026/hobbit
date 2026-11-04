'use strict';
// =====================================================================
// 数据表：敌人、Boss、物品、装备、商店、任务
// 伤害单位：1 颗心 = 4 点
// =====================================================================
const DATA = {
  enemies: {
    // hp 生命，dmg 伤害，speed 速度，shadow 是否影子类（暗处 +50%，怕光爆），wick 掉落灯芯范围
    shade: { name: '小影', hp: 7, dmg: 2, speed: 33, shadow: true, wick: [1, 2], box: [5, 4], tell: 0.5, lunge: 142, lungeTime: 0.32, rest: 0.55 },
    hound: { name: '影犬', hp: 6, dmg: 2, speed: 78, shadow: true, wick: [1, 2], box: [5, 3], tell: 0.4, lunge: 172, lungeTime: 0.25 },
    ghost: { name: '灯笼鬼', hp: 6, dmg: 1, speed: 36, shadow: true, wick: [2, 3], box: [5, 5], steal: 15, fly: true },
    spike: { name: '竹刺', hp: 8, dmg: 3, speed: 0, wick: [1, 2], box: [6, 4], range: 30, tell: 0.45 },
    frog: { name: '冰蛙', hp: 8, dmg: 2, speed: 0, wick: [1, 3], box: [6, 4], tell: 0.5, jump: 0.55, slow: 1.5 },
    lamp: { name: '浮灯', hp: 6, dmg: 2, speed: 26, wick: [2, 3], box: [5, 5], fly: true, tell: 0.6, shard: 95, keep: 90 },
    clay: { name: '陶兵', hp: 12, dmg: 3, speed: 26, wick: [2, 3], box: [6, 4], shield: true, tell: 0.5 },
    lizard: { name: '火蜥', hp: 9, dmg: 3, speed: 38, wick: [2, 3], box: [6, 3], tell: 0.5, dash: 175, dashTime: 0.55 },
    smoke: { name: '烟鬼', hp: 7, dmg: 1, speed: 30, wick: [2, 3], box: [6, 5], fly: true },
    elite: { name: '影将', hp: 44, dmg: 4, speed: 40, shadow: true, wick: [16, 22], box: [9, 6], tell: 0.6, big: true },
  },
  bosses: {
    ke: { name: '竹中客', hp: 60, dmg: 3 },
    carp: { name: '溺钟', hp: 90, dmg: 4 },
    kiln: { name: '窑神', hp: 110, dmg: 4, plate: 7 },
    zhu: { name: '师父·烛', hp: 150, dmg: 3 },
    night: { name: '长夜', hp: 170, dmg: 4 },
  },
  bossWicks: 40,
  items: {
    shade_old: { name: '旧灯罩', desc: '师父做的灯罩。朴素，什么都不加。', slot: 'shade' },
    shade_iron: { name: '铁灯罩', desc: '攻击 +1。沉甸甸的，砸下去很有分量。', slot: 'shade' },
    shade_paper: { name: '纸灯罩', desc: '光照范围更大（×1.3），但受到的伤害 +1。', slot: 'shade' },
    shade_long: { name: '长柄灯罩', desc: '挥击距离更远，出招慢一点。', slot: 'shade' },
    shade_qing: { name: '青灯罩', desc: '每次挥击命中，回 2 点灯油。老枫压箱底的手艺。', slot: 'shade' },
    charm_slow: { name: '慢时符', desc: '完美闪避后，时间变慢更久。', slot: 'charm' },
    charm_rage: { name: '怒火符', desc: '生命只剩 1 颗心以下时，攻击 ×1.5。', slot: 'charm' },
    charm_oil: { name: '省油符', desc: '暗处灯油消耗 -30%。', slot: 'charm' },
    charm_soup: { name: '暖心符', desc: '暖汤多回 1 颗心。', slot: 'charm' },
    charm_flame: { name: '焰步符', desc: '冲刺时在身后留下一串火。', slot: 'charm' },
    charm_luck: { name: '招财符', desc: '敌人掉落的灯芯 +50%。', slot: 'charm' },
    mat_bamboo: { name: '青竹篾', desc: '竹影林里最韧的竹篾。老枫想要它。' },
    mat_ice: { name: '冰魄', desc: '沉钟湖底结出的冰晶，摸上去不冷。' },
    mat_glaze: { name: '青瓷釉', desc: '窑火坡的老釉料，颜色像雨后的天。' },
    oilbottle: { name: '灯油瓶（送）', desc: '老枫给的灯油，送到熄了灯的人家门口。' },
    cat: { name: '橘猫团子', desc: '小满的猫。缩在你怀里打呼噜。' },
  },
  // 商店（老枫灯铺）。price 可以是数组（第 n 次购买的价格）
  shop: [
    { id: 'soup', name: '一碗暖汤', desc: '补一碗暖汤（不超过上限）。', price: 15 },
    { id: 'soupmax', name: '大汤碗', desc: '暖汤上限 +1。', price: [50, 100], max: 2 },
    { id: 'oilmax', name: '大油壶', desc: '灯油上限 +20。', price: [60, 120], max: 2 },
    { id: 'shade_iron', name: '铁灯罩', desc: '攻击 +1。', price: 80 },
    { id: 'shade_long', name: '长柄灯罩', desc: '挥击距离更远，出招慢一点。', price: 100 },
    { id: 'charm_oil', name: '省油符', desc: '暗处灯油消耗 -30%。', price: 90 },
    { id: 'charm_luck', name: '招财符', desc: '敌人掉落的灯芯 +50%。', price: 70 },
  ],
  abilities: {
    dash: { name: '冲刺', desc: '右键：朝鼠标方向冲刺。冲刺中无敌，能越过裂缝。' },
    hook: { name: '钩索', desc: '右键：射出钩索。勾住灯柱飞过去，或者把小怪拉过来。' },
    fire: { name: '投火', desc: '右键：扔出火种。点燃火盆、烧掉藤蔓、打碎陶兵的盾。' },
  },
  // 送油：五户人家
  houses: {
    h1: { who: '张伯', line: '我梦见自己在黑水里游了好久……灯一亮，我就找到家门了。谢谢你，孩子。' },
    h2: { who: '李家小妹', line: '……是你把我叫醒的吗？我好像一直听见有人在敲门。' },
    h3: { who: '陈先生', line: '我当了三年影子，只记得一件事：欠老枫的账还没还。帮我跟他说一声。' },
    h4: { who: '刘奶奶', line: '光好暖和啊。孩子，你这盏灯笼，跟烛师傅那盏好像。' },
    h5: { who: '赵铁匠', line: '嘿，我的锤子还在！等天亮了，我给你打一把顶好的灯钩。' },
  },
  materials: ['mat_bamboo', 'mat_ice', 'mat_glaze'],
};

// 任务日志（根据剧情标记生成）
function questLog() {
  const f = G.S.flags, out = [];
  const main = (() => {
    if (f.ending) return '故事已经结束了。谢谢你点亮这座城。';
    if (f.boss_zhu) return '在长明台顶做出选择。';
    if (f.lit_summit) return '登上塔顶，找到师父。';
    if (f.seal_open) return '穿过石门，登上长明台下的灯塔。';
    if (f.qi_sister) return '回镇口，往北走上山道，用火烧开藤蔓，打开“三灯石门”。';
    if (f.boss_kiln) return '回窑火坡灯塔，小满在那里等你。';
    if (f.lit_kiln) return '深入窑火坡，找到最深处的大窑。';
    if (f.boss_carp) return '从石阶街往南，用钩索越过断桥，去窑火坡。';
    if (f.lit_lake) return '找到沉钟湖心的钟。小钟能让冰面冻上。';
    if (f.boss_ke) return '回镇上，从下坊往东去沉钟湖（用冲刺越过裂缝）。';
    if (f.qi1) return '去竹林最深处，找“戴斗笠的人”。';
    if (f.lit_bamboo) return '深入竹影林，寻找阿七。';
    if (f.lit_town) return '去西边的竹影林寻找阿七。';
    if (f.pro_feng) return '去镇口（北边）点亮灯塔。';
    if (f.pro_xiaoman) return '穿过石阶街，去镇口点亮灯塔。';
    if (f.got_lantern) return '跟上小满。';
    return '到工作台拿起师父的旧灯笼。';
  })();
  out.push({ title: '主线 · 点灯', text: main, done: !!f.ending });
  const qc = f.q_cat | 0;
  if (qc) out.push({ title: '支线 · 茶铺的猫', text: qc >= 3 ? '团子回家了。小满送了你一张慢时符。' : f.cat_found ? '把团子带回给小满。' : '小满的猫“团子”跑进了竹影林深处。听说在裂缝的那头。', done: qc >= 3 });
  const qo = f.q_oil | 0;
  if (qo) out.push({ title: '支线 · 送油', text: qo >= 2 ? '五户人家都亮了。老枫给了你纸灯罩。' : `给镇上熄了灯的人家送灯油：${deliveredCount()} / 5（石阶街 3 户，下坊 2 户）。送完回去找老枫。`, done: qo >= 2 });
  const qs = f.q_shade | 0;
  if (qs) out.push({ title: '支线 · 老枫的灯罩', text: qs >= 2 ? '老枫做出了青灯罩。' : `找齐三样材料交给老枫：青竹篾 ${has('mat_bamboo') ? '✓' : '✗'}（竹影林）、冰魄 ${has('mat_ice') ? '✓' : '✗'}（沉钟湖）、青瓷釉 ${has('mat_glaze') ? '✓' : '✗'}（窑火坡）。`, done: qs >= 2 });
  return out;
}
function deliveredCount() { let n = 0; for (const k in DATA.houses) if (G.S.flags['dl_' + k]) n++; return n; }
function has(id) { return (G.S.items[id] | 0) > 0; }
