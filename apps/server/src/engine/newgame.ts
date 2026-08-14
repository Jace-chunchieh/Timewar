import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import { seededGarrison } from './enemy.js';
import { syncTalents } from './generals.js';
import { randomChineseName, randomInt } from './rng.js';
import { defaultTechState } from './tech.js';

export function createNewGame(
  balance: BalanceConfig,
  cities: CityConfig[],
  rng: () => number,
  nowMs: number = Date.now()
): GameState {
  const nowIso = new Date(nowMs).toISOString();
  const startCityId = balance.startCityId;

  const enemyCities = cities
    .filter((c) => c.id !== startCityId)
    .map((c) => {
      const garrison = seededGarrison(balance, cities, c.id, rng);
      return {
        cityId: c.id,
        garrison,
        lastGrowthAt: nowIso,
        initialGarrison: garrison,
        // 每座敌方城市有一名守将（等级 = 城市等级 + 随机加成）
        defender: {
          name: randomChineseName(rng),
          level: Math.max(1, c.level + randomInt(balance.defender.levelBonusMin, balance.defender.levelBonusMax, rng)),
        },
      };
    });

  const generalName = randomChineseName(rng);
  const initialGeneral = {
    id: 'g-initial',
    name: generalName,
    level: balance.newGame.initialGeneralLevel,
    xp: 0,
    status: 'IDLE' as const,
    talents: [] as string[],
  };
  syncTalents(balance, initialGeneral);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `game-${Date.now()}`,
    version: 7,
    createdAt: nowIso,
    updatedAt: nowIso,
    lastCalculatedAt: nowIso,
    populationRemainderMs: 0,
    resources: {
      idlePopulation: balance.newGame.idlePopulation,
      trainedPopulation: 0,
      weapons: 0,
      armors: 0,
      horses: 0,
      infantry: balance.newGame.infantry,
      cavalry: balance.newGame.cavalry,
      deadPopulation: 0,
    },
    production: {
      weapon: { workers: 0, progress: 0 },
      armor: { workers: 0, progress: 0 },
      horse: { workers: 0, progress: 0 },
    },
    trainingBatches: [],
    generals: [initialGeneral],
    cities: [
      {
        cityId: startCityId,
        occupiedAt: nowIso,
        level: 1,
        infantry: 0,
        cavalry: 0,
      },
    ],
    enemyCities,
    armies: [],
    battleReports: [],
    barbarianCamps: [],
    tech: (() => {
      const t = defaultTechState(nowIso);
      t.bannerFlags = balance.newGame.bannerFlags;
      return t;
    })(),
    capitalCityId: balance.capitalCityId,
    tutorialStep: 1,
    welcomeShown: false,
  };
}
