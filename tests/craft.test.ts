import { describe, expect, it } from 'vitest';
import { craftSoldiers, maxCraftable } from '../apps/server/src/engine/index.js';
import { makeCtx, makeGame } from './helpers.js';

describe('士兵合成（验收 22.4）', () => {
  it('合成1步兵准确扣除1训练人口、1武器、1盔甲', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 5;
    state.resources.weapons = 3;
    state.resources.armors = 4;
    state.resources.horses = 1;
    const result = craftSoldiers(ctx.balance, state, 1, 0);
    expect(result).toEqual({ infantry: 1, cavalry: 0 });
    expect(state.resources.trainedPopulation).toBe(4);
    expect(state.resources.weapons).toBe(2);
    expect(state.resources.armors).toBe(3);
    expect(state.resources.horses).toBe(1);
    expect(state.resources.infantry).toBe(201);
  });

  it('合成1骑兵额外扣除1战马', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 5;
    state.resources.weapons = 3;
    state.resources.armors = 4;
    state.resources.horses = 1;
    craftSoldiers(ctx.balance, state, 0, 1);
    expect(state.resources.trainedPopulation).toBe(4);
    expect(state.resources.weapons).toBe(2);
    expect(state.resources.armors).toBe(3);
    expect(state.resources.horses).toBe(0);
    expect(state.resources.cavalry).toBe(1);
  });

  it('任一资源不足时，事务整体失败，资源不变化', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 2;
    state.resources.weapons = 1;
    state.resources.armors = 9;
    state.resources.horses = 0;
    const before = structuredClone(state);
    expect(() => craftSoldiers(ctx.balance, state, 2, 0)).toThrow('INSUFFICIENT_RESOURCES');
    expect(state).toEqual(before);
  });

  it('骑兵缺少战马时整体失败', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 5;
    state.resources.weapons = 5;
    state.resources.armors = 5;
    state.resources.horses = 0;
    const before = structuredClone(state);
    expect(() => craftSoldiers(ctx.balance, state, 0, 1)).toThrow('INSUFFICIENT_RESOURCES');
    expect(state).toEqual(before);
  });

  it('最大可合成数量计算正确', () => {
    const ctx = makeCtx();
    const state = makeGame(ctx);
    state.resources.trainedPopulation = 10;
    state.resources.weapons = 7;
    state.resources.armors = 5;
    state.resources.horses = 2;
    expect(maxCraftable(state)).toEqual({ infantry: 5, cavalry: 2 });
  });
});
