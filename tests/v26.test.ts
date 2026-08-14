import { describe, expect, it } from 'vitest';
import {
  advanceGameState,
  itemProbability,
  rollItem,
} from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, T0 } from './helpers.js';

describe('v2.6 军团旗与加速符', () => {
  it('军团旗概率：基准100万人口，同投入下难10倍于神行符', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.researchWorkers = 500_000;
    expect(itemProbability(ctx.balance, state, 'banner')).toBe(0); // 未达基准
    state.tech.researchWorkers = 1_000_000;
    const banner = itemProbability(ctx.balance, state, 'banner');
    const talisman = itemProbability(ctx.balance, state, 'talisman');
    // 同投入人数下：军团旗概率 = 神行符 ÷ 10（难10倍）
    // 100 万投入：神行符 ≈ 10.01%，军团旗 ≈ 1.001%
    expect(banner).toBeCloseTo(0.01001);
    expect(banner * 10).toBeCloseTo(talisman, 5);
  });

  it('加速符概率：基准1000人，比神行符更易获得', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.tech.researchWorkers = 1000;
    const speedup = itemProbability(ctx.balance, state, 'speedup');
    const talisman = itemProbability(ctx.balance, state, 'talisman');
    expect(speedup).toBeGreaterThan(talisman);
    expect(speedup).toBeCloseTo(0.0002);
  });

  it('三种物品独立判定且幂等', () => {
    const ctx = makeCtx(5);
    const state = makeGame(ctx);
    state.tech.researchWorkers = 2_000_000;
    state.tech.lastTalismanRollAt = iso(T0);
    state.tech.lastBannerRollAt = iso(T0);
    state.tech.lastSpeedupRollAt = iso(T0);
    advanceGameState(ctx, state, T0 + 10_000);
    const totals = { t: state.tech.talismans, b: state.tech.bannerFlags, s: state.tech.speedUps };
    advanceGameState(ctx, state, T0 + 10_000);
    expect(state.tech.talismans).toBe(totals.t);
    expect(state.tech.bannerFlags).toBe(totals.b);
    expect(state.tech.speedUps).toBe(totals.s);
  });

  it('rollItem 幂等推进（同种子复现）', () => {
    const ctx = makeCtx(7);
    const state = makeGame(ctx);
    state.tech.researchWorkers = 2_000_000;
    state.tech.lastBannerRollAt = iso(T0);
    const rng = () => 0.5;
    const r1 = rollItem(ctx.balance, state, 'banner', T0 + 10_000, rng);
    const after = state.tech.bannerFlags;
    const r2 = rollItem(ctx.balance, state, 'banner', T0 + 10_000, rng);
    expect(r2.gained).toBe(0);
    expect(state.tech.bannerFlags).toBe(after);
    expect(r1.rolls).toBe(1);
  });
});
