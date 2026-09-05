import { prisma } from "@/lib/db/client";
import { AuthError } from "@/lib/auth/session";
import { assertTeacherOwnsSchedule } from "@/lib/permissions";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import { findCurrentPeriod, type PeriodLike } from "@/features/attendance/period-detection";
import { computeAlertCandidates, latestStatusByStudentSegment } from "@/features/attendance/cross-period-alerts";
import { recordAudit } from "@/features/audit/service";
import type { SaveAttendanceInput, TeacherRemovalInput } from "@/lib/validation/attendance";
import type { SessionUser } from "@/types";
import type { AttendanceStatus, PeriodSegment, Prisma } from "@prisma/client";

export type RosterStudent = {
  id: string;
  firstName: string;
  lastName: string;
  massarCode: string | null;
  status: AttendanceStatus | null; // null = not yet recorded (default PRESENT in the UI)
  note: string | null;
};

export type AlertView = {
  id: string;
  studentId: string;
  studentName: string;
  sourceSubject: string;
  sourcePeriodName: string;
};

export type TeacherSession =
  | { state: "NO_ACTIVE_PERIOD" }
  | { state: "NOT_SCHEDULED" }
  | {
      state: "READY";
      scheduleId: string;
      className: string;
      subjectName: string;
      periodName: string;
      isDouble: boolean;
      dateKey: string;
      alreadyRecorded: boolean;
      students: RosterStudent[];
      alerts: AlertView[];
    };

async function loadOrderedPeriods(): Promise<PeriodLike[]> {
  return prisma.period.findMany({ orderBy: { order: "asc" } });
}

/** Determines what a teacher should see right now: their current class roster, or why there isn't one. */
export async function getTeacherSession(user: SessionUser, now: Date = new Date()): Promise<TeacherSession> {
  if (!user.teacherId) return { state: "NOT_SCHEDULED" };

  const { weekday, dateKey, timeMinutes } = schoolLocalParts(now);
  const periods = await loadOrderedPeriods();
  const currentPeriod = findCurrentPeriod(periods, timeMinutes);
  if (!currentPeriod) return { state: "NO_ACTIVE_PERIOD" };

  const schedule = await prisma.schedule.findFirst({
    where: { teacherId: user.teacherId, weekday, periodId: currentPeriod.id },
    include: { class: true, subject: true, period: true },
  });
  if (!schedule) return { state: "NOT_SCHEDULED" };

  const [students, events, alerts] = await Promise.all([
    prisma.student.findMany({
      where: { classId: schedule.classId, active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.attendanceEvent.findMany({
      where: { scheduleId: schedule.id, date: dateKeyToUtcDate(dateKey) },
      orderBy: { createdAt: "asc" },
    }),
    prisma.crossPeriodAlert.findMany({
      where: {
        targetClassId: schedule.classId,
        targetPeriodId: schedule.periodId,
        date: dateKeyToUtcDate(dateKey),
        acknowledged: false,
      },
      include: { student: true, sourceEvent: { include: { schedule: { include: { subject: true, period: true } } } } },
    }),
  ]);

  const latest = latestStatusByStudentSegment(events);
  const alreadyRecorded = events.length > 0;

  const roster: RosterStudent[] = students.map((s) => {
    // FULL-segment records apply regardless of which segment is queried; fall back to any recorded segment for this student.
    const own = latest.get(`${s.id}:FULL`) ?? [...latest.values()].find((e) => e.studentId === s.id) ?? null;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      massarCode: s.massarCode,
      status: own?.status ?? null,
      note: own?.note ?? null,
    };
  });

  return {
    state: "READY",
    scheduleId: schedule.id,
    className: schedule.class.name,
    subjectName: schedule.subject.name,
    periodName: schedule.period.name,
    isDouble: schedule.isDouble,
    dateKey,
    alreadyRecorded,
    students: roster,
    alerts: alerts.map((a) => ({
      id: a.id,
      studentId: a.studentId,
      studentName: `${a.student.firstName} ${a.student.lastName}`,
      sourceSubject: a.sourceEvent.schedule?.subject.name ?? "",
      sourcePeriodName: a.sourceEvent.schedule?.period.name ?? "",
    })),
  };
}

/** Two schedule rows form one double lesson when they share class/teacher/subject/weekday and are flagged double. */
function isPairedDouble(
  a: { classId: string; teacherId: string; subjectId: string; weekday: number; isDouble: boolean },
  b: { classId: string; teacherId: string; subjectId: string; weekday: number; isDouble: boolean },
): boolean {
  return (
    a.isDouble &&
    b.isDouble &&
    a.classId === b.classId &&
    a.teacherId === b.teacherId &&
    a.subjectId === b.subjectId &&
    a.weekday === b.weekday
  );
}

/** After attendance is saved for a period, raise alerts for the immediately following period of the same class. */
async function generateAlertsForNextPeriod(
  tx: Prisma.TransactionClient,
  schedule: {
    id: string;
    classId: string;
    teacherId: string;
    subjectId: string;
    weekday: number;
    isDouble: boolean;
    period: { order: number };
  },
  savedEvents: { id: string; studentId: string; status: AttendanceStatus; segment: PeriodSegment }[],
  dateKey: string,
): Promise<void> {
  const nextSchedule = await tx.schedule.findFirst({
    where: { classId: schedule.classId, weekday: schedule.weekday, period: { order: schedule.period.order + 1 } },
    include: { period: true },
  });
  if (!nextSchedule) return;

  const paired = isPairedDouble(schedule, nextSchedule);
  const candidates = computeAlertCandidates(savedEvents, paired);

  for (const candidate of candidates) {
    await tx.crossPeriodAlert.upsert({
      where: {
        sourceEventId_targetPeriodId: { sourceEventId: candidate.sourceEventId, targetPeriodId: nextSchedule.periodId },
      },
      update: {},
      create: {
        studentId: candidate.studentId,
        sourceEventId: candidate.sourceEventId,
        date: dateKeyToUtcDate(dateKey),
        targetPeriodId: nextSchedule.periodId,
        targetClassId: nextSchedule.classId,
      },
    });
  }
}

/** Persists a full roster save transactionally, then raises next-period alerts. Idempotent per (idempotencyKey, studentId). */
export async function saveAttendance(user: SessionUser, input: SaveAttendanceInput): Promise<void> {
  await assertTeacherOwnsSchedule(user, input.scheduleId);

  const schedule = await prisma.schedule.findUnique({ where: { id: input.scheduleId }, include: { period: true } });
  if (!schedule) throw new AuthError("Unknown schedule", 403);

  const studentIds = input.entries.map((e) => e.studentId);
  const validStudents = await prisma.student.findMany({ where: { id: { in: studentIds }, classId: schedule.classId } });
  const validIds = new Set(validStudents.map((s) => s.id));
  const entries = input.entries.filter((e) => validIds.has(e.studentId));

  await prisma.$transaction(async (tx) => {
    const savedEvents: { id: string; studentId: string; status: AttendanceStatus; segment: PeriodSegment }[] = [];

    for (const entry of entries) {
      const recordKey = `${input.idempotencyKey}:${entry.studentId}`;
      const event = await tx.attendanceEvent.upsert({
        where: { idempotencyKey: recordKey },
        update: {},
        create: {
          studentId: entry.studentId,
          scheduleId: schedule.id,
          date: dateKeyToUtcDate(input.dateKey),
          segment: input.segment,
          status: entry.status,
          reason: entry.status === "ABSENT" ? "MORNING_ABSENCE" : null,
          note: entry.note,
          recordedByUserId: user.id,
          idempotencyKey: recordKey,
        },
      });
      savedEvents.push({ id: event.id, studentId: event.studentId, status: event.status, segment: event.segment });
    }

    await recordAudit(tx, {
      actorId: user.id,
      action: "ATTENDANCE_SAVED",
      entity: "Schedule",
      entityId: schedule.id,
      metadata: { dateKey: input.dateKey, segment: input.segment, count: entries.length },
    });

    await generateAlertsForNextPeriod(
      tx,
      { ...schedule, period: { order: schedule.period.order } },
      savedEvents,
      input.dateKey,
    );
  });
}

/** Teacher confirms a previously-absent student is now present. Creates a new event and acknowledges the alert. */
export async function confirmPresent(user: SessionUser, alertId: string, idempotencyKey: string): Promise<void> {
  const alert = await prisma.crossPeriodAlert.findUnique({ where: { id: alertId } });
  if (!alert) throw new AuthError("Unknown alert", 403);

  const schedule = await prisma.schedule.findFirst({
    where: { classId: alert.targetClassId, periodId: alert.targetPeriodId },
  });
  if (!schedule) throw new AuthError("Unknown schedule for alert", 403);
  await assertTeacherOwnsSchedule(user, schedule.id);

  await prisma.$transaction(async (tx) => {
    if (alert.acknowledged) return; // already handled; treat as idempotent no-op
    await tx.attendanceEvent.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        studentId: alert.studentId,
        scheduleId: schedule.id,
        date: alert.date,
        segment: "FULL",
        status: "PRESENT",
        note: "arrived after prior absence",
        recordedByUserId: user.id,
        idempotencyKey,
      },
    });
    await tx.crossPeriodAlert.update({
      where: { id: alert.id },
      data: { acknowledged: true, acknowledgedByUserId: user.id, acknowledgedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "CROSS_PERIOD_ALERT_ACKNOWLEDGED",
      entity: "CrossPeriodAlert",
      entityId: alert.id,
      metadata: { studentId: alert.studentId },
    });
  });
}

