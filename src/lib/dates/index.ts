const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || "Africa/Casablanca";

export type SchoolLocalParts = {
  weekday: number; // 0=Sunday .. 6=Saturday
  dateKey: string; // YYYY-MM-DD in school-local calendar
  timeMinutes: number; // minutes since local midnight
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** Resolves "now" (or any instant) to school-local calendar date / weekday / minute-of-day. */
export function schoolLocalParts(date: Date = new Date()): SchoolLocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIMEZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const hour = Number(map.hour);
  const minute = Number(map.minute);

  return {
    weekday: WEEKDAY_INDEX[map.weekday ?? "Sun"] ?? 0,
    dateKey: `${map.year}-${map.month}-${map.day}`,
    timeMinutes: hour * 60 + minute,
  };
}

/** Converts a YYYY-MM-DD date key to a UTC-midnight Date, matching Prisma's @db.Date storage. */
export function dateKeyToUtcDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

export function timeStringToMinutes(hhmm: string): number {
  const parts = hhmm.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  return h * 60 + m;
}

export function hoursBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60);
}
