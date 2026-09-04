import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getGateStudentView } from "@/features/gate/service";
import { apiHandler } from "@/server/http";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return apiHandler(async () => {
    await requireRole("GATE", "ADMIN", "SUPERVISOR", "READONLY");
    const view = await getGateStudentView(params.id);
    if (!view) return NextResponse.json({ error: "Student not found" }, { status: 404 });
    return NextResponse.json(view);
  });
}
