import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { releaseDisciplinaryAction } from "@/features/disciplinary/service";
import { apiHandler } from "@/server/http";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return apiHandler(async () => {
    const user = await requireRole("SUPERVISOR", "ADMIN");
    await releaseDisciplinaryAction(user, params.id);
    return NextResponse.json({ ok: true });
  });
}
