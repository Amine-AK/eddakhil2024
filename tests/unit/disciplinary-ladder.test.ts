import { describe, it, expect } from "vitest";
import { determineLadderRung, type LadderRung } from "@/features/disciplinary/ladder";

const ladder: LadderRung[] = [
  { minDays: 1, maxDays: 1, action: "VERBAL_WARNING", isHold: false },
  { minDays: 3, maxDays: 5, action: "FIRST_PARENT_NOTICE", isHold: false },
  { minDays: 8, maxDays: 10, action: "SECOND_PARENT_NOTICE", isHold: false },
  { minDays: 15, maxDays: 15, action: "FORMAL_REPRIMAND", isHold: false },
  { minDays: 30, maxDays: null, action: "DROPPED_OUT_REFERRAL", isHold: true },
];

describe("determineLadderRung", () => {
  it("returns null below the first threshold", () => {
    expect(determineLadderRung(0, ladder)).toBeNull();
  });

  it("matches the verbal warning rung at exactly 1 day", () => {
    expect(determineLadderRung(1, ladder)?.action).toBe("VERBAL_WARNING");
  });

  it("matches the first parent notice within its 3-5 day band", () => {
    expect(determineLadderRung(3, ladder)?.action).toBe("FIRST_PARENT_NOTICE");
    expect(determineLadderRung(5, ladder)?.action).toBe("FIRST_PARENT_NOTICE");
  });

  it("still resolves to the highest reached rung inside a gap between bands", () => {
    // day 6 falls between the 3-5 and 8-10 bands; it must not fall through to nothing.
    expect(determineLadderRung(6, ladder)?.action).toBe("FIRST_PARENT_NOTICE");
  });

  it("escalates to the second parent notice at 8+ days", () => {
    expect(determineLadderRung(9, ladder)?.action).toBe("SECOND_PARENT_NOTICE");
  });

  it("escalates to a formal reprimand at 15 days", () => {
    expect(determineLadderRung(15, ladder)?.action).toBe("FORMAL_REPRIMAND");
  });

  it("escalates to a holding dropped-out referral at 30+ consecutive days", () => {
    const result = determineLadderRung(45, ladder);
    expect(result?.action).toBe("DROPPED_OUT_REFERRAL");
    expect(result?.isHold).toBe(true);
  });

  it("is driven entirely by the passed-in config, not any hardcoded threshold", () => {
    const customLadder: LadderRung[] = [{ minDays: 2, maxDays: null, action: "SUSPENSION", isHold: true }];
    expect(determineLadderRung(1, customLadder)).toBeNull();
    expect(determineLadderRung(2, customLadder)?.action).toBe("SUSPENSION");
  });
});
