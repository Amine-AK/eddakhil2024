import { prisma } from "@/lib/db/client";
import type { EntryDecisionRuleConfig } from "@/features/decision-engine/engine";

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
