import type {
  BalanceConfig,
  BarbarianCamp,
  CityConfig,
  GameState,
  OfflineReport,
  RouteConfig,
} from '@timewar/shared';
import { syncAcityLevel } from './acity.js';
import { armyGeneralIds, isEnemyCity, isPlayerCity, mergeIntoCity } from './army.js';
import { resolveBattle, resolveCounterAttack, battleRng } from './battle.js';
import { advanceEnemyGrowth } from './enemy.js';
import { advanceGeneralXp } from './generals.js';
import { advancePopulation } from './population.js';
import { advanceProduction } from './production.js';
import { completeTrainingBatches } from './training.js';
import { rollItem } from './tech.js';

export interface EngineContext {
  balance: BalanceConfig;
  cities: CityConfig[];
  routes: RouteConfig[];
  rng: () => number;
}

function snapshot(state: GameState): GameState {
  return structuredClone(state);
}

// 核心结算入口：按固定顺序结算，幂等，现实时间戳驱动
export function advanceGameState(ctx: EngineContext, state: GameState, nowMs: number): GameState {
  const { balance } = ctx;
  const elapsedMs = Math.max(0, nowMs - Date.parse(state.lastCalculatedAt));
  if (elapsedMs <= 0) return state;

  const effectiveMs = Math.min(elapsedMs, balance.offlineCapSeconds * 1000);
  const settleUntil = Date.parse(state.lastCalculatedAt) + effectiveMs;
  const before = snapshot(state);

  // 0. A市 动态等级同步（幂等）
  syncAcityLevel(ctx.cities, state);

  // 0.5 负伤将领到期自动恢复
  recoverWounded(state, settleUntil);

  // 1. 敌方城市成长
  advanceEnemyGrowth(balance, ctx.cities, state, settleUntil);
  // 2. 玩家人口增长（等级加权 + 军屯 + 首都 + 省域）
  advancePopulation(balance, ctx.cities, state, settleUntil);
  // 3. 武器生产 / 4. 盔甲生产 / 5. 战马生产（冶炼加成）
  advanceProduction(balance, state, effectiveMs);
  // 6. 人口训练完成（含将领随机产生）
  completeTrainingBatches(balance, state, settleUntil, ctx.rng);
  // 6.5 科研院：神行符 / 军团旗 / 加速符 概率判定（独立计时）
  rollItem(balance, state, 'talisman', settleUntil, ctx.rng);
  rollItem(balance, state, 'banner', settleUntil, ctx.rng);
  rollItem(balance, state, 'speedup', settleUntil, ctx.rng);
  // 7. 将领训练经验（治军加成）
  advanceGeneralXp(balance, state, settleUntil);
  // 8. 军团行军到达 / 9. 战斗 / 10. 返回军团到达
  resolveArrivals(ctx, state, settleUntil);
  // 11. 敌方反攻
  processCounterAttacks(ctx, state, settleUntil);
  // 12. 蛮族营地刷新
  refreshBarbarianCamps(ctx, state, settleUntil);
  // 13. 通关检测（占领全部城市）
  checkCompletion(balance, ctx.cities, state, settleUntil);
  // 14. 占领后再次同步 A市 等级
  syncAcityLevel(ctx.cities, state);

  state.lastCalculatedAt = new Date(settleUntil).toISOString();
  state.updatedAt = new Date(nowMs).toISOString();

  // 离线报告：离线超过阈值时生成一次
  if (elapsedMs > balance.offlineReportThresholdSeconds * 1000) {
    state.offlineReport = buildOfflineReport(balance, state, before, elapsedMs);
  }
  return state;
}

// 负伤恢复：到期自动恢复空闲
function recoverWounded(state: GameState, nowMs: number): void {
  for (const g of state.generals) {
    if (g.status === 'WOUNDED' && g.injuredUntil && Date.parse(g.injuredUntil) <= nowMs) {
      g.status = 'IDLE';
      g.injuredUntil = undefined;
    }
  }
}

