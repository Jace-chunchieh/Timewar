import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import { defaultTechState } from './tech.js';
import { seededGarrison } from './enemy.js';
import { hashString, mulberry32, randomChineseName, randomInt } from './rng.js';
import { syncTalents } from './generals.js';

export const CURRENT_VERSION = 6;

// 存档迁移：v1（粤桂琼）→ v2（全国）→ v3（守将）→ v5（多将领/天赋/首都/营地）
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
      defender: {
        name: randomChineseName(rng),
        level: Math.max(1, c.level + randomInt(balance.defender.levelBonusMin, balance.defender.levelBonusMax, rng)),
      },
    });
  }

  // 旧版玩家城市补 level 字段（从配置读取）
  for (const c of state.cities) {
    const cfg = cities.find((x) => x.id === c.cityId);
    if (cfg) c.level = cfg.level;
    else c.level = 1;
  }

  // 旧版敌方城市补守将（固定种子生成，幂等）
  for (const e of state.enemyCities) {
    if (!e.defender) {
      const rng = mulberry32(hashString(`defender:${e.cityId}`));
      const cfg = cities.find((x) => x.id === e.cityId);
      e.defender = {
        name: randomChineseName(rng),
        level: Math.max(1, (cfg?.level ?? 1) + randomInt(balance.defender.levelBonusMin, balance.defender.levelBonusMax, rng)),
      };
    }
  }

  // v5：将领补天赋、军团补 generalIds、首都/营地初始化
  for (const g of state.generals) {
    if (!g.talents) g.talents = [];
    syncTalents(balance, g);
  }
  if (!state.capitalCityId) state.capitalCityId = balance.capitalCityId;
  if (!state.barbarianCamps) state.barbarianCamps = [];

  // v6：旧临时军团转永久军团（军团长=原主将，成员=原将领列表）；tech 补新物品字段
  for (const a of state.armies) {
    const legacyIds = (a as unknown as { generalIds?: string[]; generalId?: string }).generalIds;
    const legacyLead = (a as unknown as { generalId?: string }).generalId;
    const members = legacyIds && legacyIds.length > 0 ? legacyIds : legacyLead ? [legacyLead] : [];
    a.memberGeneralIds = members.length > 0 ? members : [a.bannerGeneralId];
    a.name = a.name || '旧军团';
    if (!a.bannerGeneralId) a.bannerGeneralId = a.memberGeneralIds[0];
    if (!a.strategy) a.strategy = 'NORMAL';
  }
  const t = state.tech;
  if (t) {
    if (t.bannerFlags === undefined) t.bannerFlags = 0;
    if (t.speedUps === undefined) t.speedUps = 0;
    if (!t.lastBannerRollAt) t.lastBannerRollAt = nowIso;
    if (!t.lastSpeedupRollAt) t.lastSpeedupRollAt = nowIso;
  }
  for (const c of state.cities) {
    if (!c.generalIds && c.generalId) c.generalIds = [c.generalId];
  }

  return state;
}
