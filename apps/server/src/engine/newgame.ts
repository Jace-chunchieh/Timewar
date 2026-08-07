import type { BalanceConfig, CityConfig, GameState } from '@timewar/shared';
import { seededGarrison } from './enemy.js';
import { randomChineseName } from './rng.js';
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
      };
    });

  const generalName = randomChineseName(rng);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `game-${Date.now()}`,
    version: 2,
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
    generals: [
      {
        id: 'g-initial',
        name: generalName,
        level: balance.newGame.initialGeneralLevel,
        xp: 0,
        status: 'IDLE',
      },
    ],
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
    tech: defaultTechState(nowIso),
    tutorialStep: 1,
    welcomeShown: false,
  };
}
