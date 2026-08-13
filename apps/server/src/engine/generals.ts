import type { BalanceConfig, General, GeneralStatus, GameState, TalentDef } from '@timewar/shared';
import { techEffects } from './tech.js';

export function xpNeeded(balance: BalanceConfig, level: number): number {
  return balance.generalXpBase * level * level;
}

// 统帅上限 = (200 + (等级-1)×100) × (1 + 统帅之道 + 威仪天赋)
export function commandCap(balance: BalanceConfig, level: number, state?: GameState, general?: General): number {
  const base = balance.generalBaseCommand + (level - 1) * balance.generalCommandPerLevel;
  let factor = 1;
  if (state) factor *= techEffects(balance, state).command;
  if (general) factor *= 1 + talentEffect(balance, general, 'command');
  return Math.round(base * factor);
}

export function generalPowerMultiplier(balance: BalanceConfig, level: number): number {
  return 1 + level * balance.generalPowerPerLevel;
}

// ---------- 天赋 ----------

export function talentDef(balance: BalanceConfig, id: string): TalentDef | undefined {
  return balance.talentPool.find((t) => t.id === id);
}

export function talentEffect(balance: BalanceConfig, general: General, key: 'attack' | 'marchSpeed' | 'casualtyReduction' | 'trainingXp' | 'command'): number {
  let sum = 0;
  for (const id of general.talents ?? []) {
    const t = talentDef(balance, id);
    if (t && t[key]) sum += t[key]!;
  }
  return sum;
}

// 到达指定等级时领悟新天赋（不重复）
export function talentsForLevel(balance: BalanceConfig, level: number): string[] {
  const unlocked = balance.talentLevels.filter((l) => level >= l);
  const pool = balance.talentPool.map((t) => t.id);
  const result: string[] = [];
  for (let i = 0; i < unlocked.length; i++) {
    result.push(pool[i % pool.length]);
  }
  return result;
}

export function randomTalents(balance: BalanceConfig, rng: () => number, count: number): string[] {
  const pool = balance.talentPool.map((t) => t.id);
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// 升级后补齐天赋（1/5/10/15/20 级各一个，从天赋池按顺序取）
export function syncTalents(balance: BalanceConfig, general: General): void {
  if (!general.talents) general.talents = [];
  const needed = talentsForLevel(balance, general.level);
  for (let i = 0; i < needed.length; i++) {
    if (!general.talents.includes(needed[i])) {
      general.talents.push(needed[i]);
    }
  }
}

// 训练中的将领按现实时间获得经验（治军 + 练兵天赋加成），自动升级
export function advanceGeneralXp(balance: BalanceConfig, state: GameState, nowMs: number): number {
  let totalXp = 0;
  for (const g of state.generals) {
    if (g.status !== 'TRAINING') continue;
    const lastAt = Date.parse(g.lastXpCalculatedAt ?? g.trainingStartedAt ?? state.lastCalculatedAt);
    const elapsedMs = Math.max(0, nowMs - lastAt);
    if (elapsedMs <= 0) continue;
    const xpRate = balance.generalXpPerSecond * techEffects(balance, state).generalXp * (1 + talentEffect(balance, g, 'trainingXp'));
    const gained = (elapsedMs / 1000) * xpRate;
    g.xp += gained;
    g.lastXpCalculatedAt = new Date(nowMs).toISOString();
    totalXp += gained;
    levelUpGeneral(balance, g);
  }
  return totalXp;
}

// 增加经验并处理升级（升级时补齐天赋）
export function levelUpGeneral(balance: BalanceConfig, g: General, xpGain = 0): void {
  if (xpGain > 0) g.xp += xpGain;
  let leveled = false;
  while (g.level < balance.generalMaxLevel && g.xp >= xpNeeded(balance, g.level)) {
    g.xp -= xpNeeded(balance, g.level);
    g.level += 1;
    leveled = true;
  }
  if (leveled || !g.talents) syncTalents(balance, g);
}

export function isGeneralIdle(g: General): boolean {
  return g.status === 'IDLE';
}
