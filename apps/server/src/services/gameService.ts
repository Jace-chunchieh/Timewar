import type {
  BalanceConfig,
  BattleReport,
  CityConfig,
  GameState,
  RouteConfig,
  TechKey,
} from '@timewar/shared';
import {
  advanceGameState,
  canAttack,
  commandCap,
  craftSoldiers,
  createNewGame,
  marchTimeSeconds,
  migrateGameState,
  routeBetween,
  talismanCost,
  techEffects,
  techUpgradeCostNext,
  trainingCapacity,
  activeTrainingCount,
  troopPool,
  CURRENT_VERSION,
  type EngineContext,
} from '../engine/index.js';
import type { GameRepository } from '../repositories/gameRepository.js';
import { fail } from './gameError.js';

const nowIso = (t?: number) => new Date(t ?? Date.now()).toISOString();

export class GameService {
  constructor(
    private repo: GameRepository,
    private ctx: EngineContext,
    private clock: () => number = () => Date.now()
  ) {}

  private nowMs(): number {
    return this.clock();
  }

  private loadAndAdvance(): GameState {
    let state = this.repo.get();
    if (!state) {
      state = createNewGame(this.ctx.balance, this.ctx.cities, this.ctx.rng, this.nowMs());
    } else if ((state.version ?? 1) < CURRENT_VERSION) {
      state = migrateGameState(this.ctx.balance, this.ctx.cities, state);
    }
    advanceGameState(this.ctx, state, this.nowMs());
    return state;
  }

  private commit(state: GameState): GameState {
    state.updatedAt = nowIso(this.nowMs());
    this.repo.save(state);
    return state;
  }

  private cityConfig(id: string): CityConfig {
    const c = this.ctx.cities.find((c) => c.id === id);
    if (!c) fail('CITY_NOT_FOUND', `城市不存在: ${id}`, { cityId: id });
    return c;
  }

  private playerCity(state: GameState, id: string) {
    const c = state.cities.find((c) => c.cityId === id);
    if (!c) fail('CITY_NOT_PLAYER_OWNED', `城市未被占领: ${id}`, { cityId: id });
    return c;
  }

  // ---------- 基础 ----------

  state(): GameState {
    return this.commit(this.loadAndAdvance());
  }

  newGame(): GameState {
    const state = createNewGame(this.ctx.balance, this.ctx.cities, this.ctx.rng, this.nowMs());
    this.repo.deleteAll();
    return this.commit(state);
  }

  reset(): GameState {
    return this.newGame();
  }

  setTutorialStep(step: number): GameState {
    const state = this.loadAndAdvance();
    state.tutorialStep = Math.min(6, Math.max(0, step));
    return this.commit(state);
  }

  ackWelcome(): GameState {
    const state = this.loadAndAdvance();
    state.welcomeShown = true;
    return this.commit(state);
  }

  reports(): BattleReport[] {
    return this.loadAndAdvance().battleReports;
  }

  // ---------- 生产 ----------

  allocate(workers: { weapon: number; armor: number; horse: number }): GameState {
    const state = this.loadAndAdvance();
    const p = state.production;
    const currentTotal = p.weapon.workers + p.armor.workers + p.horse.workers;
    const newTotal = workers.weapon + workers.armor + workers.horse;
    const idle = state.resources.idlePopulation;
    if (newTotal > currentTotal + idle) {
      fail('INSUFFICIENT_IDLE_POPULATION', '空闲人口不足，无法分配', {
        need: newTotal - currentTotal,
        idle,
      });
    }
    p.weapon.workers = workers.weapon;
    p.armor.workers = workers.armor;
    p.horse.workers = workers.horse;
    state.resources.idlePopulation = idle + currentTotal - newTotal;
    return this.commit(state);
  }

  // ---------- 科研院 ----------

  allocateResearch(workers: number): GameState {
    const state = this.loadAndAdvance();
    const idle = state.resources.idlePopulation;
    const current = state.tech.researchWorkers;
    if (workers > current + idle) {
      fail('INSUFFICIENT_IDLE_POPULATION', '空闲人口不足，无法分配科研人口', {
        need: workers - current,
        idle,
      });
    }
    state.resources.idlePopulation = idle + current - workers;
    state.tech.researchWorkers = workers;
    return this.commit(state);
  }

  // ---------- 科技升级（一次性人口投入，永久生效） ----------

