import { describe, expect, it } from 'vitest';
import {
  activeTrainingCount,
  advanceGameState,
  trainingDurationFor,
} from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, T0 } from './helpers.js';

describe('人口训练', () => {
  it('训练时长随人数增长：100人 = 600 + 99×0.6 ≈ 659 秒', () => {
    const ctx = makeCtx();
    expect(trainingDurationFor(ctx.balance, 1)).toBe(600);
    expect(trainingDurationFor(ctx.balance, 100)).toBe(Math.round(600 + 99 * 0.6));
    expect(trainingDurationFor(ctx.balance, 1000)).toBe(Math.round(600 + 999 * 0.6));
    expect(trainingDurationFor(ctx.balance, 5000)).toBe(Math.round(600 + 4999 * 0.6));
  });

  it('训练无人数上限（1 人即可开批，万人批也允许）', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    state.resources.idlePopulation = 20000;
    state.trainingBatches.push({
      id: 't1',
      count: 10000,
      startedAt: iso(T0),
      completesAt: iso(T0 + trainingDurationFor(ctx.balance, 10000) * 1000),
    });
    advanceGameState(ctx, state, T0 + trainingDurationFor(ctx.balance, 10000) * 1000);
    expect(state.trainingBatches.length).toBe(0);
    expect(state.resources.trainedPopulation + state.generals.length - 1).toBe(10000);
  });

  it('训练未到完成时间不能提前产生结果', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    const durationMs = trainingDurationFor(ctx.balance, 100) * 1000;
    state.trainingBatches.push({
      id: 't1',
      count: 100,
      startedAt: iso(T0),
      completesAt: iso(T0 + durationMs),
    });
    advanceGameState(ctx, state, T0 + durationMs - 1);
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
      completesAt: iso(T0 + trainingDurationFor(ctx.balance, 100) * 1000),
    });
    advanceGameState(ctx, state, T0 + trainingDurationFor(ctx.balance, 100) * 1000);
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
        completesAt: iso(T0 + trainingDurationFor(ctx.balance, 100_000) * 1000),
      });
      advanceGameState(ctx, state, T0 + trainingDurationFor(ctx.balance, 100_000) * 1000);
      return {
        generals: state.generals.slice(1).map((g) => g.name),
        trained: state.resources.trainedPopulation,
      };
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
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
