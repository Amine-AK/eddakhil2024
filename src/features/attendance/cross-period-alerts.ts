export type AttendanceEventLike = {
  id: string;
  studentId: string;
  status: "PRESENT" | "ABSENT" | "LATE";
  segment: "FULL" | "HOUR_1" | "HOUR_2";
};

export type AlertCandidate = { studentId: string; sourceEventId: string };

/**
 * Pure decision: given the previous period's attendance events for a class,
 * which students should raise a cross-period alert for the next period?
 *
 * A FULL-segment absence inside a paired double lesson already declares the
 * student absent for both hours, so it is excluded here — re-alerting the
 * same teacher about their own just-made declaration is noise. A HOUR_1
 * (or ordinary single-period) absence must still alert the next period:
 * per spec, a first-hour absence must never be silently assumed to carry
 * into the second hour.
 */
export function computeAlertCandidates(
  previousPeriodEvents: AttendanceEventLike[],
  isPairedDoubleLesson: boolean,
): AlertCandidate[] {
  return previousPeriodEvents
    .filter((e) => e.status === "ABSENT")
    .filter((e) => !(isPairedDoubleLesson && e.segment === "FULL"))
    .map((e) => ({ studentId: e.studentId, sourceEventId: e.id }));
}

/**
 * Reduces a stream of attendance events (possibly several corrections over
 * time for the same student/segment) down to the latest declared status
 * per student, keyed by (studentId, segment). Attendance history is never
 * deleted, so "current status" is always derived, never stored directly.
 */
export function latestStatusByStudentSegment<
  T extends { studentId: string; segment: string; createdAt: Date },
>(events: T[]): Map<string, T> {
  const latest = new Map<string, T>();
  for (const event of events) {
    const key = `${event.studentId}:${event.segment}`;
    const current = latest.get(key);
    if (!current || event.createdAt > current.createdAt) {
      latest.set(key, event);
    }
  }
  return latest;
}
