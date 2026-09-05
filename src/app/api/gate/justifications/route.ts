import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { submitJustification } from "@/features/gate/service";
import { submitJustificationSchema } from "@/lib/validation/gate";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("GATE", "ADMIN", "SUPERVISOR");
    const body = submitJustificationSchema.parse(await req.json());
    const result = await submitJustification(user, body);
    return NextResponse.json(result);
  });
}
