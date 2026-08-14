import { readFileSync } from 'node:fs';
import type { BalanceConfig, BattleReport, CityConfig, GameState, RouteConfig, TechKey } from '@timewar/shared';
import {
  advanceGameState,
  armyCommandCap,
  armyGeneralIds,
  armySpeedCoefficient,
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
  trainingDurationFor,
  activeTrainingCount,
  troopPool,
  CURRENT_VERSION,
  type EngineContext,
} from '../engine/index.js';
import type { GameRepository, MailItem } from '../repositories/gameRepository.js';
import { fail } from './gameError.js';
import { ADMIN_CODE } from '../db/database.js';

const nowIso = (t?: number) => new Date(t ?? Date.now()).toISOString();

export class GameService {
  private code: string = ADMIN_CODE;

  constructor(
    private repo: GameRepository,
    private ctx: EngineContext,
    private clock: () => number = () => Date.now()
  ) {
    // 系统初始化：确保管理员收到 GM 欢迎礼包（幂等）
    this.repo.sendMailItem({
      id: 'welcome-banner-gift-1',
      toCode: ADMIN_CODE,
      fromCode: 'GM',
      title: 'GM 欢迎礼包',
      body: '欢迎来到 TimeWar！这是 GM 赠予的军团旗礼包，可用于组建你的第一支永久军团。',
      itemType: 'banner',
      itemAmount: 2,
    });
  }

  // 授权码上下文：同一请求内同步执行（无 await 交错），保存/恢复安全
  withCode<T>(code: string, fn: () => T): T {
    const prev = this.code;
    this.code = code;
    try {
      return fn();
    } finally {
      this.code = prev;
    }
  }

  setCode(code: string): void {
    this.code = code;
  }

  authInfo(code: string): { code: string; name: string; isAdmin: boolean } | undefined {
    const info = this.repo.authCode(code);
    return info ? { code: info.code, name: info.name, isAdmin: info.isAdmin } : undefined;
  }

  get currentCode(): string {
    return this.code;
  }

  private nowMs(): number {
    return this.clock();
  }

