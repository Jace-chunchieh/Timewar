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
  trainingCapacityPerLevel: Record<string, number>;
  trainingCancelRefundRate: number;
  populationPerCityPerInterval: Record<string, number>;
  generalProbability: number;
  generalMaxLevel: number;
  generalBaseCommand: number;
  generalCommandPerLevel: number;
  generalXpPerSecond: number;
  generalXpBase: number;
  generalPowerPerLevel: number;
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
  cityLevels: Record<string, CityLevelBalance>;
  talisman: TalismanBalance;
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

export type GeneralStatus = 'IDLE' | 'TRAINING' | 'MARCHING' | 'GARRISON' | 'BATTLE';

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
}

export type ArmyStatus = 'IDLE' | 'MARCHING' | 'GARRISON' | 'RETURNING' | 'BATTLE';

export interface Army {
  id: string;
  generalId?: string;
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
}

export interface EnemyCityState {
  cityId: string;
  garrison: number;
  lastGrowthAt: string;
  initialGarrison: number;
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
  lastTalismanRollAt: string | null;
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
  tech: TechState;
  tutorialStep: number;
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
};

export const ARMY_STATUS_LABEL: Record<ArmyStatus, string> = {
  IDLE: '空闲',
  MARCHING: '行军中',
  GARRISON: '驻守中',
  RETURNING: '返回中',
  BATTLE: '战斗中',
};
