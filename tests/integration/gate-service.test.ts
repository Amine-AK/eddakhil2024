import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { issueEntry } from "@/features/gate/service";
import { ValidationError } from "@/lib/validation/errors";
import { schoolLocalParts, dateKeyToUtcDate } from "@/lib/dates";
import type { SessionUser } from "@/types";

// computeEntryDecisionForStudent always evaluates "today" against the real
// clock (issueEntry never accepts an injected `now`, by design — gate
// decisions must reflect the live day), so fixtures use today's actual
// school-local date rather than an arbitrary fixed one.
const { dateKey: today } = schoolLocalParts(new Date());
const suffix = Math.random().toString(36).slice(2, 8);
let studentId: string;
let classId: string;
let academicYearId: string;
let gateUser: SessionUser;

beforeAll(async () => {
  const year = await prisma.academicYear.create({
    data: { label: `gate-test-year-${suffix}`, startDate: new Date(), endDate: new Date(), isActive: false },
  });
  academicYearId = year.id;
  const cls = await prisma.class.create({ data: { name: `gate-test-class-${suffix}`, academicYearId } });
  classId = cls.id;
  const student = await prisma.student.create({ data: { firstName: "Gate", lastName: `Test${suffix}`, classId } });
  studentId = student.id;
  const user = await prisma.user.create({
    data: { email: `gate-${suffix}@test.local`, name: "Gate Tester", role: "GATE", passwordHash: "x" },
  });
  gateUser = { id: user.id, email: user.email, name: user.name, role: "GATE", teacherId: null };
});

afterAll(async () => {
  if (!studentId || !classId || !academicYearId) {
    await prisma.$disconnect();
    return;
  }
  await prisma.conductScoreLog.deleteMany({ where: { studentId } });
  await prisma.auditLog.deleteMany({ where: { actorId: gateUser.id } });
  await prisma.entryEvent.deleteMany({ where: { studentId } });
  await prisma.attendanceEvent.deleteMany({ where: { studentId } });
  await prisma.student.deleteMany({ where: { classId } });
  await prisma.user.deleteMany({ where: { id: gateUser.id } });
  await prisma.class.deleteMany({ where: { id: classId } });
  await prisma.academicYear.deleteMany({ where: { id: academicYearId } });
  await prisma.$disconnect();
});

describe("issueEntry", () => {
  it("is idempotent: retrying the same key returns the same result without creating a duplicate row", async () => {
    const idempotencyKey = `issue-retry-${suffix}`;
    const first = await issueEntry(gateUser, {
      studentId,
      dateKey: today,
      parentPresent: false,
      idempotencyKey,
    });
    const second = await issueEntry(gateUser, {
      studentId,
      dateKey: today,
      parentPresent: false,
      idempotencyKey,
    });
    expect(second).toEqual(first);

    const count = await prisma.entryEvent.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });

  it("rejects an override with no reason even if the caller bypasses schema validation", async () => {
    await expect(
      issueEntry(gateUser, {
        studentId,
        dateKey: today,
        parentPresent: false,
        idempotencyKey: `issue-no-reason-${suffix}`,
        overrideFinalDecision: "DENIED",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records the override with actor, reason, previous recommendation, and final decision in the audit log", async () => {
    const result = await issueEntry(gateUser, {
      studentId,
      dateKey: today,
      parentPresent: true,
      idempotencyKey: `issue-override-${suffix}`,
      overrideFinalDecision: "DENIED",
      overrideReason: "Manual security concern",
    });
    expect(result.overridden).toBe(true);
    expect(result.finalDecision).toBe("DENIED");

    const audit = await prisma.auditLog.findFirst({ where: { action: "ENTRY_DECISION_OVERRIDDEN", actorId: gateUser.id } });
    expect(audit).not.toBeNull();
    expect(audit?.reason).toBe("Manual security concern");
  });

  it("applies the unjustified-absence conduct deduction only once across repeated gate visits the same day", async () => {
    await prisma.attendanceEvent.create({
      data: {
        studentId,
        date: dateKeyToUtcDate(today),
        segment: "FULL",
        status: "ABSENT",
        reason: "MORNING_ABSENCE",
        recordedByUserId: gateUser.id,
        idempotencyKey: `dedup-absence-${suffix}`,
      },
    });

    await issueEntry(gateUser, {
      studentId,
      dateKey: today,
      parentPresent: false,
      idempotencyKey: `issue-dedup-1-${suffix}`,
    });
    await issueEntry(gateUser, {
      studentId,
      dateKey: today,
      parentPresent: false,
      idempotencyKey: `issue-dedup-2-${suffix}`,
    });

    const logs = await prisma.conductScoreLog.findMany({
      where: { studentId, relatedEntityType: "UNJUSTIFIED_ABSENCE" },
    });
    expect(logs).toHaveLength(1);
  });
});
