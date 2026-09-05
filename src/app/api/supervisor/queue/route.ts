import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getSupervisorQueue } from "@/features/supervisor/service";
import { apiHandler } from "@/server/http";

export async function GET() {
  return apiHandler(async () => {
    await requireRole("SUPERVISOR", "ADMIN", "READONLY");
    const queue = await getSupervisorQueue();
    return NextResponse.json(queue);
  });
}
