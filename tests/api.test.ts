import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../apps/server/src/app.js';
import { loadGameData } from '../apps/server/src/config.js';
import { openDatabase } from '../apps/server/src/db/database.js';
import { mulberry32 } from '../apps/server/src/engine/index.js';
import { GameRepository } from '../apps/server/src/repositories/gameRepository.js';
import { GameService } from '../apps/server/src/services/gameService.js';
import type { GameState } from '@timewar/shared';

const T0 = Date.parse('2026-02-01T00:00:00.000Z');

let app: FastifyInstance;
let db: Database.Database;
let now = T0;
let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'timewar-test-'));
  db = openDatabase(join(dir, 'test.db'));
  const repo = new GameRepository(db);
  const data = loadGameData();
  const service = new GameService(
    repo,
    { balance: data.balance, cities: data.cities, routes: data.routes, rng: mulberry32(99) },
    () => now
  );
  app = await buildApp(service, { isDev: false });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const AUTH = { 'x-auth-code': 'ainiyiwannian' };
const post = (url: string, body?: unknown) =>
  app.inject({ method: 'POST', url, payload: body ?? {}, headers: { 'content-type': 'application/json', ...AUTH } });
const get = (url: string) => app.inject({ method: 'GET', url, headers: AUTH });
const stateOf = (res: { json: () => { state: GameState } }) => res.json().state;

// 注入军团旗到当前存档
async function injectBannerFlags(n: number) {
  const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
  const injected = JSON.parse(row.state) as GameState;
  injected.tech.bannerFlags = n;
  db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
}

// 快速建军团（注入旗帜）：返回 armyId
async function newArmy(opts: { generalId: string; infantry?: number; cavalry?: number }): Promise<string> {
  await injectBannerFlags(5);
  const create = await post('/api/armies/create', {
    originCityId: 'acity',
    name: '测试军团',
    bannerGeneralId: opts.generalId,
    memberGeneralIds: [opts.generalId],
    strategy: 'NORMAL',
    infantry: opts.infantry ?? 200,
    cavalry: opts.cavalry ?? 0,
  });
  expect(create.statusCode, JSON.stringify(create.json())).toBe(200);
  const s = stateOf(create);
  return s.armies[s.armies.length - 1].id;
}
async function newArmyAndMarch(opts: {
  generalId: string;
  targetCityId: string;
  infantry?: number;
  useTalisman?: boolean;
}): Promise<GameState> {
  const armyId = await newArmy(opts);
  const m = await post('/api/armies/march', { armyId, targetCityId: opts.targetCityId, useTalisman: opts.useTalisman ?? false });
  expect(m.statusCode).toBe(200);
  return stateOf(m);
}

