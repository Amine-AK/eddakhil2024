const LABELS: Record<string, { text: string; className: string; icon: string }> = {
  PRESENT: { text: "حاضر", className: "bg-green-100 text-green-800 border-green-300", icon: "✓" },
  ABSENT: { text: "غائب", className: "bg-red-100 text-red-800 border-red-300", icon: "✕" },
  LATE: { text: "متأخر", className: "bg-amber-100 text-amber-800 border-amber-300", icon: "!" },
  REVIEW: { text: "مراجعة", className: "bg-orange-100 text-orange-800 border-orange-300", icon: "⚠" },
  UNRECORDED: { text: "غير مسجل", className: "bg-slate-100 text-slate-600 border-slate-300", icon: "–" },
};

export function StatusBadge({ status }: { status: keyof typeof LABELS | string }) {
  const cfg = LABELS[status] ?? LABELS.UNRECORDED!;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.className}`}
    >
      <span aria-hidden>{cfg.icon}</span>
      {cfg.text}
    </span>
  );
}
