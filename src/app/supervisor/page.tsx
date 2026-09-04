import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";

export default async function SupervisorPage() {
  const user = await requireRole("SUPERVISOR", "ADMIN", "READONLY");
  return (
    <>
      <AppHeader title="لوحة الإشراف" userName={user.name} />
      <main className="p-4 text-slate-600">قريباً: قائمة المراجعة، المبررات، الإجراءات التأديبية.</main>
    </>
  );
}
