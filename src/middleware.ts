import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

const ROLE_HOME: Record<Role, string> = {
  ADMIN: "/admin",
  SUPERVISOR: "/supervisor",
  TEACHER: "/teacher",
  GATE: "/gate",
  READONLY: "/supervisor",
};

// Server-side route → allowed-roles map. UI hiding is never sufficient on its
// own; this is the actual enforcement layer for page access.
const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/teacher", roles: ["TEACHER", "ADMIN"] },
  { prefix: "/gate", roles: ["GATE", "ADMIN"] },
  { prefix: "/supervisor", roles: ["SUPERVISOR", "ADMIN", "READONLY"] },
  { prefix: "/admin", roles: ["ADMIN"] },
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const role = token?.role as Role | undefined;
    const path = req.nextUrl.pathname;

    const rule = ROUTE_ROLES.find((r) => path.startsWith(r.prefix));
    if (rule && role && !rule.roles.includes(role)) {
      const home = ROLE_HOME[role] ?? "/login";
      return NextResponse.redirect(new URL(home, req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: "/login" },
  },
);

export const config = {
  matcher: ["/teacher/:path*", "/gate/:path*", "/supervisor/:path*", "/admin/:path*"],
};
