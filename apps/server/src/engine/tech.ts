import type { BalanceConfig, GameState, TechKey, TechState } from '@timewar/shared';
import { TECH_KEYS } from '@timewar/shared';

export function defaultTechState(nowIso: string): TechState {
  return {
    researchWorkers: 0,
    talismans: 0,
    lastTalismanRollAt: nowIso,
    levels: Object.fromEntries(TECH_KEYS.map((k) => [k, 0])) as Record<TechKey, number>,
  };
}

// 科技加成汇总（全部为乘数）
export interface TechEffects {
  populationRate: number; // 人口产出倍率（军屯）
  productionEfficiency: number; // 生产效率倍率（冶炼）
  marchSpeed: number; // 行军速度倍率（军驿，>1 更快）
  attackerCasualtyReduction: number; // 攻城自身伤亡减免（攻城术，0~1）
  generalXp: number; // 将领经验倍率（治军）
  command: number; // 统帅上限倍率（统帅之道）
  talismanProbability: number; // 神行符概率倍率（神行符强化）
}

export function techEffects(balance: BalanceConfig, state: GameState): TechEffects {
  const t = state.tech;
  const lv = (k: TechKey) => t?.levels?.[k] ?? 0;
  return {
    populationRate: 1 + lv('agronomy') * balance.tech.agronomy.effectPerLevel,
    productionEfficiency: 1 + lv('smithing') * balance.tech.smithing.effectPerLevel,
    marchSpeed: 1 + lv('logistics') * balance.tech.logistics.effectPerLevel,
    attackerCasualtyReduction: Math.min(0.5, lv('siege') * balance.tech.siege.effectPerLevel),
    generalXp: 1 + lv('discipline') * balance.tech.discipline.effectPerLevel,
    command: 1 + lv('command') * balance.tech.command.effectPerLevel,
    talismanProbability: 1 + lv('talismanMastery') * balance.tech.talismanMastery.effectPerLevel,
  };
}

export function techLevel(balance: BalanceConfig, state: GameState, key: TechKey): number {
  return Math.min(balance.tech.maxLevel, state.tech?.levels?.[key] ?? 0);
}

// 升级到 level 级所需累计人口：costBase × n(n+1)/2
export function techUpgradeCost(balance: BalanceConfig, toLevel: number): number {
  return balance.tech.costBase * ((toLevel * (toLevel + 1)) / 2);
}

export function techUpgradeCostNext(balance: BalanceConfig, currentLevel: number): number {
  return techUpgradeCost(balance, currentLevel + 1);
}

// 神行符获得概率 = (base + 投入人数/100 × per100) × 强化倍率
export function talismanProbability(balance: BalanceConfig, state: GameState): number {
  const t = state.tech;
  const workers = t?.researchWorkers ?? 0;
  if (workers < balance.talisman.researchBaseline) return 0;
  const base =
    balance.talisman.baseProbability +
    (workers / 100) * balance.talisman.probabilityPer100Workers;
  return base * techEffects(balance, state).talismanProbability;
}

// 幂等科研结算：按 rollInterval 周期推进判定
export function rollTalisman(
  balance: BalanceConfig,
  state: GameState,
  nowMs: number,
  rng: () => number
): { gained: number; probability: number; rolls: number } {
  const t = state.tech;
  const intervalMs = balance.talisman.rollIntervalSeconds * 1000;
  const lastAt = t.lastTalismanRollAt ? Date.parse(t.lastTalismanRollAt) : nowMs;
  const elapsed = Math.max(0, nowMs - lastAt);
  const rolls = Math.floor(elapsed / intervalMs);
  if (rolls <= 0) return { gained: 0, probability: talismanProbability(balance, state), rolls: 0 };
  const probability = talismanProbability(balance, state);
  let gained = 0;
  if (probability > 0) {
    for (let i = 0; i < rolls; i++) {
      if (rng() < probability) gained++;
    }
  }
  t.talismans += gained;
  t.lastTalismanRollAt = new Date(lastAt + rolls * intervalMs).toISOString();
  return { gained, probability, rolls };
}

// 神行符跨省消耗：省距 d（接壤=1，隔1省=2…）；同省 = sameProvinceCost
export function talismanCost(balance: BalanceConfig, fromProvinceId: string, toProvinceId: string): number {
  if (fromProvinceId === toProvinceId) return balance.talisman.sameProvinceCost;
  const d = balance.provinceDistances[`${fromProvinceId}|${toProvinceId}`];
  if (d === undefined || d === Infinity) return 99;
  return Math.max(1, d);
}
