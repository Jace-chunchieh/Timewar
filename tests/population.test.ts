import { describe, expect, it } from 'vitest';
import { advanceGameState, syncAcityLevel } from '../apps/server/src/engine/index.js';
import { HOUR, iso, makeCtx, makeGame, occupy, T0 } from './helpers.js';

describe('人口增长（等级加权）', () => {
  it('开局仅 A市（1级）：经过10秒增加1人口', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    expect(state.cities[0].cityId).toBe('acity');
    expect(state.cities[0].level).toBe(1);
    advanceGameState(ctx, state, T0 + 10_000);
    expect(state.resources.idlePopulation).toBe(501);
    expect(state.populationRemainderMs).toBe(0);
  });

  it('占领清远（2级）后：A市 自动升 2 级，每10秒 +4（2+2）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    occupy(ctx, state, 'qingyuan');
    advanceGameState(ctx, state, T0 + 10_000);
    const acity = state.cities.find((c) => c.cityId === 'acity')!;
    expect(acity.level).toBe(2);
    expect(state.resources.idlePopulation).toBe(504);
  });

  it('占领 5 级城市后 A市 升到 5 级（动态取玩家真实城市最高等级）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    occupy(ctx, state, 'guangzhou'); // 5 级
    syncAcityLevel(ctx.cities, state);
    expect(state.cities.find((c) => c.cityId === 'acity')!.level).toBe(5);
  });

  it('占领3座城市离线1小时：A市自动升4级(4+4+4) = 12/10秒 → +43200', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    occupy(ctx, state, 'foshan');
    occupy(ctx, state, 'dongguan');
    advanceGameState(ctx, state, T0 + HOUR);
    // A市 随最高真实城市(4级)升到 4 级 → 4+4+4 = 12/10秒
    expect(state.resources.idlePopulation).toBe(500 + 360 * 12);
  });

  it('经过9秒不增加人口，累计到10秒后增加', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + 9_000);
    expect(state.resources.idlePopulation).toBe(500);
    expect(state.populationRemainderMs).toBe(9_000);
    advanceGameState(ctx, state, T0 + 10_000);
    expect(state.resources.idlePopulation).toBe(501);
  });

  it('刷新页面不能重复增加人口（同一时间戳幂等）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    advanceGameState(ctx, state, T0 + HOUR);
    const once = state.resources.idlePopulation;
    advanceGameState(ctx, state, T0 + HOUR);
    expect(state.resources.idlePopulation).toBe(once);
  });

  it('军屯科技提升人口产出（每级 +5%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.levels.agronomy = 2;
    advanceGameState(ctx, state, T0 + 100_000);
    // 10 周期 × 1 × 1.1 = 11
    expect(state.resources.idlePopulation - 500).toBe(11);
  });
});
