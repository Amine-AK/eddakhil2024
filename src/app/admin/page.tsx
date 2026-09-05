import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import { AdminConfigClient } from "@/app/admin/config-client";

export default async function AdminPage() {
  const user = await requireRole("ADMIN");
  return (
    <>
      <AppHeader title="لوحة الإدارة" userName={user.name} />
      <main className="mx-auto max-w-2xl p-3">
        <AdminConfigClient />
      </main>
    </>
  );
}
