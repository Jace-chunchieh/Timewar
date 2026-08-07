import { describe, expect, it } from 'vitest';
import { advanceGameState } from '../apps/server/src/engine/index.js';
import { iso, makeCtx, makeGame, occupy, T0 } from './helpers.js';

describe('生产系统', () => {
  it('100人制造武器，30秒完成1件', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    advanceGameState(ctx, state, T0 + 30_000);
    expect(state.resources.weapons).toBe(1);
    expect(state.production.weapon.progress).toBe(0);
  });

  it('100人制造盔甲，45秒完成1件', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.armor.workers = 100;
    advanceGameState(ctx, state, T0 + 45_000);
    expect(state.resources.armors).toBe(1);
  });

  it('100人饲养战马，90秒完成1匹', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.horse.workers = 100;
    advanceGameState(ctx, state, T0 + 90_000);
    expect(state.resources.horses).toBe(1);
  });

  it('1000人制造武器，3秒完成1件', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 1000;
    advanceGameState(ctx, state, T0 + 3_000);
    expect(state.resources.weapons).toBe(1);
  });

  it('撤回生产人口后，已有工作量进度保留', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    advanceGameState(ctx, state, T0 + 15_000);
    expect(state.production.weapon.progress).toBe(1500);
    state.production.weapon.workers = 0;
    advanceGameState(ctx, state, T0 + 30_000);
    expect(state.production.weapon.progress).toBe(1500);
    expect(state.resources.weapons).toBe(0);
  });

  it('多条生产线进度不串线（人口不重复占用）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    state.production.armor.workers = 100;
    state.production.horse.workers = 100;
    advanceGameState(ctx, state, T0 + 30_000);
    expect(state.resources.weapons).toBe(1);
    expect(state.resources.armors).toBe(0);
    expect(state.production.armor.progress).toBe(3000);
    expect(state.resources.horses).toBe(0);
    expect(state.production.horse.progress).toBe(3000);
  });

  it('冶炼科技提升生产效率（每级 +5%）', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.production.weapon.workers = 100;
    state.tech.levels.smithing = 2; // +10%
    advanceGameState(ctx, state, T0 + 30_000);
    // 100 × 30 × 1.1 = 3300 → 1 件，进度 300
    expect(state.resources.weapons).toBe(1);
    expect(state.production.weapon.progress).toBeCloseTo(300, 5);
  });
});
