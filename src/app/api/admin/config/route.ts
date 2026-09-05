import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getEntryDecisionRuleConfig } from "@/features/decision-engine/config";
import { getDisciplinaryLadderConfig } from "@/features/disciplinary/config";
import { apiHandler } from "@/server/http";

export async function GET() {
  return apiHandler(async () => {
    await requireRole("ADMIN");
    const [entryDecisionRules, disciplinaryLadder] = await Promise.all([
      getEntryDecisionRuleConfig(),
      getDisciplinaryLadderConfig(),
    ]);
    return NextResponse.json({ entryDecisionRules, disciplinaryLadder });
  });
}