// 敌方反攻：≥minCities 后，间隔内检查弱驻军相邻城
function processCounterAttacks(ctx: EngineContext, state: GameState, nowMs: number): void {
  const { balance, cities } = ctx;
  if (state.cities.length < balance.counterAttackMinCities) return;
  const intervalMs = balance.counterAttackIntervalMinutes * 60 * 1000;
  const lastAt = Date.parse(state.lastCalculatedAt);
  const ticks = Math.floor((nowMs - lastAt) / intervalMs);
  if (ticks <= 0) return;

  for (let t = 0; t < ticks; t++) {
    const checkAt = lastAt + (t + 1) * intervalMs;
    if (checkAt > nowMs) break;
    for (const enemy of state.enemyCities) {
      const config = cities.find((c) => c.id === enemy.cityId);
      if (!config) continue;
      const neighbors = config.neighbors.filter((n) => isPlayerCity(state, n) && n !== balance.startCityId);
      if (neighbors.length === 0) continue;
      // 找出驻军战力低于敌方×阈值的弱驻军城（含驻守军团兵力）
      const weak = neighbors.filter((n) => {
        const pc = state.cities.find((c) => c.cityId === n);
        if (!pc) return false;
        const armyTroops = state.armies
          .filter((a) => (a.status === 'IDLE' || a.status === 'GARRISON') && a.originCityId === n)
          .reduce((s, a) => s + a.infantry + a.cavalry, 0);
        const levelConfig = balance.cityLevels[String(cityLevelOf(cities, n))];
        const defenderPower = (pc.infantry + pc.cavalry + armyTroops) * balance.infantryDefense * (1 + (levelConfig?.defenseBonus ?? 0));
        const attackerPower = enemy.garrison * balance.infantryAttack;
        return attackerPower > defenderPower * (1 / balance.counterAttackThreshold);
      });
      if (weak.length === 0) continue;
      if (battleRng(balance, `counter:${enemy.cityId}:${Math.floor(checkAt / 600000)}`)() < balance.counterAttackChance) {
        const target = weak[Math.floor(battleRng(balance, `counter-target:${enemy.cityId}:${Math.floor(checkAt / 600000)}`)() * weak.length)];
        resolveCounterAttack(balance, cities, state, enemy.cityId, target, checkAt);
      }
    }
  }
}

function cityLevelOf(cities: CityConfig[], cityId: string): number {
  return cities.find((c) => c.id === cityId)?.level ?? 1;
}

// 蛮族营地：每 interval 在随机敌方城市旁补充营地（最多 maxCamps）
function refreshBarbarianCamps(ctx: EngineContext, state: GameState, nowMs: number): void {
  const { balance, cities } = ctx;
  if (!state.barbarianCamps) state.barbarianCamps = [];
  const intervalMs = balance.barbarianRespawnMinutes * 60 * 1000;
  const lastAt = Date.parse(state.lastCalculatedAt);
  const ticks = Math.floor((nowMs - lastAt) / intervalMs);
  if (ticks <= 0) return;
  for (let t = 0; t < ticks; t++) {
    if (state.barbarianCamps.length >= balance.barbarianMaxCamps) break;
    const enemyCities = state.enemyCities;
    if (enemyCities.length === 0) break;
    const host = enemyCities[Math.floor(battleRng(balance, `camp:${nowMs}:${t}`)() * enemyCities.length)];
    const hostConfig = cities.find((c) => c.id === host.cityId);
    if (!hostConfig) continue;
    if (state.barbarianCamps.some((c) => c.hostCityId === host.cityId)) continue;
    state.barbarianCamps.push({
      id: `camp-${host.cityId}`,
      hostCityId: host.cityId,
      x: hostConfig.x + (battleRng(balance, `camp-x:${host.cityId}`)() - 0.5) * 60,
      y: hostConfig.y + (battleRng(balance, `camp-y:${host.cityId}`)() - 0.5) * 60,
      garrison: balance.barbarianGarrison,
      createdAt: new Date(nowMs).toISOString(),
    });
  }
}

// 通关：占领全部城市
function checkCompletion(balance: BalanceConfig, cities: CityConfig[], state: GameState, nowMs: number): void {
  if (!state.completedAt && state.cities.length >= cities.length) {
    state.completedAt = new Date(nowMs).toISOString();
  }
}