  private loadAndAdvance(): GameState {
    let state = this.repo.get(this.code);
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
    this.repo.save(state, this.code);
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

  // ---------- 授权码 ----------

  authLogin(code: string): { code: string; name: string; isAdmin: boolean } {
    const info = this.repo.authCode(code);
    if (!info) fail('AUTH_INVALID', '授权码无效');
    return { code: info.code, name: info.name, isAdmin: info.isAdmin };
  }

  authAddCode(code: string, name: string): { code: string; name: string; isAdmin: boolean } {
    const current = this.repo.authCode(this.code);
    if (!current?.isAdmin) fail('AUTH_FORBIDDEN', '仅管理员可新增授权码');
    if (!/^[\w\u4e00-\u9fa5-]{2,32}$/.test(code)) {
      fail('AUTH_CODE_FORMAT', '授权码需为 2~32 位字母/数字/中文/下划线/连字符');
    }
    if (this.repo.authCode(code)) fail('AUTH_CODE_EXISTS', '授权码已存在');
    const info = this.repo.addAuthCode(code, name);
    return { code: info.code, name: info.name, isAdmin: info.isAdmin };
  }

  authList(): { code: string; name: string; isAdmin: boolean }[] {
    return this.repo.authCodes().map((c) => ({ code: c.code, name: c.name, isAdmin: c.isAdmin }));
  }

  // ---------- 游戏内邮箱 ----------

  mailList(): MailItem[] {
    return this.repo.mailList(this.code);
  }

  unclaimedMailCount(): number {
    return this.repo.unclaimedMailCount(this.code);
  }

  // GM 发奖：仅管理员可向任意授权码账号发送邮件（可附奖励物品）
  gmSendMail(input: {
    toCode: string;
    title: string;
    body: string;
    itemType?: string;
    itemAmount: number;
  }): MailItem {
    const current = this.repo.authCode(this.code);
    if (!current?.isAdmin) fail('AUTH_FORBIDDEN', '仅管理员（GM）可发送奖励邮件');
    if (!this.repo.authCode(input.toCode)) fail('AUTH_CODE_NOT_FOUND', '收件授权码不存在');
    if (!['banner', 'talisman', 'speedup', 'population', 'weapons', 'armors', 'horses'].includes(input.itemType ?? '')) {
      fail('INVALID_ITEM_TYPE', '奖励类型无效（banner/talisman/speedup/population/weapons/armors/horses）');
    }
    const id = `gm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    this.repo.sendMailItem({
      id,
      toCode: input.toCode,
      fromCode: this.code,
      title: input.title.slice(0, 40),
      body: input.body.slice(0, 500),
      itemType: input.itemType,
      itemAmount: Math.max(0, Math.floor(input.itemAmount)),
    });
    return this.repo.mailList(input.toCode).find((m) => m.id === id)!;
  }

  // 领取邮件附件（物品直接到账）
  claimMail(mailId: string): GameState {
    const state = this.loadAndAdvance();
    const result = this.repo.claimMailItem(mailId, this.code);
    if (!result.ok) {
      const msg = result.reason === 'NOT_FOUND' ? '邮件不存在' : result.reason === 'NOT_OWNER' ? '不能领取他人的邮件' : '该邮件附件已领取';
      fail('MAIL_CLAIM_FAILED', msg);
    }
    if (result.itemType && result.itemAmount > 0) {
      switch (result.itemType) {
        case 'banner':
          state.tech.bannerFlags += result.itemAmount;
          break;
        case 'talisman':
          state.tech.talismans += result.itemAmount;
          break;
        case 'speedup':
          state.tech.speedUps += result.itemAmount;
          break;
        case 'population':
          state.resources.idlePopulation += result.itemAmount;
          break;
        case 'weapons':
          state.resources.weapons += result.itemAmount;
          break;
        case 'armors':
          state.resources.armors += result.itemAmount;
          break;
        case 'horses':
          state.resources.horses += result.itemAmount;
          break;
      }
    }
    return this.commit(state);
  }

  // ---------- 基础 ----------

  // 版本信息（确认部署版本用）
  versionInfo(): { app: string; schema: number } {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    ) as { version: string };
    return { app: pkg.version, schema: CURRENT_VERSION };
  }

  state(): GameState {
    return this.commit(this.loadAndAdvance());
  }

  newGame(): GameState {
    const state = createNewGame(this.ctx.balance, this.ctx.cities, this.ctx.rng, this.nowMs());
    this.repo.deleteAll(this.code);
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
    if (state.resources.idlePopulation < count) {
      fail('INSUFFICIENT_IDLE_POPULATION', '空闲人口不足', { need: count, idle: state.resources.idlePopulation });
    }
    const now = this.nowMs();
    state.trainingBatches.push({
      id: `tb-${now}-${state.trainingBatches.length}`,
      count,
      startedAt: nowIso(now),
      // 训练时长随人数增长（无容量上限）
      completesAt: nowIso(now + trainingDurationFor(balance, count) * 1000),
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
    // 空闲或驻守将领均可开始训练；训练期间保留驻守地标记
    if (g.status !== 'IDLE' && g.status !== 'GARRISON') {
      fail('GENERAL_NOT_IDLE', '只有空闲或驻守中的将领可以开始训练', { status: g.status });
    }
    const now = this.nowMs();
    g.status = 'TRAINING';
    g.trainingStartedAt = nowIso(now);
    g.lastXpCalculatedAt = nowIso(now);
    g.armyId = undefined;
    return this.commit(state);
  }

  stopGeneralTraining(generalId: string): GameState {
    const state = this.loadAndAdvance();
    const g = this.general(state, generalId);
    if (g.status !== 'TRAINING') fail('GENERAL_NOT_TRAINING', '该将领不在训练中', { status: g.status });
    // 若训练前驻守某城，停止后恢复驻守状态
    const city = g.cityId ? state.cities.find((c) => c.cityId === g.cityId) : undefined;
    g.status = city ? 'GARRISON' : 'IDLE';
    g.trainingStartedAt = undefined;
    g.lastXpCalculatedAt = undefined;
    if (city && !city.generalId) city.generalId = g.id;
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

  // 组建永久军团：需消耗 1 面军团旗 + 指定军团长（不可更换）+ 命名
  createArmy(input: {
    originCityId: string;
    name: string;
    bannerGeneralId: string;
    memberGeneralIds: string[];
    strategy?: string;
    infantry: number;
    cavalry: number;
  }): GameState {
    const state = this.loadAndAdvance();
    this.playerCity(state, input.originCityId);
    const name = (input.name ?? '').trim().slice(0, this.ctx.balance.maxArmyNameLength);
    if (!name) fail('ARMY_NAME_REQUIRED', '军团必须命名（军团番号）');
    if (state.tech.bannerFlags < 1) {
      fail('BANNER_FLAG_REQUIRED', `组建军团需要 1 面军团旗，当前持有 ${state.tech.bannerFlags ?? 0}（科研院 ≥100万人口投入后概率获得）`);
    }
    // 成员去重 + 军团长必须在成员内
    const memberGeneralIds = [...new Set(input.memberGeneralIds)];
    if (!memberGeneralIds.includes(input.bannerGeneralId)) {
      fail('BANNER_GENERAL_NOT_IN_ARMY', '军团长必须是军团成员之一');
    }
    if (memberGeneralIds.length > this.ctx.balance.maxGeneralsPerArmy) {
      fail('TOO_MANY_GENERALS', `一个军团最多编入 ${this.ctx.balance.maxGeneralsPerArmy} 名将领`);
    }
    if (memberGeneralIds.length === 0) fail('EMPTY_ARMY', '军团至少需要 1 名将领');
    const generals = memberGeneralIds.map((id) => this.general(state, id));
    for (const g of generals) {
      if (g.status !== 'IDLE') {
        fail('GENERAL_NOT_IDLE', '只有空闲将领可以组建军团', { status: g.status, name: g.name });
      }
    }
    const pool = troopPool(state);
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '军团人数必须大于 0');
    const cap = armyCommandCap(this.ctx.balance, state, { bannerGeneralId: input.bannerGeneralId, memberGeneralIds });
    const used = input.infantry + input.cavalry;
    if (used > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${used} 人，将领合计统帅 ${cap} 人，超出 ${used - cap} 人`, {
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
    // 消耗军团旗，创建永久军团
    state.tech.bannerFlags -= 1;
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name,
      bannerGeneralId: input.bannerGeneralId,
      memberGeneralIds,
      strategy: (input.strategy as 'NORMAL' | 'DEFENSIVE' | 'CHARGE') ?? 'NORMAL',
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'IDLE' as const,
      originCityId: input.originCityId,
    };
    state.armies.push(army);
    for (const g of generals) {
      g.armyId = army.id;
    }
    return this.commit(state);
  }

  // 军团加入将领（空闲将领，≤上限）
  armyAddGeneral(armyId: string, generalId: string): GameState {
    const state = this.loadAndAdvance();
    const army = state.armies.find((a) => a.id === armyId);
    if (!army) fail('ARMY_NOT_FOUND', '军团不存在', { armyId });
    if (army.status === 'MARCHING' || army.status === 'RETURNING') {
      fail('ARMY_NOT_STATIONARY', '军团行军/返回中不可变更将领');
    }
    if (army.memberGeneralIds.length >= this.ctx.balance.maxGeneralsPerArmy) {
      fail('TOO_MANY_GENERALS', `军团将领已满（${this.ctx.balance.maxGeneralsPerArmy} 人）`);
    }
    if (army.memberGeneralIds.includes(generalId)) fail('GENERAL_ALREADY_IN_ARMY', '该将领已在军团中');
    const g = this.general(state, generalId);
    if (g.status !== 'IDLE') fail('GENERAL_NOT_IDLE', '只有空闲将领可以加入军团', { status: g.status });
    army.memberGeneralIds.push(generalId);
    g.armyId = army.id;
    return this.commit(state);
  }

  // 军团撤走将领（军团长不可撤走）
  armyRemoveGeneral(armyId: string, generalId: string): GameState {
    const state = this.loadAndAdvance();
    const army = state.armies.find((a) => a.id === armyId);
    if (!army) fail('ARMY_NOT_FOUND', '军团不存在', { armyId });
    if (army.status === 'MARCHING' || army.status === 'RETURNING') {
      fail('ARMY_NOT_STATIONARY', '军团行军/返回中不可撤走将领');
    }
    if (army.bannerGeneralId === generalId) {
      fail('BANNER_GENERAL_FIXED', '军团长不可更换或撤走');
    }
    if (!army.memberGeneralIds.includes(generalId)) fail('GENERAL_NOT_IN_ARMY', '该将领不在军团中');
    army.memberGeneralIds = army.memberGeneralIds.filter((id) => id !== generalId);
    const g = this.general(state, generalId);
    g.status = 'IDLE';
    g.armyId = undefined;
    g.cityId = undefined;
    // 从城市驻守列表中移除
    for (const city of state.cities) {
      if (city.generalIds?.includes(generalId)) {
        city.generalIds = city.generalIds.filter((id) => id !== generalId);
        city.generalId = city.generalIds[0];
      }
    }
    return this.commit(state);
  }

  // 军团补充兵力（士兵池 → 军团）
  armyReinforce(armyId: string, infantry: number, cavalry: number): GameState {
    const state = this.loadAndAdvance();
    const army = state.armies.find((a) => a.id === armyId);
    if (!army) fail('ARMY_NOT_FOUND', '军团不存在', { armyId });
    if (army.status === 'MARCHING' || army.status === 'RETURNING') {
      fail('ARMY_NOT_STATIONARY', '军团行军/返回中不可补充兵力');
    }
    if (infantry + cavalry <= 0) fail('EMPTY_ARMY', '补充数量必须大于 0');
    const pool = troopPool(state);
    if (infantry > pool.infantry || cavalry > pool.cavalry) {
      fail('INSUFFICIENT_TROOPS', '可用士兵不足', { need: { infantry, cavalry }, pool });
    }
    const cap = armyCommandCap(this.ctx.balance, state, army);
    if (army.infantry + army.cavalry + infantry + cavalry > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', '补充后超出将领合计统帅上限');
    }
    army.infantry += infantry;
    army.cavalry += cavalry;
    return this.commit(state);
  }

  // 单将进攻：无需军团/军团旗，空闲将领直接从出兵地（默认首都）出兵攻城
  soloAttack(input: {
    generalId: string;
    targetCityId: string;
    originCityId?: string;
    infantry: number;
    cavalry: number;
    useTalisman?: boolean;
  }): GameState {
    const state = this.loadAndAdvance();
    const g = this.general(state, input.generalId);
    if (g.status !== 'IDLE') fail('GENERAL_NOT_IDLE', '只有空闲将领可以率兵进攻', { status: g.status });
    if (!state.enemyCities.some((e) => e.cityId === input.targetCityId)) {
      fail('TARGET_NOT_ENEMY', '目标必须是敌方城市');
    }
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '兵力必须大于 0');
    const pool = troopPool(state);
    if (input.infantry > pool.infantry || input.cavalry > pool.cavalry) {
      fail('INSUFFICIENT_TROOPS', '可用士兵不足', { need: { infantry: input.infantry, cavalry: input.cavalry }, pool });
    }
    // 单将按无军团长加成的统帅约束
    const cap = commandCap(this.ctx.balance, g.level, state, g);
    if (input.infantry + input.cavalry > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前兵力 ${input.infantry + input.cavalry} 人，将领统帅 ${cap} 人，超出 ${input.infantry + input.cavalry - cap} 人`);
    }
    // 出兵地：指定己方城市，默认首都（或首个己方城市）
    const originCityId = input.originCityId
      ? (() => {
          this.playerCity(state, input.originCityId);
          return input.originCityId;
        })()
      : (state.cities.find((c) => c.cityId === state.capitalCityId) ?? state.cities[0]).cityId;
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: `${g.name}部`,
      bannerGeneralId: g.id,
      memberGeneralIds: [g.id],
      strategy: 'NORMAL' as const,
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'IDLE' as const,
      originCityId,
    };
    state.armies.push(army);
    g.armyId = army.id;
    this.doMarch(state, army.id, input.targetCityId, input.useTalisman ?? false);
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
    // 目标为己方：须有路线或用神行符；目标为敌方：须相邻或用神行符
    if (isFriendly) {
      if (!routeBetween(this.ctx.routes, army.originCityId, targetCityId) && !useTalisman) {
        fail('NO_ROUTE', '出发城市与目标城市之间没有路线，可开启神行符增援', { targetCityId });
      }
    } else if (!canAttack(this.ctx.cities, state, targetCityId) && !useTalisman) {
      fail('NOT_ATTACKABLE', '目标城市不满足进攻条件（必须为相邻敌方城市或己方城市）', { targetCityId });
    }

    const originConfig = this.cityConfig(army.originCityId);
    let noRouteKm: number | undefined;
    let talismanCostUsed = 0;

    if (useTalisman) {
      if (!isFriendly && !state.enemyCities.some((e) => e.cityId === targetCityId)) {
        fail('TARGET_NOT_ENEMY', '目标城市不存在');
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

    const generalIds = army.memberGeneralIds ?? [];
    for (const id of generalIds) {
      const general = state.generals.find((g) => g.id === id);
      if (general && general.status !== 'IDLE') {
        fail('GENERAL_NOT_IDLE', '将领当前状态不可出征', { status: general.status });
      }
    }
    const cap = armyCommandCap(this.ctx.balance, state, { bannerGeneralId: army.bannerGeneralId, memberGeneralIds: army.memberGeneralIds });
    if (army.infantry + army.cavalry > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${army.infantry + army.cavalry} 人，将领合计统帅 ${cap} 人，超出 ${army.infantry + army.cavalry - cap} 人`);
    }

