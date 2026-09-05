import { z } from "zod";

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export const entryDecisionSchema = z.enum(["AUTO_ALLOWED", "ADMIN_REVIEW", "DENIED"]);

export const issueEntrySchema = z
  .object({
    studentId: z.string().uuid(),
    dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    parentPresent: z.boolean(),
    idempotencyKey: z.string().min(8).max(128),
    overrideFinalDecision: entryDecisionSchema.optional(),
    overrideReason: z.string().max(500).optional(),
  })
  .refine((v) => !v.overrideFinalDecision || (v.overrideReason && v.overrideReason.trim().length > 0), {
    message: "An override reason is required when overriding the recommended decision",
    path: ["overrideReason"],
  });

export type IssueEntryInput = z.infer<typeof issueEntrySchema>;

export const submitJustificationSchema = z.object({
  studentId: z.string().uuid(),
  absenceDateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reasonText: z.string().min(3).max(1000),
  parentPresent: z.boolean(),
});

export type SubmitJustificationInput = z.infer<typeof submitJustificationSchema>;
