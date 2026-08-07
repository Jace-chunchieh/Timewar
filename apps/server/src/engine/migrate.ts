import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import { defaultTechState } from './tech.js';
import { seededGarrison } from './enemy.js';
import { hashString, mulberry32 } from './rng.js';

export const CURRENT_VERSION = 2;

// 存档迁移：v1（粤桂琼 44 城版）→ v2（全国版 + A市 + 科技）
// 规则：旧玩家城市保留；新配置城市补为敌方城市（seed 生成守军）；补全 tech；A市 若不存在则加入为敌方城市
export function migrateGameState(
  balance: BalanceConfig,
  cities: CityConfig[],
  raw: GameState
): GameState {
  const state = structuredClone(raw) as GameState;
  state.version = CURRENT_VERSION;

  if (!state.tech) {
    state.tech = defaultTechState(state.lastCalculatedAt ?? state.updatedAt);
  }

  const nowIso = state.lastCalculatedAt ?? state.updatedAt;
  const playerIds = new Set(state.cities.map((c) => c.cityId));
  const enemyIds = new Set(state.enemyCities.map((e) => e.cityId));

  for (const c of cities) {
    if (c.id === balance.startCityId) continue;
    if (playerIds.has(c.id) || enemyIds.has(c.id)) continue;
    const rng = mulberry32(hashString(`migrate:${c.id}`));
    const garrison = seededGarrison(balance, cities, c.id, rng);
    state.enemyCities.push({
      cityId: c.id,
      garrison,
      lastGrowthAt: nowIso,
      initialGarrison: garrison,
    });
  }

  // 旧版玩家城市补 level 字段（从配置读取）
  for (const c of state.cities) {
    const cfg = cities.find((x) => x.id === c.cityId);
    if (cfg) c.level = cfg.level;
    else c.level = 1;
  }

  return state;
}