  upgradeTech(key: TechKey): GameState {
    const state = this.loadAndAdvance();
    const current = state.tech.levels[key] ?? 0;
    if (current >= this.ctx.balance.tech.maxLevel) {
      fail('TECH_MAX_LEVEL', '该科技已达到最高等级');
    }
    const cost = techUpgradeCostNext(this.ctx.balance, current);
    if (state.resources.idlePopulation < cost) {
      fail('INSUFFICIENT_POPULATION', `升级需要 ${cost} 人口（一次性投入），当前空闲 ${state.resources.idlePopulation}`);
    }
    state.resources.idlePopulation -= cost;
    state.tech.levels[key] = current + 1;
    return this.commit(state);
  }

  // ---------- 训练 ----------

  startTraining(count: number): GameState {
    const state = this.loadAndAdvance();
    const balance = this.ctx.balance;
    if (count <= 0) fail('INVALID_COUNT', '训练人数必须大于 0');
    const capacity = trainingCapacity(balance, state);
    const active = activeTrainingCount(state);
    if (active + count > capacity) {
      fail('TRAINING_CAPACITY_EXCEEDED', `训练名额不足：当前 ${active}/${capacity}`, {
        active,
        capacity,
        requested: count,
      });
    }
    if (state.resources.idlePopulation < count) {
      fail('INSUFFICIENT_IDLE_POPULATION', '空闲人口不足', { need: count, idle: state.resources.idlePopulation });
    }
    const now = this.nowMs();
    state.trainingBatches.push({
      id: `tb-${now}-${state.trainingBatches.length}`,
      count,
      startedAt: nowIso(now),
      completesAt: nowIso(now + balance.trainingDurationSeconds * 1000),
    });
    state.resources.idlePopulation -= count;
    return this.commit(state);
  }

  cancelTraining(batchId: string): GameState {
    const state = this.loadAndAdvance();
    const idx = state.trainingBatches.findIndex((b) => b.id === batchId);
    if (idx < 0) fail('BATCH_NOT_FOUND', '训练批次不存在', { batchId });
    const batch = state.trainingBatches[idx];
    const refund = Math.floor(batch.count * this.ctx.balance.trainingCancelRefundRate);
    state.resources.idlePopulation += refund;
    state.trainingBatches.splice(idx, 1);
    return this.commit(state);
  }

  // ---------- 合成 ----------

  craft(infantry: number, cavalry: number): GameState {
    const state = this.loadAndAdvance();
    try {
      craftSoldiers(this.ctx.balance, state, infantry, cavalry);
    } catch {
      fail('INSUFFICIENT_RESOURCES', '资源不足，无法合成士兵（需要 训练后人口 + 武器 + 盔甲，骑兵另需战马）');
    }
    return this.commit(state);
  }

  // ---------- 将领 ----------

  private general(state: GameState, id: string) {
    const g = state.generals.find((g) => g.id === id);
    if (!g) fail('GENERAL_NOT_FOUND', '将领不存在', { generalId: id });
    return g;
  }

  startGeneralTraining(generalId: string): GameState {
    const state = this.loadAndAdvance();
    const g = this.general(state, generalId);
    if (g.status !== 'IDLE') {
      fail('GENERAL_NOT_IDLE', '只有空闲将领可以开始训练', { status: g.status });
    }
    const now = this.nowMs();
    g.status = 'TRAINING';
    g.trainingStartedAt = nowIso(now);
    g.lastXpCalculatedAt = nowIso(now);
    g.cityId = undefined;
    g.armyId = undefined;
    return this.commit(state);
  }

  stopGeneralTraining(generalId: string): GameState {
    const state = this.loadAndAdvance();
    const g = this.general(state, generalId);
    if (g.status !== 'TRAINING') fail('GENERAL_NOT_TRAINING', '该将领不在训练中', { status: g.status });
    g.status = 'IDLE';
    g.trainingStartedAt = undefined;
    g.lastXpCalculatedAt = undefined;
    return this.commit(state);
  }

  dismissGarrison(generalId: string): GameState {
    const state = this.loadAndAdvance();
    const g = this.general(state, generalId);
    if (g.status !== 'GARRISON') fail('GENERAL_NOT_GARRISON', '该将领未在驻守', { status: g.status });
    const city = state.cities.find((c) => c.generalId === g.id);
    if (city) city.generalId = undefined;
    g.status = 'IDLE';
    g.cityId = undefined;
    g.armyId = undefined;
    return this.commit(state);
  }

