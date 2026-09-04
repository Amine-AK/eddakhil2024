"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { REMOVAL_REASONS } from "@/lib/validation/attendance";

type Status = "PRESENT" | "ABSENT" | "LATE";
type Segment = "FULL" | "HOUR_1" | "HOUR_2";

type RosterStudent = {
  id: string;
  firstName: string;
  lastName: string;
  massarCode: string | null;
  status: Status | null;
  note: string | null;
};

type AlertView = {
  id: string;
  studentId: string;
  studentName: string;
  sourceSubject: string;
  sourcePeriodName: string;
};

type ReadySession = {
  state: "READY";
  scheduleId: string;
  className: string;
  subjectName: string;
  periodName: string;
  isDouble: boolean;
  dateKey: string;
  alreadyRecorded: boolean;
  students: RosterStudent[];
  alerts: AlertView[];
};

const REASON_LABELS: Record<(typeof REMOVAL_REASONS)[number], string> = {
  DISRUPTIVE_BEHAVIOR: "سلوك مخل بالنظام",
  MISSING_MATERIALS: "عدم إحضار الأدوات",
  DISRESPECT: "قلة احترام",
  SAFETY_CONCERN: "مخاوف تتعلق بالسلامة",
  OTHER: "سبب آخر",
};

type SyncStatus = "idle" | "saving" | "synced" | "failed";

export function RosterClient({ initial }: { initial: ReadySession }) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(() =>
    Object.fromEntries(initial.students.map((s) => [s.id, s.status ?? "PRESENT"])),
  );
  const [segment, setSegment] = useState<Segment>("FULL");
  const [alerts, setAlerts] = useState<AlertView[]>(initial.alerts);
  const [sync, setSync] = useState<SyncStatus>("idle");
  const [removalTarget, setRemovalTarget] = useState<string | null>(null);

  function setStatus(studentId: string, status: Status) {
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
  }

  async function handleConfirmPresent(alertId: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    try {
      await fetch("/api/teacher/attendance/confirm-present", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId, idempotencyKey: crypto.randomUUID() }),
      });
    } catch {
      // best-effort; the alert will simply reappear on next load if this failed
    }
  }

  async function handleSave() {
    setSync("saving");
    try {
      const res = await fetch("/api/teacher/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: initial.scheduleId,
          dateKey: initial.dateKey,
          segment,
          idempotencyKey: crypto.randomUUID(),
          entries: Object.entries(statuses).map(([studentId, status]) => ({ studentId, status })),
        }),
      });
      if (!res.ok) throw new Error("save failed");
      setSync("synced");
    } catch {
      setSync("failed");
    }
  }

  async function handleRemoval(studentId: string, reasonCode: string) {
    setRemovalTarget(null);
    setStatus(studentId, "ABSENT");
    try {
      await fetch("/api/teacher/removal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleId: initial.scheduleId,
          dateKey: initial.dateKey,
          segment,
          studentId,
          reasonCode,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
    } catch {
      // will be retried by an explicit re-save; nothing to reconcile silently here
    }
  }

  return (
    <div className="pb-24">
      {alerts.length > 0 && (
        <div className="mb-3 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className="rounded-xl border border-orange-300 bg-orange-50 p-3">
              <p className="text-sm font-semibold text-orange-900">
                ⚠ {a.studentName}
              </p>
              <p className="text-xs text-orange-700">
                غائب في: {a.sourceSubject} — {a.sourcePeriodName}
              </p>
              <button
                onClick={() => handleConfirmPresent(a.id)}
                className="tap-target mt-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                حاضر الآن
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 rounded-xl bg-white p-3 shadow-sm">
        <p className="font-bold text-slate-800">{initial.className}</p>
        <p className="text-sm text-slate-500">
          {initial.subjectName} · {initial.periodName}
        </p>
        {initial.isDouble && (
          <div className="mt-2 flex gap-2">
            {(["HOUR_1", "HOUR_2", "FULL"] as Segment[]).map((seg) => (
              <button
                key={seg}
                onClick={() => setSegment(seg)}
                className={`tap-target flex-1 rounded-lg border px-2 py-2 text-sm font-medium ${
                  segment === seg ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                }`}
              >
                {seg === "HOUR_1" ? "الساعة الأولى" : seg === "HOUR_2" ? "الساعة الثانية" : "الحصة كاملة"}
              </button>
            ))}
          </div>
        )}
      </div>

      <ul className="space-y-2">
        {initial.students.map((student) => (
          <li key={student.id} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-slate-800">
                  {student.lastName} {student.firstName}
                </p>
                {student.massarCode && <p className="text-xs text-slate-400">{student.massarCode}</p>}
              </div>
              <StatusBadge status={statuses[student.id] ?? "PRESENT"} />
            </div>
            <div className="mt-2 flex gap-1.5">
              {(["PRESENT", "ABSENT", "LATE"] as Status[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(student.id, s)}
                  className={`tap-target flex-1 rounded-lg border py-2 text-sm font-semibold ${
                    statuses[student.id] === s
                      ? s === "PRESENT"
                        ? "border-green-600 bg-green-600 text-white"
                        : s === "ABSENT"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-amber-600 bg-amber-600 text-white"
                      : "border-slate-200 text-slate-500"
                  }`}
                >
                  {s === "PRESENT" ? "حاضر" : s === "ABSENT" ? "غائب" : "متأخر"}
                </button>
              ))}
              <button
                onClick={() => setRemovalTarget(removalTarget === student.id ? null : student.id)}
                className="tap-target rounded-lg border border-slate-200 px-3 text-sm text-slate-500"
              >
                إخراج
              </button>
            </div>
            {removalTarget === student.id && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REMOVAL_REASONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRemoval(student.id, r)}
                    className="tap-target rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-medium text-slate-700"
                  >
                    {REASON_LABELS[r]}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-3">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <SyncIndicator status={sync} />
          <button
            onClick={handleSave}
            disabled={sync === "saving"}
            className="tap-target flex-1 rounded-xl bg-blue-700 py-3 text-base font-bold text-white disabled:opacity-50"
          >
            {sync === "saving" ? "جارٍ الحفظ..." : "حفظ الحضور"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SyncIndicator({ status }: { status: SyncStatus }) {
  const cfg: Record<SyncStatus, { text: string; className: string }> = {
    idle: { text: "غير محفوظ", className: "text-slate-400" },
    saving: { text: "جارٍ المزامنة", className: "text-blue-600" },
    synced: { text: "تمت المزامنة", className: "text-green-600" },
    failed: { text: "فشلت المزامنة", className: "text-red-600" },
  };
  const c = cfg[status];
  return <span className={`text-xs font-medium ${c.className}`}>{c.text}</span>;
}
