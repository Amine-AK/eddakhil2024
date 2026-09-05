import { timeStringToMinutes } from "@/lib/dates";

export type PeriodLike = {
  id: string;
  order: number;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  name: string;
};

/** Pure function: which period (if any) contains the given minute-of-day. */
export function findCurrentPeriod(periods: PeriodLike[], nowMinutes: number): PeriodLike | null {
  for (const period of periods) {
    const start = timeStringToMinutes(period.startTime);
    const end = timeStringToMinutes(period.endTime);
    if (nowMinutes >= start && nowMinutes < end) return period;
  }
  return null;
}

/** Pure function: the period immediately preceding `current` by schedule order. */
export function findPreviousPeriod(periods: PeriodLike[], current: PeriodLike): PeriodLike | null {
  const sorted = [...periods].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((p) => p.id === current.id);
  if (idx <= 0) return null;
  return sorted[idx - 1] ?? null;
}
