import { describe, it, expect } from "vitest";
import { findCurrentPeriod, findPreviousPeriod, type PeriodLike } from "@/features/attendance/period-detection";

const periods: PeriodLike[] = [
  { id: "p1", order: 1, name: "P1", startTime: "08:00", endTime: "09:00" },
  { id: "p2", order: 2, name: "P2", startTime: "09:00", endTime: "10:00" },
  { id: "p3", order: 3, name: "P3", startTime: "10:15", endTime: "11:15" },
];

describe("findCurrentPeriod", () => {
  it("finds the period containing the given time", () => {
    expect(findCurrentPeriod(periods, 8 * 60 + 30)?.id).toBe("p1");
    expect(findCurrentPeriod(periods, 9 * 60)?.id).toBe("p2");
  });

  it("returns null during a gap between periods", () => {
    expect(findCurrentPeriod(periods, 10 * 60)).toBeNull();
  });

  it("returns null before the first and after the last period", () => {
    expect(findCurrentPeriod(periods, 7 * 60)).toBeNull();
    expect(findCurrentPeriod(periods, 12 * 60)).toBeNull();
  });

  it("treats the end time as exclusive", () => {
    expect(findCurrentPeriod(periods, 9 * 60)?.id).toBe("p2");
    expect(findCurrentPeriod(periods, 8 * 60 + 59)?.id).toBe("p1");
  });
});

describe("findPreviousPeriod", () => {
  it("returns the immediately preceding period by order", () => {
    const p2 = periods[1]!;
    expect(findPreviousPeriod(periods, p2)?.id).toBe("p1");
  });

  it("returns null for the first period", () => {
    const p1 = periods[0]!;
    expect(findPreviousPeriod(periods, p1)).toBeNull();
  });
});
