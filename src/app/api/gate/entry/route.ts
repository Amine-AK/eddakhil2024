import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { issueEntry } from "@/features/gate/service";
import { issueEntrySchema } from "@/lib/validation/gate";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("GATE", "ADMIN");
    const body = issueEntrySchema.parse(await req.json());
    const result = await issueEntry(user, body);
    return NextResponse.json(result);
  });
}