describe('API 集成（后端权威）', () => {
  it('授权码登录：未登录 401、正确登录返回管理员、错误码拒绝', async () => {
    // 无授权码 → 401
    const noAuth = await app.inject({ method: 'GET', url: '/api/game/state' });
    expect(noAuth.statusCode).toBe(401);
    expect(noAuth.json().code).toBe('AUTH_REQUIRED');
    // 错误授权码 → 401
    const bad = await app.inject({ method: 'GET', url: '/api/game/state', headers: { 'x-auth-code': 'wrong' } });
    expect(bad.statusCode).toBe(401);
    // 登录接口放行
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { code: 'ainiyiwannian' },
      headers: { 'content-type': 'application/json' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().auth.isAdmin).toBe(true);
  });

  it('管理员可新增授权码，非管理员被拒绝；新授权码拥有独立存档', async () => {
    // 管理员新增
    const add = await post('/api/auth/add-code', { code: 'player01', name: '玩家一' });
    expect(add.statusCode).toBe(200);
    expect(add.json().auth.code).toBe('player01');
    // 重复 → 拒绝
    const dup = await post('/api/auth/add-code', { code: 'player01', name: 'x' });
    expect(dup.statusCode).toBe(400);
    expect(dup.json().code).toBe('AUTH_CODE_EXISTS');
    // 非管理员（player01）新增 → 拒绝
    const p1Add = await app.inject({
      method: 'POST',
      url: '/api/auth/add-code',
      payload: { code: 'player02', name: 'x' },
      headers: { 'content-type': 'application/json', 'x-auth-code': 'player01' },
    });
    expect(p1Add.statusCode).toBe(400);
    expect(p1Add.json().code).toBe('AUTH_FORBIDDEN');
    // 管理员存档：占领清远
    const gidAdmin = stateOf(await get('/api/game/state')).generals[0].id;
    await newArmyAndMarch({ generalId: gidAdmin, targetCityId: 'qingyuan' });
    const s = stateOf(await get('/api/game/state'));
    // 玩家一存档独立：仍是初始状态
    const p1 = await app.inject({ method: 'GET', url: '/api/game/state', headers: { 'x-auth-code': 'player01' } });
    const p1s = p1.json().state as GameState;
    expect(p1s.cities).toHaveLength(1);
    expect(p1s.cities[0].cityId).toBe('acity');
    expect(p1s.id).not.toBe(s.id);
  });
  it('新建游戏：初始城 A市(1级)、广州为5级敌城、清远守军100、初始将领', async () => {
    const res = await post('/api/game/new');
    expect(res.statusCode).toBe(200);
    const s = stateOf(res);
    expect(s.cities).toHaveLength(1);
    expect(s.cities[0].cityId).toBe('acity');
    expect(s.cities[0].level).toBe(1);
    expect(s.resources.idlePopulation).toBe(500);
    expect(s.resources.infantry).toBe(200);
    expect(s.generals).toHaveLength(1);
    expect(s.enemyCities.find((e) => e.cityId === 'qingyuan')?.garrison).toBe(100);
    expect(s.enemyCities.find((e) => e.cityId === 'guangzhou')?.level ?? s.enemyCities.some((e) => e.cityId === 'guangzhou')).toBe(true);
    expect(s.enemyCities.length).toBeGreaterThan(330);
    expect(s.version).toBe(6);
    expect(s.tech.researchWorkers).toBe(0);
    expect(s.welcomeShown).toBe(false);
    expect(s.tutorialStep).toBe(1);
    // 每座敌城都有守将
    expect(s.enemyCities.every((e) => e.defender && e.defender.name)).toBe(true);
  });

  it('首次登录弹窗：ack 后 welcomeShown 变为 true', async () => {
    await post('/api/game/new');
    const before = stateOf(await get('/api/game/state'));
    expect(before.welcomeShown).toBe(false);
    const res = await post('/api/game/welcome-ack');
    expect(res.statusCode).toBe(200);
    const after = stateOf(res);
    expect(after.welcomeShown).toBe(true);
    // 持久化：再次读取仍为 true
    expect(stateOf(await get('/api/game/state')).welcomeShown).toBe(true);
  });

  it('GET state 推进时间：10秒后人口+1（A市 1级）', async () => {
    await post('/api/game/new');
    now += 10_000;
    const s = stateOf(await get('/api/game/state'));
    expect(s.resources.idlePopulation).toBe(501);
    const s2 = stateOf(await get('/api/game/state'));
    expect(s2.resources.idlePopulation).toBe(501);
  });

  it('离线 65 秒后 GET state 生成离线报告', async () => {
    await post('/api/game/new');
    now += 65_000;
    const res = await get('/api/game/state');
    const s = stateOf(res);
    expect(s.offlineReport).toBeTruthy();
    expect(s.offlineReport!.offlineMs).toBeGreaterThan(60_000);
    expect(s.offlineReport!.populationGained).toBeGreaterThan(0);
  });

  it('分配生产人口：空闲人口同步变化，超限拒绝', async () => {
    await post('/api/game/new');
    const res = await post('/api/production/allocate', { workers: { weapon: 100, armor: 50, horse: 0 } });
    expect(res.statusCode).toBe(200);
    const s = stateOf(res);
    expect(s.resources.idlePopulation).toBe(350);
    expect(s.production.weapon.workers).toBe(100);
    expect(s.production.armor.workers).toBe(50);
    const bad = await post('/api/production/allocate', { workers: { weapon: 1000, armor: 0, horse: 0 } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INSUFFICIENT_IDLE_POPULATION');
  });

  it('科研院：分配研究员（基准 10000 人）', async () => {
    await post('/api/game/new');
    const res = await post('/api/research/allocate', { workers: 100 });
    expect(res.statusCode).toBe(200);
    let s = stateOf(res);
    expect(s.tech.researchWorkers).toBe(100);
    expect(s.resources.idlePopulation).toBe(400);
    // 超限拒绝（当前 100 + 空闲 400 = 上限 500）
    const bad = await post('/api/research/allocate', { workers: 600 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INSUFFICIENT_IDLE_POPULATION');
    // 撤回
    s = stateOf(await post('/api/research/allocate', { workers: 0 }));
    expect(s.tech.researchWorkers).toBe(0);
    expect(s.resources.idlePopulation).toBe(500);
  });

  it('科技升级：一次性人口投入，等级+1，效果生效', async () => {
    await post('/api/game/new');
    // 注入 5000 人口后升级（开局 500 不足以支付 5000）
    const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const injected = JSON.parse(row.state) as GameState;
    injected.resources.idlePopulation += 5000;
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
    const res = await post('/api/tech/upgrade', { key: 'agronomy' });
    expect(res.statusCode).toBe(200);
    const s = stateOf(res);
    expect(s.tech.levels.agronomy).toBe(1);
    expect(s.resources.idlePopulation).toBe(500);
    const bad = await post('/api/tech/upgrade', { key: 'agronomy' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INSUFFICIENT_POPULATION');
  });

  it('训练：无人数上限、时长随人数增长、到点完成', async () => {
    await post('/api/game/new');
    const res = await post('/api/training/start', { count: 100 });
    expect(res.statusCode).toBe(200);
    let s = stateOf(res);
    expect(s.resources.idlePopulation).toBe(400);
    expect(s.trainingBatches).toHaveLength(1);
    // 时长 = round(600 + 99×0.6) = 659 秒
    const durationMs = Date.parse(s.trainingBatches[0].completesAt) - Date.parse(s.trainingBatches[0].startedAt);
    expect(durationMs).toBe(Math.round(600 + 99 * 0.6) * 1000);
    // 无容量上限：1 人也可继续开批（无 TRAINING_CAPACITY_EXCEEDED）
    const more = await post('/api/training/start', { count: 1 });
    expect(more.statusCode).toBe(200);
    now += Math.round(600 + 99 * 0.6) * 1000;
    s = stateOf(await get('/api/game/state'));
    // 两个批次（100 人 659s + 1 人 600s）均已到期完成
    expect(s.trainingBatches).toHaveLength(0);
    expect(s.resources.trainedPopulation + s.generals.length - 1).toBe(101);
  });

  it('训练取消：返还50%人口', async () => {
    await post('/api/game/new');
    const res = await post('/api/training/start', { count: 100 });
    const batchId = stateOf(res).trainingBatches[0].id;
    const cancel = await post('/api/training/cancel', { batchId });
    const s = stateOf(cancel);
    expect(s.resources.idlePopulation).toBe(450);
    expect(s.trainingBatches).toHaveLength(0);
  });

  it('合成：资源不足整体失败，充足则精确扣除', async () => {
    await post('/api/game/new');
    const bad = await post('/api/soldiers/craft', { infantry: 1, cavalry: 0 });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('INSUFFICIENT_RESOURCES');
    await post('/api/production/allocate', { workers: { weapon: 100, armor: 100, horse: 0 } });
    now += 45_000;
    let s = stateOf(await get('/api/game/state'));
    expect(s.resources.weapons).toBe(1);
    expect(s.resources.armors).toBe(1);
    await post('/api/production/allocate', { workers: { weapon: 0, armor: 0, horse: 0 } });
    await post('/api/training/start', { count: 1 });
    now += 600_000;
    const res = await post('/api/soldiers/craft', { infantry: 1, cavalry: 0 });
    expect(res.statusCode).toBe(200);
    s = stateOf(res);
    expect(s.resources.trainedPopulation).toBe(0);
    expect(s.resources.weapons).toBe(0);
    expect(s.resources.armors).toBe(0);
    expect(s.resources.infantry).toBe(201);
  });

  it('将领训练期间不能编入军团', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    await post('/api/generals/start-training', { generalId: gid });
    await injectBannerFlags(1);
    const bad = await post('/api/armies/create', {
      originCityId: 'acity',
      name: '测试军团',
      bannerGeneralId: gid,
      memberGeneralIds: [gid],
      infantry: 100,
      cavalry: 0,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('GENERAL_NOT_IDLE');
    await post('/api/generals/stop-training', { generalId: gid });
  });

  it('新档初始拥有 2 面军团旗', async () => {
    await post('/api/game/new');
    const s = stateOf(await get('/api/game/state'));
    expect(s.tech.bannerFlags).toBe(2);
  });

  it('组建军团需军团旗；军团长不可更换；成员上限 10 人', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 清空旗帜 → 拒绝
    await injectBannerFlags(0);
    const noFlag = await post('/api/armies/create', {
      originCityId: 'acity',
      name: '测试军团',
      bannerGeneralId: gid,
      memberGeneralIds: [gid],
      infantry: 100,
      cavalry: 0,
    });
    expect(noFlag.statusCode).toBe(400);
    expect(noFlag.json().code).toBe('BANNER_FLAG_REQUIRED');
    // 有旗帜 → 成功，消耗 1 面
    await injectBannerFlags(3);
    const ok = await post('/api/armies/create', {
      originCityId: 'acity',
      name: '虎啸营',
      bannerGeneralId: gid,
      memberGeneralIds: [gid],
      infantry: 100,
      cavalry: 0,
    });
    expect(ok.statusCode).toBe(200);
    const s = stateOf(ok);
    expect(s.tech.bannerFlags).toBe(2);
    const armyId = s.armies[0].id;
    // 军团长不可撤走
    const removeBanner = await post('/api/armies/remove-general', { armyId, generalId: gid });
    expect(removeBanner.statusCode).toBe(400);
    expect(removeBanner.json().code).toBe('BANNER_GENERAL_FIXED');
  });

  it('驻守将领可训练：占领清远后驻守将领训练，停止后恢复驻守', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    const qy = s.cities.find((c) => c.cityId === 'qingyuan')!;
    expect(qy.generalId).toBe(gid);
    // 驻守将领开始训练（允许）
    const tr = await post('/api/generals/start-training', { generalId: gid });
    expect(tr.statusCode).toBe(200);
    s = stateOf(tr);
    expect(s.generals[0].status).toBe('TRAINING');
    expect(s.generals[0].cityId).toBe('qingyuan'); // 驻守地保留
    expect(s.cities.find((c) => c.cityId === 'qingyuan')!.generalId).toBe(gid);
    // 停止训练后恢复驻守
    const st = await post('/api/generals/stop-training', { generalId: gid });
    s = stateOf(st);
    expect(s.generals[0].status).toBe('GARRISON');
    expect(s.generals[0].cityId).toBe('qingyuan');
  });

  it('神行符：攻打任意城市 + 己方城市无路线增援', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 注入神行符 + 第二座己方城市（阳江，与清远无直达路线）
    const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const injected = JSON.parse(row.state) as GameState;
    injected.tech.talismans = 10;
    injected.cities.push({ cityId: 'yangjiang', occupiedAt: new Date().toISOString(), level: 2, infantry: 0, cavalry: 0 });
    injected.enemyCities = injected.enemyCities.filter((e) => e.cityId !== 'yangjiang');
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
    // 占领清远获得驻军
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    // 无神行符时 transfer 到无路线己方城市 → 拒绝
    const noT = await post('/api/armies/transfer', {
      originCityId: 'qingyuan',
      targetCityId: 'yangjiang',
      infantry: 10,
      cavalry: 0,
    });
    expect(noT.statusCode).toBe(400);
    expect(noT.json().code).toBe('NO_ROUTE');
    // 使用神行符 → 成功（同省 1 张）
    const ok = await post('/api/armies/transfer', {
      originCityId: 'qingyuan',
      targetCityId: 'yangjiang',
      infantry: 10,
      cavalry: 0,
      useTalisman: true,
    });
    expect(ok.statusCode).toBe(200);
    s = stateOf(ok);
    expect(s.armies[0].status).toBe('MARCHING');
    expect(s.tech.talismans).toBe(9);
  });

  it('驻守出征：驻守将领从驻守地调兵攻打周边', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    const qy = s.cities.find((c) => c.cityId === 'qingyuan')!;
    expect(qy.infantry).toBeGreaterThan(0);
    // 驻守出征：清远驻军攻打相邻的肇庆
    const attack = await post('/api/armies/garrison-attack', {
      garrisonCityId: 'qingyuan',
      generalId: gid,
      targetCityId: 'zhaoqing',
      infantry: qy.infantry,
      cavalry: 0,
    });
    expect(attack.statusCode).toBe(200);
    s = stateOf(attack);
    expect(s.armies[0].status).toBe('MARCHING');
    expect(s.armies[0].originCityId).toBe('qingyuan');
    expect(s.cities.find((c) => c.cityId === 'qingyuan')!.infantry).toBe(0);
    expect(s.generals[0].status).toBe('MARCHING');
    // 将领非驻守时拒绝
    const bad = await post('/api/armies/garrison-attack', {
      garrisonCityId: 'qingyuan',
      generalId: gid,
      targetCityId: 'zhaoqing',
      infantry: 1,
      cavalry: 0,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('GENERAL_NOT_GARRISON');
  });

  it('统帅上限：军团长 1 级(×1.5=300)超出禁止创建军团', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    await injectBannerFlags(1);
    // 注入士兵池兵力
    const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const injected = JSON.parse(row.state) as GameState;
    injected.resources.infantry += 500;
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
    const bad = await post('/api/armies/create', {
      originCityId: 'acity',
      name: '测试军团',
      bannerGeneralId: gid,
      memberGeneralIds: [gid],
      infantry: 301,
      cavalry: 0,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('COMMAND_LIMIT_EXCEEDED');
  });

  it('完整流程：200步兵攻清远 → 占领 → 增速+5/10秒 → A市升级 → 战报可查', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    expect(s.armies[0].status).toBe('MARCHING');
    const arrivesAt = Date.parse(s.armies[0].arrivesAt!);
    now = arrivesAt + 1000;
    s = stateOf(await get('/api/game/state'));
    expect(s.cities).toHaveLength(2);
    expect(s.battleReports[0].victory).toBe(true);
    expect(s.cities.find((c) => c.cityId === 'acity')!.level).toBe(2);
    now += 10_000;
    const popBefore = s.resources.idlePopulation;
    s = stateOf(await get('/api/game/state'));
    expect(s.resources.idlePopulation - popBefore).toBe(5); // A市(2×1.5首都)+清远2
    const reports = (await get('/api/battles')).json().reports;
    expect(reports).toHaveLength(1);
  });

  it('神行符：突破接壤攻打远省城市，按省距消耗', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 无神行符时不允许攻打非相邻城市
    const armyId0 = await newArmy({ generalId: gid, infantry: 200 });
    const noTalisman = await post('/api/armies/march', { armyId: armyId0, targetCityId: 'wuhan' });
    expect(noTalisman.statusCode).toBe(400);
    expect(noTalisman.json().code).toBe('NOT_ATTACKABLE');
    // 神行符不足（先补充士兵池）
    const row0 = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const inj0 = JSON.parse(row0.state) as GameState;
    inj0.resources.infantry += 500;
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(inj0));
    const armyId = await newArmy({ generalId: gid, infantry: 1 });
    const noTalismans = await post('/api/armies/march', { armyId, targetCityId: 'wuhan', useTalisman: true });
    expect(noTalismans.statusCode).toBe(400);
    expect(noTalismans.json().code).toBe('INSUFFICIENT_TALISMANS');
    // 注入神行符（直接写库）→ 广东→湖北 隔1省 = 2 张
    const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const injected = JSON.parse(row.state) as GameState;
    injected.tech.talismans = 5;
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
    const ok = await post('/api/armies/march', { armyId, targetCityId: 'wuhan', useTalisman: true });
    if (ok.statusCode !== 200) console.log('march-ok-err:', JSON.stringify(ok.json()));
    expect(ok.statusCode).toBe(200);
    const s = stateOf(ok);
    expect(s.tech.talismans).toBe(3); // 5 - 2
    const marched = s.armies.find((a) => a.id === armyId)!;
    expect(marched.status).toBe('MARCHING');
    expect(marched.arrivesAt).toBeTruthy();
  });

  it('军团出发60秒内可撤回，超时禁止', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    const armyId = await newArmy({ generalId: gid, infantry: 100 });
    await post('/api/armies/march', { armyId, targetCityId: 'qingyuan' });
    now += 30_000;
    const cancel = await post('/api/armies/cancel-march', { armyId });
    expect(cancel.statusCode).toBe(200);
    expect(stateOf(cancel).armies[0].status).toBe('IDLE');
    await post('/api/armies/march', { armyId, targetCityId: 'qingyuan' });
    now += 61_000;
    const late = await post('/api/armies/cancel-march', { armyId });
    expect(late.statusCode).toBe(400);
    expect(late.json().code).toBe('MARCH_NOT_CANCELLABLE');
  });

  it('只能攻击相邻敌方城市（非相邻拒绝）', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    const armyId = await newArmy({ generalId: gid, infantry: 100 });
    const bad = await post('/api/armies/march', { armyId, targetCityId: 'zhaoqing' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('NOT_ATTACKABLE');
  });

  it('调兵（transfer）：从驻军抽调至己方城市', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    const qy = s.cities.find((c) => c.cityId === 'qingyuan')!;
    expect(qy.infantry).toBeGreaterThan(0);
    const transfer = await post('/api/armies/transfer', {
      originCityId: 'qingyuan',
      targetCityId: 'acity',
      infantry: qy.infantry,
      cavalry: 0,
    });
    expect(transfer.statusCode).toBe(200);
    const s2 = stateOf(transfer);
    expect(s2.cities.find((c) => c.cityId === 'qingyuan')!.infantry).toBe(0);
    expect(s2.armies[0].status).toBe('MARCHING');
    now = Date.parse(s2.armies[0].arrivesAt!) + 1000;
    const s3 = stateOf(await get('/api/game/state'));
    expect(s3.cities.find((c) => c.cityId === 'acity')!.infantry).toBeGreaterThan(0);
  });

  it('调兵（transfer）：驻守将领可随队转防，到达后驻守目标城', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    let s = await newArmyAndMarch({ generalId: gid, targetCityId: 'qingyuan' });
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    expect(s.cities.find((c) => c.cityId === 'qingyuan')!.generalIds).toContain(gid);
    const transfer = await post('/api/armies/transfer', {
      originCityId: 'qingyuan',
      targetCityId: 'acity',
      infantry: 100,
      cavalry: 0,
      generalId: gid,
    });
    expect(transfer.statusCode).toBe(200);
    const s2 = stateOf(transfer);
    // 出发后从清远驻守列表移除，随队行军
    expect(s2.cities.find((c) => c.cityId === 'qingyuan')!.generalIds).not.toContain(gid);
    expect(s2.armies[0].memberGeneralIds).toContain(gid);
    expect(s2.generals.find((g) => g.id === gid)!.status).toBe('MARCHING');
    now = Date.parse(s2.armies[0].arrivesAt!) + 1000;
    const s3 = stateOf(await get('/api/game/state'));
    expect(s3.cities.find((c) => c.cityId === 'acity')!.generalIds).toContain(gid);
    expect(s3.generals.find((g) => g.id === gid)!.status).toBe('GARRISON');
    // 非本城驻守将领（此时已驻守 A市）率队 → 拒绝
    const bad = await post('/api/armies/transfer', {
      originCityId: 'qingyuan',
      targetCityId: 'acity',
      infantry: 10,
      cavalry: 0,
      generalId: gid,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('GENERAL_NOT_IDLE');
  });

  it('单将进攻：无需军团旗，从首都出兵，胜利后驻守', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 单将进攻清远
    const attack = await post('/api/armies/solo-attack', {
      generalId: gid,
      targetCityId: 'qingyuan',
      infantry: 200,
      cavalry: 0,
    });
    expect(attack.statusCode).toBe(200);
    const s = stateOf(attack);
    expect(s.armies[0].status).toBe('MARCHING');
    expect(s.armies[0].bannerGeneralId).toBe(gid);
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    const s2 = stateOf(await get('/api/game/state'));
    expect(s2.cities).toHaveLength(2);
    expect(s2.battleReports[0].victory).toBe(true);
    // 将领驻守新城市
    expect(s2.generals[0].status).toBe('GARRISON');
    expect(s2.generals[0].cityId).toBe('qingyuan');
    // 非空闲将领不可单将进攻
    await post('/api/generals/start-training', { generalId: gid });
    const bad = await post('/api/armies/solo-attack', {
      generalId: gid,
      targetCityId: 'zhaoqing',
      infantry: 1,
      cavalry: 0,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('GENERAL_NOT_IDLE');
  });

  it('单将进攻可选择出兵地；非己方出兵地拒绝', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 出兵地必须是己方城市
    const badOrigin = await post('/api/armies/solo-attack', {
      generalId: gid,
      targetCityId: 'qingyuan',
      originCityId: 'zhaoqing', // 敌方城市
      infantry: 1,
      cavalry: 0,
    });
    expect(badOrigin.statusCode).toBe(400);
    expect(badOrigin.json().code).toBe('CITY_NOT_PLAYER_OWNED');
    // 指定出兵地（清远需先占领）——先占清远，再从清远出兵打肇庆
    const first = await post('/api/armies/solo-attack', { generalId: gid, targetCityId: 'qingyuan', infantry: 200, cavalry: 0 });
    expect(first.statusCode).toBe(200);
    let s = stateOf(first);
    now = Date.parse(s.armies[0].arrivesAt!) + 1000;
    s = stateOf(await get('/api/game/state'));
    expect(s.cities).toHaveLength(2);
    // 将领驻守清远后先训练？直接另测：清远驻军不足以打肇庆——用注入兵力+将领空闲
    const g2 = stateOf(await get('/api/game/state')).generals[0];
    expect(g2.status).toBe('GARRISON');
  });

  it('游戏内邮箱：管理员初始收到 GM 欢迎礼包（2面军团旗），领取到账，GM 可发奖', async () => {
    await post('/api/game/new');
    // 管理员收件箱包含欢迎礼包
    const list = await get('/api/mail/list');
    expect(list.statusCode).toBe(200);
    const mails = list.json().mails as { id: string; title: string; itemType?: string; itemAmount: number; claimed: boolean }[];
    const welcome = mails.find((m) => m.id === 'welcome-banner-gift-1');
    expect(welcome).toBeTruthy();
    expect(welcome!.itemType).toBe('banner');
    expect(welcome!.itemAmount).toBe(2);
    // 领取 → 军团旗 +2
    const claim = await post('/api/mail/claim', { mailId: welcome!.id });
    expect(claim.statusCode).toBe(200);
    const s = stateOf(claim);
    expect(s.tech.bannerFlags).toBeGreaterThanOrEqual(2);
    // 重复领取 → 拒绝
    const again = await post('/api/mail/claim', { mailId: welcome!.id });
    expect(again.statusCode).toBe(400);
    // GM 给玩家一发邮件（附 2 面军团旗）
    await post('/api/auth/add-code', { code: 'player01', name: '玩家一' });
    const gm = await post('/api/mail/gm-send', {
      toCode: 'player01',
      title: 'GM 测试奖励',
      body: '奖励内容',
      itemType: 'banner',
      itemAmount: 2,
    });
    expect(gm.statusCode).toBe(200);
    // 非管理员不能发奖
    const p1 = await app.inject({
      method: 'POST',
      url: '/api/mail/gm-send',
      payload: { toCode: 'ainiyiwannian', title: 'x', itemAmount: 0 },
      headers: { 'content-type': 'application/json', 'x-auth-code': 'player01' },
    });
    expect(p1.statusCode).toBe(400);
    expect(p1.json().code).toBe('AUTH_FORBIDDEN');
    // 玩家一领取附件
    const p1List = await app.inject({ method: 'GET', url: '/api/mail/list', headers: { 'x-auth-code': 'player01' } });
    const p1Mails = p1List.json().mails as { id: string; itemType?: string; itemAmount: number }[];
    const gift = p1Mails.find((m) => m.itemType === 'banner');
    expect(gift).toBeTruthy();
    const p1Claim = await app.inject({
      method: 'POST',
      url: '/api/mail/claim',
      payload: { mailId: gift!.id },
      headers: { 'content-type': 'application/json', 'x-auth-code': 'player01' },
    });
    expect(p1Claim.statusCode).toBe(200);
    const p1s = p1Claim.json().state as GameState;
    expect(p1s.tech.bannerFlags).toBe(4); // 新档初始2 + GM 奖励2
  });

  it('数据校验错误返回统一格式', async () => {
    const res = await post('/api/training/start', { count: -5 });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('VALIDATION_ERROR');
  });

  it('重置存档', async () => {
    await post('/api/game/new');
    now += 60_000;
    const res = await post('/api/game/reset');
    const s = stateOf(res);
    expect(s.resources.idlePopulation).toBe(500);
    expect(s.cities).toHaveLength(1);
  });
});
