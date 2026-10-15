# Kanbit

Kanbit is an installable web app (PWA) that helps student teams run their weekly sprint in class: a Kanban board with one row per teammate, moderator validation of cards, a daily phone check-in, and a projected stand-up meeting with a 15-minute timer. The teacher sees every team's board and whether today's meeting happened. The full specification is in [`spec.md`](spec.md).

## Stack

| Part | Tech | Deploy |
|---|---|---|
| `apps/web` | React 19, Vite 8, Tailwind 4, vite-plugin-pwa, TanStack Query, React Router | Vercel (`kanbit.app`) |
| `apps/api` | Node, Express 5, Prisma 7 (PostgreSQL), zod, pino | Railway (`api.kanbit.app`) |
| `packages/shared` | zod enums and DTOs shared by both apps | — |

## Prerequisites

- Node.js 22.12+ (see `.nvmrc`)
- pnpm 12 (`corepack enable` picks the version from `package.json`)
- Docker (for the local PostgreSQL)

## Local setup

```sh
pnpm install                              # also generates the Prisma client
docker compose up -d                      # PostgreSQL 17 on localhost:5433
cp apps/api/.env.example apps/api/.env    # local defaults already point at docker compose
pnpm --filter @kanbit/api db:migrate      # apply migrations
pnpm dev                                  # API on :3000, web on :5173 (proxies /api)
```

Open http://localhost:5173 — the home page shows the API and database health.

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | API (tsx watch) and web (Vite) in parallel |
| `pnpm build` | Builds every package (`prisma generate` + tsup for the API, Vite for the web) |
| `pnpm test` | Vitest in every package (no database needed) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm --filter @kanbit/api db:migrate` | Create/apply a migration in development |
| `pnpm --filter @kanbit/web icons` | Regenerate the placeholder PWA icons |

## Deploy

Domains and cookies (spec §13.1): the web runs on `kanbit.app` and the API on `api.kanbit.app` so the session cookie (`Domain=.kanbit.app`, `HttpOnly`, `Secure`, `SameSite=Lax`) is first-party, including in installed PWAs on iOS.

**Railway (API + PostgreSQL)**

- Add a PostgreSQL service (enable backups) and an API service from this repo.
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @kanbit/api build`
- Start command: `pnpm --filter @kanbit/api start` (runs `prisma migrate deploy`, then `node dist/index.js`)
- Health check path: `/api/v1/health`
- Variables: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_DOMAIN=.kanbit.app`, `CORS_ORIGIN=https://kanbit.app`, `NODE_ENV=production`, optional `SEED_TEACHER_USERNAME` / `SEED_TEACHER_PASSWORD` (see `apps/api/.env.example`).
- Custom domain `api.kanbit.app`; add the `CNAME api` record Railway shows in Vercel DNS.

**Vercel (web)**

- Root directory: `apps/web`, framework preset Vite.
- Variable: `VITE_API_URL=https://api.kanbit.app/api/v1`.
- `apps/web/vercel.json` rewrites all routes to `/index.html` and serves `sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache`.
- Domain `kanbit.app` (with `www.kanbit.app` redirecting to it).
