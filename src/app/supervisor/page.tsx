import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import { SupervisorQueueClient } from "@/app/supervisor/queue-client";

export default async function SupervisorPage() {
  const user = await requireRole("SUPERVISOR", "ADMIN", "READONLY");
  return (
    <>
      <AppHeader title="لوحة الإشراف" userName={user.name} />
      <main className="mx-auto max-w-2xl p-3">
        <SupervisorQueueClient canAct={user.role !== "READONLY"} />
      </main>
    </>
  );
}
