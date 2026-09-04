import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/features/audit/service";
import type { LadderRung } from "@/features/disciplinary/ladder";
import type { SessionUser } from "@/types";

export const DISCIPLINARY_LADDER_CONFIG_KEY = "disciplinary_ladder";

// Fallback only for a missing config row; the seed always creates one, and
// admins edit that row rather than this file.
const DEFAULT_LADDER: LadderRung[] = [
  { minDays: 1, maxDays: 1, action: "VERBAL_WARNING", isHold: false },
  { minDays: 3, maxDays: 5, action: "FIRST_PARENT_NOTICE", isHold: false },
  { minDays: 8, maxDays: 10, action: "SECOND_PARENT_NOTICE", isHold: false },
  { minDays: 15, maxDays: 15, action: "FORMAL_REPRIMAND", isHold: false },
  { minDays: 30, maxDays: null, action: "DROPPED_OUT_REFERRAL", isHold: true },
];

export async function getDisciplinaryLadderConfig(): Promise<LadderRung[]> {
  const row = await prisma.decisionRuleConfig.findUnique({ where: { key: DISCIPLINARY_LADDER_CONFIG_KEY } });
  if (!row) return DEFAULT_LADDER;
  return row.value as LadderRung[];
}

export async function setDisciplinaryLadderConfig(user: SessionUser, value: LadderRung[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.decisionRuleConfig.upsert({
      where: { key: DISCIPLINARY_LADDER_CONFIG_KEY },
      update: { value, updatedByUserId: user.id },
      create: { key: DISCIPLINARY_LADDER_CONFIG_KEY, value, updatedByUserId: user.id },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "DECISION_RULE_CONFIG_UPDATED",
      entity: "DecisionRuleConfig",
      entityId: DISCIPLINARY_LADDER_CONFIG_KEY,
      metadata: { value },
    });
  });
}
