import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { saveAttendance } from "@/features/attendance/service";
import { assertTeacherOwnsSchedule } from "@/lib/permissions";
import { AuthError } from "@/lib/auth/session";
import type { SessionUser } from "@/types";

// Integration tests exercise the real Postgres database (DATABASE_URL) to
// verify idempotent synchronization and server-side authorization scoping
// end-to-end, not just the pure decision logic.

const suffix = Math.random().toString(36).slice(2, 8);
let academicYearId: string;
let classId: string;
let otherClassId: string;
let subjectId: string;
let periodId: string;
let teacherUser: SessionUser;
let otherTeacherUser: SessionUser;
let scheduleId: string;
let studentIds: string[];

beforeAll(async () => {
  const year = await prisma.academicYear.create({
    data: { label: `test-year-${suffix}`, startDate: new Date(), endDate: new Date(), isActive: false },
  });
  academicYearId = year.id;

  const cls = await prisma.class.create({ data: { name: `test-class-${suffix}`, academicYearId } });
  classId = cls.id;
  const otherCls = await prisma.class.create({ data: { name: `test-class-other-${suffix}`, academicYearId } });
  otherClassId = otherCls.id;

  const subject = await prisma.subject.create({ data: { name: `test-subject-${suffix}` } });
  subjectId = subject.id;

  const period = await prisma.period.create({
    data: {
      name: `test-period-${suffix}`,
      startTime: "08:00",
      endTime: "09:00",
      order: 900_000 + Math.floor(Math.random() * 100_000),
    },
  });
  periodId = period.id;

  const user = await prisma.user.create({
    data: { email: `teacher-${suffix}@test.local`, name: "Test Teacher", role: "TEACHER", passwordHash: "x" },
  });
  const teacher = await prisma.teacher.create({ data: { userId: user.id } });
  teacherUser = { id: user.id, email: user.email, name: user.name, role: "TEACHER", teacherId: teacher.id };

  const otherUser = await prisma.user.create({
    data: { email: `teacher-other-${suffix}@test.local`, name: "Other Teacher", role: "TEACHER", passwordHash: "x" },
  });
  const otherTeacher = await prisma.teacher.create({ data: { userId: otherUser.id } });
  otherTeacherUser = { id: otherUser.id, email: otherUser.email, name: otherUser.name, role: "TEACHER", teacherId: otherTeacher.id };

  const schedule = await prisma.schedule.create({
    data: { academicYearId, classId, teacherId: teacher.id, subjectId, periodId, weekday: 1, isDouble: false },
  });
  scheduleId = schedule.id;

  const students = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.student.create({ data: { firstName: `S${n}`, lastName: `Test${suffix}`, classId } }),
    ),
  );
  studentIds = students.map((s) => s.id);
});

afterAll(async () => {
  // Defensive: if beforeAll threw partway through, some of these ids may be
  // undefined. Never let an undefined id turn into an unfiltered deleteMany.
  if (!scheduleId || !academicYearId || !classId || !subjectId || !periodId) {
    console.warn("Skipping integration test cleanup: setup did not complete fully.");
    await prisma.$disconnect();
    return;
  }
  await prisma.crossPeriodAlert.deleteMany({ where: { targetClassId: { in: [classId, otherClassId] } } });
  await prisma.attendanceEvent.deleteMany({ where: { scheduleId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacherUser.id, otherTeacherUser.id] } } });
  await prisma.schedule.deleteMany({ where: { academicYearId } });
  await prisma.student.deleteMany({ where: { classId: { in: [classId, otherClassId] } } });
  await prisma.teacher.deleteMany({ where: { userId: { in: [teacherUser.id, otherTeacherUser.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [teacherUser.id, otherTeacherUser.id] } } });
  await prisma.class.deleteMany({ where: { academicYearId } });
  await prisma.subject.delete({ where: { id: subjectId } });
  await prisma.period.delete({ where: { id: periodId } });
  await prisma.academicYear.delete({ where: { id: academicYearId } });
  await prisma.$disconnect();
});

describe("saveAttendance idempotency", () => {
  it("retrying the same idempotency key never creates duplicate events", async () => {
    const input = {
      scheduleId,
      dateKey: "2026-01-05",
      segment: "FULL" as const,
      idempotencyKey: `retry-key-${suffix}`,
      entries: studentIds.map((studentId) => ({ studentId, status: "PRESENT" as const })),
    };

    await saveAttendance(teacherUser, input);
    await saveAttendance(teacherUser, input); // simulate a network retry of the same submission

    const events = await prisma.attendanceEvent.findMany({ where: { scheduleId, date: new Date("2026-01-05T00:00:00.000Z") } });
    expect(events).toHaveLength(studentIds.length);
  });

  it("a deliberate correction with a new idempotency key adds history rather than overwriting", async () => {
    const dateKey = "2026-01-06";
    await saveAttendance(teacherUser, {
      scheduleId,
      dateKey,
      segment: "FULL",
      idempotencyKey: `first-save-${suffix}`,
      entries: studentIds.map((studentId) => ({ studentId, status: "PRESENT" as const })),
    });
    await saveAttendance(teacherUser, {
      scheduleId,
      dateKey,
      segment: "FULL",
      idempotencyKey: `correction-${suffix}`,
      entries: [{ studentId: studentIds[0]!, status: "ABSENT" }],
    });

    const events = await prisma.attendanceEvent.findMany({
      where: { scheduleId, date: new Date(`${dateKey}T00:00:00.000Z`), studentId: studentIds[0] },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.status).toBe("PRESENT");
    expect(events[1]?.status).toBe("ABSENT");
  });
});

describe("assertTeacherOwnsSchedule authorization", () => {
  it("allows a teacher assigned to the schedule", async () => {
    await expect(assertTeacherOwnsSchedule(teacherUser, scheduleId)).resolves.toBeUndefined();
  });

  it("rejects a teacher who is not assigned to the schedule", async () => {
    await expect(assertTeacherOwnsSchedule(otherTeacherUser, scheduleId)).rejects.toBeInstanceOf(AuthError);
  });

  it("allows ADMIN to bypass ownership scoping", async () => {
    const admin: SessionUser = { id: "admin", email: "a@test.local", name: "Admin", role: "ADMIN", teacherId: null };
    await expect(assertTeacherOwnsSchedule(admin, scheduleId)).resolves.toBeUndefined();
  });

  it("rejects a GATE user outright regardless of assignment", async () => {
    const gate: SessionUser = { id: "gate", email: "g@test.local", name: "Gate", role: "GATE", teacherId: null };
    await expect(assertTeacherOwnsSchedule(gate, scheduleId)).rejects.toBeInstanceOf(AuthError);
  });
});
