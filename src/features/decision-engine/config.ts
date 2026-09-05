import { prisma } from "@/lib/db/client";
import { recordAudit } from "@/features/audit/service";
import type { EntryDecisionRuleConfig } from "@/features/decision-engine/engine";
import type { SessionUser } from "@/types";

export const ENTRY_DECISION_CONFIG_KEY = "entry_decision_rules";

// Used only if the DecisionRuleConfig row is somehow missing; the seed
// always creates it. Never treated as the source of truth once the row
// exists — admins edit the DB row, not this file.
const DEFAULTS: EntryDecisionRuleConfig = {
  justificationWindowHours: 48,
  conductDeductionUnjustifiedAbsence: -1,
  repeatedAbsenceThresholdOccurrences: 3,
  repeatedAbsenceLookbackDays: 30,
  conductReviewThreshold: -10,
};

export async function getEntryDecisionRuleConfig(): Promise<EntryDecisionRuleConfig> {
  const row = await prisma.decisionRuleConfig.findUnique({ where: { key: ENTRY_DECISION_CONFIG_KEY } });
  if (!row) return DEFAULTS;
  return { ...DEFAULTS, ...(row.value as Partial<EntryDecisionRuleConfig>) };
}

/** Admin-only rule editing: thresholds live in this one config row, never scattered as hardcoded constants. */
export async function setEntryDecisionRuleConfig(user: SessionUser, value: EntryDecisionRuleConfig): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.decisionRuleConfig.upsert({
      where: { key: ENTRY_DECISION_CONFIG_KEY },
      update: { value, updatedByUserId: user.id },
      create: { key: ENTRY_DECISION_CONFIG_KEY, value, updatedByUserId: user.id },
    });
    await recordAudit(tx, {
      actorId: user.id,
      action: "DECISION_RULE_CONFIG_UPDATED",
      entity: "DecisionRuleConfig",
      entityId: ENTRY_DECISION_CONFIG_KEY,
      metadata: { value },
    });
  });
}
