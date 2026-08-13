import type {
  BalanceConfig,
  BattleReport,
  CityConfig,
  GameState,
  RouteConfig,
} from '@timewar/shared';
import { cityLevelOf } from './enemy.js';
import { armyGeneralIds } from './army.js';
import { levelUpGeneral, talentEffect } from './generals.js';
import { hashString, mulberry32, randomBetween } from './rng.js';
import { techEffects } from './tech.js';

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// 战斗波动值由 battleId 固定种子生成，战报重放结果一致
export function battleVariance(balance: BalanceConfig, battleId: string): number {
  const rng = mulberry32(hashString(battleId));
  return randomBetween(balance.battleVarianceMin, balance.battleVarianceMax, rng);
}

// 招募/负伤等判定使用独立派生种子（与波动同源，刷新一致）
export function battleRng(balance: BalanceConfig, seedKey: string): () => number {
  return mulberry32(hashString(seedKey));
}

// 多将领战力加成 = 1 + 主将等级×0.02 + Σ(副将等级×0.01)；再叠加全体将领攻击天赋
export function armyPowerMultiplier(balance: BalanceConfig, state: GameState, generals: { level: number; talents: string[] }[]): number {
  if (generals.length === 0) return 1;
  const lead = generals[0];
  let multiplier = 1 + lead.level * balance.generalPowerPerLevel;
  for (let i = 1; i < generals.length; i++) {
    multiplier += generals[i].level * balance.subGeneralPowerPerLevel;
  }
  const attackBonus = generals.reduce((sum, g) => sum + talentEffect(balance, g as never, 'attack'), 0);
  return multiplier * (1 + attackBonus);
}

export interface BattlePowers {
  attackerPower: number;
  defenderPower: number;
  variance: number;
}

export function computeBattlePowers(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  army: { infantry: number; cavalry: number; powerMultiplier: number },
  targetCityId: string,
  variance: number,
  defenseBonusOverride?: number
): BattlePowers {
  const attackerBase =
    army.infantry * balance.infantryAttack +
    army.cavalry * balance.cavalryAttack * balance.cavalrySiegeFactor;
  const attackerPower = attackerBase * army.powerMultiplier * variance;
  const enemy = state.enemyCities.find((e) => e.cityId === targetCityId);
  const defenderGarrison = enemy?.garrison ?? 0;
  const levelConfig = balance.cityLevels[String(cityLevelOf(cities, targetCityId))];
  const defenseBonus = defenseBonusOverride ?? levelConfig?.defenseBonus ?? 0;
  const defenderPower =
    defenderGarrison * balance.infantryDefense * (1 + defenseBonus) * variance;
  return { attackerPower, defenderPower, variance };
}

export interface BattleOutcome {
  report: BattleReport;
  victory: boolean;
  captured: boolean;
}

interface BattleInput {
  army: {
    id: string;
    generalId?: string;
    generalIds?: string[];
    infantry: number;
    cavalry: number;
    originCityId: string;
    targetCityId?: string;
    arrivesAt?: string;
    strategy?: string;
    name?: string;
  };
  nowMs: number;
  counterAttack?: boolean;
  isBarbarian?: boolean;
  defenseBonusOverride?: number;
}

