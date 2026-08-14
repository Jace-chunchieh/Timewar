import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import balanceJson from '../../../../data/game-balance.json';
import citiesJson from '../../../../data/cities.json';
import routesJson from '../../../../data/routes.json';
import nationalJson from '../../../../data/cities-national.json';
import provincesJson from '../../../../data/provinces.json';
import distancesJson from '../../../../data/province-distances.json';

export const balance = balanceJson as unknown as BalanceConfig & { provinceDistances: Record<string, number> };
export const cities = citiesJson as CityConfig[];
export const routes = routesJson as { id: string; from: string; to: string; km: number; baseSeconds: number; routeType: 'LAND' | 'SEA' }[];
export const nationalCities = nationalJson as { id: string; name: string; x: number; y: number }[];
export const provinces = provincesJson as { id: string; name: string; neighbors: string[] }[];

balance.provinceDistances = distancesJson as unknown as Record<string, number>;

export const cityName = (id: string): string => cities.find((c) => c.id === id)?.name ?? id;
export const provinceName = (id: string): string => provinces.find((p) => p.id === id)?.name ?? id;
export const cityProvinceId = (id: string): string =>
  cities.find((c) => c.id === id)?.provinceId ?? '';

export function canAttackClient(state: GameState, targetId: string): boolean {
  const isEnemy = state.enemyCities.some((e) => e.cityId === targetId);
  if (!isEnemy) return false;
  const target = cities.find((c) => c.id === targetId);
  if (!target) return false;
  return target.neighbors.some((n) => state.cities.some((c) => c.cityId === n));
}

export function routeBetweenClient(fromId: string, toId: string) {
  return routes.find(
    (r) => (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
  );
}

// 军团速度系数 = 步兵占比×1.0 + 骑兵占比×1.8
export function speedCoeff(infantry: number, cavalry: number): number {
  const total = infantry + cavalry;
  if (total <= 0) return 1;
  return (infantry + cavalry * 1.8) / total;
}

export function marchTimeClient(
  fromId: string,
  toId: string,
  infantry: number,
  cavalry: number,
  speedMultiplier = 1
): number {
  const route = routeBetweenClient(fromId, toId);
  if (!route) return 0;
  let seconds = route.baseSeconds / speedCoeff(infantry, cavalry);
  if (route.routeType === 'SEA') seconds *= balance.seaRouteTimeFactor;
  return Math.ceil(seconds / speedMultiplier);
}

// 神行符远征兜底：无直达路线时按大圆距离估算行军秒数
export function marchTimeFallbackClient(
  fromId: string,
  toId: string,
  infantry: number,
  cavalry: number,
  speedMultiplier = 1
): number {
  const route = routeBetweenClient(fromId, toId);
  if (route) return marchTimeClient(fromId, toId, infantry, cavalry, speedMultiplier);
  const a = cities.find((c) => c.id === fromId);
  const b = cities.find((c) => c.id === toId);
  if (!a || !b) return 0;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(h));
  return Math.ceil(((km / 100) * balance.marchBaseSecondsPer100Km) / speedCoeff(infantry, cavalry) / speedMultiplier);
}

export function commandCapClient(level: number, state?: GameState): number {
  const base = balance.generalBaseCommand + (level - 1) * balance.generalCommandPerLevel;
  if (!state) return base;
  return Math.round(base * (1 + (state.tech?.levels?.command ?? 0) * balance.tech.command.effectPerLevel));
}

export function xpNeededClient(level: number): number {
  return balance.generalXpBase * level * level;
}

export function troopPoolClient(state: GameState): { infantry: number; cavalry: number } {
  const gi = state.cities.reduce((s, c) => s + c.infantry, 0);
  const gc = state.cities.reduce((s, c) => s + c.cavalry, 0);
  const ai = state.armies.reduce((s, a) => s + a.infantry, 0);
  const ac = state.armies.reduce((s, a) => s + a.cavalry, 0);
  return {
    infantry: Math.max(0, state.resources.infantry - gi - ai),
    cavalry: Math.max(0, state.resources.cavalry - gc - ac),
  };
}

export function enemyGarrison(state: GameState, cityId: string): number {
  return state.enemyCities.find((e) => e.cityId === cityId)?.garrison ?? 0;
}

export function defenseBonusOf(cityId: string): number {
  const level = cities.find((c) => c.id === cityId)?.level ?? 1;
  return balance.cityLevels[String(level)].defenseBonus;
}

