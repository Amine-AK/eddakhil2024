# Deployment

## Prerequisites

- Docker + Docker Compose v2
- (Local dev only) Node.js 22+ and a local PostgreSQL 15+ if you prefer running the app outside Docker

## First run

```bash
cp .env.example .env
# Edit .env: set a real NEXTAUTH_SECRET (openssl rand -base64 32) and, in
# production, NEXTAUTH_URL to the site's real https URL.

docker compose up --build
```

This starts Postgres (not exposed to the host or the internet — only reachable
from the `app` container on the compose network) and the Next.js app. On
container start the app runs `prisma migrate deploy` automatically before
serving traffic.

The app is now at http://localhost:3000.

## Seeding demo data

Seeding is not run automatically in the production image (it creates demo
users/students and is meant for development and evaluation, not production
data). Run it once, from the host, against the running stack:

```bash
docker compose exec app npx prisma db seed
```

This creates one login per role, all with the password `Passw0rd!`
(`admin@school.test`, `supervisor@school.test`, `gate@school.test`,
`teacher1@school.test`..`teacher5@school.test`, `readonly@school.test`),
plus classes, students, a weekly schedule, and a few example attendance /
justification / disciplinary scenarios. **Change or remove these accounts
before using real student data.**

## Local (non-Docker) development

```bash
npm install
# Point DATABASE_URL in .env at a local Postgres instance
npm run db:migrate
npm run db:seed
npm run dev
```

## Environment variables

See `.env.example` for the full list. The only two you must set for a real
deployment:

- `DATABASE_URL` — Postgres connection string (set automatically by
  `docker-compose.yml` for the `app` service; only needed manually for local
  dev)
- `NEXTAUTH_SECRET` — random 32-byte secret used to sign session tokens.
  Never reuse the value from `.env.example`.

## Backups

```bash
./scripts/backup.sh            # writes backups/school_attendance-<timestamp>.sql.gz
./scripts/restore.sh backups/school_attendance-<timestamp>.sql.gz
```

Run backups on a schedule (cron/systemd timer) outside the container, since
Docker volumes alone are not a substitute for off-host backups.

## Network & security notes

- Postgres is never published to the host (`expose`, not `ports`, in
  `docker-compose.yml`) and must stay that way — the database must not be
  reachable from outside the Docker network, let alone the internet.
- The app container itself has no TLS termination. Put it behind a reverse
  proxy (Caddy, nginx, Traefik) that terminates TLS and forwards to
  `app:3000`; set `NEXTAUTH_URL` to the proxy's https URL so cookies are
  marked secure.
- This is designed as a LAN-first deployment (one school, one server). It
  has not been load-tested and makes no attempt at multi-region or
  high-availability deployment — that is out of scope for the MVP.
- Rotate `NEXTAUTH_SECRET` and all seeded demo passwords before exposing the
  deployment to real users.

## Production build/test checklist

Run before every deploy:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

`npm test` requires a reachable `DATABASE_URL` (integration tests exercise
the real database). Point it at a disposable Postgres instance, never at
production data.
