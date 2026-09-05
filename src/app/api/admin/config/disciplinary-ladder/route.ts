import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { setDisciplinaryLadderConfig } from "@/features/disciplinary/config";
import { disciplinaryLadderConfigSchema } from "@/lib/validation/supervisor";
import { apiHandler } from "@/server/http";

export async function PUT(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("ADMIN");
    const body = disciplinaryLadderConfigSchema.parse(await req.json());
    await setDisciplinaryLadderConfig(user, body);
    return NextResponse.json({ ok: true });
  });
}
