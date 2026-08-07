import type {
  Army,
  BalanceConfig,
  CityConfig,
  GameState,
  RouteConfig,
} from '@timewar/shared';
import { commandCap } from './generals.js';
import { techEffects } from './tech.js';

export function routeBetween(
  routes: RouteConfig[],
  fromId: string,
  toId: string
): RouteConfig | undefined {
  return routes.find(
    (r) =>
      (r.from === fromId && r.to === toId) || (r.from === toId && r.to === fromId)
  );
}

// 军团速度系数 = 步兵占比 × 1.0 + 骑兵占比 × 1.8
export function armySpeedCoefficient(infantry: number, cavalry: number): number {
  const total = infantry + cavalry;
  if (total <= 0) return 1;
  return (infantry * 1 + cavalry * 1.8) / total;
}

// 行军时间秒数 = 路线基础秒数 ÷ 军团速度系数 ÷ 军驿加成；海路 × 1.5
// noRouteKm：无直达路线时按大圆距离兜底（神行符远征）
export function marchTimeSeconds(
  balance: BalanceConfig,
  routes: RouteConfig[],
  fromId: string,
  toId: string,
  infantry: number,
  cavalry: number,
  speedMultiplier = 1,
  noRouteKm?: number
): number {
  const route = routeBetween(routes, fromId, toId);
  let seconds: number;
  if (route) {
    seconds = route.baseSeconds / armySpeedCoefficient(infantry, cavalry);
    if (route.routeType === 'SEA') seconds *= balance.seaRouteTimeFactor;
  } else if (noRouteKm !== undefined) {
    seconds = ((noRouteKm / 100) * balance.marchBaseSecondsPer100Km) / armySpeedCoefficient(infantry, cavalry);
  } else {
    throw new Error('NO_ROUTE');
  }
  seconds = seconds / speedMultiplier;
  return Math.ceil(seconds);
}

export function isEnemyCity(state: GameState, cityId: string): boolean {
  return state.enemyCities.some((e) => e.cityId === cityId);
}

export function isPlayerCity(state: GameState, cityId: string): boolean {
  return state.cities.some((c) => c.cityId === cityId);
}

// 可攻击判定：目标为敌方城市，且至少与一座己方城市相邻（路线相连）
export function canAttack(cities: CityConfig[], state: GameState, targetCityId: string): boolean {
  if (!isEnemyCity(state, targetCityId)) return false;
  const target = cities.find((c) => c.id === targetCityId);
  if (!target) return false;
  return target.neighbors.some((n) => isPlayerCity(state, n));
}

export function marchEligibility(
  balance: BalanceConfig,
  state: GameState,
  army: Army
): { ok: boolean; reason?: string; maxCommand?: number; commandUsed?: number } {
  const general = state.generals.find((g) => g.id === army.generalId);
  if (!general) return { ok: false, reason: '将领不存在' };
  if (general.status !== 'IDLE') return { ok: false, reason: '将领当前不可出征' };
  const cap = commandCap(balance, general.level, state);
  const used = army.infantry + army.cavalry;
  if (used > cap) {
    return {
      ok: false,
      reason: `当前军团 ${used} 人，将领统帅 ${cap} 人，超出 ${used - cap} 人`,
      maxCommand: cap,
      commandUsed: used,
    };
  }
  return { ok: true, maxCommand: cap, commandUsed: used };
}

// 到达己方城市：转为驻军
export function mergeIntoCity(
  state: GameState,
  cityId: string,
  infantry: number,
  cavalry: number,
  generalId?: string,
  nowMs?: number
): void {
  const city = state.cities.find((c) => c.cityId === cityId);
  if (!city) return;
  city.infantry += infantry;
  city.cavalry += cavalry;
  if (generalId) {
    const general = state.generals.find((g) => g.id === generalId);
    if (general) {
      general.status = 'GARRISON';
      general.cityId = cityId;
      general.armyId = undefined;
    }
    city.generalId = generalId;
  }
  if (nowMs) city.occupiedAt = new Date(nowMs).toISOString();
}

export function garrisonOf(state: GameState, cityId: string): { infantry: number; cavalry: number } {
  const city = state.cities.find((c) => c.cityId === cityId);
  return { infantry: city?.infantry ?? 0, cavalry: city?.cavalry ?? 0 };
}

// 可用士兵池 = 全局步兵/骑兵 - 所有驻军 - 所有军团
export function troopPool(state: GameState): { infantry: number; cavalry: number } {
  const garrisonInfantry = state.cities.reduce((s, c) => s + c.infantry, 0);
  const garrisonCavalry = state.cities.reduce((s, c) => s + c.cavalry, 0);
  const armyInfantry = state.armies.reduce((s, a) => s + a.infantry, 0);
  const armyCavalry = state.armies.reduce((s, a) => s + a.cavalry, 0);
  return {
    infantry: Math.max(0, state.resources.infantry - garrisonInfantry - armyInfantry),
    cavalry: Math.max(0, state.resources.cavalry - garrisonCavalry - armyCavalry),
  };
}
