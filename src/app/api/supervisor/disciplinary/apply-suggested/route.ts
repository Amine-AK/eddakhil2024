import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { applySuggestedAction } from "@/features/disciplinary/service";
import { z } from "zod";
import { apiHandler } from "@/server/http";

const schema = z.object({ studentId: z.string().uuid() });

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("SUPERVISOR", "ADMIN");
    const body = schema.parse(await req.json());
    const result = await applySuggestedAction(user, body.studentId);
    return NextResponse.json(result);
  });
}
