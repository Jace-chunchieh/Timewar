import { loadGameData } from '../apps/server/src/config.js';
import { createNewGame, mulberry32, type EngineContext } from '../apps/server/src/engine/index.js';
import type { GameState } from '@timewar/shared';

export const T0 = Date.parse('2026-01-01T00:00:00.000Z');
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function makeCtx(seed = 42): EngineContext {
  const data = loadGameData();
  return {
    balance: data.balance,
    cities: data.cities,
    routes: data.routes,
    rng: mulberry32(seed),
  };
}

export function makeGame(ctx: EngineContext, t = T0): GameState {
  return createNewGame(ctx.balance, ctx.cities, ctx.rng, t);
}

export const iso = (t: number) => new Date(t).toISOString();

// 便捷：占领一座配置城市（测试用，直接注入玩家城市）
export function occupy(ctx: EngineContext, state: GameState, cityId: string, t = T0): void {
  const cfg = ctx.cities.find((c) => c.id === cityId)!;
  const enemyIdx = state.enemyCities.findIndex((e) => e.cityId === cityId);
  if (enemyIdx >= 0) state.enemyCities.splice(enemyIdx, 1);
  if (!state.cities.some((c) => c.cityId === cityId)) {
    state.cities.push({
      cityId,
      occupiedAt: iso(t),
      level: cfg.level,
      infantry: 0,
      cavalry: 0,
    });
  }
}
