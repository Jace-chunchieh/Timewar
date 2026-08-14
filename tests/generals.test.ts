import { describe, expect, it } from 'vitest';
import {
  advanceGameState,
  commandCap,
  generalPowerMultiplier,
  itemProbability,
  talismanCost,
  techUpgradeCost,
  techUpgradeCostNext,
  xpNeeded,
} from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, T0 } from './helpers.js';

describe('将领系统', () => {
  it('1级将领统帅上限为200', () => {
    const ctx = makeCtx();
    expect(commandCap(ctx.balance, 1)).toBe(200);
  });

  it('5级将领统帅上限为600', () => {
    const ctx = makeCtx();
    expect(commandCap(ctx.balance, 5)).toBe(600);
  });

  it('统帅之道提升统帅上限（每级 +5%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.levels.command = 2;
    expect(commandCap(ctx.balance, 5, state)).toBe(660);
  });

  it('升级所需经验 = 300 × 当前等级²', () => {
    const ctx = makeCtx();
    expect(xpNeeded(ctx.balance, 1)).toBe(300);
    expect(xpNeeded(ctx.balance, 2)).toBe(1200);
    expect(xpNeeded(ctx.balance, 10)).toBe(30_000);
  });

  it('将领训练300秒后从1级升到2级', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    const g = state.generals[0];
    g.status = 'TRAINING';
    g.trainingStartedAt = iso(T0);
    g.lastXpCalculatedAt = iso(T0);
    advanceGameState(ctx, state, T0 + 300_000);
    expect(g.level).toBe(2);
    expect(g.xp).toBe(0);
  });

  it('训练可随时停止，已获得经验保留', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    const g = state.generals[0];
    g.status = 'TRAINING';
    g.trainingStartedAt = iso(T0);
    g.lastXpCalculatedAt = iso(T0);
    advanceGameState(ctx, state, T0 + 100_000);
    const xpBefore = g.xp;
    expect(xpBefore).toBeGreaterThan(0);
    g.status = 'IDLE';
    g.lastXpCalculatedAt = undefined;
    advanceGameState(ctx, state, T0 + 200_000);
    expect(g.xp).toBe(xpBefore);
  });

  it('将领最多50级，超过上限后经验不再升级', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    const g = state.generals[0];
    g.level = 50;
    g.xp = xpNeeded(ctx.balance, 50) + 100;
    g.status = 'TRAINING';
    g.trainingStartedAt = iso(T0);
    g.lastXpCalculatedAt = iso(T0);
    advanceGameState(ctx, state, T0 + 600_000);
    expect(g.level).toBe(50);
  });

  it('将领战力加成 = 1 + 等级 × 0.02', () => {
    const ctx = makeCtx();
    expect(generalPowerMultiplier(ctx.balance, 1)).toBe(1.02);
    expect(generalPowerMultiplier(ctx.balance, 50)).toBe(2);
  });
});

describe('科技系统', () => {
  it('科技升级费用 = 5000 × n(n+1)/2', () => {
    const ctx = makeCtx();
    expect(techUpgradeCost(ctx.balance, 1)).toBe(5000);
    expect(techUpgradeCost(ctx.balance, 2)).toBe(15000);
    expect(techUpgradeCostNext(ctx.balance, 0)).toBe(5000);
    expect(techUpgradeCostNext(ctx.balance, 1)).toBe(15000);
  });

  it('神行符概率 = (0.01% + 人数/100 × 0.001%) × 强化倍率', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.researchWorkers = 1000;
    expect(itemProbability(ctx.balance, state, 'talisman')).toBe(0); // 未达基准 10000
    state.tech.researchWorkers = 10_000;
    expect(itemProbability(ctx.balance, state, 'talisman')).toBeCloseTo(0.0001 + 100 * 0.00001);
    state.tech.researchWorkers = 50_000;
    expect(itemProbability(ctx.balance, state, 'talisman')).toBeCloseTo(0.0001 + 500 * 0.00001);
    state.tech.levels.talismanMastery = 1; // +20%
    expect(itemProbability(ctx.balance, state, 'talisman')).toBeCloseTo((0.0001 + 500 * 0.00001) * 1.2);
  });

  it('神行符判定幂等且按 10 秒周期推进', () => {
    const ctx = makeCtx(3);
    const state = makeGame(ctx);
    state.tech.researchWorkers = 10_000;
    state.tech.lastTalismanRollAt = iso(T0);
    advanceGameState(ctx, state, T0 + 10_000);
    const gained = state.tech.talismans;
    const after = state.tech.lastTalismanRollAt!;
    advanceGameState(ctx, state, T0 + 10_000); // 重复结算不重复获得
    expect(state.tech.talismans).toBe(gained);
    expect(state.tech.lastTalismanRollAt).toBe(after);
  });

  it('神行符跨省消耗：接壤=1，隔1省=2，同省=1', () => {
    const ctx = makeCtx();
    expect(talismanCost(ctx.balance, 'gd', 'gx')).toBe(1); // 接壤
    expect(talismanCost(ctx.balance, 'gd', 'hb')).toBe(2); // gd→hn→hb
    expect(talismanCost(ctx.balance, 'gd', 'gd')).toBe(1); // 同省
    expect(talismanCost(ctx.balance, 'gd', 'xj')).toBeGreaterThan(1);
  });
});
