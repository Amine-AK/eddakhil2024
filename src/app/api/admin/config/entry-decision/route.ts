import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { setEntryDecisionRuleConfig } from "@/features/decision-engine/config";
import { entryDecisionRuleConfigSchema } from "@/lib/validation/supervisor";
import { apiHandler } from "@/server/http";

export async function PUT(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("ADMIN");
    const body = entryDecisionRuleConfigSchema.parse(await req.json());
    await setEntryDecisionRuleConfig(user, body);
    return NextResponse.json({ ok: true });
  });
}
