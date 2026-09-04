import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getRecentAuditLogs } from "@/features/audit/service";
import { apiHandler } from "@/server/http";

export async function GET() {
  return apiHandler(async () => {
    await requireRole("SUPERVISOR", "ADMIN", "READONLY");
    const logs = await getRecentAuditLogs(100);
    return NextResponse.json({ logs });
  });
}
