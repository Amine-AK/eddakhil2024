import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { searchStudents } from "@/features/gate/service";
import { searchQuerySchema } from "@/lib/validation/gate";
import { apiHandler } from "@/server/http";

export async function GET(req: NextRequest) {
  return apiHandler(async () => {
    await requireRole("GATE", "ADMIN", "SUPERVISOR", "READONLY");
    const { q } = searchQuerySchema.parse({ q: req.nextUrl.searchParams.get("q") ?? "" });
    const results = await searchStudents(q);
    return NextResponse.json({ results });
  });
}
