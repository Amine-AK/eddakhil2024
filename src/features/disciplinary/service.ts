import { prisma } from "@/lib/db/client";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import { recordAudit } from "@/features/audit/service";
import { getDisciplinaryLadderConfig } from "@/features/disciplinary/config";
import { determineLadderRung, type LadderRung } from "@/features/disciplinary/ladder";
import { ValidationError } from "@/lib/validation/errors";
import type { SessionUser } from "@/types";
import type { DisciplinaryActionType } from "@prisma/client";

const LADDER_LOOKBACK_DAYS = 60;

/** Current conduct score is always derived from the append-only ledger, never stored directly. */
export async function getConductScore(studentId: string): Promise<number> {
  const agg = await prisma.conductScoreLog.aggregate({ where: { studentId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

export async function getDisciplinaryFacts(
  studentId: string,
): Promise<{ hasActiveSuspension: boolean; hasActiveHold: boolean }> {
  const openHolds = await prisma.disciplinaryAction.findMany({
    where: { studentId, isHold: true, status: "OPEN" },
  });
  return {
    hasActiveSuspension: openHolds.some((a) => a.type === "SUSPENSION"),
    hasActiveHold: openHolds.some((a) => a.type !== "SUSPENSION"),
  };
}

/**
 * Walks backward day-by-day from today counting the current run of
 * consecutive *school* days (weekdays the student's class actually has a
 * schedule for) with an unexplained absence, stopping at the first school
 * day that is not one — a present/late day, a day with no record yet, or
 * one covered by an APPROVED justification.
 */
export async function computeConsecutiveUnexplainedAbsenceDays(studentId: string, now: Date = new Date()): Promise<number> {
  const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
  const scheduledWeekdays = await prisma.schedule.findMany({
    where: { classId: student.classId },
    select: { weekday: true },
    distinct: ["weekday"],
  });
  const weekdaySet = new Set(scheduledWeekdays.map((s) => s.weekday));
  if (weekdaySet.size === 0) return 0;

  const { dateKey: todayKey } = schoolLocalParts(now);
  const todayDate = dateKeyToUtcDate(todayKey);
  const since = new Date(todayDate.getTime() - LADDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [absences, approvedJustifications] = await Promise.all([
    prisma.attendanceEvent.findMany({
      where: { studentId, status: "ABSENT", reason: { not: "TEACHER_REMOVAL" }, date: { gte: since, lte: todayDate } },
      select: { date: true },
      distinct: ["date"],
    }),
    prisma.justification.findMany({
      where: { studentId, status: "APPROVED", absenceDate: { gte: since, lte: todayDate } },
      select: { absenceDate: true },
    }),
  ]);

  const absentDays = new Set(absences.map((a) => a.date.toISOString().slice(0, 10)));
  const justifiedDays = new Set(approvedJustifications.map((j) => j.absenceDate.toISOString().slice(0, 10)));

  let streak = 0;
  let cursor = todayDate;
  for (let i = 0; i < LADDER_LOOKBACK_DAYS; i++) {
    if (weekdaySet.has(cursor.getUTCDay())) {
      const key = cursor.toISOString().slice(0, 10);
      if (!absentDays.has(key) || justifiedDays.has(key)) break;
      streak++;
    }
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

export type SuggestedAction = { consecutiveDays: number; rung: LadderRung } | null;

export async function getSuggestedDisciplinaryAction(studentId: string, now: Date = new Date()): Promise<SuggestedAction> {
  const [consecutiveDays, ladder] = await Promise.all([
    computeConsecutiveUnexplainedAbsenceDays(studentId, now),
    getDisciplinaryLadderConfig(),
  ]);
  const rung = determineLadderRung(consecutiveDays, ladder);
  return rung ? { consecutiveDays, rung } : null;
}

export type AtRiskStudent = {
  student: { id: string; firstName: string; lastName: string; className: string };
  consecutiveDays: number;
  rung: LadderRung;
};

/** Students currently at/above the lowest ladder threshold who don't already have a matching open action. */
export async function getAtRiskStudents(now: Date = new Date()): Promise<AtRiskStudent[]> {
  const ladder = await getDisciplinaryLadderConfig();
  if (ladder.length === 0) return [];
  const minThreshold = Math.min(...ladder.map((r) => r.minDays));

  const { dateKey: todayKey } = schoolLocalParts(now);
  const todayDate = dateKeyToUtcDate(todayKey);
  const since = new Date(todayDate.getTime() - LADDER_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.attendanceEvent.findMany({
    where: { status: "ABSENT", reason: { not: "TEACHER_REMOVAL" }, date: { gte: since, lte: todayDate } },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  const results: AtRiskStudent[] = [];
  for (const { studentId } of candidates) {
    const suggestion = await getSuggestedDisciplinaryAction(studentId, now);
    if (!suggestion || suggestion.consecutiveDays < minThreshold) continue;

    const alreadyOpen = await prisma.disciplinaryAction.findFirst({
      where: { studentId, type: suggestion.rung.action, status: "OPEN" },
    });
    if (alreadyOpen) continue;

    const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: true } });
    if (!student) continue;
    results.push({
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, className: student.class.name },
      consecutiveDays: suggestion.consecutiveDays,
      rung: suggestion.rung,
    });
  }
  return results;
}

/** Supervisor applies the ladder's suggested action for a student, creating the disciplinary record. Idempotent per (student, action type, OPEN). */
export async function applySuggestedAction(user: SessionUser, studentId: string, now: Date = new Date()): Promise<{ id: string }> {
  const suggestion = await getSuggestedDisciplinaryAction(studentId, now);
  if (!suggestion) throw new ValidationError("No disciplinary action is currently suggested for this student");

  const existing = await prisma.disciplinaryAction.findFirst({
    where: { studentId, type: suggestion.rung.action, status: "OPEN" },
  });
  if (existing) return { id: existing.id };

  return prisma.$transaction(async (tx) => {
    const action = await tx.disciplinaryAction.create({
      data: {
        studentId,
        type: suggestion.rung.action,
        reason: `${suggestion.consecutiveDays} consecutive unexplained absence day(s)`,
        isHold: suggestion.rung.isHold,
        createdByUserId: user.id,
      },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "DISCIPLINARY_ACTION_CREATED",
      entity: "DisciplinaryAction",
      entityId: action.id,
      reason: action.reason,
      metadata: { studentId, type: action.type, isHold: action.isHold, source: "ladder_suggestion" },
    });
    return { id: action.id };
  });
}

export async function createDisciplinaryAction(
  user: SessionUser,
  input: { studentId: string; type: DisciplinaryActionType; reason: string; isHold: boolean },
): Promise<{ id: string }> {
  const student = await prisma.student.findUnique({ where: { id: input.studentId } });
  if (!student) throw new ValidationError("Unknown student");

  return prisma.$transaction(async (tx) => {
    const action = await tx.disciplinaryAction.create({
      data: {
        studentId: input.studentId,
        type: input.type,
        reason: input.reason,
        isHold: input.isHold,
        createdByUserId: user.id,
      },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "DISCIPLINARY_ACTION_CREATED",
      entity: "DisciplinaryAction",
      entityId: action.id,
      reason: input.reason,
      metadata: { studentId: input.studentId, type: input.type, isHold: input.isHold, source: "manual" },
    });
    return { id: action.id };
  });
}

export async function releaseDisciplinaryAction(user: SessionUser, actionId: string): Promise<void> {
  const action = await prisma.disciplinaryAction.findUnique({ where: { id: actionId } });
  if (!action) throw new ValidationError("Unknown disciplinary action");
  if (action.status !== "OPEN") return; // already resolved; idempotent no-op

  await prisma.$transaction(async (tx) => {
    await tx.disciplinaryAction.update({
      where: { id: actionId },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedByUserId: user.id },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "DISCIPLINARY_ACTION_RELEASED",
      entity: "DisciplinaryAction",
      entityId: actionId,
      metadata: { studentId: action.studentId, type: action.type },
    });
  });
}
