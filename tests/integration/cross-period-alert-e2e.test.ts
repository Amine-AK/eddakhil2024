import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveAttendance, confirmPresent, getTeacherSession } from "@/features/attendance/service";
import { schoolLocalParts } from "@/lib/dates";
import type { SessionUser } from "@/types";

// End-to-end (service-level) verification of the full cross-period alert
// lifecycle: period N's teacher marks a student absent -> period N+1's
// teacher immediately sees a targeted alert -> confirming "present now"
// acknowledges it and adds a new PRESENT event. This is the same flow
// verified manually during development; captured here permanently.

const suffix = Math.random().toString(36).slice(2, 8);
// findCurrentPeriod resolves ties (an overlapping time window) in favor of
// the lowest `order`. The real seeded periods use small positive orders
// (1-6) for the same 08:00-10:00 window this fixture needs, so this test's
// periods must sort before them to be the ones actually picked.
const baseOrder = -500_000 - Math.floor(Math.random() * 50_000);
const weekday = 1;

let academicYearId: string;
let classId: string;
let subjectId: string;
let period1Id: string;
let period2Id: string;
let scheduleId1: string;
let scheduleId2: string;
let teacher1: SessionUser;
let teacher2: SessionUser;
let studentId: string;

beforeAll(async () => {
  const year = await prisma.academicYear.create({
    data: { label: `xperiod-year-${suffix}`, startDate: new Date(), endDate: new Date(), isActive: false },
  });
  academicYearId = year.id;
  const cls = await prisma.class.create({ data: { name: `xperiod-class-${suffix}`, academicYearId } });
  classId = cls.id;
  const subject = await prisma.subject.create({ data: { name: `xperiod-subject-${suffix}` } });
  subjectId = subject.id;

  const period1 = await prisma.period.create({
    data: { name: `xperiod-1-${suffix}`, startTime: "08:00", endTime: "09:00", order: baseOrder },
  });
  period1Id = period1.id;
  const period2 = await prisma.period.create({
    data: { name: `xperiod-2-${suffix}`, startTime: "09:00", endTime: "10:00", order: baseOrder + 1 },
  });
  period2Id = period2.id;

  const user1 = await prisma.user.create({
    data: {
      email: `xperiod-teacher1-${suffix}@test.local`,
      name: "Period 1 Teacher",
      role: "TEACHER",
      passwordHash: "x",
    },
  });
  const t1 = await prisma.teacher.create({ data: { userId: user1.id } });
  teacher1 = { id: user1.id, email: user1.email, name: user1.name, role: "TEACHER", teacherId: t1.id };

  const user2 = await prisma.user.create({
    data: {
      email: `xperiod-teacher2-${suffix}@test.local`,
      name: "Period 2 Teacher",
      role: "TEACHER",
      passwordHash: "x",
    },
  });
  const t2 = await prisma.teacher.create({ data: { userId: user2.id } });
  teacher2 = { id: user2.id, email: user2.email, name: user2.name, role: "TEACHER", teacherId: t2.id };

  const schedule1 = await prisma.schedule.create({
    data: { academicYearId, classId, teacherId: t1.id, subjectId, periodId: period1Id, weekday, isDouble: false },
  });
  scheduleId1 = schedule1.id;
  const schedule2 = await prisma.schedule.create({
    data: { academicYearId, classId, teacherId: t2.id, subjectId, periodId: period2Id, weekday, isDouble: false },
  });
  scheduleId2 = schedule2.id;

  const student = await prisma.student.create({ data: { firstName: "Absent", lastName: `Student${suffix}`, classId } });
  studentId = student.id;
});

afterAll(async () => {
  if (!classId || !academicYearId) {
    await prisma.$disconnect();
    return;
  }
  await prisma.crossPeriodAlert.deleteMany({ where: { targetClassId: classId } });
  await prisma.attendanceEvent.deleteMany({ where: { studentId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacher1.id, teacher2.id] } } });
  await prisma.schedule.deleteMany({ where: { academicYearId } });
  await prisma.student.deleteMany({ where: { classId } });
  await prisma.teacher.deleteMany({ where: { userId: { in: [teacher1.id, teacher2.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [teacher1.id, teacher2.id] } } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.subject.deleteMany({ where: { id: subjectId } });
  await prisma.period.deleteMany({ where: { id: { in: [period1Id, period2Id] } } });
  await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
  await prisma.$disconnect();
});

// An instant whose school-local time/weekday match the target, computed via
// the app's own timezone conversion (not a hardcoded UTC offset) so this
// stays correct regardless of the current Africa/Casablanca DST state.
function instantAtLocalTime(hhmm: string, targetWeekday: number): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const desiredMinutes = h! * 60 + m!;
  const now = new Date();
  const deltaMinutes = desiredMinutes - schoolLocalParts(now).timeMinutes;
  let candidate = new Date(now.getTime() + deltaMinutes * 60 * 1000);
  for (let i = 0; i < 7; i++) {
    if (schoolLocalParts(candidate).weekday === targetWeekday) return candidate;
    candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return candidate;
}

function instantInPeriod1(): Date {
  return instantAtLocalTime("08:30", weekday);
}

describe("cross-period alert end-to-end", () => {
  it("period 2's teacher sees a targeted alert after period 1 marks the student absent, and confirming present acknowledges it", async () => {
    const now = instantInPeriod1();

    await saveAttendance(teacher1, {
      scheduleId: scheduleId1,
      dateKey: now.toISOString().slice(0, 10),
      segment: "FULL",
      idempotencyKey: `xperiod-save-${suffix}`,
      entries: [{ studentId, status: "ABSENT" }],
    });

    const period2Now = new Date(now.getTime() + 60 * 60 * 1000); // 09:30, inside period 2's window
    const session2 = await getTeacherSession(teacher2, period2Now);
    expect(session2.state).toBe("READY");
    if (session2.state !== "READY") throw new Error("unreachable");

    expect(session2.alerts).toHaveLength(1);
    expect(session2.alerts[0]?.studentId).toBe(studentId);

    await confirmPresent(teacher2, session2.alerts[0]!.id, `xperiod-confirm-${suffix}`);

    const afterAck = await getTeacherSession(teacher2, period2Now);
    if (afterAck.state !== "READY") throw new Error("unreachable");
    expect(afterAck.alerts).toHaveLength(0);

    const presentEvent = await prisma.attendanceEvent.findFirst({
      where: { studentId, scheduleId: scheduleId2, status: "PRESENT" },
    });
    expect(presentEvent?.note).toBe("arrived after prior absence");
  });

  it("does not alert period 2 when the absence is FULL-segment inside a paired double lesson", async () => {
    // Reset: make schedule1/schedule2 a paired double lesson (same subject/teacher/class/weekday, both isDouble).
    await prisma.schedule.update({
      where: { id: scheduleId1 },
      data: { isDouble: true, teacherId: teacher1.teacherId! },
    });
    await prisma.schedule.update({
      where: { id: scheduleId2 },
      data: { isDouble: true, teacherId: teacher1.teacherId! },
    });

    const now = instantInPeriod1();
    const dateKey = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // a fresh day, avoid clashing with the previous test's events

    await saveAttendance(teacher1, {
      scheduleId: scheduleId1,
      dateKey,
      segment: "FULL",
      idempotencyKey: `xperiod-double-save-${suffix}`,
      entries: [{ studentId, status: "ABSENT" }],
    });

    const alerts = await prisma.crossPeriodAlert.findMany({
      where: { studentId, targetPeriodId: period2Id, date: new Date(`${dateKey}T00:00:00.000Z`) },
    });
    expect(alerts).toHaveLength(0);
  });
});
