import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);
export const periodSegmentSchema = z.enum(["FULL", "HOUR_1", "HOUR_2"]);

export const attendanceEntrySchema = z.object({
  studentId: z.string().uuid(),
  status: attendanceStatusSchema,
  note: z.string().max(500).optional(),
});

export const saveAttendanceSchema = z.object({
  scheduleId: z.string().uuid(),
  dateKey: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
  segment: periodSegmentSchema,
  idempotencyKey: z.string().min(8).max(128),
  entries: z.array(attendanceEntrySchema).min(1),
});

export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

export const confirmPresentSchema = z.object({
  alertId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(128),
});

export type ConfirmPresentInput = z.infer<typeof confirmPresentSchema>;

export const REMOVAL_REASONS = [
  "DISRUPTIVE_BEHAVIOR",
  "MISSING_MATERIALS",
  "DISRESPECT",
  "SAFETY_CONCERN",
  "OTHER",
] as const;

export const teacherRemovalSchema = z.object({
  scheduleId: z.string().uuid(),
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  segment: periodSegmentSchema,
  studentId: z.string().uuid(),
  reasonCode: z.enum(REMOVAL_REASONS),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export type TeacherRemovalInput = z.infer<typeof teacherRemovalSchema>;
