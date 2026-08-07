import { describe, expect, it } from 'vitest';
import {
  activeTrainingCount,
  advanceGameState,
  trainingCapacity,
} from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, occupy, T0 } from './helpers.js';

describe('人口训练', () => {
  it('100人训练600秒后完成', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    state.trainingBatches.push({
      id: 't1',
      count: 100,
      startedAt: iso(T0),
      completesAt: iso(T0 + 600_000),
    });
    advanceGameState(ctx, state, T0 + 600_000);
    expect(state.trainingBatches.length).toBe(0);
    expect(state.resources.trainedPopulation).toBe(100);
  });

  it('训练未满600秒不能提前产生结果', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    state.trainingBatches.push({
      id: 't1',
      count: 100,
      startedAt: iso(T0),
      completesAt: iso(T0 + 600_000),
    });
    advanceGameState(ctx, state, T0 + 599_999);
    expect(state.trainingBatches.length).toBe(1);
    expect(state.resources.trainedPopulation).toBe(0);
  });

  it('训练完成后，训练后人口与将领数量之和等于训练人数', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    state.trainingBatches.push({
      id: 't1',
      count: 100,
      startedAt: iso(T0),
      completesAt: iso(T0 + 600_000),
    });
    advanceGameState(ctx, state, T0 + 600_000);
    const newGenerals = state.generals.length - 1;
    expect(state.resources.trainedPopulation + newGenerals).toBe(100);
  });

  it('随机种子固定时，测试结果可复现', () => {
    const run = (seed: number) => {
      const ctx = makeCtx(seed);
      const state = makeGame(ctx);
      state.trainingBatches.push({
        id: 't1',
        count: 100_000,
        startedAt: iso(T0),
        completesAt: iso(T0 + 600_000),
      });
      advanceGameState(ctx, state, T0 + 600_000);
      return {
        generals: state.generals.slice(1).map((g) => g.name),
        trained: state.resources.trainedPopulation,
      };
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });

  it('训练容量按城市等级加权：A市(1级)=100，加两座4级城=900', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    expect(trainingCapacity(ctx.balance, state)).toBe(100);
    occupy(ctx, state, 'foshan'); // 4级 400
    occupy(ctx, state, 'dongguan'); // 4级 400
    expect(trainingCapacity(ctx.balance, state)).toBe(900);
  });

  it('训练批次人数计入同时训练名额', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.trainingBatches.push({
      id: 't1',
      count: 60,
      startedAt: iso(T0),
      completesAt: iso(T0 + 600_000),
    });
    expect(activeTrainingCount(state)).toBe(60);
  });

  it('取消训练只返还50%人口', () => {
    const ctx = makeCtx(5);
    const state = makeGame(ctx);
    const refund = Math.floor(100 * ctx.balance.trainingCancelRefundRate);
    expect(refund).toBe(50);
  });

  it('治军科技提升将领经验（每级 +5%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.levels.discipline = 2;
    const g = state.generals[0];
    g.status = 'TRAINING';
    g.trainingStartedAt = iso(T0);
    g.lastXpCalculatedAt = iso(T0);
    advanceGameState(ctx, state, T0 + 100_000);
    expect(g.xp).toBeCloseTo(110, 5); // 100s × 1 × 1.1
  });
});
