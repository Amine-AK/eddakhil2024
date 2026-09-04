import { prisma } from "@/lib/db/client";
import { getPendingJustifications, type PendingJustificationView } from "@/features/justification/service";
import { getAtRiskStudents, type AtRiskStudent } from "@/features/disciplinary/service";

export type ActiveHoldView = {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  type: string;
  reason: string;
  createdAt: string;
};

export type SupervisorQueue = {
  pendingJustifications: PendingJustificationView[];
  atRiskStudents: AtRiskStudent[];
  activeHolds: ActiveHoldView[];
};

/** Aggregates everything a supervisor needs to triage in one screen: justifications awaiting a decision, students hitting the disciplinary ladder, and standing holds available to release. */
export async function getSupervisorQueue(now: Date = new Date()): Promise<SupervisorQueue> {
  const [pendingJustifications, atRiskStudents, holds] = await Promise.all([
    getPendingJustifications(),
    getAtRiskStudents(now),
    prisma.disciplinaryAction.findMany({
      where: { isHold: true, status: "OPEN" },
      include: { student: { include: { class: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    pendingJustifications,
    atRiskStudents,
    activeHolds: holds.map((h) => ({
      id: h.id,
      studentId: h.studentId,
      studentName: `${h.student.firstName} ${h.student.lastName}`,
      className: h.student.class.name,
      type: h.type,
      reason: h.reason,
      createdAt: h.createdAt.toISOString(),
    })),
  };
}
