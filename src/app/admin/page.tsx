import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function AdminPage() {
  const user = await requireRole("ADMIN");
  return (
    <>
      <AppHeader title="لوحة الإدارة" userName={user.name} />
      <main className="p-4 text-slate-600">قريباً: إدارة القواعد، السنة الدراسية، المستخدمين.</main>
    </>
  );
}
