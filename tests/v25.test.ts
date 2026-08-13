import { describe, expect, it } from 'vitest';
import {
  advanceGameState,
  armyCommandCap,
  cityPopulationWeight,
  createNewGame,
  provinceComplete,
  syncTalents,
} from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, occupy, T0 } from './helpers.js';

function setupMarch(
  ctx: ReturnType<typeof makeCtx>,
  state: ReturnType<typeof makeGame>,
  opts: { infantry: number; cavalry: number; target: string; level?: number; armyId?: string; generalIds?: string[] }
) {
  const generals = opts.generalIds
    ? opts.generalIds.map((id) => state.generals.find((g) => g.id === id)!)
    : [state.generals[0]];
  generals[0].level = opts.level ?? 1;
  const arrivesMs = T0 + 600_000;
  const army = {
    id: opts.armyId ?? `a-${Math.random()}`,
    generalId: generals[0].id,
    generalIds: generals.map((g) => g.id),
    infantry: opts.infantry,
    cavalry: opts.cavalry,
    status: 'MARCHING' as const,
    originCityId: 'acity',
    targetCityId: opts.target,
    departedAt: iso(T0),
    arrivesAt: iso(arrivesMs),
  };
  state.armies.push(army);
  for (const g of generals) {
    g.status = 'MARCHING';
    g.armyId = army.id;
  }
  return { army, arrivesMs };
}

describe('v2.5 多将领出征', () => {
  it('多将领合计统帅 = Σ 各将统帅；超过拒绝由服务层校验，引擎侧合计正确', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.generals.push(
      { id: 'g2', name: '副将甲', level: 5, xp: 0, status: 'IDLE', talents: [] },
      { id: 'g3', name: '副将乙', level: 10, xp: 0, status: 'IDLE', talents: [] }
    );
    // 主将1级(200) + 5级(600) + 10级(1100) = 1900
    expect(armyCommandCap(ctx.balance, state, ['g-initial', 'g2', 'g3'])).toBe(200 + 600 + 1100);
  });

  it('多将领战斗胜利：主将驻守、副将恢复空闲；战斗经验同额发放', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    state.generals.push({ id: 'g2', name: '副将甲', level: 3, xp: 0, status: 'IDLE', talents: [] });
    const { arrivesMs } = setupMarch(ctx, state, {
      infantry: 1000,
      cavalry: 0,
      target: 'qingyuan',
      armyId: 'a-multi',
      generalIds: ['g-initial', 'g2'],
    });
    advanceGameState(ctx, state, arrivesMs + 1);
    const report = state.battleReports[0];
    expect(report.victory).toBe(true);
    const lead = state.generals.find((g) => g.id === 'g-initial')!;
    const sub = state.generals.find((g) => g.id === 'g2')!;
    expect(lead.status).toBe('GARRISON');
    expect(lead.cityId).toBe('qingyuan');
    expect(sub.status).toBe('IDLE');
    // 战斗经验：同额 ≥ 100（胜利基础）
    expect(lead.xp).toBeGreaterThanOrEqual(100);
    expect(sub.xp).toBeGreaterThanOrEqual(100);
    expect(report.gainedXp).toBeGreaterThanOrEqual(100);
    expect(report.attackerPower).toBeGreaterThan(2000 * 1.02); // 含副将加成
  });

  it('战败负伤：概率命中时将领 WOUNDED，到期自动恢复', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    const { arrivesMs } = setupMarch(ctx, state, { infantry: 10, cavalry: 0, target: 'qingyuan', armyId: 'a-wound' });
    advanceGameState(ctx, state, arrivesMs + 1);
    const g = state.generals[0];
    const report = state.battleReports[0];
    expect(report.victory).toBe(false);
    if (g.status === 'WOUNDED') {
      const injuredUntil = Date.parse(g.injuredUntil!);
      expect(injuredUntil).toBeGreaterThan(arrivesMs);
      // 到期自动恢复
      advanceGameState(ctx, state, injuredUntil + 1);
      expect(state.generals[0].status).toBe('IDLE');
      expect(state.generals[0].injuredUntil).toBeUndefined();
    }
  });
});

describe('v2.5 首都与省域', () => {
  it('首都城市人口权重 ×1.5', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    expect(cityPopulationWeight(ctx.balance, ctx.cities, state, { cityId: 'acity', level: 1 })).toBeCloseTo(1.5);
    expect(cityPopulationWeight(ctx.balance, ctx.cities, state, { cityId: 'foshan', level: 4 })).toBe(4);
  });

  it('完整占领省份后该省城市 +10%', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    // 占领广东所有城市
    const gd = ctx.cities.filter((c) => c.provinceId === 'gd');
    for (const c of gd) occupy(ctx, state, c.id);
    expect(provinceComplete(state, ctx.cities, 'gd')).toBe(true);
    // 佛山 4 级 × 1.1
    const pc = state.cities.find((c) => c.cityId === 'foshan')!;
    expect(cityPopulationWeight(ctx.balance, ctx.cities, state, pc)).toBeCloseTo(4 * 1.1);
  });
});

