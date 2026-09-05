import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { decideJustification } from "@/features/justification/service";
import { decideJustificationSchema } from "@/lib/validation/supervisor";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  return apiHandler(async () => {
    const user = await requireRole("SUPERVISOR", "ADMIN");
    const body = decideJustificationSchema.parse(await req.json());
    await decideJustification(user, params.id, body.status, body.note);
    return NextResponse.json({ ok: true });
  });
}
