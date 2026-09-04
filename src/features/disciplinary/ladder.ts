/**
 * Pure disciplinary-ladder matching. Thresholds are entirely configuration
 * data (DecisionRuleConfig key "disciplinary_ladder") — nothing here is
 * hardcoded. Rungs are matched by "at least N consecutive unexplained
 * absence days", not strict bands: a gap in the configured ranges (e.g.
 * day 6, between a 3-5 and an 8-10 rung) still resolves to the highest
 * rung already reached, rather than falling through to no action. The
 * `maxDays` field is display-only (e.g. "3-5 days" in the UI).
 */

export type DisciplinaryActionType =
  | "VERBAL_WARNING"
  | "FIRST_PARENT_NOTICE"
  | "SECOND_PARENT_NOTICE"
  | "FORMAL_REPRIMAND"
  | "DROPPED_OUT_REFERRAL"
  | "SUSPENSION"
  | "HOLD";

export type LadderRung = {
  minDays: number;
  maxDays: number | null;
  action: DisciplinaryActionType;
  isHold: boolean;
};

export function determineLadderRung(consecutiveUnexplainedDays: number, ladder: LadderRung[]): LadderRung | null {
  const sorted = [...ladder].sort((a, b) => a.minDays - b.minDays);
  let matched: LadderRung | null = null;
  for (const rung of sorted) {
    if (consecutiveUnexplainedDays >= rung.minDays) {
      matched = rung;
    }
  }
  return matched;
}
