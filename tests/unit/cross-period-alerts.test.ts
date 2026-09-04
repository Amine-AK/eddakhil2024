import { describe, it, expect } from "vitest";
import { computeAlertCandidates, latestStatusByStudentSegment } from "@/features/attendance/cross-period-alerts";

describe("computeAlertCandidates", () => {
  it("raises an alert for an ordinary absence in a single period", () => {
    const result = computeAlertCandidates([{ id: "e1", studentId: "s1", status: "ABSENT", segment: "FULL" }], false);
    expect(result).toEqual([{ studentId: "s1", sourceEventId: "e1" }]);
  });

  it("does not raise an alert for a present or late student", () => {
    const result = computeAlertCandidates(
      [
        { id: "e1", studentId: "s1", status: "PRESENT", segment: "FULL" },
        { id: "e2", studentId: "s2", status: "LATE", segment: "FULL" },
      ],
      false,
    );
    expect(result).toEqual([]);
  });

  it("suppresses the alert when a FULL-segment absence already covers the paired double-lesson hour", () => {
    const result = computeAlertCandidates([{ id: "e1", studentId: "s1", status: "ABSENT", segment: "FULL" }], true);
    expect(result).toEqual([]);
  });

  it("still raises an alert for a HOUR_1-only absence in a paired double lesson (must not imply HOUR_2)", () => {
    const result = computeAlertCandidates([{ id: "e1", studentId: "s1", status: "ABSENT", segment: "HOUR_1" }], true);
    expect(result).toEqual([{ studentId: "s1", sourceEventId: "e1" }]);
  });
});

describe("latestStatusByStudentSegment", () => {
  it("keeps only the most recent event per student+segment", () => {
    const events = [
      { studentId: "s1", segment: "FULL", createdAt: new Date("2026-01-01T08:00:00Z"), status: "ABSENT" },
      { studentId: "s1", segment: "FULL", createdAt: new Date("2026-01-01T08:05:00Z"), status: "PRESENT" },
    ];
    const latest = latestStatusByStudentSegment(events);
    expect(latest.get("s1:FULL")?.status).toBe("PRESENT");
  });

  it("tracks segments independently for the same student", () => {
    const events = [
      { studentId: "s1", segment: "HOUR_1", createdAt: new Date("2026-01-01T08:00:00Z"), status: "ABSENT" },
      { studentId: "s1", segment: "HOUR_2", createdAt: new Date("2026-01-01T09:00:00Z"), status: "PRESENT" },
    ];
    const latest = latestStatusByStudentSegment(events);
    expect(latest.get("s1:HOUR_1")?.status).toBe("ABSENT");
    expect(latest.get("s1:HOUR_2")?.status).toBe("PRESENT");
  });
});