    const speedMultiplier =
      techEffects(this.ctx.balance, state).marchSpeed *
      (1 + (state.capitalCityId === army.originCityId ? this.ctx.balance.capitalMarchSpeedBonus : 0));
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
    for (const id of generalIds) {
      const general = state.generals.find((g) => g.id === id);
      if (general) {
        general.status = 'MARCHING';
        general.cityId = undefined;
        general.armyId = army.id;
      }
    }
  }

  // 驻守将领从驻守地调兵攻打周边（兵力取自驻军）
  garrisonAttack(input: {
    garrisonCityId: string;
    generalId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    useTalisman?: boolean;
  }): GameState {
    const state = this.loadAndAdvance();
    const city = this.playerCity(state, input.garrisonCityId);
    const g = this.general(state, input.generalId);
    if (g.status !== 'GARRISON' || g.cityId !== input.garrisonCityId) {
      fail('GENERAL_NOT_GARRISON', '该将领未驻守于此城市，无法率驻军出征', {
        status: g.status,
        cityId: g.cityId,
      });
    }
    if (input.targetCityId === input.garrisonCityId) fail('INVALID_TARGET', '目标城市不能是驻守城市');
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '兵力必须大于 0');
    if (input.infantry > city.infantry || input.cavalry > city.cavalry) {
      fail('INSUFFICIENT_GARRISON', '驻军不足', {
        need: { infantry: input.infantry, cavalry: input.cavalry },
        have: { infantry: city.infantry, cavalry: city.cavalry },
      });
    }
    const cap = commandCap(this.ctx.balance, g.level, state);
    if (input.infantry + input.cavalry > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${input.infantry + input.cavalry} 人，将领统帅 ${cap} 人，超出 ${input.infantry + input.cavalry - cap} 人`);
    }
    if (!state.enemyCities.some((e) => e.cityId === input.targetCityId)) {
      fail('TARGET_NOT_ENEMY', '目标必须是敌方城市');
    }
    const useTalisman = input.useTalisman ?? false;
    if (!canAttack(this.ctx.cities, state, input.targetCityId) && !useTalisman) {
      fail('NOT_ATTACKABLE', '目标城市不满足进攻条件（必须相邻或使用神行符）', { targetCityId: input.targetCityId });
    }

    const originConfig = this.cityConfig(input.garrisonCityId);
    const targetConfig = this.cityConfig(input.targetCityId);
    let noRouteKm: number | undefined;
    if (useTalisman) {
      const cost = talismanCost(this.ctx.balance, originConfig.provinceId, targetConfig.provinceId);
      if ((state.tech.talismans ?? 0) < cost) {
        fail('INSUFFICIENT_TALISMANS', `神行符不足：需要 ${cost} 张，当前持有 ${state.tech.talismans ?? 0}`);
      }
      state.tech.talismans -= cost;
      if (!routeBetween(this.ctx.routes, input.garrisonCityId, input.targetCityId)) {
        noRouteKm = haversineKm(originConfig, targetConfig);
      }
    } else if (!routeBetween(this.ctx.routes, input.garrisonCityId, input.targetCityId)) {
      fail('NO_ROUTE', '出发城市与目标城市之间没有路线', { targetCityId: input.targetCityId });
    }

    city.infantry -= input.infantry;
    city.cavalry -= input.cavalry;
    city.generalIds = (city.generalIds ?? (city.generalId ? [city.generalId] : [])).filter((id) => id !== g.id);
    city.generalId = city.generalIds[0] ?? undefined;

    const speedMultiplier = techEffects(this.ctx.balance, state).marchSpeed;
    const seconds = marchTimeSeconds(
      this.ctx.balance,
      this.ctx.routes,
      input.garrisonCityId,
      input.targetCityId,
      input.infantry,
      input.cavalry,
      speedMultiplier,
      noRouteKm
    );
    const now = this.nowMs();
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: `${g.name}部`,
      bannerGeneralId: g.id,
      memberGeneralIds: [g.id],
      strategy: 'NORMAL' as const,
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'MARCHING' as const,
      originCityId: input.garrisonCityId,
      targetCityId: input.targetCityId,
      departedAt: nowIso(now),
      arrivesAt: nowIso(now + seconds * 1000),
    };
    state.armies.push(army);
    g.status = 'MARCHING';
    g.armyId = army.id;
    g.cityId = undefined;
    return this.commit(state);
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
    const generalIds = army.memberGeneralIds ?? [];
    army.status = 'IDLE';
    army.targetCityId = undefined;
    army.departedAt = undefined;
    army.arrivesAt = undefined;
    for (const id of generalIds) {
      const general = state.generals.find((g) => g.id === id);
      if (general) {
        general.status = 'IDLE';
        general.armyId = army.id;
      }
    }
    return this.commit(state);
  }

  // 首都迁移：迁都后首都人口 ×1.5、从首都出发行军 +5%
  moveCapital(cityId: string): GameState {
    const state = this.loadAndAdvance();
    this.playerCity(state, cityId);
    state.capitalCityId = cityId;
    return this.commit(state);
  }

  // 攻打蛮族营地（无接壤要求，行军 = 大圆距离，不耗神行符；需将领统率）
  barbarianAttack(input: {
    campId: string;
    bannerGeneralId: string;
    memberGeneralIds: string[];
    strategy?: string;
    infantry: number;
    cavalry: number;
  }): GameState {
    const state = this.loadAndAdvance();
    const camp = state.barbarianCamps.find((c) => c.id === input.campId);
    if (!camp) fail('CAMP_NOT_FOUND', '蛮族营地不存在');
    const generalIds = [...new Set(input.memberGeneralIds)];
    if (generalIds.length === 0) {
      fail('GENERAL_REQUIRED_FOR_ATTACK', '攻打营地必须由将领统率');
    }
    if (!generalIds.includes(input.bannerGeneralId)) fail('BANNER_GENERAL_NOT_IN_ARMY', '军团长必须是成员之一');
    if (generalIds.length > this.ctx.balance.maxGeneralsPerArmy) {
      fail('TOO_MANY_GENERALS', `最多编入 ${this.ctx.balance.maxGeneralsPerArmy} 名将领`);
    }
    const generals = generalIds.map((id) => this.general(state, id));
    for (const g of generals) {
      if (g.status !== 'IDLE') fail('GENERAL_NOT_IDLE', '只有空闲将领可以出征', { status: g.status });
    }
    const pool = troopPool(state);
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '兵力必须大于 0');
    const cap = armyCommandCap(this.ctx.balance, state, { bannerGeneralId: input.bannerGeneralId, memberGeneralIds: generalIds });
    if (input.infantry + input.cavalry > cap) {
      fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${input.infantry + input.cavalry} 人，将领合计统帅 ${cap} 人，超出 ${input.infantry + input.cavalry - cap} 人`);
    }
    if (input.infantry > pool.infantry || input.cavalry > pool.cavalry) {
      fail('INSUFFICIENT_TROOPS', '可用士兵不足');
    }
    // 从首都（或首个己方城市）出发，大圆距离行军
    const from = state.cities.find((c) => c.cityId === state.capitalCityId) ?? state.cities[0];
    const hostConfig = this.cityConfig(camp.hostCityId);
    const speedMultiplier =
      techEffects(this.ctx.balance, state).marchSpeed *
      (1 + (from.cityId === state.capitalCityId ? this.ctx.balance.capitalMarchSpeedBonus : 0));
    const seconds = Math.ceil(
      ((campDistance(camp, hostConfig) / 100) * this.ctx.balance.marchBaseSecondsPer100Km) /
        armySpeedCoefficient(input.infantry, input.cavalry) /
        speedMultiplier
    );
    const now = this.nowMs();
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: '营地讨伐',
      bannerGeneralId: input.bannerGeneralId,
      memberGeneralIds: generalIds,
      strategy: (input.strategy as 'NORMAL' | 'DEFENSIVE' | 'CHARGE') ?? 'NORMAL',
      infantry: input.infantry,
      cavalry: input.cavalry,
      status: 'MARCHING' as const,
      originCityId: from.cityId,
      targetCityId: input.campId,
      departedAt: nowIso(now),
      arrivesAt: nowIso(now + seconds * 1000),
    };
    state.armies.push(army);
    for (const g of generals) {
      g.status = 'MARCHING';
      g.armyId = army.id;
      g.cityId = undefined;
    }
    return this.commit(state);
  }

  // 使用加速符：使训练批次/行军剩余时间提前 1 小时（可对同一目标多次使用）
  useSpeedup(targetType: 'training' | 'army', targetId: string): GameState {
    const state = this.loadAndAdvance();
    if ((state.tech.speedUps ?? 0) < 1) fail('NO_SPEEDUP', '加速符不足');
    const seconds = this.ctx.balance.speedup.secondsPerUse;
    if (targetType === 'training') {
      const batch = state.trainingBatches.find((b) => b.id === targetId);
      if (!batch) fail('BATCH_NOT_FOUND', '训练批次不存在');
      const newMs = Date.parse(batch.completesAt) - seconds * 1000;
      batch.completesAt = new Date(Math.max(Date.parse(batch.startedAt), newMs)).toISOString();
    } else {
      const army = state.armies.find((a) => a.id === targetId);
      if (!army) fail('ARMY_NOT_FOUND', '军团不存在');
      if (army.status !== 'MARCHING' && army.status !== 'RETURNING') {
        fail('ARMY_NOT_IN_MARCH', '该军团不在行军/返回中');
      }
      const newMs = Date.parse(army.arrivesAt!) - seconds * 1000;
      army.arrivesAt = new Date(newMs).toISOString();
    }
    state.tech.speedUps -= 1;
    return this.commit(state);
  }

  // 一键训练 / 一键结束训练
  batchTraining(action: 'start' | 'stop'): GameState {
    const state = this.loadAndAdvance();
    if (action === 'start') {
      const now = this.nowMs();
      for (const g of state.generals) {
        if (g.status === 'IDLE' || g.status === 'GARRISON') {
          g.status = 'TRAINING';
          g.trainingStartedAt = nowIso(now);
          g.lastXpCalculatedAt = nowIso(now);
          g.armyId = undefined;
        }
      }
    } else {
      for (const g of state.generals) {
        if (g.status !== 'TRAINING') continue;
        const city = g.cityId ? state.cities.find((c) => c.cityId === g.cityId) : undefined;
        g.status = city ? 'GARRISON' : 'IDLE';
        g.trainingStartedAt = undefined;
        g.lastXpCalculatedAt = undefined;
        if (city && !city.generalIds?.includes(g.id)) {
          if (!city.generalIds) city.generalIds = [];
          city.generalIds.push(g.id);
          city.generalId = city.generalIds[0];
        }
      }
    }
    return this.commit(state);
  }

  transfer(input: {
    originCityId: string;
    targetCityId: string;
    infantry: number;
    cavalry: number;
    generalId?: string;
    useTalisman?: boolean;
  }): GameState {
    const state = this.loadAndAdvance();
    this.playerCity(state, input.originCityId);
    this.playerCity(state, input.targetCityId);
    if (input.originCityId === input.targetCityId) fail('INVALID_TARGET', '目标城市不能是出发城市');
    if (input.infantry + input.cavalry <= 0) fail('EMPTY_ARMY', '调兵数量必须大于 0');
    const useTalisman = input.useTalisman ?? false;
    if (!routeBetween(this.ctx.routes, input.originCityId, input.targetCityId) && !useTalisman) {
      fail('NO_ROUTE', '两城之间没有路线，可开启神行符增援', { targetCityId: input.targetCityId });
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
      const garrisonAtOrigin = g.status === 'GARRISON' && g.cityId === input.originCityId;
      if (g.status !== 'IDLE' && !garrisonAtOrigin) {
        fail('GENERAL_NOT_IDLE', '只有空闲将领或出发城驻守将领可以率队', { status: g.status });
      }
      const cap = commandCap(this.ctx.balance, g.level, state);
      if (input.infantry + input.cavalry > cap) {
        fail('COMMAND_LIMIT_EXCEEDED', `当前军团 ${input.infantry + input.cavalry} 人，将领统帅 ${cap} 人`);
      }
      generalId = g.id;
      if (garrisonAtOrigin) {
        origin.generalIds = (origin.generalIds ?? (origin.generalId ? [origin.generalId] : [])).filter(
          (id) => id !== g.id
        );
        origin.generalId = origin.generalIds[0] ?? undefined;
      }
    }
    origin.infantry -= input.infantry;
    origin.cavalry -= input.cavalry;

    // 神行符增援：无直达路线时消耗神行符并兜底行军时间
    let noRouteKm: number | undefined;
    if (useTalisman && !routeBetween(this.ctx.routes, input.originCityId, input.targetCityId)) {
      const cost = talismanCost(
        this.ctx.balance,
        this.cityConfig(input.originCityId).provinceId,
        this.cityConfig(input.targetCityId).provinceId
      );
      if ((state.tech.talismans ?? 0) < cost) {
        fail('INSUFFICIENT_TALISMANS', `神行符不足：需要 ${cost} 张，当前持有 ${state.tech.talismans ?? 0}`);
      }
      state.tech.talismans -= cost;
      noRouteKm = haversineKm(this.cityConfig(input.originCityId), this.cityConfig(input.targetCityId));
    }

    const speedMultiplier = techEffects(this.ctx.balance, state).marchSpeed;
    const seconds = marchTimeSeconds(
      this.ctx.balance,
      this.ctx.routes,
      input.originCityId,
      input.targetCityId,
      input.infantry,
      input.cavalry,
      speedMultiplier,
      noRouteKm
    );
    const now = this.nowMs();
    const army = {
      id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      name: '增援',
      bannerGeneralId: generalId ?? '',
      memberGeneralIds: generalId ? [generalId] : [],
      strategy: 'NORMAL' as const,
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

// 蛮族营地到其宿主城市的大圆距离（营地坐标偏移 ±30px 内）
function campDistance(camp: { x: number; y: number }, host: CityConfig): number {
  const dx = (camp.x - host.x) / 1.7;
  const dy = (camp.y - host.y) / 1.7;
  return Math.max(50, Math.round(Math.sqrt(dx * dx + dy * dy) * 4));
}
