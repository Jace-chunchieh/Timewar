import type { BalanceConfig, GameState } from '@timewar/shared';
import { techEffects } from './tech.js';

export interface PopulationResult {
  gained: number;
  completedCycles: number;
}

// 人口余数结算：每 populationIntervalSeconds 秒增长 Σ(城市等级加权 × 军屯加成)
export function advancePopulation(
  balance: BalanceConfig,
  state: GameState,
  nowMs: number
): PopulationResult {
  const intervalMs = balance.populationIntervalSeconds * 1000;
  const lastAt = Date.parse(state.lastCalculatedAt);
  const elapsedMs = Math.max(0, nowMs - lastAt);
  const weight = state.cities.reduce(
    (sum, c) => sum + (balance.populationPerCityPerInterval[String(c.level)] ?? 1),
    0
  );
  const total = state.populationRemainderMs + elapsedMs;
  const completedCycles = Math.floor(total / intervalMs);
  const gained = completedCycles * weight * techEffects(balance, state).populationRate;
  state.populationRemainderMs = total % intervalMs;
  state.resources.idlePopulation += Math.floor(gained);
  return { gained: Math.floor(gained), completedCycles };
}
