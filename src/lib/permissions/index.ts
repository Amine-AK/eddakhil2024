import { prisma } from "@/lib/db/client";
import { AuthError } from "@/lib/auth/session";
import type { SessionUser } from "@/types";

/**
 * Verifies a TEACHER user actually owns the given schedule slot before
 * letting them touch attendance for it. ADMIN/SUPERVISOR bypass the
 * ownership check (they can act on any class); GATE/READONLY are never
 * allowed here regardless of ownership.
 */
export async function assertTeacherOwnsSchedule(user: SessionUser, scheduleId: string): Promise<void> {
  if (user.role === "ADMIN" || user.role === "SUPERVISOR") return;
  if (user.role !== "TEACHER" || !user.teacherId) {
    throw new AuthError("Only teachers may record attendance", 403);
  }
  const schedule = await prisma.schedule.findUnique({ where: { id: scheduleId } });
  if (!schedule || schedule.teacherId !== user.teacherId) {
    throw new AuthError("You are not assigned to this class/period", 403);
  }
}
