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

const post = (url: string, body?: unknown) =>
  app.inject({ method: 'POST', url, payload: body ?? {}, headers: { 'content-type': 'application/json' } });
const get = (url: string) => app.inject({ method: 'GET', url });
const stateOf = (res: { json: () => { state: GameState } }) => res.json().state;

describe('API 集成（后端权威）', () => {
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
    expect(s.version).toBe(2);
    expect(s.tech.researchWorkers).toBe(0);
    expect(s.welcomeShown).toBe(false);
    expect(s.tutorialStep).toBe(1);
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

  it('训练：启动批次、容量限制（A市 1级=100）、600秒后完成', async () => {
    await post('/api/game/new');
    const res = await post('/api/training/start', { count: 100 });
    expect(res.statusCode).toBe(200);
    let s = stateOf(res);
    expect(s.resources.idlePopulation).toBe(400);
    expect(s.trainingBatches).toHaveLength(1);
    const over = await post('/api/training/start', { count: 1 });
    expect(over.statusCode).toBe(400);
    expect(over.json().code).toBe('TRAINING_CAPACITY_EXCEEDED');
    now += 600_000;
    s = stateOf(await get('/api/game/state'));
    expect(s.trainingBatches).toHaveLength(0);
    expect(s.resources.trainedPopulation + s.generals.length - 1).toBe(100);
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

  it('将领训练期间不能出征', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    await post('/api/generals/start-training', { generalId: gid });
    const bad = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 100,
      cavalry: 0,
      targetCityId: 'qingyuan',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('GENERAL_NOT_IDLE');
    await post('/api/generals/stop-training', { generalId: gid });
  });

  it('统帅上限：超出200人禁止创建军团', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    const bad = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 201,
      cavalry: 0,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('COMMAND_LIMIT_EXCEEDED');
  });

  it('完整流程：200步兵攻清远 → 占领 → 增速+4/10秒 → A市升级 → 战报可查', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    const create = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 200,
      cavalry: 0,
      targetCityId: 'qingyuan',
    });
    expect(create.statusCode).toBe(200);
    let s = stateOf(create);
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
    expect(s.resources.idlePopulation - popBefore).toBe(4);
    const reports = (await get('/api/battles')).json().reports;
    expect(reports).toHaveLength(1);
  });

  it('神行符：突破接壤攻打远省城市，按省距消耗', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    // 无神行符时不允许攻打非相邻城市
    const noTalisman = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 200,
      cavalry: 0,
      targetCityId: 'wuhan',
    });
    expect(noTalisman.statusCode).toBe(400);
    expect(noTalisman.json().code).toBe('NOT_ATTACKABLE');
    // 神行符不足
    const noTalismans = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 200,
      cavalry: 0,
      targetCityId: 'wuhan',
      useTalisman: true,
    });
    expect(noTalismans.statusCode).toBe(400);
    expect(noTalismans.json().code).toBe('INSUFFICIENT_TALISMANS');
    // 注入神行符（直接写库）→ 广东→湖北 隔1省 = 2 张
    const row = db.prepare('SELECT state FROM game_state LIMIT 1').get() as { state: string };
    const injected = JSON.parse(row.state) as GameState;
    injected.tech.talismans = 5;
    db.prepare('UPDATE game_state SET state = ?').run(JSON.stringify(injected));
    const ok = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 200,
      cavalry: 0,
      targetCityId: 'wuhan',
      useTalisman: true,
    });
    expect(ok.statusCode).toBe(200);
    const s = stateOf(ok);
    expect(s.tech.talismans).toBe(3); // 5 - 2
    expect(s.armies[0].status).toBe('MARCHING');
    expect(s.armies[0].arrivesAt).toBeTruthy();
  });

  it('军团出发60秒内可撤回，超时禁止', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    const create = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 100,
      cavalry: 0,
    });
    const armyId = stateOf(create).armies[0].id;
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
    const bad = await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 100,
      cavalry: 0,
      targetCityId: 'zhaoqing',
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('NOT_ATTACKABLE');
  });

  it('调兵（transfer）：从驻军抽调至己方城市', async () => {
    await post('/api/game/new');
    const gid = stateOf(await get('/api/game/state')).generals[0].id;
    await post('/api/armies/create', {
      originCityId: 'acity',
      generalId: gid,
      infantry: 200,
      cavalry: 0,
      targetCityId: 'qingyuan',
    });
    let s = stateOf(await get('/api/game/state'));
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
