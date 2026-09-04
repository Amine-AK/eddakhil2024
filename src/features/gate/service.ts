import { prisma } from "@/lib/db/client";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import { latestPerPeriod } from "@/features/attendance/cross-period-alerts";
import { computeEntryDecisionForStudent } from "@/features/decision-engine/service";
import { getConductScore, getDisciplinaryFacts } from "@/features/disciplinary/service";
import { recordAudit } from "@/features/audit/service";
import { ValidationError } from "@/lib/validation/errors";
import type { IssueEntryInput, SubmitJustificationInput } from "@/lib/validation/gate";
import type { SessionUser } from "@/types";
import type { EntryDecision } from "@/features/decision-engine/engine";

export type StudentSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  massarCode: string | null;
  className: string;
};

/** Gate search across name, Massar code, and class — never exposes more than the fields needed to pick the right student. */
export async function searchStudents(query: string): Promise<StudentSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const students = await prisma.student.findMany({
    where: {
      active: true,
      OR: [
        { massarCode: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { class: { name: { contains: q, mode: "insensitive" } } },
      ],
    },
    include: { class: true },
    take: 20,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return students.map((s) => ({
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    massarCode: s.massarCode,
    className: s.class.name,
  }));
}

export type TimelineEntry = {
  periodName: string;
  subjectName: string;
  status: string;
  reason: string | null;
  note: string | null;
  recordedAt: string;
};

export type GateStudentView = {
  student: { id: string; firstName: string; lastName: string; massarCode: string | null; className: string };
  timeline: TimelineEntry[];
  justifications: {
    id: string;
    status: string;
    absenceDate: string;
    reasonText: string;
    parentPresent: boolean;
    submittedAt: string;
  }[];
  disciplinary: { hasActiveHold: boolean; hasActiveSuspension: boolean; conductScore: number };
  decision: { decision: EntryDecision; reasons: string[]; actions: string[] };
};

/** Everything the gate officer needs to see for one student, in one call: identity, today's timeline, and the recommendation. */
export async function getGateStudentView(studentId: string, now: Date = new Date()): Promise<GateStudentView | null> {
  const student = await prisma.student.findUnique({ where: { id: studentId }, include: { class: true } });
  if (!student) return null;

  const { dateKey } = schoolLocalParts(now);
  const todayDate = dateKeyToUtcDate(dateKey);

  const [events, justifications, disciplinaryFacts, conductScore, decision] = await Promise.all([
    prisma.attendanceEvent.findMany({
      where: { studentId, date: todayDate },
      include: { schedule: { include: { period: true, subject: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.justification.findMany({ where: { studentId }, orderBy: { submittedAt: "desc" }, take: 10 }),
    getDisciplinaryFacts(studentId),
    getConductScore(studentId),
    computeEntryDecisionForStudent(studentId, now),
  ]);

  const latestEvents = latestPerPeriod(events).sort(
    (a, b) => (a.schedule?.period.order ?? 0) - (b.schedule?.period.order ?? 0),
  );

  return {
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      massarCode: student.massarCode,
      className: student.class.name,
    },
    timeline: latestEvents.map((e) => ({
      periodName: e.schedule?.period.name ?? "—",
      subjectName: e.schedule?.subject.name ?? "—",
      status: e.status,
      reason: e.reason,
      note: e.note,
      recordedAt: e.createdAt.toISOString(),
    })),
    justifications: justifications.map((j) => ({
      id: j.id,
      status: j.status,
      absenceDate: j.absenceDate.toISOString().slice(0, 10),
      reasonText: j.reasonText,
      parentPresent: j.parentPresent,
      submittedAt: j.submittedAt.toISOString(),
    })),
    disciplinary: { ...disciplinaryFacts, conductScore },
    decision: { decision: decision.decision, reasons: decision.reasons, actions: decision.actions },
  };
}

export type IssueEntryResult = {
  recommendedDecision: EntryDecision;
  finalDecision: EntryDecision;
  overridden: boolean;
};

/** Issues (or replays, if retried) an entry decision. The recommendation is always recomputed server-side — the client's opinion of it is never trusted. */
export async function issueEntry(user: SessionUser, input: IssueEntryInput): Promise<IssueEntryResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.entryEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      return {
        recommendedDecision: existing.recommendedDecision,
        finalDecision: existing.finalDecision,
        overridden: existing.overridden,
      };
    }

    const recommendation = await computeEntryDecisionForStudent(input.studentId);
    const finalDecision = input.overrideFinalDecision ?? recommendation.decision;
    const overridden = finalDecision !== recommendation.decision;
    if (overridden && !input.overrideReason?.trim()) {
      throw new ValidationError("An override reason is required when overriding the recommended decision");
    }

    const entryEvent = await tx.entryEvent.create({
      data: {
        studentId: input.studentId,
        date: dateKeyToUtcDate(input.dateKey),
        recommendedDecision: recommendation.decision,
        finalDecision,
        reasons: recommendation.reasons,
        overridden,
        overrideReason: overridden ? input.overrideReason : null,
        parentPresent: input.parentPresent,
        gateUserId: user.id,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (recommendation.conductDelta !== 0) {
      const dedupeKey = `${input.studentId}:${input.dateKey}:unjustified_absence`;
      const already = await tx.conductScoreLog.findFirst({
        where: { relatedEntityType: "UNJUSTIFIED_ABSENCE", relatedEntityId: dedupeKey },
      });
      if (!already) {
        await tx.conductScoreLog.create({
          data: {
            studentId: input.studentId,
            delta: recommendation.conductDelta,
            reason: "Unjustified absence",
            relatedEntityType: "UNJUSTIFIED_ABSENCE",
            relatedEntityId: dedupeKey,
          },
        });
      }
    }

    await recordAudit(tx, {
      actorId: user.id,
      action: overridden ? "ENTRY_DECISION_OVERRIDDEN" : "ENTRY_DECISION_ISSUED",
      entity: "EntryEvent",
      entityId: entryEvent.id,
      reason: overridden ? input.overrideReason : undefined,
      metadata: {
        studentId: input.studentId,
        recommendedDecision: recommendation.decision,
        finalDecision,
        previousRecommendation: recommendation.decision,
      },
    });

    return { recommendedDecision: recommendation.decision, finalDecision, overridden };
  });
}

export async function submitJustification(user: SessionUser, input: SubmitJustificationInput): Promise<{ id: string }> {
  const student = await prisma.student.findUnique({ where: { id: input.studentId } });
  if (!student) throw new ValidationError("Unknown student");

  const justification = await prisma.$transaction(async (tx) => {
    const created = await tx.justification.create({
      data: {
        studentId: input.studentId,
        absenceDate: dateKeyToUtcDate(input.absenceDateKey),
        reasonText: input.reasonText,
        parentPresent: input.parentPresent,
        submittedByUserId: user.id,
      },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "JUSTIFICATION_SUBMITTED",
      entity: "Justification",
      entityId: created.id,
      metadata: { studentId: input.studentId },
    });
    return created;
  });

  return { id: justification.id };
}
