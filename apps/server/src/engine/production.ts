import type { BalanceConfig, GameState, ProductionLine } from '@timewar/shared';
import { techEffects } from './tech.js';

export interface ProductionResult {
  weapons: number;
  armors: number;
  horses: number;
}

// 每条生产线：进度 += 工人数 × 秒数 × 效率(冶炼加成)；完成件数 = floor(进度 / 单件工作量)
export function advanceProduction(
  balance: BalanceConfig,
  state: GameState,
  elapsedMs: number
): ProductionResult {
  const seconds = elapsedMs / 1000;
  const work = balance.productionWork;
  const efficiency = balance.productionEfficiency * techEffects(balance, state).productionEfficiency;
  const weapons = advanceLine(balance, state.production.weapon, work.weapon, seconds, efficiency).completed;
  const armors = advanceLine(balance, state.production.armor, work.armor, seconds, efficiency).completed;
  const horses = advanceLine(balance, state.production.horse, work.horse, seconds, efficiency).completed;
  state.resources.weapons += weapons;
  state.resources.armors += armors;
  state.resources.horses += horses;
  return { weapons, armors, horses };
}

function advanceLine(
  balance: BalanceConfig,
  line: ProductionLine,
  workPerUnit: number,
  seconds: number,
  efficiency: number
): { completed: number } {
  if (line.workers <= 0 || seconds <= 0) return { completed: 0 };
  line.progress += line.workers * seconds * efficiency;
  const completed = Math.floor(line.progress / workPerUnit);
  if (completed > 0) {
    line.progress -= completed * workPerUnit;
  }
  return { completed };
}
