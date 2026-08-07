import type { CityConfig, GameState } from '@timewar/shared';

// A市：虚拟初始城市，等级 = max(1, 玩家真实城市最高等级)，动态升级不入存档
export const ACITY_ID = 'acity';

export function isAcity(cityId: string): boolean {
  return cityId === ACITY_ID;
}

// 计算 A市 当前等级（真实城市指配置中非虚拟城市）
export function computeAcityLevel(cities: CityConfig[], state: GameState): number {
  let maxLevel = 1;
  for (const c of state.cities) {
    if (c.cityId === ACITY_ID) continue;
    const cfg = cities.find((x) => x.id === c.cityId);
    if (cfg && cfg.level > maxLevel) maxLevel = cfg.level;
  }
  return maxLevel;
}

// 同步 A市 等级到存档（幂等）
export function syncAcityLevel(cities: CityConfig[], state: GameState): void {
  const acity = state.cities.find((c) => c.cityId === ACITY_ID);
  if (!acity) return;
  acity.level = computeAcityLevel(cities, state);
}
