import { describe, expect, it } from 'vitest';
import { advanceGameState } from '../apps/server/src/engine/index.js';
import { DAY, HOUR, makeCtx, makeGame, T0 } from './helpers.js';

describe('离线结算（验收 22.7）', () => {
  it('离线1小时与在线运行1小时的理论结果一致', () => {
    const ctx = makeCtx();
    // 离线一次结算 1 小时
    const offline = makeGame(ctx);
    advanceGameState(ctx, offline, T0 + HOUR);
    // 在线分两次结算
    const online = makeGame(ctx);
    advanceGameState(ctx, online, T0 + HOUR / 2);
    advanceGameState(ctx, online, T0 + HOUR);
    expect(offline.resources.idlePopulation).toBe(online.resources.idlePopulation);
    expect(offline.populationRemainderMs).toBe(online.populationRemainderMs);
  });

  it('离线超过24小时只结算24小时', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + 48 * HOUR);
    // 24 小时 = 86400 秒 → 8640 个 10 秒周期 × 1 城市
    expect(state.resources.idlePopulation - 500).toBe((24 * HOUR / 10_000) * 1);
    expect(state.populationRemainderMs).toBe(0);
  });

  it('同一离线区间不能重复领取', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + 5 * HOUR);
    const once = state.resources.idlePopulation;
    advanceGameState(ctx, state, T0 + 5 * HOUR);
    expect(state.resources.idlePopulation).toBe(once);
  });

  it('离线报告中的汇总数量与存档变化一致', () => {
    const ctx = makeCtx(6);
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    state.production.armor.workers = 100;
    state.production.horse.workers = 100;
    state.trainingBatches.push({
      id: 't1',
      count: 100,
      startedAt: new Date(T0).toISOString(),
      completesAt: new Date(T0 + 600_000).toISOString(),
    });
    const general = state.generals[0];
    general.status = 'TRAINING';
    general.trainingStartedAt = new Date(T0).toISOString();
    general.lastXpCalculatedAt = new Date(T0).toISOString();
    advanceGameState(ctx, state, T0 + 10 * HOUR);
    const report = state.offlineReport!;
    expect(report).toBeDefined();
    expect(report.offlineMs).toBe(10 * HOUR);
    // 与存档变化的差值完全一致
    expect(report.populationGained).toBe(state.resources.idlePopulation - 500);
    expect(report.weaponsProduced).toBe(state.resources.weapons);
    expect(report.armorsProduced).toBe(state.resources.armors);
    expect(report.horsesProduced).toBe(state.resources.horses);
    expect(report.trainedCompleted).toBe(
      state.resources.trainedPopulation + (state.generals.length - 1)
    );
    expect(report.generalsCreated).toBe(state.generals.length - 1);
    expect(report.generalXpGained).toBe(36_000);
    // 武器生产理论值：100人 × 36000 秒 / 3000 = 1200
    expect(report.weaponsProduced).toBe(1200);
    expect(report.armorsProduced).toBe(800);
    expect(report.horsesProduced).toBe(400);
  });

  it('离线报告只生成一次，重复加载不重新生成', () => {
    const ctx = makeCtx(6);
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + HOUR);
    const report = state.offlineReport!;
    const after = structuredClone(state);
    advanceGameState(ctx, after, T0 + HOUR + 1000);
    expect(after.offlineReport?.id).toBe(report.id);
    expect(after.offlineReport?.offlineMs).toBe(HOUR);
  });

  it('离线不足60秒不生成离线报告', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + 30_000);
    expect(state.offlineReport).toBeUndefined();
  });

  it('离线24小时上限生效于生产结算', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    advanceGameState(ctx, state, T0 + 48 * HOUR);
    // 100人 × 86400秒 / 3000 = 2880 件（仅24小时）
    expect(state.resources.weapons).toBe(2880);
  });
});
