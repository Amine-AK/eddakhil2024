"use client";

import { useEffect, useState } from "react";

type EntryDecisionRules = {
  justificationWindowHours: number;
  conductDeductionUnjustifiedAbsence: number;
  repeatedAbsenceThresholdOccurrences: number;
  repeatedAbsenceLookbackDays: number;
  conductReviewThreshold: number;
};

type LadderRung = { minDays: number; maxDays: number | null; action: string; isHold: boolean };

const RULE_LABELS: Record<keyof EntryDecisionRules, string> = {
  justificationWindowHours: "مهلة تقديم المبرر (ساعة)",
  conductDeductionUnjustifiedAbsence: "خصم نقاط السلوك عن الغياب غير المبرر",
  repeatedAbsenceThresholdOccurrences: "عدد مرات الغياب المتكرر قبل المراجعة",
  repeatedAbsenceLookbackDays: "نطاق البحث عن الغياب المتكرر (يوم)",
  conductReviewThreshold: "حد نقاط السلوك لتفعيل المراجعة",
};

const ACTION_OPTIONS = [
  "VERBAL_WARNING",
  "FIRST_PARENT_NOTICE",
  "SECOND_PARENT_NOTICE",
  "FORMAL_REPRIMAND",
  "DROPPED_OUT_REFERRAL",
  "SUSPENSION",
  "HOLD",
];

export function AdminConfigClient() {
  const [rules, setRules] = useState<EntryDecisionRules | null>(null);
  const [ladder, setLadder] = useState<LadderRung[]>([]);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/config")
      .then((r) => r.json())
      .then((d) => {
        setRules(d.entryDecisionRules);
        setLadder(d.disciplinaryLadder);
      });
  }, []);

  async function saveRules() {
    if (!rules) return;
    await fetch("/api/admin/config/entry-decision", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rules),
    });
    setSavedMessage("تم حفظ قواعد قرار الدخول");
    setTimeout(() => setSavedMessage(null), 2000);
  }

  async function saveLadder() {
    await fetch("/api/admin/config/disciplinary-ladder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ladder),
    });
    setSavedMessage("تم حفظ سلم الإجراءات التأديبية");
    setTimeout(() => setSavedMessage(null), 2000);
  }

  function updateRung(index: number, patch: Partial<LadderRung>) {
    setLadder((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  if (!rules) return <p className="p-4 text-slate-400">جارٍ التحميل...</p>;

  return (
    <div className="space-y-4">
      {savedMessage && <div className="rounded-lg bg-green-100 p-2 text-center text-sm text-green-800">{savedMessage}</div>}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-700">قواعد قرار الدخول</h3>
        <div className="space-y-2">
          {(Object.keys(RULE_LABELS) as (keyof EntryDecisionRules)[]).map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600">{RULE_LABELS[key]}</span>
              <input
                type="number"
                value={rules[key]}
                onChange={(e) => setRules({ ...rules, [key]: Number(e.target.value) })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-left"
              />
            </label>
          ))}
        </div>
        <button onClick={saveRules} className="tap-target mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
          حفظ
        </button>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-700">سلم الإجراءات التأديبية (أيام الغياب المتتالية)</h3>
        <div className="space-y-2">
          {ladder.map((rung, i) => (
            <div key={i} className="grid grid-cols-4 items-center gap-2 text-sm">
              <input
                type="number"
                value={rung.minDays}
                onChange={(e) => updateRung(i, { minDays: Number(e.target.value) })}
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                placeholder="من"
              />
              <input
                type="number"
                value={rung.maxDays ?? ""}
                onChange={(e) => updateRung(i, { maxDays: e.target.value ? Number(e.target.value) : null })}
                className="rounded-lg border border-slate-300 px-2 py-1.5"
                placeholder="إلى (اختياري)"
              />
              <select
                value={rung.action}
                onChange={(e) => updateRung(i, { action: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-1.5"
              >
                {ACTION_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={rung.isHold} onChange={(e) => updateRung(i, { isHold: e.target.checked })} />
                حجز
              </label>
            </div>
          ))}
        </div>
        <button onClick={saveLadder} className="tap-target mt-3 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
          حفظ السلم
        </button>
      </div>
    </div>
  );
}
