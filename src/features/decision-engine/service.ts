import { prisma } from "@/lib/db/client";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import { getConductScore, getDisciplinaryFacts } from "@/features/disciplinary/service";
import { getEntryDecisionRuleConfig } from "@/features/decision-engine/config";
import { evaluateEntryDecision, type EntryDecisionResult } from "@/features/decision-engine/engine";
import { latestPerPeriod } from "@/features/attendance/cross-period-alerts";

async function countRecentUnexplainedAbsenceDays(studentId: string, now: Date, lookbackDays: number): Promise<number> {
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const absences = await prisma.attendanceEvent.findMany({
    where: { studentId, status: "ABSENT", reason: { not: "TEACHER_REMOVAL" }, date: { gte: since, lte: now } },
    select: { date: true },
    distinct: ["date"],
  });
  if (absences.length === 0) return 0;

  const approved = await prisma.justification.findMany({
    where: { studentId, status: "APPROVED", absenceDate: { gte: since, lte: now } },
    select: { absenceDate: true },
  });
  const justifiedDays = new Set(approved.map((j) => j.absenceDate.toISOString().slice(0, 10)));
  return absences.filter((a) => !justifiedDays.has(a.date.toISOString().slice(0, 10))).length;
}

/** Computes today's entry-decision recommendation for a student. Read-only: does not persist anything. */
export async function computeEntryDecisionForStudent(studentId: string, now: Date = new Date()): Promise<EntryDecisionResult> {
  const { dateKey } = schoolLocalParts(now);
  const todayDate = dateKeyToUtcDate(dateKey);
  const config = await getEntryDecisionRuleConfig();

  const [todayEvents, justifications, disciplinaryFacts, conductScore, repeatedUnexplainedAbsenceDays] = await Promise.all([
    prisma.attendanceEvent.findMany({ where: { studentId, date: todayDate }, orderBy: { createdAt: "asc" } }),
    prisma.justification.findMany({ where: { studentId }, orderBy: { submittedAt: "desc" }, take: 50 }),
    getDisciplinaryFacts(studentId),
    getConductScore(studentId),
    countRecentUnexplainedAbsenceDays(studentId, now, config.repeatedAbsenceLookbackDays),
  ]);

  const latestEvents = latestPerPeriod(todayEvents);
  const absentEvents = latestEvents.filter((e) => e.status === "ABSENT");
  const hasTeacherRemovalToday = absentEvents.some((e) => e.reason === "TEACHER_REMOVAL");
  const todayAbsences = absentEvents
    .filter((e) => e.reason !== "TEACHER_REMOVAL")
    .map((e) => ({ date: e.date, createdAt: e.createdAt }));

  return evaluateEntryDecision({
    now,
    todayAbsences,
    justifications: justifications.map((j) => ({ status: j.status, absenceDate: j.absenceDate, submittedAt: j.submittedAt })),
    hasTeacherRemovalToday,
    disciplinary: { ...disciplinaryFacts, conductScore },
    repeatedUnexplainedAbsenceDays,
    config,
  });
}
