# Architecture

Modular monolith, no microservices. Business logic lives in
`src/features/*/service.ts`, never in React components or Prisma calls
scattered across routes:

```
UI (src/app/**)
  -> Route handler (src/app/api/**) — auth check, zod validation, calls a service
    -> Service (src/features/**/service.ts) — transactions, audit logging
      -> Pure domain logic (e.g. features/decision-engine/engine.ts) — no DB, no UI
        -> Prisma (src/lib/db/client.ts)
```

Pure modules (no I/O, fully unit-testable) live alongside their DB-backed
service in the same feature folder:

- `features/attendance/period-detection.ts` — which period is "now"
- `features/attendance/cross-period-alerts.ts` — which absences raise an alert
- `features/decision-engine/engine.ts` — the entry-decision rule chain
- `features/disciplinary/ladder.ts` — consecutive-absence threshold matching

## Decision engine (`features/decision-engine/engine.ts`)

Deterministic, config-driven (`DecisionRuleConfig` row `entry_decision_rules`),
evaluated in this fixed priority order:

1. Active suspension or disciplinary hold → `DENIED`. This is the only path
   that blocks entry — everything else below issues a slip.
2. Conduct score at/below the configured review threshold, or a repeated
   unexplained-absence pattern → `ADMIN_REVIEW`.
3. Otherwise `AUTO_ALLOWED`. A same-day teacher removal adds a
   notify-supervisor note. An unjustified absence (no justification
   submitted inside the configured window) adds a conduct-score deduction —
   this never escalates the decision itself, only the conduct ledger.

Callers gather facts from the DB (`features/decision-engine/service.ts`) and
hand them to the pure function — the engine itself never touches Prisma, so
every rule combination is covered by fast unit tests
(`tests/unit/decision-engine.test.ts`).

## Disciplinary ladder (`features/disciplinary/ladder.ts`)

Config-driven (`DecisionRuleConfig` row `disciplinary_ladder`), matched as
"at least N consecutive unexplained absence school-days", not strict bands —
a gap between two configured ranges still resolves to the highest rung
already reached. `computeConsecutiveUnexplainedAbsenceDays` walks backward
over the student's actual scheduled weekdays, so a weekend or a day the
class has no lessons never breaks the streak.

## Attendance history & idempotency

Attendance events are append-only: a correction is a new row, never an
update to an old one, so nothing is ever lost after it has fed a
justification or a decision. "Current status" for a student/period is
always derived as the latest row for that (student, schedule, segment)
tuple (`features/attendance/cross-period-alerts.ts#latestStatusByStudentSegment`
/ `#latestPerPeriod`).

Every mutating request the client can retry — teacher save, teacher
removal, confirm-present, gate entry issuance — carries a client-generated
idempotency key. Retrying with the same key upserts onto the same row
instead of creating a duplicate; the offline queue
(`src/lib/offline/sync.ts`) relies on exactly this to be safe to resend.

## RBAC

Enforced server-side in two layers, both required:

- `src/middleware.ts` — maps route prefix (`/teacher`, `/gate`,
  `/supervisor`, `/admin`) to allowed roles; redirects otherwise.
- `requireRole()` (`src/lib/auth/session.ts`) inside every route
  handler/page, plus `assertTeacherOwnsSchedule()`
  (`src/lib/permissions`) for resource-level scoping (a teacher can only
  touch attendance for a schedule they are actually assigned to; ADMIN
  bypasses, GATE/READONLY are always rejected there).

UI never hides a button as its only access control — every mutation is
re-checked server-side regardless of what the client sent.

## Audit log

Append-only from the application's perspective (`features/audit/service.ts`
only ever inserts). Every state-changing service call writes one row inside
the same transaction as its mutation: attendance saves/removals, alert
acknowledgement, justification decisions, disciplinary actions, entry
decisions and overrides, and config changes.
