import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/features/audit/service";
import { ValidationError } from "@/lib/validation/errors";
import type { SessionUser } from "@/types";
import type { JustificationStatus } from "@prisma/client";

export type PendingJustificationView = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  absenceDate: string;
  reasonText: string;
  parentPresent: boolean;
  submittedAt: string;
};

export async function getPendingJustifications(): Promise<PendingJustificationView[]> {
  const rows = await prisma.justification.findMany({
    where: { status: "PENDING" },
    include: { student: { include: { class: true } } },
    orderBy: { submittedAt: "asc" },
  });
  return rows.map((j) => ({
    id: j.id,
    studentId: j.studentId,
    studentName: `${j.student.firstName} ${j.student.lastName}`,
    className: j.student.class.name,
    absenceDate: j.absenceDate.toISOString().slice(0, 10),
    reasonText: j.reasonText,
    parentPresent: j.parentPresent,
    submittedAt: j.submittedAt.toISOString(),
  }));
}

/** Supervisor decision on a justification. Never touches the original AttendanceEvent — history stays exactly as the teacher declared it. */
export async function decideJustification(
  user: SessionUser,
  justificationId: string,
  status: Extract<JustificationStatus, "APPROVED" | "REJECTED">,
  note?: string,
): Promise<void> {
  const justification = await prisma.justification.findUnique({ where: { id: justificationId } });
  if (!justification) throw new ValidationError("Unknown justification");
  if (justification.status !== "PENDING") return; // already decided; idempotent no-op

  await prisma.$transaction(async (tx) => {
    await tx.justification.update({
      where: { id: justificationId },
      data: { status, decidedByUserId: user.id, decidedAt: new Date(), decisionNote: note },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: status === "APPROVED" ? "JUSTIFICATION_APPROVED" : "JUSTIFICATION_REJECTED",
      entity: "Justification",
      entityId: justificationId,
      reason: note,
      metadata: { studentId: justification.studentId },
    });
  });
}
