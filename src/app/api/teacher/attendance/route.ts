import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { saveAttendance } from "@/features/attendance/service";
import { saveAttendanceSchema } from "@/lib/validation/attendance";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("TEACHER", "ADMIN");
    const body = saveAttendanceSchema.parse(await req.json());
    await saveAttendance(user, body);
    return NextResponse.json({ ok: true });
  });
}