// 通用战斗结算：攻城/反攻/蛮族营地共用
export function resolveBattle(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  input: BattleInput
): BattleOutcome {
  const { army, nowMs } = input;
  const targetCityId = army.targetCityId!;
  const enemyIndex = state.enemyCities.findIndex((e) => e.cityId === targetCityId);
  if (enemyIndex < 0 && !input.isBarbarian) throw new Error('TARGET_NOT_ENEMY');

  const generalIds = armyGeneralIds(state, army);
  const generals = generalIds
    .map((id) => state.generals.find((g) => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);
  const leadLevel = generals[0]?.level ?? 1;

  const variance = battleVariance(balance, `${army.id}:${army.arrivesAt}`);
  const powerMultiplier = armyPowerMultiplier(balance, state, generals);
  const strategy = balance.strategy[army.strategy ?? 'NORMAL'] ?? balance.strategy.NORMAL;

  const { attackerPower, defenderPower } = computeBattlePowers(
    balance,
    cities,
    state,
    { infantry: army.infantry, cavalry: army.cavalry, powerMultiplier: powerMultiplier * strategy.powerFactor },
    targetCityId,
    variance,
    input.defenseBonusOverride
  );

  const totalPower = attackerPower + defenderPower;
  const casualtyReduction =
    techEffects(balance, state).attackerCasualtyReduction +
    generals.reduce((sum, g) => sum + talentEffect(balance, g, 'casualtyReduction'), 0);
  const attackerCasualtyRate = clamp(
    (defenderPower / totalPower) * balance.attackerCasualtyFactor * (1 - casualtyReduction) * strategy.casualtyFactor,
    balance.attackerCasualtyMin,
    balance.attackerCasualtyMax
  );
  const defenderCasualtyRate = clamp(
    (attackerPower / totalPower) * balance.defenderCasualtyFactor,
    balance.defenderCasualtyMin,
    balance.defenderCasualtyMax
  );

  const attackerLossInfantry = Math.round(army.infantry * attackerCasualtyRate);
  const attackerLossCavalry = Math.round(army.cavalry * attackerCasualtyRate);
  const defenderLosses = input.isBarbarian
    ? 0
    : Math.round(state.enemyCities[enemyIndex].garrison * defenderCasualtyRate);

  const victory = attackerPower >= defenderPower;
  const survivorInfantry = army.infantry - attackerLossInfantry;
  const survivorCavalry = army.cavalry - attackerLossCavalry;

  const recovery = victory ? balance.equipmentRecoveryVictory : balance.equipmentRecoveryDefeat;
  const deadTotal = attackerLossInfantry + attackerLossCavalry;
  const recoveredWeapons = Math.floor(deadTotal * recovery.weapon);
  const recoveredArmors = Math.floor(deadTotal * recovery.armor);
  const recoveredHorses = Math.floor(attackerLossCavalry * recovery.horse);
  state.resources.weapons += recoveredWeapons;
  state.resources.armors += recoveredArmors;
  state.resources.horses += recoveredHorses;
  state.resources.deadPopulation += deadTotal;

  const levelConfig = balance.cityLevels[String(cityLevelOf(cities, targetCityId))];
  const defender = input.isBarbarian ? undefined : state.enemyCities[enemyIndex]?.defender;
  const report: BattleReport = {
    id: `b-${army.id}-${Date.parse(army.arrivesAt ?? '')}`,
    time: new Date(nowMs).toISOString(),
    originCityId: army.originCityId,
    targetCityId,
    attackerInfantry: army.infantry,
    attackerCavalry: army.cavalry,
    defenderGarrison: input.isBarbarian ? balance.barbarianGarrison : state.enemyCities[enemyIndex]?.garrison ?? 0,
    attackerPower: Math.round(attackerPower),
    defenderPower: Math.round(defenderPower),
    generalLevel: leadLevel,
    cityDefenseBonus: levelConfig?.defenseBonus ?? 0,
    variance,
    attackerCasualtiesInfantry: attackerLossInfantry,
    attackerCasualtiesCavalry: attackerLossCavalry,
    defenderCasualties: defenderLosses,
    recoveredWeapons,
    recoveredArmors,
    recoveredHorses,
    victory,
    captured: false,
    defenderGeneralName: defender?.name,
    strategy: army.strategy ?? 'NORMAL',
    counterAttack: input.counterAttack,
    isBarbarian: input.isBarbarian,
  };

  // 战斗经验：参战将领同额
  const killBonus = Math.min(balance.battleXpKillCap, Math.round(defenderLosses * balance.battleXpPerDefenderKilled));
  const xpGain = victory ? balance.battleXpVictoryBase + killBonus : balance.battleXpDefeatBase;
  report.gainedXp = xpGain;
  for (const g of generals) {
    levelUpGeneral(balance, g, xpGain);
  }

  // 战败负伤：每名参战将领独立概率
  if (!victory && balance.injuredChance > 0) {
    const injuredRng = battleRng(balance, `${army.id}:${army.arrivesAt}:injured`);
    for (const g of generals) {
      if (injuredRng() < balance.injuredChance) {
        g.status = 'WOUNDED';
        g.injuredUntil = new Date(nowMs + balance.injuredDurationSeconds * 1000).toISOString();
        g.armyId = undefined;
      }
    }
  }

  if (input.isBarbarian) {
    // 蛮族营地：无城市归属，胜利后营地消失
    const campIndex = state.barbarianCamps.findIndex((c) => c.id === targetCityId);
    if (campIndex >= 0) state.barbarianCamps.splice(campIndex, 1);
    report.captured = true;
    grantBarbarianReward(balance, state, nowMs);
    state.armies = state.armies.filter((a) => a.id !== army.id);
    for (const g of generals) {
      g.status = 'IDLE';
      g.armyId = undefined;
    }
  } else if (victory) {
    state.enemyCities.splice(enemyIndex, 1);
    // 守将招募（确定性种子）
    if (defender && battleRng(balance, `${army.id}:${army.arrivesAt}:recruit`)() < balance.defender.recruitChance) {
      state.generals.push({
        id: `g-defender-${Date.now()}-${state.generals.length}`,
        name: defender.name,
        level: defender.level,
        xp: 0,
        status: 'IDLE',
        talents: [],
      });
      report.recruitedGeneralName = defender.name;
    }
    state.cities.push({
      cityId: targetCityId,
      occupiedAt: new Date(nowMs).toISOString(),
      level: cityLevelOf(cities, targetCityId),
      infantry: survivorInfantry,
      cavalry: survivorCavalry,
      generalId: generals[0]?.id,
    });
    // 主将驻守新城市，副将恢复空闲
    if (generals.length > 0) {
      generals[0].status = 'GARRISON';
      generals[0].cityId = targetCityId;
      generals[0].armyId = undefined;
    }
    for (let i = 1; i < generals.length; i++) {
      generals[i].status = 'IDLE';
      generals[i].cityId = undefined;
      generals[i].armyId = undefined;
    }
    report.captured = true;
    state.armies = state.armies.filter((a) => a.id !== army.id);
  } else {
    // 失败：幸存军队返回出发城市，返回时间 = 原行军时间 × 70%
    if (!input.isBarbarian) {
      state.enemyCities[enemyIndex].garrison -= defenderLosses;
    }
    const armyRecord = state.armies.find((a) => a.id === army.id);
    if (armyRecord) {
      const originalMarchMs = Math.max(
        1,
        Date.parse(armyRecord.arrivesAt ?? '') - Date.parse(armyRecord.departedAt ?? '')
      );
      armyRecord.infantry = survivorInfantry;
      armyRecord.cavalry = survivorCavalry;
      armyRecord.status = 'RETURNING';
      armyRecord.targetCityId = armyRecord.originCityId;
      armyRecord.departedAt = new Date(nowMs).toISOString();
      const returnMs = originalMarchMs * balance.returnTimeFactor;
      armyRecord.arrivesAt = new Date(nowMs + returnMs).toISOString();
    }
    for (const g of generals) {
      if (g.status !== 'WOUNDED') g.status = 'MARCHING';
    }
  }

  state.battleReports.unshift(report);
  return { report, victory, captured: report.captured };
}

// 蛮族营地奖励
export function grantBarbarianReward(balance: BalanceConfig, state: GameState, nowMs: number): void {
  const rng = battleRng(balance, `barbarian:${nowMs}`);
  const population = Math.floor(
    rng() * (balance.barbarianRewardPopulationMax - balance.barbarianRewardPopulationMin + 1) + balance.barbarianRewardPopulationMin
  );
  const equipment = Math.floor(
    rng() * (balance.barbarianRewardEquipmentMax - balance.barbarianRewardEquipmentMin + 1) + balance.barbarianRewardEquipmentMin
  );
  state.resources.idlePopulation += population;
  state.resources.weapons += equipment;
  state.resources.armors += equipment;
  state.resources.horses += Math.floor(equipment / 2);
  if (rng() < balance.barbarianRewardTalismanChance) {
    state.tech.talismans += 1;
  }
}

// 反攻结算：防守方 = 驻军 + 城防；失败城市被夺回（A市 除外）
export function resolveCounterAttack(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  enemyCityId: string,
  playerCityId: string,
  nowMs: number
): { report: BattleReport; lost: boolean } {
  const enemy = state.enemyCities.find((e) => e.cityId === enemyCityId)!;
  const playerCity = state.cities.find((c) => c.cityId === playerCityId)!;
  const variance = battleVariance(balance, `counter:${enemyCityId}:${playerCityId}:${Math.floor(nowMs / 600000)}`);
  const defenderGarrison = playerCity.infantry + playerCity.cavalry;
  const levelConfig = balance.cityLevels[String(cityLevelOf(cities, playerCityId))];
  const defenseBonus = levelConfig?.defenseBonus ?? 0;
  const defenderPower = defenderGarrison * balance.infantryDefense * (1 + defenseBonus) * variance;
  const attackerPower = enemy.garrison * balance.infantryAttack * variance;

  const victory = attackerPower >= defenderPower;
  const defenderCasualtyRate = clamp(
    (attackerPower / (attackerPower + defenderPower)) * balance.defenderCasualtyFactor,
    balance.defenderCasualtyMin,
    balance.defenderCasualtyMax
  );
  const lostInfantry = Math.round(playerCity.infantry * defenderCasualtyRate);
  const lostCavalry = Math.round(playerCity.cavalry * defenderCasualtyRate);
  state.resources.deadPopulation += lostInfantry + lostCavalry;

  const report: BattleReport = {
    id: `b-counter-${enemyCityId}-${Date.parse(enemy.lastGrowthAt)}`,
    time: new Date(nowMs).toISOString(),
    originCityId: enemyCityId,
    targetCityId: playerCityId,
    attackerInfantry: enemy.garrison,
    attackerCavalry: 0,
    defenderGarrison,
    attackerPower: Math.round(attackerPower),
    defenderPower: Math.round(defenderPower),
    generalLevel: 0,
    cityDefenseBonus: defenseBonus,
    variance,
    attackerCasualtiesInfantry: 0,
    attackerCasualtiesCavalry: 0,
    defenderCasualties: lostInfantry + lostCavalry,
    recoveredWeapons: 0,
    recoveredArmors: 0,
    recoveredHorses: 0,
    victory,
    captured: false,
    counterAttack: true,
    strategy: 'NORMAL',
  };

  const lost = victory && playerCityId !== balance.startCityId;
  if (lost) {
    // 城市被夺回：驻军全灭，回到敌方
    state.cities = state.cities.filter((c) => c.cityId !== playerCityId);
    const defenderGeneral = state.generals.find((g) => g.id === playerCity.generalId);
    if (defenderGeneral) {
      defenderGeneral.status = 'IDLE';
      defenderGeneral.cityId = undefined;
      defenderGeneral.armyId = undefined;
    }
    const rng = battleRng(balance, `counter-new-defender:${playerCityId}`);
    state.enemyCities.push({
      cityId: playerCityId,
      garrison: Math.max(100, Math.round(enemy.garrison * 0.5)),
      lastGrowthAt: new Date(nowMs).toISOString(),
      initialGarrison: Math.max(100, Math.round(enemy.garrison * 0.5)),
      defender: {
        name: `新守将${playerCityId.slice(0, 4)}`,
        level: Math.max(1, levelConfig ? Number(Object.keys(balance.cityLevels).find((k) => balance.cityLevels[k] === levelConfig) ?? 1) : 1),
      },
    });
    report.captured = false;
    report.defenderGeneralName = defenderGeneral?.name;
    void rng;
  } else {
    // 防守成功：驻军按伤亡扣减；敌方守军损失部分
    playerCity.infantry -= lostInfantry;
    playerCity.cavalry -= lostCavalry;
    const enemyLosses = Math.round(enemy.garrison * 0.2);
    enemy.garrison = Math.max(0, enemy.garrison - enemyLosses);
    report.attackerCasualtiesInfantry = enemyLosses;
  }

  state.battleReports.unshift(report);
  return { report, lost };
}
