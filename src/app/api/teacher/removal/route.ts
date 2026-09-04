import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { recordTeacherRemoval } from "@/features/attendance/service";
import { teacherRemovalSchema } from "@/lib/validation/attendance";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("TEACHER", "ADMIN");
    const body = teacherRemovalSchema.parse(await req.json());
    await recordTeacherRemoval(user, body);
    return NextResponse.json({ ok: true });
  });
}
