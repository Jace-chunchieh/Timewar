export type Province = '广东' | '广西' | '海南';
export type RouteType = 'LAND' | 'SEA';
export type CityLevel = 1 | 2 | 3 | 4 | 5;

export interface CityConfig {
  id: string;
  name: string;
  province: Province;
  provinceId: string;
  level: CityLevel;
  x: number;
  y: number;
  lat: number;
  lon: number;
  neighbors: string[];
  routeType?: RouteType;
  virtual?: boolean;
}

export interface RouteConfig {
  id: string;
  from: string;
  to: string;
  km: number;
  baseSeconds: number;
  routeType: RouteType;
}

export interface CityLevelBalance {
  garrisonMin: number;
  garrisonMax: number;
  growthPer10Min: number;
  garrisonCap: number;
  defenseBonus: number;
}

export type TechKey =
  | 'siege'
  | 'logistics'
  | 'smithing'
  | 'agronomy'
  | 'discipline'
  | 'command'
  | 'talismanMastery';

export const TECH_KEYS: TechKey[] = [
  'siege',
  'logistics',
  'smithing',
  'agronomy',
  'discipline',
  'command',
  'talismanMastery',
];

export interface TalismanBalance {
  researchBaseline: number;
  baseProbability: number;
  probabilityPer100Workers: number;
  rollIntervalSeconds: number;
  sameProvinceCost: number;
}

export interface ItemBalance {
  researchBaseline: number;
  baseProbability: number;
  probabilityPer100Workers: number;
  rollIntervalSeconds: number;
}

export interface SpeedupBalance extends ItemBalance {
  secondsPerUse: number;
}

export interface DefenderBalance {
  recruitChance: number;
  levelBonusMin: number;
  levelBonusMax: number;
}

export interface TechBalanceItem {
  label: string;
  desc: string;
  effectPerLevel: number;
}

export interface TechBalance {
  maxLevel: number;
  costBase: number;
  siege: TechBalanceItem;
  logistics: TechBalanceItem;
  smithing: TechBalanceItem;
  agronomy: TechBalanceItem;
  discipline: TechBalanceItem;
  command: TechBalanceItem;
  talismanMastery: TechBalanceItem;
}

export interface BalanceConfig {
  populationIntervalSeconds: number;
  offlineCapSeconds: number;
  offlineReportThresholdSeconds: number;
  productionWork: { weapon: number; armor: number; horse: number };
  productionEfficiency: number;
  trainingDurationSeconds: number;
  trainingTimePerPersonExtra: number;
  trainingCancelRefundRate: number;
  populationPerCityPerInterval: Record<string, number>;
  generalProbability: number;
  generalMaxLevel: number;
  generalBaseCommand: number;
  generalCommandPerLevel: number;
  generalXpPerSecond: number;
  generalXpBase: number;
  generalPowerPerLevel: number;
  maxGeneralsPerArmy: number;
  subGeneralPowerPerLevel: number;
  bannerGeneralCommandBonus: number;
  battleVarianceMin: number;
  battleVarianceMax: number;
  infantryAttack: number;
  infantryDefense: number;
  cavalryAttack: number;
  cavalryDefense: number;
  cavalrySiegeFactor: number;
  infantrySpeed: number;
  cavalrySpeed: number;
  seaRouteTimeFactor: number;
  cancelMarchWindowSeconds: number;
  returnTimeFactor: number;
  marchBaseSecondsPer100Km: number;
  attackerCasualtyMin: number;
  attackerCasualtyMax: number;
  attackerCasualtyFactor: number;
  defenderCasualtyMin: number;
  defenderCasualtyMax: number;
  defenderCasualtyFactor: number;
  equipmentRecoveryVictory: { weapon: number; armor: number; horse: number };
  equipmentRecoveryDefeat: { weapon: number; armor: number; horse: number };
  battleXpVictoryBase: number;
  battleXpDefeatBase: number;
  battleXpPerDefenderKilled: number;
  battleXpKillCap: number;
  injuredChance: number;
  injuredDurationSeconds: number;
  strategy: Record<string, { powerFactor: number; casualtyFactor: number }>;
  talentPool: TalentDef[];
  talentLevels: number[];
  capitalCityId: string;
  capitalPopulationBonus: number;
  capitalMarchSpeedBonus: number;
  provinceCompleteBonus: number;
  barbarianMaxCamps: number;
  barbarianRespawnMinutes: number;
  barbarianGarrison: number;
  barbarianRewardPopulationMin: number;
  barbarianRewardPopulationMax: number;
  barbarianRewardEquipmentMin: number;
  barbarianRewardEquipmentMax: number;
  barbarianRewardTalismanChance: number;
  counterAttackMinCities: number;
  counterAttackIntervalMinutes: number;
  counterAttackChance: number;
  counterAttackThreshold: number;
  maxArmyNameLength: number;
  cityLevels: Record<string, CityLevelBalance>;
  talisman: TalismanBalance;
  banner: ItemBalance;
  speedup: SpeedupBalance;
  defender: DefenderBalance;
  tech: TechBalance;
  startCityId: string;
  qingyuanCityId: string;
  newGame: {
    idlePopulation: number;
    infantry: number;
    cavalry: number;
    initialGeneralLevel: number;
    qingyuanFixedGarrison: number;
  };
  provinceDistances: Record<string, number>;
}

