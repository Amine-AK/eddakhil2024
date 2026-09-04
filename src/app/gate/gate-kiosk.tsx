"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";

type SearchResult = { id: string; firstName: string; lastName: string; massarCode: string | null; className: string };

type TimelineEntry = {
  periodName: string;
  subjectName: string;
  status: string;
  reason: string | null;
  note: string | null;
  recordedAt: string;
};

type JustificationView = {
  id: string;
  status: string;
  absenceDate: string;
  reasonText: string;
  parentPresent: boolean;
  submittedAt: string;
};

type Decision = "AUTO_ALLOWED" | "ADMIN_REVIEW" | "DENIED";

type StudentView = {
  student: { id: string; firstName: string; lastName: string; massarCode: string | null; className: string };
  timeline: TimelineEntry[];
  justifications: JustificationView[];
  disciplinary: { hasActiveHold: boolean; hasActiveSuspension: boolean; conductScore: number };
  decision: { decision: Decision; reasons: string[]; actions: string[] };
};

const DECISION_LABELS: Record<Decision, { text: string; className: string }> = {
  AUTO_ALLOWED: { text: "مسموح تلقائياً", className: "bg-green-100 text-green-800 border-green-300" },
  ADMIN_REVIEW: { text: "يتطلب مراجعة الإدارة", className: "bg-orange-100 text-orange-800 border-orange-300" },
  DENIED: { text: "دخول ممنوع", className: "bg-red-100 text-red-800 border-red-300" },
};

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GateKiosk() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [view, setView] = useState<StudentView | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [overrideDecision, setOverrideDecision] = useState<Decision>("AUTO_ALLOWED");
  const [overrideReason, setOverrideReason] = useState("");
  const [parentPresent, setParentPresent] = useState(false);
  const [issueResult, setIssueResult] = useState<{ finalDecision: Decision; overridden: boolean } | null>(null);
  const [justificationText, setJustificationText] = useState("");
  const [justificationSaved, setJustificationSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const res = await fetch(`/api/gate/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function selectStudent(id: string) {
    setResults([]);
    setQuery("");
    setIssueResult(null);
    setOverriding(false);
    setJustificationSaved(false);
    setJustificationText("");
    setParentPresent(false);
    const res = await fetch(`/api/gate/students/${id}`);
    if (res.ok) setView(await res.json());
  }

  async function handleIssue() {
    if (!view) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gate/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: view.student.id,
          dateKey: todayKey(),
          parentPresent,
          idempotencyKey: crypto.randomUUID(),
          ...(overriding ? { overrideFinalDecision: overrideDecision, overrideReason } : {}),
        }),
      });
      if (res.ok) {
        setIssueResult(await res.json());
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleJustification() {
    if (!view || !justificationText.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/gate/justifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: view.student.id,
          absenceDateKey: todayKey(),
          reasonText: justificationText,
          parentPresent,
        }),
      });
      if (res.ok) setJustificationSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو رمز مسار أو القسم..."
          autoFocus
          className="tap-target w-full rounded-xl border border-slate-300 px-4 py-3 text-lg focus:border-blue-600 focus:outline-none"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
            {results.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => selectStudent(r.id)}
                  className="tap-target flex w-full items-center justify-between px-4 py-3 text-right hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-800">
                    {r.lastName} {r.firstName}
                  </span>
                  <span className="text-sm text-slate-400">
                    {r.className} {r.massarCode ? `· ${r.massarCode}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {view && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h2 className="text-lg font-bold text-slate-800">
              {view.student.lastName} {view.student.firstName}
            </h2>
            <p className="text-sm text-slate-500">
              {view.student.className} {view.student.massarCode ? `· ${view.student.massarCode}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
                نقاط السلوك: {view.disciplinary.conductScore}
              </span>
              {view.disciplinary.hasActiveSuspension && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">إيقاف نشط</span>
              )}
              {view.disciplinary.hasActiveHold && (
                <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">حجز تأديبي نشط</span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-semibold text-slate-700">سجل اليوم</h3>
            {view.timeline.length === 0 ? (
              <p className="text-sm text-slate-400">لا توجد حصص مسجلة اليوم بعد.</p>
            ) : (
              <ul className="space-y-1.5">
                {view.timeline.map((t, i) => (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">
                      {t.periodName} · {t.subjectName}
                    </span>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className={`rounded-xl border p-4 ${DECISION_LABELS[view.decision.decision].className}`}>
            <p className="text-lg font-bold">{DECISION_LABELS[view.decision.decision].text}</p>
            <ul className="mt-1 list-inside list-disc text-sm">
              {view.decision.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>

          {!issueResult ? (
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <label className="mb-3 flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={parentPresent}
                  onChange={(e) => setParentPresent(e.target.checked)}
                />
                ولي الأمر حاضر
              </label>

              <button
                onClick={handleIssue}
                disabled={busy || (overriding && !overrideReason.trim())}
                className="tap-target w-full rounded-xl bg-blue-700 py-3 text-base font-bold text-white disabled:opacity-50"
              >
                إصدار تصريح الدخول
              </button>

              <button
                onClick={() => setOverriding((v) => !v)}
                className="tap-target mt-2 w-full rounded-xl border border-slate-300 py-2 text-sm text-slate-600"
              >
                {overriding ? "إلغاء التعديل" : "تعديل القرار يدوياً"}
              </button>

              {overriding && (
                <div className="mt-3 space-y-2">
                  <div className="flex gap-2">
                    {(["AUTO_ALLOWED", "ADMIN_REVIEW", "DENIED"] as Decision[]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setOverrideDecision(d)}
                        className={`tap-target flex-1 rounded-lg border py-2 text-xs font-semibold ${
                          overrideDecision === d ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {DECISION_LABELS[d].text}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="سبب التعديل (إلزامي)"
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                    rows={2}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-center">
              <p className="font-bold text-blue-900">
                تم إصدار التصريح: {DECISION_LABELS[issueResult.finalDecision].text}
                {issueResult.overridden ? " (معدَّل يدوياً)" : ""}
              </p>
              <button
                onClick={() => {
                  setView(null);
                  setIssueResult(null);
                }}
                className="tap-target mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
              >
                بحث جديد
              </button>
            </div>
          )}

          <div className="rounded-xl bg-white p-4 shadow-sm">
            <h3 className="mb-2 font-semibold text-slate-700">إضافة مبرر غياب</h3>
            {justificationSaved ? (
              <p className="text-sm text-green-700">تم تسجيل المبرر بنجاح، بانتظار مراجعة الإدارة.</p>
            ) : (
              <>
                <textarea
                  value={justificationText}
                  onChange={(e) => setJustificationText(e.target.value)}
                  placeholder="سبب الغياب..."
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm"
                  rows={2}
                />
                <button
                  onClick={handleJustification}
                  disabled={busy || !justificationText.trim()}
                  className="tap-target mt-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  حفظ المبرر
                </button>
              </>
            )}
            {view.justifications.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                {view.justifications.map((j) => (
                  <li key={j.id}>
                    {j.absenceDate} — {j.reasonText} ({j.status})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
