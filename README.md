# School Attendance & Entry Authorization System

A LAN-first Progressive Web App that replaces the paper attendance process:
teachers record attendance per period (including double lessons), absences
raise targeted alerts for the next teacher, gate staff get a deterministic
entry recommendation per student, and supervisors handle justifications and
disciplinary escalation. Arabic-first RTL UI, French/English identifiers
where useful for staff.

Teacher attendance declarations are the source of truth — there is no
automatic presence detection, and AI is never involved in any entry,
attendance, disciplinary, or authorization decision.

## Stack

Next.js 14 (App Router) + TypeScript strict + Tailwind, Prisma + PostgreSQL,
NextAuth (credentials), Vitest (unit + integration), Playwright (E2E),
Docker Compose.

## Quick start

```bash
cp .env.example .env
docker compose up --build
docker compose exec app npx prisma db seed   # demo data, once
```

Then open http://localhost:3000 and log in as `admin@school.test` /
`Passw0rd!` (or any other seeded role — see `docs/DEPLOYMENT.md`).

See `docs/DEPLOYMENT.md` for environment variables, backups, and production
notes; see `docs/ARCHITECTURE.md` for the module layout and core domain
rules.

## Development

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev      # http://localhost:3000

npm test         # unit + integration (needs DATABASE_URL)
npm run test:e2e # Playwright, spins up its own dev server
npm run build
```
