import type { BalanceConfig, General, GameState } from '@timewar/shared';
import { techEffects } from './tech.js';

export function xpNeeded(balance: BalanceConfig, level: number): number {
  return balance.generalXpBase * level * level;
}

// 统帅上限 = (200 + (等级-1)×100) × (1 + 统帅之道加成)
export function commandCap(balance: BalanceConfig, level: number, state?: GameState): number {
  const base = balance.generalBaseCommand + (level - 1) * balance.generalCommandPerLevel;
  if (!state) return base;
  return Math.round(base * techEffects(balance, state).command);
}

export function generalPowerMultiplier(balance: BalanceConfig, level: number): number {
  return 1 + level * balance.generalPowerPerLevel;
}

// 训练中的将领按现实时间获得经验（治军加成），自动升级
export function advanceGeneralXp(balance: BalanceConfig, state: GameState, nowMs: number): number {
  const xpRate = balance.generalXpPerSecond * techEffects(balance, state).generalXp;
  let totalXp = 0;
  for (const g of state.generals) {
    if (g.status !== 'TRAINING') continue;
    const lastAt = Date.parse(g.lastXpCalculatedAt ?? g.trainingStartedAt ?? state.lastCalculatedAt);
    const elapsedMs = Math.max(0, nowMs - lastAt);
    if (elapsedMs <= 0) continue;
    const gained = (elapsedMs / 1000) * xpRate;
    g.xp += gained;
    g.lastXpCalculatedAt = new Date(nowMs).toISOString();
    totalXp += gained;
    while (g.level < balance.generalMaxLevel && g.xp >= xpNeeded(balance, g.level)) {
      g.xp -= xpNeeded(balance, g.level);
      g.level += 1;
    }
  }
  return totalXp;
}

export function isGeneralIdle(g: General): boolean {
  return g.status === 'IDLE';
}
