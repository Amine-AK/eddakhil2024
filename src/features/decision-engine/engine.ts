/**
 * Pure, deterministic entry-decision engine. No DB access, no UI concerns —
 * every threshold arrives via `config` so nothing is hardcoded here. AI is
 * never involved: this is a plain rule evaluation over facts the caller
 * already gathered from the database.
 *
 * Contract for callers: `todayAbsences` must already EXCLUDE
 * TEACHER_REMOVAL-reason events (those are reported separately via
 * `hasTeacherRemovalToday`) — a removal is handled by its own notify-only
 * rule and must not also trigger the unjustified-absence conduct penalty.
 */

export type EntryDecision = "AUTO_ALLOWED" | "ADMIN_REVIEW" | "DENIED";

export type EntryDecisionRuleConfig = {
  justificationWindowHours: number;
  conductDeductionUnjustifiedAbsence: number; // negative integer
  repeatedAbsenceThresholdOccurrences: number;
  repeatedAbsenceLookbackDays: number;
  conductReviewThreshold: number; // negative integer; conductScore <= this triggers review
};

export type TodayAbsence = { date: Date; createdAt: Date };
export type JustificationFact = {
  status: "PENDING" | "APPROVED" | "REJECTED";
  absenceDate: Date;
  submittedAt: Date;
};

export type DisciplinaryFacts = {
  hasActiveSuspension: boolean;
  hasActiveHold: boolean; // any other standing hold besides suspension
  conductScore: number;
};

export type EntryDecisionInput = {
  now: Date;
  todayAbsences: TodayAbsence[];
  justifications: JustificationFact[];
  hasTeacherRemovalToday: boolean;
  disciplinary: DisciplinaryFacts;
  repeatedUnexplainedAbsenceDays: number;
  config: EntryDecisionRuleConfig;
};

export type EntryDecisionResult = {
  decision: EntryDecision;
  reasons: string[];
  actions: string[];
  conductDelta: number;
};

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

export function evaluateEntryDecision(input: EntryDecisionInput): EntryDecisionResult {
  // 1. Disciplinary holds/suspensions take absolute precedence: only a
  //    genuine hold may block automatic entry, and it always does.
  if (input.disciplinary.hasActiveSuspension) {
    return {
      decision: "DENIED",
      reasons: ["Active disciplinary suspension"],
      actions: ["Deny entry", "Notify supervisor"],
      conductDelta: 0,
    };
  }
  if (input.disciplinary.hasActiveHold) {
    return {
      decision: "DENIED",
      reasons: ["Active disciplinary hold"],
      actions: ["Deny entry", "Refer to supervisor"],
      conductDelta: 0,
    };
  }

  // 2. Escalation to supervisor review: conduct threshold or a repeated
  //    unexplained-absence pattern. Neither is an outright block, so entry
  //    itself is not decided here — a human reviews it.
  const reviewReasons: string[] = [];
  const reviewActions: string[] = [];
  if (input.disciplinary.conductScore <= input.config.conductReviewThreshold) {
    reviewReasons.push("Conduct score below review threshold");
    reviewActions.push("Refer to supervisor for review");
  }
  if (input.repeatedUnexplainedAbsenceDays >= input.config.repeatedAbsenceThresholdOccurrences) {
    reviewReasons.push("Repeated unexplained absences");
    reviewActions.push("Supervisor review required");
  }
  if (reviewReasons.length > 0) {
    return { decision: "ADMIN_REVIEW", reasons: reviewReasons, actions: reviewActions, conductDelta: 0 };
  }

  // 3. Everything below this point is an AUTO_ALLOWED outcome: entry slips
  //    are issued in almost every remaining case. Reasons/actions below are
  //    informational (notify/deduct), never blocking.
  const reasons: string[] = [];
  const actions: string[] = [];
  let conductDelta = 0;

  if (input.hasTeacherRemovalToday) {
    reasons.push("Teacher removal recorded today");
    actions.push("Notify supervisor");
  }

  if (input.todayAbsences.length > 0) {
    const earliest = input.todayAbsences.reduce((min, a) => (a.createdAt < min.createdAt ? a : min));
    const windowMs = input.config.justificationWindowHours * 60 * 60 * 1000;
    const relevant = input.justifications.filter(
      (j) => isSameCalendarDay(j.absenceDate, earliest.date) && j.submittedAt.getTime() - earliest.createdAt.getTime() <= windowMs,
    );
    const approved = relevant.some((j) => j.status === "APPROVED");
    const pending = relevant.some((j) => j.status === "PENDING");

    if (approved) {
      reasons.push("Absence justified within the justification window");
    } else if (pending) {
      reasons.push("Justification pending, submitted within the justification window");
    } else {
      reasons.push("Unjustified absence or justification window expired");
      actions.push(`Apply conduct deduction (${input.config.conductDeductionUnjustifiedAbsence})`);
      conductDelta += input.config.conductDeductionUnjustifiedAbsence;
    }
  }

  if (reasons.length === 0) {
    reasons.push("No attendance concerns today");
  }

  return { decision: "AUTO_ALLOWED", reasons, actions, conductDelta };
}
