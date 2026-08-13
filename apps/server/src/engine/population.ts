import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import { techEffects } from './tech.js';

export interface PopulationResult {
  gained: number;
  completedCycles: number;
}

// 省份是否被完整占领
export function provinceComplete(state: GameState, cities: CityConfig[], provinceId: string): boolean {
  const provinceCities = cities.filter((c) => c.provinceId === provinceId);
  if (provinceCities.length === 0) return false;
  return provinceCities.every((c) => state.cities.some((pc) => pc.cityId === c.id));
}

// 城市人口权重（等级加权 × 首都加成 × 省域加成）
export function cityPopulationWeight(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  playerCity: { cityId: string; level: number }
): number {
  let weight = balance.populationPerCityPerInterval[String(playerCity.level)] ?? 1;
  if (playerCity.cityId === state.capitalCityId) {
    weight *= 1 + balance.capitalPopulationBonus;
  }
  const config = cities.find((c) => c.id === playerCity.cityId);
  if (config && provinceComplete(state, cities, config.provinceId)) {
    weight *= 1 + balance.provinceCompleteBonus;
  }
  return weight;
}

// 人口余数结算：每 populationIntervalSeconds 秒增长 Σ(城市权重) × 军屯加成
export function advancePopulation(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  nowMs: number
): PopulationResult {
  const intervalMs = balance.populationIntervalSeconds * 1000;
  const lastAt = Date.parse(state.lastCalculatedAt);
  const elapsedMs = Math.max(0, nowMs - lastAt);
  const weight = state.cities.reduce(
    (sum, c) => sum + cityPopulationWeight(balance, cities, state, c),
    0
  );
  const total = state.populationRemainderMs + elapsedMs;
  const completedCycles = Math.floor(total / intervalMs);
  const gained = completedCycles * weight * techEffects(balance, state).populationRate;
  state.populationRemainderMs = total % intervalMs;
  state.resources.idlePopulation += Math.floor(gained);
  return { gained: Math.floor(gained), completedCycles };
}
