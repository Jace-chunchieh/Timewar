import type {
  BalanceConfig,
  BattleReport,
  CityConfig,
  GameState,
  RouteConfig,
} from '@timewar/shared';
import { cityLevelOf } from './enemy.js';
import { generalPowerMultiplier } from './generals.js';
import { hashString, mulberry32, randomBetween } from './rng.js';
import { techEffects } from './tech.js';

export interface BattlePowers {
  attackerPower: number;
  defenderPower: number;
  variance: number;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// 战斗波动值由 battleId 固定种子生成，战报重放结果一致
export function battleVariance(balance: BalanceConfig, battleId: string): number {
  const rng = mulberry32(hashString(battleId));
  return randomBetween(balance.battleVarianceMin, balance.battleVarianceMax, rng);
}

// 招募判定使用独立派生种子（与波动同源，刷新一致）
function battleRng(balance: BalanceConfig, seedKey: string): () => number {
  return mulberry32(hashString(seedKey));
}

export function computeBattlePowers(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  army: { infantry: number; cavalry: number; generalLevel: number },
  targetCityId: string,
  variance: number
): BattlePowers {
  const r = state.resources;
  const attackerBase =
    army.infantry * balance.infantryAttack +
    army.cavalry * balance.cavalryAttack * balance.cavalrySiegeFactor;
  const attackerPower = attackerBase * generalPowerMultiplier(balance, army.generalLevel) * variance;
  const enemy = state.enemyCities.find((e) => e.cityId === targetCityId);
  const defenderGarrison = enemy?.garrison ?? 0;
  const levelConfig = balance.cityLevels[String(cityLevelOf(cities, targetCityId))];
  const defenseBonus = levelConfig?.defenseBonus ?? 0;
  const defenderPower =
    defenderGarrison * balance.infantryDefense * (1 + defenseBonus) * variance;
  return { attackerPower, defenderPower, variance };
}

export interface BattleOutcome {
  report: BattleReport;
  victory: boolean;
  captured: boolean;
}

// 结算一场攻城战，并将结果应用到状态
export function resolveBattle(
  balance: BalanceConfig,
  cities: CityConfig[],
  state: GameState,
  army: {
    id: string;
    generalId?: string;
    infantry: number;
    cavalry: number;
    originCityId: string;
    targetCityId?: string;
    arrivesAt?: string;
  },
  nowMs: number
): BattleOutcome {
  const targetCityId = army.targetCityId;
  if (!targetCityId) throw new Error('NO_TARGET');
  const enemyIndex = state.enemyCities.findIndex((e) => e.cityId === targetCityId);
  if (enemyIndex < 0) throw new Error('TARGET_NOT_ENEMY');

  const general = state.generals.find((g) => g.id === army.generalId);
  const generalLevel = general?.level ?? 1;

  const variance = battleVariance(balance, `${army.id}:${army.arrivesAt}`);
  const { attackerPower, defenderPower } = computeBattlePowers(
    balance,
    cities,
    state,
    { infantry: army.infantry, cavalry: army.cavalry, generalLevel },
    targetCityId,
    variance
  );

  const totalPower = attackerPower + defenderPower;
  const casualtyReduction = techEffects(balance, state).attackerCasualtyReduction;
  const attackerCasualtyRate = clamp(
    (defenderPower / totalPower) * balance.attackerCasualtyFactor * (1 - casualtyReduction),
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
  const defenderLosses = Math.round(state.enemyCities[enemyIndex].garrison * defenderCasualtyRate);

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
  const defender = state.enemyCities[enemyIndex].defender;
  const report: BattleReport = {
    id: `b-${army.id}-${Date.parse(army.arrivesAt ?? '')}`,
    time: new Date(nowMs).toISOString(),
    originCityId: army.originCityId,
    targetCityId,
    attackerInfantry: army.infantry,
    attackerCavalry: army.cavalry,
    defenderGarrison: state.enemyCities[enemyIndex].garrison,
    attackerPower: Math.round(attackerPower),
    defenderPower: Math.round(defenderPower),
    generalLevel,
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
  };

  if (victory) {
    // 敌方剩余守军清零（视为逃散），城市被占领
    state.enemyCities.splice(enemyIndex, 1);
    // 占领后按概率招募守将为我方将领（确定性种子，刷新结果一致）
    if (defender && battleRng(balance, `${army.id}:${army.arrivesAt}:recruit`)() < balance.defender.recruitChance) {
      state.generals.push({
        id: `g-defender-${Date.now()}-${state.generals.length}`,
        name: defender.name,
        level: defender.level,
        xp: 0,
        status: 'IDLE',
      });
      report.recruitedGeneralName = defender.name;
    }
    state.cities.push({
      cityId: targetCityId,
      occupiedAt: new Date(nowMs).toISOString(),
      level: cityLevelOf(cities, targetCityId),
      infantry: survivorInfantry,
      cavalry: survivorCavalry,
      generalId: general?.id,
    });
    if (general) {
      general.status = 'GARRISON';
      general.cityId = targetCityId;
    }
    report.captured = true;
    state.armies = state.armies.filter((a) => a.id !== army.id);
  } else {
    // 失败：幸存军队返回出发城市，返回时间 = 原行军时间 × 70%
    state.enemyCities[enemyIndex].garrison -= defenderLosses;
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
    if (general) {
      general.status = 'MARCHING';
    }
  }

  state.battleReports.unshift(report);
  return { report, victory, captured: report.captured };
}
