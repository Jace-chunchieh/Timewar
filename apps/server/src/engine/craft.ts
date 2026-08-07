import type { BalanceConfig, GameState } from '@timewar/shared';

export interface CraftResult {
  infantry: number;
  cavalry: number;
}

// 原子合成：全部资源充足才允许执行，否则整体失败
export function craftSoldiers(
  balance: BalanceConfig,
  state: GameState,
  infantry: number,
  cavalry: number
): CraftResult {
  const r = state.resources;
  const needTrained = infantry + cavalry;
  const needWeapons = infantry + cavalry;
  const needArmors = infantry + cavalry;
  const needHorses = cavalry;
  if (
    needTrained > r.trainedPopulation ||
    needWeapons > r.weapons ||
    needArmors > r.armors ||
    needHorses > r.horses
  ) {
    throw new Error('INSUFFICIENT_RESOURCES');
  }
  r.trainedPopulation -= needTrained;
  r.weapons -= needWeapons;
  r.armors -= needArmors;
  r.horses -= needHorses;
  r.infantry += infantry;
  r.cavalry += cavalry;
  return { infantry, cavalry };
}

export function maxCraftable(state: GameState): { infantry: number; cavalry: number } {
  const r = state.resources;
  const maxInfantry = Math.min(r.trainedPopulation, r.weapons, r.armors);
  const maxCavalry = Math.min(r.trainedPopulation, r.weapons, r.armors, r.horses);
  return { infantry: maxInfantry, cavalry: maxCavalry };
}
