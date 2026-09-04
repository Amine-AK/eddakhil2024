import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  SUPERVISOR: "/supervisor",
  TEACHER: "/teacher",
  GATE: "/gate",
  READONLY: "/supervisor",
};

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(ROLE_HOME[user.role] ?? "/login");
}
