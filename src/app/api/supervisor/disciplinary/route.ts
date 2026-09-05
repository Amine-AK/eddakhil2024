import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { createDisciplinaryAction } from "@/features/disciplinary/service";
import { createDisciplinaryActionSchema } from "@/lib/validation/supervisor";
import { apiHandler } from "@/server/http";

export async function POST(req: NextRequest) {
  return apiHandler(async () => {
    const user = await requireRole("SUPERVISOR", "ADMIN");
    const body = createDisciplinaryActionSchema.parse(await req.json());
    const result = await createDisciplinaryAction(user, body);
    return NextResponse.json(result);
  });
}
