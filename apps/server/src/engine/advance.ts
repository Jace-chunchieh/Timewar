import type {
  BalanceConfig,
  CityConfig,
  GameState,
  OfflineReport,
  RouteConfig,
} from '@timewar/shared';
import { syncAcityLevel } from './acity.js';
import { isEnemyCity, isPlayerCity, mergeIntoCity } from './army.js';
import { resolveBattle } from './battle.js';
import { advanceEnemyGrowth } from './enemy.js';
import { advanceGeneralXp } from './generals.js';
import { advancePopulation } from './population.js';
import { advanceProduction } from './production.js';
import { completeTrainingBatches } from './training.js';
import { rollTalisman } from './tech.js';

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

  // 1. 敌方城市成长
  advanceEnemyGrowth(balance, ctx.cities, state, settleUntil);
  // 2. 玩家人口增长（等级加权 + 军屯）
  advancePopulation(balance, state, settleUntil);
  // 3. 武器生产 / 4. 盔甲生产 / 5. 战马生产（冶炼加成）
  advanceProduction(balance, state, effectiveMs);
  // 6. 人口训练完成（含将领随机产生）
  completeTrainingBatches(balance, state, settleUntil, ctx.rng);
  // 6.5 科研院：神行符概率判定
  rollTalisman(balance, state, settleUntil, ctx.rng);
  // 7. 将领训练经验（治军加成）
  advanceGeneralXp(balance, state, settleUntil);
  // 8. 军团行军到达 / 9. 战斗 / 10. 返回军团到达
  resolveArrivals(ctx, state, settleUntil);
  // 11. 占领后再次同步 A市 等级（新占领城市立即生效）
  syncAcityLevel(ctx.cities, state);

  state.lastCalculatedAt = new Date(settleUntil).toISOString();
  state.updatedAt = new Date(nowMs).toISOString();

  // 离线报告：离线超过阈值时生成一次
  if (elapsedMs > balance.offlineReportThresholdSeconds * 1000) {
    state.offlineReport = buildOfflineReport(balance, state, before, elapsedMs);
  }
  return state;
}

function resolveArrivals(ctx: EngineContext, state: GameState, nowMs: number): void {
  const marching = state.armies
    .filter(
      (a) => a.status === 'MARCHING' && a.arrivesAt && Date.parse(a.arrivesAt) <= nowMs
    )
    .sort((a, b) => Date.parse(a.arrivesAt!) - Date.parse(b.arrivesAt!));

  for (const army of marching) {
    if (isEnemyCity(state, army.targetCityId!)) {
      // 到达敌方城市：自动进入战斗
      resolveBattle(ctx.balance, ctx.cities, state, army, nowMs);
    } else if (isPlayerCity(state, army.targetCityId!)) {
      // 到达己方城市：自动转为驻军
      mergeIntoCity(
        state,
        army.targetCityId!,
        army.infantry,
        army.cavalry,
        army.generalId,
        nowMs
      );
      state.armies = state.armies.filter((a) => a.id !== army.id);
    }
  }

  const returning = state.armies.filter(
    (a) => a.status === 'RETURNING' && a.arrivesAt && Date.parse(a.arrivesAt) <= nowMs
  );
  for (const army of returning) {
    // 失败军团返回：兵力并入出发城市驻军，将领恢复空闲
    const city = state.cities.find((c) => c.cityId === army.originCityId);
    if (city) {
      city.infantry += army.infantry;
      city.cavalry += army.cavalry;
    }
    const general = state.generals.find((g) => g.id === army.generalId);
    if (general) {
      general.status = 'IDLE';
      general.cityId = army.originCityId;
      general.armyId = undefined;
    }
    state.armies = state.armies.filter((a) => a.id !== army.id);
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