export interface ResourceState {
  idlePopulation: number;
  trainedPopulation: number;
  weapons: number;
  armors: number;
  horses: number;
  infantry: number;
  cavalry: number;
  deadPopulation: number;
}

export interface ProductionLine {
  workers: number;
  progress: number;
}

export interface ProductionState {
  weapon: ProductionLine;
  armor: ProductionLine;
  horse: ProductionLine;
}

export type GeneralStatus = 'IDLE' | 'TRAINING' | 'MARCHING' | 'GARRISON' | 'BATTLE' | 'WOUNDED';

export interface TalentDef {
  id: string;
  name: string;
  desc: string;
  attack?: number;
  marchSpeed?: number;
  casualtyReduction?: number;
  trainingXp?: number;
  command?: number;
}

export interface General {
  id: string;
  name: string;
  level: number;
  xp: number;
  status: GeneralStatus;
  cityId?: string;
  armyId?: string;
  trainingStartedAt?: string;
  lastXpCalculatedAt?: string;
  injuredUntil?: string;
  talents: string[];
}

export type ArmyStatus = 'IDLE' | 'MARCHING' | 'GARRISON' | 'RETURNING' | 'BATTLE';

export type BattleStrategy = 'NORMAL' | 'DEFENSIVE' | 'CHARGE';

// 永久军团：军团长不可更换，将领可加入/撤走（≤maxGeneralsPerArmy）
export interface Army {
  id: string;
  name: string;
  bannerGeneralId: string;
  memberGeneralIds: string[];
  strategy?: BattleStrategy;
  infantry: number;
  cavalry: number;
  status: ArmyStatus;
  originCityId: string;
  targetCityId?: string;
  departedAt?: string;
  arrivesAt?: string;
}

export interface PlayerCityState {
  cityId: string;
  occupiedAt: string;
  level: number;
  infantry: number;
  cavalry: number;
  generalId?: string;
  generalIds?: string[];
}

export interface EnemyCityState {
  cityId: string;
  garrison: number;
  lastGrowthAt: string;
  initialGarrison: number;
  defender?: { name: string; level: number };
}

export interface TrainingBatch {
  id: string;
  count: number;
  startedAt: string;
  completesAt: string;
}

export interface BattleReport {
  id: string;
  time: string;
  originCityId: string;
  targetCityId: string;
  attackerInfantry: number;
  attackerCavalry: number;
  defenderGarrison: number;
  attackerPower: number;
  defenderPower: number;
  generalLevel: number;
  cityDefenseBonus: number;
  variance: number;
  attackerCasualtiesInfantry: number;
  attackerCasualtiesCavalry: number;
  defenderCasualties: number;
  recoveredWeapons: number;
  recoveredArmors: number;
  recoveredHorses: number;
  victory: boolean;
  captured: boolean;
  defenderGeneralName?: string;
  recruitedGeneralName?: string;
  strategy?: string;
  gainedXp?: number;
  counterAttack?: boolean;
  isBarbarian?: boolean;
}

export interface BarbarianCamp {
  id: string;
  hostCityId: string;
  x: number;
  y: number;
  garrison: number;
  createdAt: string;
}

export interface OfflineReport {
  id: string;
  offlineMs: number;
  populationGained: number;
  weaponsProduced: number;
  armorsProduced: number;
  horsesProduced: number;
  trainedCompleted: number;
  generalsCreated: number;
  generalXpGained: number;
  marchesCompleted: number;
  battleCount: number;
  victories: number;
  defeats: number;
  citiesCaptured: number;
}

export interface TechState {
  researchWorkers: number;
  talismans: number;
  bannerFlags: number;
  speedUps: number;
  lastTalismanRollAt: string | null;
  lastBannerRollAt: string | null;
  lastSpeedupRollAt: string | null;
  levels: Record<TechKey, number>;
}

export interface GameState {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastCalculatedAt: string;
  populationRemainderMs: number;
  resources: ResourceState;
  production: ProductionState;
  trainingBatches: TrainingBatch[];
  generals: General[];
  cities: PlayerCityState[];
  enemyCities: EnemyCityState[];
  armies: Army[];
  battleReports: BattleReport[];
  barbarianCamps: BarbarianCamp[];
  tech: TechState;
  capitalCityId: string;
  completedAt?: string;
  tutorialStep: number;
  welcomeShown?: boolean;
  offlineReport?: OfflineReport;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const GENERAL_STATUS_LABEL: Record<GeneralStatus, string> = {
  IDLE: '空闲',
  TRAINING: '训练中',
  MARCHING: '行军中',
  GARRISON: '驻守中',
  BATTLE: '战斗中',
  WOUNDED: '负伤中',
};

export const ARMY_STATUS_LABEL: Record<ArmyStatus, string> = {
  IDLE: '空闲',
  MARCHING: '行军中',
  GARRISON: '驻守中',
  RETURNING: '返回中',
  BATTLE: '战斗中',
};
