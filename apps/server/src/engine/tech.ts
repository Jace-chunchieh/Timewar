import type { BalanceConfig, GameState, ItemBalance, SpeedupBalance, TechKey, TechState } from '@timewar/shared';
import { TECH_KEYS } from '@timewar/shared';

export function defaultTechState(nowIso: string): TechState {
  return {
    researchWorkers: 0,
    talismans: 0,
    bannerFlags: 0,
    speedUps: 0,
    lastTalismanRollAt: nowIso,
    lastBannerRollAt: nowIso,
    lastSpeedupRollAt: nowIso,
    levels: Object.fromEntries(TECH_KEYS.map((k) => [k, 0])) as Record<TechKey, number>,
  };
}

// 科技加成汇总（全部为乘数）
export interface TechEffects {
  populationRate: number;
  productionEfficiency: number;
  marchSpeed: number;
  attackerCasualtyReduction: number;
  generalXp: number;
  command: number;
  talismanProbability: number;
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

export function techUpgradeCost(balance: BalanceConfig, toLevel: number): number {
  return balance.tech.costBase * ((toLevel * (toLevel + 1)) / 2);
}

export function techUpgradeCostNext(balance: BalanceConfig, currentLevel: number): number {
  return techUpgradeCost(balance, currentLevel + 1);
}

export type ItemKind = 'talisman' | 'banner' | 'speedup';

// 物品获得概率（基准 + 人数加成；神行符受强化科技加成）
export function itemProbability(balance: BalanceConfig, state: GameState, kind: ItemKind): number {
  const t = state.tech;
  const workers = t?.researchWorkers ?? 0;
  const cfg = kind === 'talisman' ? balance.talisman : kind === 'banner' ? balance.banner : balance.speedup;
  if (workers < cfg.researchBaseline) return 0;
  const base = cfg.baseProbability + (workers / 100) * cfg.probabilityPer100Workers;
  if (kind === 'talisman') return base * techEffects(balance, state).talismanProbability;
  return base;
}

export interface ItemRollResult {
  gained: number;
  probability: number;
  rolls: number;
}

// 幂等判定：按 rollInterval 周期推进（三种物品独立计时）
export function rollItem(
  balance: BalanceConfig,
  state: GameState,
  kind: ItemKind,
  nowMs: number,
  rng: () => number
): ItemRollResult {
  const t = state.tech;
  const cfg = kind === 'talisman' ? balance.talisman : kind === 'banner' ? balance.banner : balance.speedup;
  const lastKey = kind === 'talisman' ? 'lastTalismanRollAt' : kind === 'banner' ? 'lastBannerRollAt' : 'lastSpeedupRollAt';
  const countKey = kind === 'talisman' ? 'talismans' : kind === 'banner' ? 'bannerFlags' : 'speedUps';
  const intervalMs = cfg.rollIntervalSeconds * 1000;
  const lastAt = t[lastKey] ? Date.parse(t[lastKey] as string) : nowMs;
  const elapsed = Math.max(0, nowMs - lastAt);
  const rolls = Math.floor(elapsed / intervalMs);
  if (rolls <= 0) return { gained: 0, probability: itemProbability(balance, state, kind), rolls: 0 };
  const probability = itemProbability(balance, state, kind);
  let gained = 0;
  if (probability > 0) {
    for (let i = 0; i < rolls; i++) {
      if (rng() < probability) gained++;
    }
  }
  t[countKey] += gained;
  t[lastKey] = new Date(lastAt + rolls * intervalMs).toISOString();
  return { gained, probability, rolls };
}

// 神行符跨省消耗：省距 d（接壤=1，隔1省=2…）；同省 = sameProvinceCost
export function talismanCost(balance: BalanceConfig, fromProvinceId: string, toProvinceId: string): number {
  if (fromProvinceId === toProvinceId) return balance.talisman.sameProvinceCost;
  const d = balance.provinceDistances[`${fromProvinceId}|${toProvinceId}`];
  if (d === undefined || d === Infinity) return 99;
  return Math.max(1, d);
}
