import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { confirmPresent } from "@/features/attendance/service";
import { confirmPresentSchema } from "@/lib/validation/attendance";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("TEACHER", "ADMIN");
    const body = confirmPresentSchema.parse(await req.json());
    await confirmPresent(user, body.alertId, body.idempotencyKey);
    return NextResponse.json({ ok: true });
  });
}
