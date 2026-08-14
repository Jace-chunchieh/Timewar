import { z } from 'zod';

const nonNegativeInt = z.number().int().min(0);
const positiveInt = z.number().int().min(1);

export const allocateSchema = z.object({
  workers: z.object({
    weapon: nonNegativeInt,
    armor: nonNegativeInt,
    horse: nonNegativeInt,
  }),
});

export const trainingStartSchema = z.object({
  count: positiveInt,
});

export const trainingCancelSchema = z.object({
  batchId: z.string().min(1),
});

export const craftSchema = z.object({
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
});

export const generalIdSchema = z.object({
  generalId: z.string().min(1),
});

export const armyCreateSchema = z.object({
  originCityId: z.string().min(1),
  name: z.string().min(1).max(8),
  bannerGeneralId: z.string().min(1),
  memberGeneralIds: z.array(z.string().min(1)).max(10),
  strategy: z.enum(['NORMAL', 'DEFENSIVE', 'CHARGE']).optional(),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
});

export const armyMemberSchema = z.object({
  armyId: z.string().min(1),
  generalId: z.string().min(1),
});

export const armyReinforceSchema = z.object({
  armyId: z.string().min(1),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
});

export const speedupUseSchema = z.object({
  targetType: z.enum(['training', 'army']),
  targetId: z.string().min(1),
});

export const batchTrainingSchema = z.object({
  action: z.enum(['start', 'stop']),
});

export const claimMailSchema = z.object({
  mailId: z.string().min(1),
});

export const gmMailSchema = z.object({
  toCode: z.string().min(1).max(64),
  title: z.string().min(1).max(40),
  body: z.string().max(500).optional(),
  itemType: z.enum(['banner', 'talisman', 'speedup', 'population', 'weapons', 'armors', 'horses']).optional(),
  itemAmount: z.number().int().min(0),
});

export const soloAttackSchema = z.object({
  generalId: z.string().min(1),
  targetCityId: z.string().min(1),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
  useTalisman: z.boolean().optional(),
});

export const armyMarchSchema = z.object({
  armyId: z.string().min(1),
  targetCityId: z.string().min(1),
  useTalisman: z.boolean().optional(),
});

export const moveCapitalSchema = z.object({
  cityId: z.string().min(1),
});

export const barbarianAttackSchema = z.object({
  campId: z.string().min(1),
  bannerGeneralId: z.string().min(1),
  memberGeneralIds: z.array(z.string().min(1)).max(10),
  strategy: z.enum(['NORMAL', 'DEFENSIVE', 'CHARGE']).optional(),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
});

export const armyCancelSchema = z.object({
  armyId: z.string().min(1),
});

export const armyTransferSchema = z.object({
  originCityId: z.string().min(1),
  targetCityId: z.string().min(1),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
  generalId: z.string().min(1).optional(),
  useTalisman: z.boolean().optional(),
});

export const garrisonAttackSchema = z.object({
  garrisonCityId: z.string().min(1),
  generalId: z.string().min(1),
  targetCityId: z.string().min(1),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
  useTalisman: z.boolean().optional(),
});

export const tutorialStepSchema = z.object({
  step: z.number().int().min(0).max(6),
});

export const loginSchema = z.object({
  code: z.string().min(1).max(64),
});

export const addCodeSchema = z.object({
  code: z.string().min(2).max(32),
  name: z.string().min(1).max(32),
});

export const researchSchema = z.object({
  workers: nonNegativeInt,
});

export const techUpgradeSchema = z.object({
  key: z.enum(['siege', 'logistics', 'smithing', 'agronomy', 'discipline', 'command', 'talismanMastery']),
});

export type AllocateInput = z.infer<typeof allocateSchema>;
export type TrainingStartInput = z.infer<typeof trainingStartSchema>;
export type CraftInput = z.infer<typeof craftSchema>;
export type ArmyCreateInput = z.infer<typeof armyCreateSchema>;
export type ArmyMarchInput = z.infer<typeof armyMarchSchema>;
export type ArmyTransferInput = z.infer<typeof armyTransferSchema>;
