import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  computeConsecutiveUnexplainedAbsenceDays,
  applySuggestedAction,
  releaseDisciplinaryAction,
} from "@/features/disciplinary/service";
import { decideJustification } from "@/features/justification/service";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import type { SessionUser } from "@/types";

const suffix = Math.random().toString(36).slice(2, 8);
let studentId: string;
let classId: string;
let academicYearId: string;
let supervisor: SessionUser;

// The class must actually have a schedule for every weekday, otherwise
// computeConsecutiveUnexplainedAbsenceDays treats none of them as school
// days and always returns 0.
const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function daysAgo(n: number): Date {
  const { dateKey } = schoolLocalParts(new Date());
  const today = dateKeyToUtcDate(dateKey);
  return new Date(today.getTime() - n * 24 * 60 * 60 * 1000);
}

beforeAll(async () => {
  const year = await prisma.academicYear.create({
    data: { label: `disc-test-year-${suffix}`, startDate: new Date(), endDate: new Date(), isActive: false },
  });
  academicYearId = year.id;
  const cls = await prisma.class.create({ data: { name: `disc-test-class-${suffix}`, academicYearId } });
  classId = cls.id;
  const student = await prisma.student.create({ data: { firstName: "Disc", lastName: `Test${suffix}`, classId } });
  studentId = student.id;
  const user = await prisma.user.create({
    data: {
      email: `supervisor-${suffix}@test.local`,
      name: "Supervisor Tester",
      role: "SUPERVISOR",
      passwordHash: "x",
    },
  });
  supervisor = { id: user.id, email: user.email, name: user.name, role: "SUPERVISOR", teacherId: null };

  const subject = await prisma.subject.create({ data: { name: `disc-subject-${suffix}` } });
  const period = await prisma.period.create({
    data: {
      name: `disc-period-${suffix}`,
      startTime: "08:00",
      endTime: "09:00",
      order: 900_000 + Math.floor(Math.random() * 100_000),
    },
  });
  const teacherUser = await prisma.user.create({
    data: { email: `disc-teacher-${suffix}@test.local`, name: "Disc Teacher", role: "TEACHER", passwordHash: "x" },
  });
  const teacher = await prisma.teacher.create({ data: { userId: teacherUser.id } });
  for (const weekday of ALL_WEEKDAYS) {
    await prisma.schedule.create({
      data: { academicYearId, classId, teacherId: teacher.id, subjectId: subject.id, periodId: period.id, weekday },
    });
  }

  // 4 consecutive unexplained absence days (today back through 3 days ago).
  for (let i = 0; i < 4; i++) {
    await prisma.attendanceEvent.create({
      data: {
        studentId,
        date: daysAgo(i),
        segment: "FULL",
        status: "ABSENT",
        reason: "MORNING_ABSENCE",
        recordedByUserId: supervisor.id,
        idempotencyKey: `disc-absence-${suffix}-${i}`,
      },
    });
  }
});

afterAll(async () => {
  if (!studentId || !classId || !academicYearId) {
    await prisma.$disconnect();
    return;
  }
  await prisma.disciplinaryAction.deleteMany({ where: { studentId } });
  await prisma.auditLog.deleteMany({ where: { actorId: supervisor.id } });
  await prisma.attendanceEvent.deleteMany({ where: { studentId } });
  await prisma.justification.deleteMany({ where: { studentId } });
  await prisma.schedule.deleteMany({ where: { academicYearId } });
  await prisma.student.deleteMany({ where: { classId } });
  const teacherUsers = await prisma.user.findMany({ where: { email: { contains: `-${suffix}@test.local` } } });
  await prisma.teacher.deleteMany({ where: { userId: { in: teacherUsers.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { id: { in: teacherUsers.map((u) => u.id) } } });
  await prisma.subject.deleteMany({ where: { name: `disc-subject-${suffix}` } });
  await prisma.period.deleteMany({ where: { name: `disc-period-${suffix}` } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
  await prisma.$disconnect();
});

describe("computeConsecutiveUnexplainedAbsenceDays", () => {
  it("counts the trailing run of unexplained absence days", async () => {
    const days = await computeConsecutiveUnexplainedAbsenceDays(studentId);
    expect(days).toBe(4);
  });

  it("stops the streak at a day covered by an APPROVED justification", async () => {
    const justification = await prisma.justification.create({
      data: {
        studentId,
        absenceDate: daysAgo(2),
        reasonText: "Doctor visit",
        submittedByUserId: supervisor.id,
      },
    });
    await decideJustification(supervisor, justification.id, "APPROVED");

    // The streak breaks at day-2 (justified), so only days 0 and 1 count.
    const days = await computeConsecutiveUnexplainedAbsenceDays(studentId);
    expect(days).toBe(2);
  });
});

describe("applySuggestedAction / releaseDisciplinaryAction", () => {
  it("creates the ladder-suggested action and is idempotent on repeat application", async () => {
    const first = await applySuggestedAction(supervisor, studentId);
    const second = await applySuggestedAction(supervisor, studentId);
    expect(second.id).toBe(first.id);

    const openActions = await prisma.disciplinaryAction.findMany({ where: { studentId, status: "OPEN" } });
    expect(openActions).toHaveLength(1);
  });

  it("releases the action and records an audit entry", async () => {
    const action = await prisma.disciplinaryAction.findFirstOrThrow({ where: { studentId, status: "OPEN" } });
    await releaseDisciplinaryAction(supervisor, action.id);

    const updated = await prisma.disciplinaryAction.findUniqueOrThrow({ where: { id: action.id } });
    expect(updated.status).toBe("RESOLVED");
    expect(updated.resolvedByUserId).toBe(supervisor.id);

    const audit = await prisma.auditLog.findFirst({
      where: { action: "DISCIPLINARY_ACTION_RELEASED", entityId: action.id },
    });
    expect(audit).not.toBeNull();
  });
});