  // ---------- 军团与行军 ----------

  createArmy(input: {
    originCityId: string;
    generalId: string;
    infantry: number;
    cavalry: number;
    targetCityId?: string;
    useTalisman?: boolean;
  }): GameState {
    const state = this.loadAndAdvance();
    this.playerCity(state, input.originCityId);
    const g = this.general(state, input.generalId);
    if (g.status !== 'IDLE') {
      fail('GENERAL_NOT_IDLE', '只有空闲将领可以组建军团', { status: g.status });
    }
    const pool = troopPool(state);
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '军团人数必须大于 0');
    const cap = commandCap(this.ctx.balance, g.level, state);
    const used = input.infantry + input.cavalry;
    if (used > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${used} 人，将领统帅 ${cap} 人，超出 ${used - cap} 人`, {
        used,
        cap,
        over: used - cap,
      });
    }
    if (input.infantry > pool.infantry || input.cavalry > pool.cavalry) {
      fail('INSUFFICIENT_TROOPS', '可用士兵不足（士兵池 = 全局士兵 - 驻军 - 其他军团）', {
        need: { infantry: input.infantry, cavalry: input.cavalry },
        pool,
      });
    }
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      generalId: g.id,
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'IDLE' as const,
      originCityId: input.originCityId,
    };
    state.armies.push(army);
    g.armyId = army.id;
    if (input.targetCityId) {
      this.doMarch(state, army.id, input.targetCityId, input.useTalisman ?? false);
    }
    return this.commit(state);
  }

  march(input: { armyId: string; targetCityId: string; useTalisman?: boolean }): GameState {
    const state = this.loadAndAdvance();
    this.doMarch(state, input.armyId, input.targetCityId, input.useTalisman ?? false);
    return this.commit(state);
  }

  private doMarch(
    state: GameState,
    armyId: string,
    targetCityId: string,
    useTalisman: boolean
  ): void {
    const army = state.armies.find((a) => a.id === armyId);
    if (!army) fail('ARMY_NOT_FOUND', '军团不存在', { armyId });
    if (army.status !== 'IDLE') fail('ARMY_NOT_IDLE', '只有空闲军团可以出征', { status: army.status });
    if (targetCityId === army.originCityId) fail('INVALID_TARGET', '目标城市不能是出发城市');
    const targetConfig = this.cityConfig(targetCityId);

    const isFriendly = state.cities.some((c) => c.cityId === targetCityId);
    if (isFriendly && useTalisman) {
      fail('TALISMAN_NOT_NEEDED', '目标为已方城市，无需使用神行符');
    }
    if (!isFriendly && !canAttack(this.ctx.cities, state, targetCityId) && !useTalisman) {
      fail('NOT_ATTACKABLE', '目标城市不满足进攻条件（必须为相邻敌方城市或己方城市）', { targetCityId });
    }

    const originConfig = this.cityConfig(army.originCityId);
    let noRouteKm: number | undefined;
    let talismanCostUsed = 0;

    if (useTalisman) {
      if (!isFriendly && !state.enemyCities.some((e) => e.cityId === targetCityId)) {
        fail('TARGET_NOT_ENEMY', '神行符只能用于攻打敌方城市');
      }
      talismanCostUsed = talismanCost(
        this.ctx.balance,
        originConfig.provinceId,
        targetConfig.provinceId
      );
      if ((state.tech.talismans ?? 0) < talismanCostUsed) {
        fail('INSUFFICIENT_TALISMANS', `神行符不足：需要 ${talismanCostUsed} 张，当前持有 ${state.tech.talismans ?? 0}`, {
          need: talismanCostUsed,
          have: state.tech.talismans ?? 0,
        });
      }
      state.tech.talismans -= talismanCostUsed;
      if (!routeBetween(this.ctx.routes, army.originCityId, targetCityId)) {
        noRouteKm = haversineKm(originConfig, targetConfig);
      }
    } else if (!routeBetween(this.ctx.routes, army.originCityId, targetCityId)) {
      fail('NO_ROUTE', '出发城市与目标城市之间没有路线', { targetCityId });
    }

    const general = state.generals.find((g) => g.id === army.generalId);
    if (general && general.status !== 'IDLE') {
      fail('GENERAL_NOT_IDLE', '将领当前状态不可出征', { status: general.status });
    }
    if (general) {
      const cap = commandCap(this.ctx.balance, general.level, state);
      if (army.infantry + army.cavalry > cap) {
        fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${army.infantry + army.cavalry} 人，将领统帅 ${cap} 人，超出 ${army.infantry + army.cavalry - cap} 人`);
      }
    }

    const speedMultiplier = techEffects(this.ctx.balance, state).marchSpeed;
    const seconds = marchTimeSeconds(
      this.ctx.balance,
      this.ctx.routes,
      army.originCityId,
      targetCityId,
      army.infantry,
      army.cavalry,
      speedMultiplier,
      noRouteKm
    );
    const now = this.nowMs();
    army.status = 'MARCHING';
    army.targetCityId = targetCityId;
    army.departedAt = nowIso(now);
    army.arrivesAt = nowIso(now + seconds * 1000);
    if (general) {
      general.status = 'MARCHING';
      general.cityId = undefined;
      general.armyId = army.id;
    }
  }

  cancelMarch(armyId: string): GameState {
    const state = this.loadAndAdvance();
    const army = state.armies.find((a) => a.id === armyId);
    if (!army) fail('ARMY_NOT_FOUND', '军团不存在', { armyId });
    if (army.status !== 'MARCHING') fail('ARMY_NOT_MARCHING', '该军团不在行军中', { status: army.status });
    const elapsed = this.nowMs() - Date.parse(army.departedAt!);
    if (elapsed > this.ctx.balance.cancelMarchWindowSeconds * 1000) {
      fail('MARCH_NOT_CANCELLABLE', `出发超过 ${this.ctx.balance.cancelMarchWindowSeconds} 秒，无法撤回，只能继续行军`, {
        elapsedSeconds: Math.round(elapsed / 1000),
      });
    }
    const general = state.generals.find((g) => g.id === army.generalId);
    army.status = 'IDLE';
    army.targetCityId = undefined;
    army.departedAt = undefined;
    army.arrivesAt = undefined;
    if (general) {
      general.status = 'IDLE';
      general.armyId = army.id;
    }
    return this.commit(state);
  }

  transfer(input: {
    originCityId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    generalId?: string;
  }): GameState {
    const state = this.loadAndAdvance();
    this.playerCity(state, input.originCityId);
    this.playerCity(state, input.targetCityId);
    if (input.originCityId === input.targetCityId) fail('INVALID_TARGET', '目标城市不能是出发城市');
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '调兵数量必须大于 0');
    if (!routeBetween(this.ctx.routes, input.originCityId, input.targetCityId)) {
      fail('NO_ROUTE', '两城之间没有路线', { targetCityId: input.targetCityId });
    }
    const origin = state.cities.find((c) => c.cityId === input.originCityId)!;
    if (input.infantry > origin.infantry || input.cavalry > origin.cavalry) {
      fail('INSUFFICIENT_GARRISON', '出发城市驻军不足', {
        need: { infantry: input.infantry, cavalry: input.cavalry },
        have: { infantry: origin.infantry, cavalry: origin.cavalry },
      });
    }
    let generalId: string | undefined;
    if (input.generalId) {
      const g = this.general(state, input.generalId);
      if (g.status !== 'IDLE') fail('GENERAL_NOT_IDLE', '只有空闲将领可以率队', { status: g.status });
      const cap = commandCap(this.ctx.balance, g.level, state);
      if (input.infantry + input.cavalry > cap) {
        fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${input.infantry + input.cavalry} 人，将领统帅 ${cap} 人`);
      }
      generalId = g.id;
    }
    origin.infantry -= input.infantry;
    origin.cavalry -= input.cavalry;

    const speedMultiplier = techEffects(this.ctx.balance, state).marchSpeed;
    const seconds = marchTimeSeconds(
      this.ctx.balance,
      this.ctx.routes,
      input.originCityId,
      input.targetCityId,
      input.infantry,
      input.cavalry,
      speedMultiplier
    );
    const now = this.nowMs();
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      generalId,
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'MARCHING' as const,
      originCityId: input.originCityId,
      targetCityId: input.targetCityId,
      departedAt: nowIso(now),
      arrivesAt: nowIso(now + seconds * 1000),
    };
    state.armies.push(army);
    if (generalId) {
      const g = state.generals.find((g) => g.id === generalId)!;
      g.status = 'MARCHING';
      g.armyId = army.id;
      g.cityId = undefined;
    }
    return this.commit(state);
  }
}

function haversineKm(a: CityConfig, b: CityConfig): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}