function resolveArrivals(ctx: EngineContext, state: GameState, nowMs: number): void {
  const marching = state.armies
    .filter(
      (a) => a.status === 'MARCHING' && a.arrivesAt && Date.parse(a.arrivesAt) <= nowMs
    )
    .sort((a, b) => Date.parse(a.arrivesAt!) - Date.parse(b.arrivesAt!));

  for (const army of marching) {
    const battleArmy = {
      id: army.id,
      bannerGeneralId: army.bannerGeneralId,
      memberGeneralIds: army.memberGeneralIds,
      infantry: army.infantry,
      cavalry: army.cavalry,
      originCityId: army.originCityId,
      targetCityId: army.targetCityId,
      arrivesAt: army.arrivesAt,
      strategy: army.strategy,
      name: army.name,
      permanent: army.permanent,
    };
    if (army.targetCityId?.startsWith('camp-')) {
      // 蛮族营地战斗
      resolveBattle(ctx.balance, ctx.cities, state, {
        army: battleArmy,
        nowMs,
        isBarbarian: true,
      });
    } else if (isEnemyCity(state, army.targetCityId!)) {
      // 到达敌方城市：自动进入战斗
      resolveBattle(ctx.balance, ctx.cities, state, {
        army: battleArmy,
        nowMs,
      });
    } else if (isPlayerCity(state, army.targetCityId!)) {
      if (army.permanent) {
        // 永久军团：到达己方城市就地驻守（保留编制与兵力）
        const targetId = army.targetCityId!;
        const city = state.cities.find((c) => c.cityId === targetId);
        army.status = 'GARRISON';
        army.originCityId = targetId;
        army.targetCityId = undefined;
        army.departedAt = undefined;
        army.arrivesAt = undefined;
        if (city) {
          const ids = new Set(city.generalIds ?? (city.generalId ? [city.generalId] : []));
          for (const id of army.memberGeneralIds) {
            const general = state.generals.find((g) => g.id === id);
            if (general) {
              general.status = 'GARRISON';
              general.cityId = targetId;
              general.armyId = army.id;
              ids.add(id);
            }
          }
          city.generalIds = [...ids];
          city.generalId = city.generalIds[0];
        }
      } else {
        // 临时军团：到达己方城市转为驻军（全体成员驻守）
        mergeIntoCity(
          state,
          army.targetCityId!,
          army.infantry,
          army.cavalry,
          army.memberGeneralIds,
          nowMs
        );
        state.armies = state.armies.filter((a) => a.id !== army.id);
      }
    }
  }

  const returning = state.armies.filter(
    (a) => a.status === 'RETURNING' && a.arrivesAt && Date.parse(a.arrivesAt) <= nowMs
  );
  for (const army of returning) {
    const ids = army.memberGeneralIds ?? [];
    if (army.permanent) {
      // 永久军团：幸存兵力保留在军团，返回驻地休整（不解散）
      army.status = 'IDLE';
      army.originCityId = army.targetCityId ?? army.originCityId;
      army.targetCityId = undefined;
      army.departedAt = undefined;
      army.arrivesAt = undefined;
      for (const id of ids) {
        const general = state.generals.find((g) => g.id === id);
        if (general) {
          general.armyId = army.id;
          if (general.status !== 'WOUNDED') {
            general.status = 'IDLE';
            general.cityId = undefined;
          }
        }
      }
    } else {
      // 失败军团返回：兵力并入出发城市驻军，将领恢复空闲（负伤者保持负伤）
      const city = state.cities.find((c) => c.cityId === army.originCityId);
      if (city) {
        city.infantry += army.infantry;
        city.cavalry += army.cavalry;
      }
      for (const id of ids) {
        const general = state.generals.find((g) => g.id === id);
        if (general && general.status !== 'WOUNDED') {
          general.status = 'IDLE';
          general.cityId = army.originCityId;
          general.armyId = undefined;
        }
      }
      state.armies = state.armies.filter((a) => a.id !== army.id);
    }
  }
}

export function buildOfflineReport(
  balance: BalanceConfig,
  after: GameState,
  before: GameState,
  offlineMs: number
): OfflineReport {
  const delta = (get: (s: GameState) => number) => Math.max(0, get(after) - get(before));
  // 累计经验 = 当前经验 + 所有已消耗的升级经验（升级会扣减经验，必须把升级消耗加回）
  const cumulativeXp = (s: GameState, id: string) => {
    const g = s.generals.find((g) => g.id === id);
    if (!g) return 0;
    let total = g.xp;
    for (let l = 1; l < g.level; l++) total += balance.generalXpBase * l * l;
    return total;
  };
  const allGeneralIds = new Set([...before.generals, ...after.generals].map((g) => g.id));
  const generalXpGained = [...allGeneralIds].reduce(
    (sum, id) => sum + Math.max(0, cumulativeXp(after, id) - cumulativeXp(before, id)),
    0
  );
  const marchesCompleted = before.armies.filter(
    (a) => a.status === 'MARCHING' && a.arrivesAt && Date.parse(a.arrivesAt) <= Date.parse(after.lastCalculatedAt)
  ).length;
  const battles = after.battleReports.slice(0, after.battleReports.length - before.battleReports.length);
  const victories = battles.filter((b) => b.victory).length;
  const defeats = battles.filter((b) => !b.victory).length;
  return {
    id: `offline-${Date.parse(after.updatedAt)}`,
    offlineMs,
    populationGained: delta((s) => s.resources.idlePopulation),
    weaponsProduced: delta((s) => s.resources.weapons),
    armorsProduced: delta((s) => s.resources.armors),
    horsesProduced: delta((s) => s.resources.horses),
    trainedCompleted: delta((s) => s.resources.trainedPopulation) + delta((s) => s.generals.length),
    generalsCreated: delta((s) => s.generals.length),
    generalXpGained: Math.round(generalXpGained),
    marchesCompleted,
    battleCount: battles.length,
    victories,
    defeats,
    citiesCaptured: delta((s) => s.cities.length),
  };
}
