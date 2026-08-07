import type { BalanceConfig, GameState, TrainingBatch } from '@timewar/shared';
import { randomChineseName, sampleBinomial } from './rng.js';

export interface TrainingCompletionResult {
  completedBatches: TrainingBatch[];
  trainedPopulation: number;
  newGenerals: number;
  newGeneralNames: string[];
}

// 训练容量 = Σ 已占领城市等级容量
export function trainingCapacity(balance: BalanceConfig, state: GameState): number {
  return state.cities.reduce(
    (sum, c) => sum + (balance.trainingCapacityPerLevel[String(c.level)] ?? 100),
    0
  );
}

export function activeTrainingCount(state: GameState): number {
  return state.trainingBatches.reduce((sum, b) => sum + b.count, 0);
}

// 批量训练完成：二项分布抽样决定将领数量，其余进入训练后人口
export function completeTrainingBatches(
  balance: BalanceConfig,
  state: GameState,
  nowMs: number,
  rng: () => number
): TrainingCompletionResult {
  const done = state.trainingBatches.filter((b) => Date.parse(b.completesAt) <= nowMs);
  if (done.length === 0) {
    return { completedBatches: [], trainedPopulation: 0, newGenerals: 0, newGeneralNames: [] };
  }
  state.trainingBatches = state.trainingBatches.filter((b) => !done.includes(b));

  let trainedPopulation = 0;
  let newGenerals = 0;
  const newGeneralNames: string[] = [];
  for (const batch of done) {
    const generals = sampleBinomial(batch.count, balance.generalProbability, rng);
    trainedPopulation += batch.count - generals;
    newGenerals += generals;
    for (let i = 0; i < generals; i++) {
      const name = randomChineseName(rng);
      newGeneralNames.push(name);
      state.generals.push({
        id: `g-${Date.now()}-${state.generals.length}-${i}`,
        name,
        level: 1,
        xp: 0,
        status: 'IDLE',
      });
    }
  }
  state.resources.trainedPopulation += trainedPopulation;
  return { completedBatches: done, trainedPopulation, newGenerals, newGeneralNames };
}
