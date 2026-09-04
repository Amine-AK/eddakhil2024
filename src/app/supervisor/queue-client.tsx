"use client";

import { useEffect, useState } from "react";

type PendingJustification = {
  id: string;
  studentName: string;
  className: string;
  absenceDate: string;
  reasonText: string;
  parentPresent: boolean;
  submittedAt: string;
};

type AtRiskStudent = {
  student: { id: string; firstName: string; lastName: string; className: string };
  consecutiveDays: number;
  rung: { action: string; isHold: boolean };
};

type ActiveHold = {
  id: string;
  studentName: string;
  className: string;
  type: string;
  reason: string;
  createdAt: string;
};

type Queue = {
  pendingJustifications: PendingJustification[];
  atRiskStudents: AtRiskStudent[];
  activeHolds: ActiveHold[];
};

type AuditRow = {
  id: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string;
  reason: string | null;
  createdAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  VERBAL_WARNING: "تنبيه شفوي",
  FIRST_PARENT_NOTICE: "إشعار أول لولي الأمر",
  SECOND_PARENT_NOTICE: "إشعار ثانٍ لولي الأمر",
  FORMAL_REPRIMAND: "توبيخ رسمي",
  DROPPED_OUT_REFERRAL: "إحالة انقطاع عن الدراسة",
  SUSPENSION: "إيقاف",
  HOLD: "حجز تأديبي",
};

export function SupervisorQueueClient({ canAct }: { canAct: boolean }) {
  const [tab, setTab] = useState<"queue" | "audit">("queue");
  const [queue, setQueue] = useState<Queue | null>(null);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadQueue() {
    const res = await fetch("/api/supervisor/queue");
    if (res.ok) setQueue(await res.json());
  }

  useEffect(() => {
    loadQueue();
  }, []);

  useEffect(() => {
    if (tab === "audit") {
      fetch("/api/supervisor/audit")
        .then((r) => r.json())
        .then((d) => setAudit(d.logs));
    }
  }, [tab]);

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(id);
    try {
      await fetch(`/api/supervisor/justifications/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await loadQueue();
    } finally {
      setBusy(null);
    }
  }

  async function applySuggested(studentId: string) {
    setBusy(studentId);
    try {
      await fetch("/api/supervisor/disciplinary/apply-suggested", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      await loadQueue();
    } finally {
      setBusy(null);
    }
  }

  async function release(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/supervisor/disciplinary/${id}/release`, { method: "POST" });
      await loadQueue();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab("queue")}
          className={`tap-target rounded-lg px-4 py-2 text-sm font-semibold ${tab === "queue" ? "bg-blue-700 text-white" : "bg-white text-slate-600"}`}
        >
          قائمة المراجعة
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`tap-target rounded-lg px-4 py-2 text-sm font-semibold ${tab === "audit" ? "bg-blue-700 text-white" : "bg-white text-slate-600"}`}
        >
          سجل التدقيق
        </button>
      </div>

      {tab === "queue" && queue && (
        <div className="space-y-4">
          <Section title="مبررات بانتظار المراجعة" empty={queue.pendingJustifications.length === 0}>
            {queue.pendingJustifications.map((j) => (
              <li key={j.id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-medium text-slate-800">
                  {j.studentName} · {j.className}
                </p>
                <p className="text-sm text-slate-500">
                  {j.absenceDate} — {j.reasonText} {j.parentPresent ? "(ولي الأمر حاضر)" : ""}
                </p>
                {canAct && (
                  <div className="mt-2 flex gap-2">
                    <button
                      disabled={busy === j.id}
                      onClick={() => decide(j.id, "APPROVED")}
                      className="tap-target rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      قبول
                    </button>
                    <button
                      disabled={busy === j.id}
                      onClick={() => decide(j.id, "REJECTED")}
                      className="tap-target rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                )}
              </li>
            ))}
          </Section>

          <Section title="حالات تستدعي إجراءً تأديبياً" empty={queue.atRiskStudents.length === 0}>
            {queue.atRiskStudents.map((a) => (
              <li key={a.student.id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-medium text-slate-800">
                  {a.student.lastName} {a.student.firstName} · {a.student.className}
                </p>
                <p className="text-sm text-slate-500">
                  {a.consecutiveDays} يوم غياب متتالٍ غير مبرر — الإجراء المقترح:{" "}
                  {ACTION_LABELS[a.rung.action] ?? a.rung.action}
                  {a.rung.isHold ? " (حجز)" : ""}
                </p>
                {canAct && (
                  <button
                    disabled={busy === a.student.id}
                    onClick={() => applySuggested(a.student.id)}
                    className="tap-target mt-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    تطبيق الإجراء
                  </button>
                )}
              </li>
            ))}
          </Section>

          <Section title="حالات حجز تأديبي نشطة" empty={queue.activeHolds.length === 0}>
            {queue.activeHolds.map((h) => (
              <li key={h.id} className="rounded-lg border border-slate-100 p-3">
                <p className="font-medium text-slate-800">
                  {h.studentName} · {h.className}
                </p>
                <p className="text-sm text-slate-500">
                  {ACTION_LABELS[h.type] ?? h.type} — {h.reason}
                </p>
                {canAct && (
                  <button
                    disabled={busy === h.id}
                    onClick={() => release(h.id)}
                    className="tap-target mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    رفع الحجز
                  </button>
                )}
              </li>
            ))}
          </Section>
        </div>
      )}

      {tab === "audit" && (
        <div className="overflow-x-auto rounded-xl bg-white p-3 shadow-sm">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="p-2">الوقت</th>
                <th className="p-2">المستخدم</th>
                <th className="p-2">الإجراء</th>
                <th className="p-2">الكائن</th>
                <th className="p-2">السبب</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id} className="border-b border-slate-50">
                  <td className="p-2 text-slate-400">{new Date(row.createdAt).toLocaleString("ar-MA")}</td>
                  <td className="p-2">{row.actorName}</td>
                  <td className="p-2">{row.action}</td>
                  <td className="p-2 text-slate-500">
                    {row.entity}#{row.entityId.slice(0, 8)}
                  </td>
                  <td className="p-2 text-slate-500">{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <h3 className="mb-2 font-semibold text-slate-700">{title}</h3>
      {empty ? (
        <p className="text-sm text-slate-400">لا توجد عناصر حالياً.</p>
      ) : (
        <ul className="space-y-2">{children}</ul>
      )}
    </div>
  );
}
