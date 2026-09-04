import { z } from "zod";

export const decideJustificationSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional(),
});

export const disciplinaryActionTypeSchema = z.enum([
  "VERBAL_WARNING",
  "FIRST_PARENT_NOTICE",
  "SECOND_PARENT_NOTICE",
  "FORMAL_REPRIMAND",
  "DROPPED_OUT_REFERRAL",
  "SUSPENSION",
  "HOLD",
]);

export const createDisciplinaryActionSchema = z.object({
  studentId: z.string().uuid(),
  type: disciplinaryActionTypeSchema,
  reason: z.string().min(3).max(500),
  isHold: z.boolean(),
});

export const entryDecisionRuleConfigSchema = z.object({
  justificationWindowHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30),
  conductDeductionUnjustifiedAbsence: z.number().int().max(0),
  repeatedAbsenceThresholdOccurrences: z.number().int().min(1),
  repeatedAbsenceLookbackDays: z.number().int().min(1).max(365),
  conductReviewThreshold: z.number().int().max(0),
});

export const ladderRungSchema = z.object({
  minDays: z.number().int().min(1),
  maxDays: z.number().int().min(1).nullable(),
  action: disciplinaryActionTypeSchema,
  isHold: z.boolean(),
});

export const disciplinaryLadderConfigSchema = z.array(ladderRungSchema).min(1);
