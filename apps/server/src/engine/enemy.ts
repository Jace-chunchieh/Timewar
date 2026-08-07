import type { BalanceConfig, CityConfig, EnemyCityState, GameState } from '@timewar/shared';
import { randomInt } from './rng.js';

export interface EnemyGrowthResult {
  cityId: string;
  added: number;
}

export function cityLevelOf(cities: CityConfig[], cityId: string): number {
  return cities.find((c) => c.id === cityId)?.level ?? 1;
}

// 敌方城市成长：每 10 分钟按等级增长值增加守军，上限为守军上限
export function advanceEnemyGrowth(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  nowMs: number
): EnemyGrowthResult[] {
  const growthIntervalMs = 10 * 60 * 1000;
  const results: EnemyGrowthResult[] = [];
  for (const e of state.enemyCities) {
    const config = balance.cityLevels[String(cityLevelOf(cities, e.cityId))];
    if (!config) continue;
    const elapsed = nowMs - Date.parse(e.lastGrowthAt);
    const ticks = Math.floor(elapsed / growthIntervalMs);
    if (ticks <= 0) continue;
    const added = Math.min(ticks * config.growthPer10Min, config.garrisonCap - e.garrison);
    e.garrison += added;
    e.lastGrowthAt = new Date(Date.parse(e.lastGrowthAt) + ticks * growthIntervalMs).toISOString();
    if (added > 0) results.push({ cityId: e.cityId, added });
  }
  return results;
}

// 初始守军：等级范围内用固定种子（cityId）生成，生成后永久保存
export function seededGarrison(balance: BalanceConfig, cities: CityConfig[], cityId: string, rng: () => number): number {
  if (cityId === balance.qingyuanCityId) {
    return balance.newGame.qingyuanFixedGarrison;
  }
  const config = balance.cityLevels[String(cityLevelOf(cities, cityId))];
  if (!config) return 100;
  return randomInt(config.garrisonMin, config.garrisonMax, rng);
}
