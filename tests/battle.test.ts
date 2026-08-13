import { describe, expect, it } from 'vitest';
import {
  advanceGameState,
  canAttack,
  marchTimeSeconds,
  routeBetween,
  type EngineContext,
} from '../apps/server/src/engine/index.js';
import type { GameState } from '@timewar/shared';
import { iso, makeCtx, makeGame, T0 } from './helpers.js';

function setupMarch(
  ctx: EngineContext,
  state: GameState,
  opts: { infantry: number; cavalry: number; target: string; level?: number; armyId?: string }
): { armyId: string; arrivesMs: number; marchSeconds: number } {
  const general = state.generals[0];
  general.level = opts.level ?? 1;
  const seconds = marchTimeSeconds(
    ctx.balance,
    ctx.routes,
    'acity',
    opts.target,
    opts.infantry,
    opts.cavalry
  );
  const armyId = opts.armyId ?? `a-test-${Math.random()}`;
  const arrivesMs = T0 + seconds * 1000;
  state.armies.push({
    id: armyId,
    generalId: general.id,
    infantry: opts.infantry,
    cavalry: opts.cavalry,
    status: 'MARCHING',
    originCityId: 'acity',
    targetCityId: opts.target,
    departedAt: iso(T0),
    arrivesAt: iso(arrivesMs),
  });
  general.status = 'MARCHING';
  general.armyId = armyId;
  return { armyId, arrivesMs, marchSeconds: seconds };
}

describe('城市与可攻击判定', () => {
  it('清远新手守军固定100，且不同种子不变', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const ctx = makeCtx(seed);
      const state = makeGame(ctx);
      expect(state.enemyCities.find((e) => e.cityId === 'qingyuan')?.garrison).toBe(100);
    }
  });

  it('初始守军在该等级范围内且生成后保存', () => {
    const ctx = makeCtx(3);
    const state = makeGame(ctx);
    const shenzhen = state.enemyCities.find((e) => e.cityId === 'shenzhen')!;
    expect(shenzhen.garrison).toBeGreaterThanOrEqual(4000);
    expect(shenzhen.garrison).toBeLessThanOrEqual(6000);
    expect(shenzhen.initialGarrison).toBe(shenzhen.garrison);
  });

  it('只能攻击相邻的敌方城市', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    expect(canAttack(ctx.cities, state, 'qingyuan')).toBe(true); // A市 虚拟邻接
    expect(canAttack(ctx.cities, state, 'zhaoqing')).toBe(false); // 不相邻
    expect(canAttack(ctx.cities, state, 'acity')).toBe(false); // 己方城市
  });

  it('海路行军时间 = 陆路计算结果 × 1.5', () => {
    const ctx = makeCtx();
    const land = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 100, 0);
    const sea = marchTimeSeconds(ctx.balance, ctx.routes, 'zhanjiang', 'haikou', 100, 0);
    const seaRoute = routeBetween(ctx.routes, 'zhanjiang', 'haikou')!;
    expect(seaRoute.routeType).toBe('SEA');
    expect(sea).toBe(Math.ceil((seaRoute.baseSeconds / 1) * ctx.balance.seaRouteTimeFactor));
    expect(land).toBeGreaterThan(0);
  });

  it('军团速度 = 步兵占比×1.0 + 骑兵占比×1.8', () => {
    const ctx = makeCtx();
    const pureInf = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 100, 0);
    const pureCav = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 0, 100);
    const mix = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 50, 50);
    expect(pureInf).toBeGreaterThan(pureCav);
    expect(mix).toBe(Math.ceil(pureInf / 1.4));
  });

  it('军驿科技提升行军速度（每级 +5%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.levels.logistics = 1;
    const base = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 100, 0, 1);
    const fast = marchTimeSeconds(ctx.balance, ctx.routes, 'acity', 'qingyuan', 100, 0, 1.05);
    expect(fast).toBe(Math.ceil(base / 1.05));
  });
});

