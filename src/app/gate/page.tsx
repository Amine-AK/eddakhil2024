import { requireRole } from "@/lib/auth/session";
import { AppHeader } from "@/components/app-header";
import { GateKiosk } from "@/app/gate/gate-kiosk";

export default async function GatePage() {
  const user = await requireRole("GATE", "ADMIN");
  return (
    <>
      <AppHeader title="بوابة الدخول" userName={user.name} />
      <main className="mx-auto max-w-2xl p-3">
        <GateKiosk />
      </main>
    </>
  );
}
