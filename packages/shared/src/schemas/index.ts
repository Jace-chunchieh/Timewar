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
  generalId: z.string().min(1),
  infantry: nonNegativeInt,
  cavalry: nonNegativeInt,
  targetCityId: z.string().min(1).optional(),
  useTalisman: z.boolean().optional(),
});

export const armyMarchSchema = z.object({
  armyId: z.string().min(1),
  targetCityId: z.string().min(1),
  useTalisman: z.boolean().optional(),
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
});

export const tutorialStepSchema = z.object({
  step: z.number().int().min(0).max(6),
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