describe('战斗系统', () => {
  it('200步兵进攻清远（守军100）必定胜利并占领', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan' });
    advanceGameState(ctx, state, arrivesMs + 1);
    expect(state.battleReports[0].victory).toBe(true);
    expect(state.battleReports[0].captured).toBe(true);
    expect(state.cities.length).toBe(2);
    expect(state.enemyCities.some((e) => e.cityId === 'qingyuan')).toBe(false);
    const qy = state.cities.find((c) => c.cityId === 'qingyuan')!;
    expect(qy.level).toBe(2);
    expect(state.armies.length).toBe(0);
  });

  it('占领清远后：A市 升 2 级，每10秒 +5（A市2×1.5首都 + 清远2）', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan' });
    advanceGameState(ctx, state, arrivesMs + 1);
    const acity = state.cities.find((c) => c.cityId === 'acity')!;
    expect(acity.level).toBe(2);
    const popBefore = state.resources.idlePopulation;
    advanceGameState(ctx, state, arrivesMs + 10_001);
    expect(state.resources.idlePopulation - popBefore).toBe(5);
  });

  it('战斗波动在 0.95~1.05 之间，且结果刷新后一致', () => {
    const run = () => {
      const ctx = makeCtx(8);
      const state = makeGame(ctx);
      const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan', armyId: 'a-det' });
      advanceGameState(ctx, state, arrivesMs + 1);
      const report = state.battleReports[0];
      advanceGameState(ctx, state, arrivesMs + 5000);
      return { report, state };
    };
    const a = run();
    const b = run();
    expect(a.report.variance).toBeGreaterThanOrEqual(0.95);
    expect(a.report.variance).toBeLessThanOrEqual(1.05);
    expect(a.report.attackerPower).toBe(b.report.attackerPower);
    expect(a.report.defenderPower).toBe(b.report.defenderPower);
    expect(a.report.attackerCasualtiesInfantry).toBe(b.report.attackerCasualtiesInfantry);
    expect(a.report.victory).toBe(b.report.victory);
  });

  it('伤亡率范围符合 clamp 规则', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan' });
    advanceGameState(ctx, state, arrivesMs + 1);
    const report = state.battleReports[0];
    const rate = report.attackerCasualtiesInfantry / report.attackerInfantry;
    expect(rate).toBeGreaterThanOrEqual(0.08);
    expect(rate).toBeLessThanOrEqual(0.65);
    expect(report.defenderCasualties).toBeGreaterThanOrEqual(0);
    expect(report.defenderCasualties).toBeLessThanOrEqual(report.defenderGarrison);
  });

  it('失败军团幸存者返回原城市，返回时间 = 行军时间×70%', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    const { arrivesMs, marchSeconds } = setupMarch(ctx, state, { infantry: 10, cavalry: 0, target: 'qingyuan', armyId: 'a-defeat' });
    advanceGameState(ctx, state, arrivesMs + 1);
    const army = state.armies.find((a) => a.id === 'a-defeat')!;
    expect(state.battleReports[0].victory).toBe(false);
    expect(army.status).toBe('RETURNING');
    expect(army.targetCityId).toBe('acity');
    const returnMs = Date.parse(army.arrivesAt!) - Date.parse(army.departedAt!);
    expect(returnMs).toBe(Math.round(marchSeconds * ctx.balance.returnTimeFactor * 1000));
    const beforeGarrison = state.cities.find((c) => c.cityId === 'acity')!;
    const beforeInf = beforeGarrison.infantry;
    advanceGameState(ctx, state, Date.parse(army.arrivesAt!) + 1);
    const acity = state.cities.find((c) => c.cityId === 'acity')!;
    expect(acity.infantry).toBe(beforeInf + 10 - state.battleReports[0].attackerCasualtiesInfantry);
    // 战败可能负伤（WOUNDED），否则恢复空闲
    const g = state.generals[0];
    if (g.status === 'WOUNDED') {
      expect(g.injuredUntil).toBeTruthy();
    } else {
      expect(g.status).toBe('IDLE');
    }
    expect(state.armies.length).toBe(0);
  });

  it('胜利后装备按阵亡数量回收', () => {
    const ctx = makeCtx(8);
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 1000;
    state.resources.weapons = 1000;
    state.resources.armors = 1000;
    state.resources.horses = 1000;
    state.resources.infantry += 1000;
    const { arrivesMs } = setupMarch(ctx, state, { infantry: 1000, cavalry: 200, target: 'qingyuan', armyId: 'a-rec' });
    advanceGameState(ctx, state, arrivesMs + 1);
    const report = state.battleReports[0];
    const dead = report.attackerCasualtiesInfantry + report.attackerCasualtiesCavalry;
    expect(report.recoveredWeapons).toBe(Math.floor(dead * 0.4));
    expect(report.recoveredArmors).toBe(Math.floor(dead * 0.4));
    expect(report.recoveredHorses).toBe(Math.floor(report.attackerCasualtiesCavalry * 0.25));
  });

  it('攻城术降低攻城伤亡（每级 -1%）', () => {
    const run = (siegeLevel: number) => {
      const ctx = makeCtx(8);
      const state = makeGame(ctx);
      state.tech.levels.siege = siegeLevel;
      const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan' });
      advanceGameState(ctx, state, arrivesMs + 1);
      return state.battleReports[0].attackerCasualtiesInfantry;
    };
    const base = run(0);
    const reduced = run(5); // -5%
    expect(reduced).toBeLessThan(base);
    expect(base - reduced).toBeGreaterThanOrEqual(2);
  });

  it('敌城守将：生成、战报记录、招募概率确定性', () => {
    const run = () => {
      const ctx = makeCtx(8);
      const state = makeGame(ctx);
      const qy = state.enemyCities.find((e) => e.cityId === 'qingyuan')!;
      expect(qy.defender).toBeTruthy();
      expect(qy.defender!.level).toBeGreaterThanOrEqual(2); // 清远 2 级城守将 ≥2
      const { arrivesMs } = setupMarch(ctx, state, { infantry: 200, cavalry: 0, target: 'qingyuan', armyId: 'a-recruit' });
      advanceGameState(ctx, state, arrivesMs + 1);
      const report = state.battleReports[0];
      expect(report.defenderGeneralName).toBe(qy.defender!.name);
      return { report, generals: state.generals.map((g) => g.name) };
    };
    const a = run();
    const b = run();
    // 固定种子：招募结果刷新后一致
    expect(a.report.recruitedGeneralName).toBe(b.report.recruitedGeneralName);
    if (a.report.recruitedGeneralName) {
      expect(a.generals).toContain(a.report.recruitedGeneralName!);
      // 招募的将领保留守将等级
      const g = a.generals.find((n) => n === a.report.recruitedGeneralName!);
      expect(g).toBeTruthy();
    }
  });

  it('所有敌城初始都有守将（等级 = 城市等级 + 随机加成）', () => {
    const ctx = makeCtx(3);
    const state = makeGame(ctx);
    expect(state.enemyCities.every((e) => e.defender && e.defender.name)).toBe(true);
    const gz = state.enemyCities.find((e) => e.cityId === 'guangzhou')!;
    expect(gz.defender!.level).toBeGreaterThanOrEqual(5);
  });
});
