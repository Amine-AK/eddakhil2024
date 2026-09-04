import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import type { SessionUser } from "@/types";
import type { Role } from "@prisma/client";

export class AuthError extends Error {
  constructor(
    message: string,
    public status: 401 | 403 = 401,
  ) {
    super(message);
  }
}

/** Reads the authenticated user from the server-side session. Never trust client-supplied identity. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name ?? "",
    role: session.user.role,
    teacherId: session.user.teacherId,
  };
}

/** Throws AuthError(401) if unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Authentication required", 401);
  return user;
}

/** Throws AuthError(401/403) unless the user is authenticated and holds one of the allowed roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(`Requires role: ${roles.join(", ")}`, 403);
  }
  return user;
}
