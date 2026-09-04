import { prisma } from "@/lib/db/client";

/** Current conduct score is always derived from the append-only ledger, never stored directly. */
export async function getConductScore(studentId: string): Promise<number> {
  const agg = await prisma.conductScoreLog.aggregate({ where: { studentId }, _sum: { delta: true } });
  return agg._sum.delta ?? 0;
}

export async function getDisciplinaryFacts(
  studentId: string,
): Promise<{ hasActiveSuspension: boolean; hasActiveHold: boolean }> {
  const openHolds = await prisma.disciplinaryAction.findMany({
    where: { studentId, isHold: true, status: "OPEN" },
  });
  return {
    hasActiveSuspension: openHolds.some((a) => a.type === "SUSPENSION"),
    hasActiveHold: openHolds.some((a) => a.type !== "SUSPENSION"),
  };
}
