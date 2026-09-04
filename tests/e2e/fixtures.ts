import { PrismaClient } from "@prisma/client";
import { schoolLocalParts, dateKeyToUtcDate } from "../../src/lib/dates";
import { findCurrentPeriod } from "../../src/features/attendance/period-detection";

const prisma = new PrismaClient();

export const E2E_TEACHER_EMAIL = "e2e-teacher@school.test";
export const E2E_PASSWORD = "Passw0rd!";

/**
 * Links the E2E test teacher to whichever real period is active right now,
 * using the exact same period-detection logic the app uses — there is no
 * test-only time bypass. Returns null (and does nothing) if no period is
 * currently active, so the caller can skip gracefully instead of faking one.
 */
export async function activateE2EPeriod(): Promise<{ scheduleId: string; dateKey: string } | null> {
  const now = new Date();
  const { weekday, dateKey, timeMinutes } = schoolLocalParts(now);
  const periods = await prisma.period.findMany({ orderBy: { order: "asc" } });
  const current = findCurrentPeriod(periods, timeMinutes);
  if (!current) return null;

  const teacherUser = await prisma.user.findUniqueOrThrow({
    where: { email: E2E_TEACHER_EMAIL },
    include: { teacher: true },
  });
  const e2eClass = await prisma.class.findFirstOrThrow({ where: { name: "E2E-TEST" } });
  const subject = await prisma.subject.findFirstOrThrow();
  const academicYear = await prisma.academicYear.findFirstOrThrow({ where: { isActive: true } });

  const schedule = await prisma.schedule.upsert({
    where: { classId_weekday_periodId: { classId: e2eClass.id, weekday, periodId: current.id } },
    update: { teacherId: teacherUser.teacher!.id },
    create: {
      academicYearId: academicYear.id,
      classId: e2eClass.id,
      teacherId: teacherUser.teacher!.id,
      subjectId: subject.id,
      periodId: current.id,
      weekday,
      isDouble: false,
    },
  });

  // Clean slate: remove any attendance this suite left behind on a previous run for today.
  await prisma.attendanceEvent.deleteMany({ where: { scheduleId: schedule.id, date: dateKeyToUtcDate(dateKey) } });

  return { scheduleId: schedule.id, dateKey };
}

export async function cleanupE2EPeriod(scheduleId: string): Promise<void> {
  await prisma.attendanceEvent.deleteMany({ where: { scheduleId } });
  await prisma.schedule.delete({ where: { id: scheduleId } });
}

export async function getAttendanceEventCount(scheduleId: string): Promise<number> {
  return prisma.attendanceEvent.count({ where: { scheduleId } });
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}

export const GATE_EMAIL = "gate@school.test";
export const SUPERVISOR_EMAIL = "supervisor@school.test";

export async function createPendingJustification(): Promise<{ id: string; studentMassarCode: string }> {
  const student = await prisma.student.findFirstOrThrow({ where: { class: { name: "E2E-TEST" } } });
  const gateUser = await prisma.user.findFirstOrThrow({ where: { role: "GATE" } });
  const { dateKey } = schoolLocalParts(new Date());
  const justification = await prisma.justification.create({
    data: {
      studentId: student.id,
      absenceDate: dateKeyToUtcDate(dateKey),
      reasonText: "عذر طبي - اختبار آلي",
      submittedByUserId: gateUser.id,
    },
  });
  return { id: justification.id, studentMassarCode: student.massarCode! };
}

export async function deleteJustification(id: string): Promise<void> {
  await prisma.justification.deleteMany({ where: { id } });
}