/** Teacher removes a student from class for a documented reason. Creates the attendance record + removal + audit atomically. */
export async function recordTeacherRemoval(user: SessionUser, input: TeacherRemovalInput): Promise<void> {
  await assertTeacherOwnsSchedule(user, input.scheduleId);
  const schedule = await prisma.schedule.findUnique({ where: { id: input.scheduleId }, include: { period: true } });
  if (!schedule) throw new AuthError("Unknown schedule", 403);

  const student = await prisma.student.findFirst({ where: { id: input.studentId, classId: schedule.classId } });
  if (!student) throw new AuthError("Student not in this class", 403);

  await prisma.$transaction(async (tx) => {
    const event = await tx.attendanceEvent.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        studentId: input.studentId,
        scheduleId: schedule.id,
        date: dateKeyToUtcDate(input.dateKey),
        segment: input.segment,
        status: "ABSENT",
        reason: "TEACHER_REMOVAL",
        note: input.note,
        recordedByUserId: user.id,
        idempotencyKey: input.idempotencyKey,
      },
    });

    await tx.teacherRemoval.upsert({
      where: { attendanceEventId: event.id },
      update: {},
      create: {
        attendanceEventId: event.id,
        studentId: input.studentId,
        reasonCode: input.reasonCode,
        removedByUserId: user.id,
      },
    });

    await recordAudit(tx, {
      actorId: user.id,
      action: "TEACHER_REMOVAL",
      entity: "Student",
      entityId: input.studentId,
      reason: input.reasonCode,
    });

    await generateAlertsForNextPeriod(
      tx,
      { ...schedule, period: { order: schedule.period.order } },
      [{ id: event.id, studentId: event.studentId, status: event.status, segment: event.segment }],
      input.dateKey,
    );
  });
}
