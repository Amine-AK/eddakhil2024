import { requireRole } from "@/lib/auth/session";
import { getTeacherSession } from "@/features/attendance/service";
import { AppHeader } from "@/components/app-header";
import { RosterClient } from "@/app/teacher/roster-client";

export default async function TeacherPage() {
  const user = await requireRole("TEACHER", "ADMIN");
  const session = await getTeacherSession(user);

  return (
    <>
      <AppHeader title="تسجيل الحضور" userName={user.name} />
      <main className="mx-auto max-w-lg p-3">
        {session.state === "NO_ACTIVE_PERIOD" && <EmptyState message="لا توجد حصة جارية الآن." />}
        {session.state === "NOT_SCHEDULED" && <EmptyState message="لا يوجد جدول لك في هذه الحصة." />}
        {session.state === "READY" && <RosterClient initial={session} />}
      </main>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500">{message}</div>
  );
}
