import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getTeacherSession } from "@/features/attendance/service";
import { apiHandler } from "@/server/http";

export async function GET() {
  return apiHandler(async () => {
    const user = await requireRole("TEACHER", "ADMIN");
    const session = await getTeacherSession(user);
    return NextResponse.json(session);
  });
}