// 人口增速：Σ 已占领城市等级权重 × 军屯加成
export function populationRate(state: GameState): number {
  const weight = state.cities.reduce(
    (s, c) => s + (balance.populationPerCityPerInterval[String(c.level)] ?? 1),
    0
  );
  const agronomy = (state.tech?.levels?.agronomy ?? 0) * balance.tech.agronomy.effectPerLevel;
  return Math.floor(weight * (1 + agronomy) * 10) / 10;
}

// 神行符跨省消耗
export function talismanCostClient(fromProvinceId: string, toProvinceId: string): number {
  if (fromProvinceId === toProvinceId) return balance.talisman.sameProvinceCost;
  const d = balance.provinceDistances[`${fromProvinceId}|${toProvinceId}`];
  if (d === undefined) return 99;
  return Math.max(1, d);
}

// 神行符获得概率
export function talismanProbabilityClient(state: GameState): number {
  return itemProbabilityClient(state, 'talisman');
}

// 物品获得概率（神行符/军团旗/加速符）
export function itemProbabilityClient(state: GameState, kind: 'talisman' | 'banner' | 'speedup'): number {
  const workers = state.tech?.researchWorkers ?? 0;
  const cfg = kind === 'talisman' ? balance.talisman : kind === 'banner' ? balance.banner : balance.speedup;
  if (workers < cfg.researchBaseline) return 0;
  const base = cfg.baseProbability + (workers / 100) * cfg.probabilityPer100Workers;
  if (kind === 'talisman') {
    const mastery = (state.tech?.levels?.talismanMastery ?? 0) * balance.tech.talismanMastery.effectPerLevel;
    return base * (1 + mastery);
  }
  return base;
}

// 科技升级费用
export function techCostClient(nextLevel: number): number {
  return balance.tech.costBase * ((nextLevel * (nextLevel + 1)) / 2);
}

export interface ExpectedPowers {
  attackerPower: number;
  defenderPower: number;
  winProbability: number;
}

// 预计战力（展示用，波动按平均值1计算）+ 胜率抽样估算
export function expectedBattle(state: GameState, generalLevel: number, infantry: number, cavalry: number, targetCityId: string): ExpectedPowers {
  const garrison = enemyGarrison(state, targetCityId);
  const defenseBonus = defenseBonusOf(targetCityId);
  const attackerBase =
    infantry * balance.infantryAttack + cavalry * balance.cavalryAttack * balance.cavalrySiegeFactor;
  const attackerPower = attackerBase * (1 + generalLevel * balance.generalPowerPerLevel);
  const defenderPower = garrison * balance.infantryDefense * (1 + defenseBonus);
  let wins = 0;
  const samples = 60;
  for (let i = 0; i < samples; i++) {
    const variance = balance.battleVarianceMin + ((i * 37) % 100) / 100 * (balance.battleVarianceMax - balance.battleVarianceMin);
    if (attackerPower * variance >= defenderPower * variance) wins++;
  }
  return { attackerPower, defenderPower, winProbability: wins / samples };
}

// 客户端展示用时间推进（仅用于进度条/倒计时，服务器才是权威数据源）
export function previewAdvance(state: GameState, nowMs: number): GameState {
  const s = structuredClone(state);
  const elapsed = Math.max(0, nowMs - Date.parse(s.lastCalculatedAt));
  if (elapsed <= 0) return s;
  const effective = Math.min(elapsed, balance.offlineCapSeconds * 1000);
  const intervalMs = balance.populationIntervalSeconds * 1000;
  const total = s.populationRemainderMs + effective;
  const cycles = Math.floor(total / intervalMs);
  const weight = s.cities.reduce(
    (sum, c) => sum + (balance.populationPerCityPerInterval[String(c.level)] ?? 1),
    0
  );
  const agronomy = (s.tech?.levels?.agronomy ?? 0) * balance.tech.agronomy.effectPerLevel;
  s.resources.idlePopulation += Math.floor(cycles * weight * (1 + agronomy));
  s.populationRemainderMs = total % intervalMs;
  const seconds = effective / 1000;
  const efficiency = 1 + (s.tech?.levels?.smithing ?? 0) * balance.tech.smithing.effectPerLevel;
  const items: [keyof typeof s.production, number, keyof typeof s.resources][] = [
    ['weapon', balance.productionWork.weapon, 'weapons'],
    ['armor', balance.productionWork.armor, 'armors'],
    ['horse', balance.productionWork.horse, 'horses'],
  ];
  for (const [key, work, resKey] of items) {
    const line = s.production[key];
    if (line.workers > 0 && seconds > 0) {
      line.progress += line.workers * seconds * efficiency;
      const done = Math.floor(line.progress / work);
      if (done > 0) {
        s.resources[resKey] += done;
        line.progress -= done * work;
      }
    }
  }
  s.lastCalculatedAt = new Date(nowMs).toISOString();
  return s;
}
