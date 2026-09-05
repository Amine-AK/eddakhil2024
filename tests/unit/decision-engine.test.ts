import { describe, it, expect } from "vitest";
import {
  evaluateEntryDecision,
  type EntryDecisionInput,
  type EntryDecisionRuleConfig,
} from "@/features/decision-engine/engine";

const config: EntryDecisionRuleConfig = {
  justificationWindowHours: 48,
  conductDeductionUnjustifiedAbsence: -1,
  repeatedAbsenceThresholdOccurrences: 3,
  repeatedAbsenceLookbackDays: 30,
  conductReviewThreshold: -10,
};

function baseInput(overrides: Partial<EntryDecisionInput> = {}): EntryDecisionInput {
  return {
    now: new Date("2026-01-10T09:00:00.000Z"),
    todayAbsences: [],
    justifications: [],
    hasTeacherRemovalToday: false,
    disciplinary: { hasActiveSuspension: false, hasActiveHold: false, conductScore: 0 },
    repeatedUnexplainedAbsenceDays: 0,
    config,
    ...overrides,
  };
}

describe("evaluateEntryDecision", () => {
  it("allows entry with no concerns", () => {
    const result = evaluateEntryDecision(baseInput());
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(0);
  });

  it("denies entry outright for an active suspension, regardless of other facts", () => {
    const result = evaluateEntryDecision(
      baseInput({ disciplinary: { hasActiveSuspension: true, hasActiveHold: false, conductScore: 0 } }),
    );
    expect(result.decision).toBe("DENIED");
    expect(result.reasons).toContain("Active disciplinary suspension");
  });

  it("denies entry for a standing disciplinary hold even with a perfect attendance day", () => {
    const result = evaluateEntryDecision(
      baseInput({ disciplinary: { hasActiveSuspension: false, hasActiveHold: true, conductScore: 0 } }),
    );
    expect(result.decision).toBe("DENIED");
  });

  it("escalates to ADMIN_REVIEW when conduct score is at/below the review threshold", () => {
    const result = evaluateEntryDecision(
      baseInput({ disciplinary: { hasActiveSuspension: false, hasActiveHold: false, conductScore: -10 } }),
    );
    expect(result.decision).toBe("ADMIN_REVIEW");
  });

  it("escalates to ADMIN_REVIEW for a repeated unexplained absence pattern", () => {
    const result = evaluateEntryDecision(baseInput({ repeatedUnexplainedAbsenceDays: 3 }));
    expect(result.decision).toBe("ADMIN_REVIEW");
    expect(result.reasons).toContain("Repeated unexplained absences");
  });

  it("does not escalate below the repeated-absence threshold", () => {
    const result = evaluateEntryDecision(baseInput({ repeatedUnexplainedAbsenceDays: 2 }));
    expect(result.decision).toBe("AUTO_ALLOWED");
  });

  it("allows entry for a teacher removal without any disciplinary flag, and notifies the supervisor", () => {
    const result = evaluateEntryDecision(baseInput({ hasTeacherRemovalToday: true }));
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.actions).toContain("Notify supervisor");
    expect(result.conductDelta).toBe(0);
  });

  it("allows entry with no conduct deduction when the absence is approved within the 48h window", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
        justifications: [
          {
            status: "APPROVED",
            absenceDate: new Date("2026-01-10T00:00:00.000Z"),
            submittedAt: new Date("2026-01-10T20:00:00.000Z"),
          },
        ],
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(0);
    expect(result.reasons).toContain("Absence justified within the justification window");
  });

  it("allows entry with a grace period while a justification is still pending inside the window", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
        justifications: [
          {
            status: "PENDING",
            absenceDate: new Date("2026-01-10T00:00:00.000Z"),
            submittedAt: new Date("2026-01-10T10:00:00.000Z"),
          },
        ],
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(0);
  });

  it("still allows entry but applies the conduct deduction when there is no justification at all", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(-1);
    expect(result.reasons).toContain("Unjustified absence or justification window expired");
  });

  it("applies the conduct deduction once the justification window has expired, even if later approved", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
        justifications: [
          {
            status: "APPROVED",
            absenceDate: new Date("2026-01-10T00:00:00.000Z"),
            submittedAt: new Date("2026-01-13T08:00:00.000Z"), // submitted 3 days later, past 48h
          },
        ],
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(-1);
  });

  it("applies the conduct deduction when the only justification was rejected", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
        justifications: [
          {
            status: "REJECTED",
            absenceDate: new Date("2026-01-10T00:00:00.000Z"),
            submittedAt: new Date("2026-01-10T09:00:00.000Z"),
          },
        ],
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
    expect(result.conductDelta).toBe(-1);
  });

  it("never lets an unjustified absence alone escalate past AUTO_ALLOWED", () => {
    const result = evaluateEntryDecision(
      baseInput({
        todayAbsences: [
          { date: new Date("2026-01-10T00:00:00.000Z"), createdAt: new Date("2026-01-10T08:00:00.000Z") },
        ],
        disciplinary: { hasActiveSuspension: false, hasActiveHold: false, conductScore: -1 },
      }),
    );
    expect(result.decision).toBe("AUTO_ALLOWED");
  });
});
