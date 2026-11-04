'use strict';
// =====================================================================
// 《烬灯》全部数值配置。改这里就能调手感和难度。
// 敌人、物品、装备、商店价格在 data.js。
// 伤害单位：1 颗心 = 4 点。
// =====================================================================
const CFG = {
  W: 480, H: 270,          // 逻辑分辨率，按整数倍放大
  TILE: 16,
  FPS: 60,                 // 固定逻辑帧

  player: {
    hearts: 5,             // 起始 5 颗心
    hpPerHeart: 4,
    oil: 100,              // 灯油
    soup: 3,               // 暖汤
    speed: 90,             // 像素/秒
    accel: 0.06,           // 起步/停下约 0.06 秒
    iceAccel: 0.55,        // 冰面上加减速变慢（会滑）
    box: [5, 3],           // 脚下碰撞盒半宽/半高
    hurtInvuln: 1.0,       // 受伤后无敌
    hurtKnock: 120,
    soupHeal: 8,           // 一碗暖汤回 2 颗心
    soupTime: 0.6,
    fallDmg: 2,            // 掉进裂缝/水/熔岩
  },
  roll: { dist: 48, time: 0.3, iframe: 0.2, cd: 0.4, ghosts: 3 },
  perfect: { slow: 0.3, scale: 0.3, charmSlow: 1.2, charmScale: 0.35 },
  combo: {
    dmg: [2, 2, 4],
    knock: [70, 70, 170],
    windup: 0.08,
    active: 0.07,
    recover: 0.18,
    window: 0.25,          // 连招输入窗口
    range: 23,             // 挥击半径
    arc: 2.0,              // 挥击扇形角度（弧度）
    hitstop: [0.05, 0.05, 0.09],
    lunge: [26, 26, 44],   // 出招时向前小步
  },
  burst: { hold: 1.0, cost: 15, radius: 84, stun: 2.0, knock: 200, dmg: 2 },
  oil: {
    rMax: 96, rMin: 24,    // 100 油时 96 像素，0 油时 24 像素
    fullAt: 100,
    darkDrain: 1,          // 暗处每秒耗油
    lightRegen: 6,         // 亮处每秒回油
    starveEvery: 3,        // 灯油为 0 时每 3 秒掉 1 点血
    bottle: 25,            // 灯油瓶回多少油
    lightThreshold: 0.72,  // 站在光源半径的多少以内算“亮区”
  },
  abil: {
    dash: { dist: 74, minDist: 40, time: 0.18, cd: 0.55 }, // 冲刺距离跟着鼠标，40~74 像素
    hook: { range: 160, speed: 460, pull: 380, cd: 0.45 },
    fire: { range: 140, time: 0.42, cost: 5, dmg: 3, radius: 18, cd: 0.6 },
  },
  shadowDarkBonus: 1.5,    // 影子类敌人在暗处伤害 +50%
  lightBurstStun: 2.0,
  wickDropChance: 0.65,
  oilDropChance: 0.14,
  camera: { mouseLead: 0.16, follow: 8, shakeMax: 5 },
  light: {
    lighthouse: 120, brazier: 62, firefly: 30, moon: 38, lava: 26, fire: 34, lamp: 22,
    ambient: { home: 0.55, tea: 0.5, town: 0.86, bamboo: 0.9, lake: 0.82, kiln: 0.78, summit: 0.9 },
  },
  hint: { time: 5, ttl: 8 }, // ttl：提示排队超过这么久（不算对话时间）就作废
  debug: /[?&]debug=1/.test(location.search),
};