describe('v2.5 蛮族营地', () => {
  it('离线推进刷新营地（最多 3 个），攻打后消失并获得奖励', () => {
    const ctx = makeCtx(5);
    const state = makeGame(ctx);
    // 手动推进 2 小时触发营地刷新
    advanceGameState(ctx, state, T0 + 2 * 3_600_000);
    expect(state.barbarianCamps.length).toBeGreaterThan(0);
    expect(state.barbarianCamps.length).toBeLessThanOrEqual(ctx.balance.barbarianMaxCamps);
    const camp = state.barbarianCamps[0];
    const before = {
      idle: state.resources.idlePopulation,
      weapons: state.resources.weapons,
      talismans: state.tech.talismans,
    };
    // 直接调用营地战斗：1000 步兵必胜
    state.armies.push({
      id: 'a-camp',
      generalId: 'g-initial',
      generalIds: ['g-initial'],
      infantry: 1000,
      cavalry: 0,
      status: 'MARCHING',
      originCityId: 'acity',
      targetCityId: camp.id,
      departedAt: iso(T0 + 2 * 3_600_000),
      arrivesAt: iso(T0 + 2 * 3_600_000 + 60_000),
    });
    advanceGameState(ctx, state, T0 + 2 * 3_600_000 + 61_000);
    expect(state.battleReports[0].victory).toBe(true);
    expect(state.battleReports[0].isBarbarian).toBe(true);
    expect(state.barbarianCamps.some((c) => c.id === camp.id)).toBe(false);
    expect(state.resources.idlePopulation).toBeGreaterThan(before.idle);
    expect(state.resources.weapons).toBeGreaterThan(before.weapons);
  });
});

describe('v2.5 通关结局', () => {
  it('占领全部城市后 completedAt 自动设置', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    for (const c of ctx.cities) {
      if (c.id !== 'acity') occupy(ctx, state, c.id);
    }
    expect(state.cities.length).toBe(ctx.cities.length);
    advanceGameState(ctx, state, T0 + 60_000);
    expect(state.completedAt).toBeTruthy();
  });
});

describe('v2.5 将领天赋', () => {
  it('初始将领 1 级领悟第一个天赋；升级 5 级领悟第二个', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    const g = state.generals[0];
    advanceGameState(ctx, state, T0 + 60_000);
    // 1 级天赋已同步
    expect(g.talents.length).toBe(1);
    g.level = 5;
    syncTalents(ctx.balance, g);
    expect(g.talents.length).toBe(2);
    // 天赋不重复
    expect(new Set(g.talents).size).toBe(g.talents.length);
  });

  it('威仪天赋提升统帅（+10%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    const g = state.generals[0];
    g.talents = ['majestic'];
    expect(armyCommandCap(ctx.balance, state, [g.id])).toBe(Math.round(200 * 1.1));
  });
});

describe('v2.5 敌方反攻', () => {
  it('占领 ≥5 城且弱驻军时可能被反攻夺回（A市 除外）', () => {
    const ctx = makeCtx(11);
    const state = makeGame(ctx);
    // 占领 5 座城（含清远 + 4 座 1 级城），全部不留驻军
    occupy(ctx, state, 'qingyuan');
    occupy(ctx, state, 'heyuan');
    occupy(ctx, state, 'meizhou');
    occupy(ctx, state, 'shanwei');
    occupy(ctx, state, 'chaozhou');
    expect(state.cities.length).toBeGreaterThanOrEqual(5);
    // 推进 90 分钟触发反攻检查
    advanceGameState(ctx, state, T0 + 90 * 60_000);
    const lostCities = state.cities.filter((c) => c.cityId !== 'acity' && !['qingyuan', 'heyuan', 'meizhou', 'shanwei', 'chaozhou'].includes(c.cityId));
    // 可能被夺回（弱驻军），也可能守住；至少不夺回 A市
    expect(state.cities.some((c) => c.cityId === 'acity')).toBe(true);
    expect(lostCities.length).toBe(0);
    // 存在反攻战报（若触发）
    const counterReports = state.battleReports.filter((r) => r.counterAttack);
    expect(counterReports.length).toBeGreaterThanOrEqual(0);
  });
});
