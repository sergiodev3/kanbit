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

Open http://localhost:5173 and sign in; `/status` shows the API and database health.

### Teacher account

There is no teacher sign-up: the teacher is seeded from `SEED_TEACHER_USERNAME`, `SEED_TEACHER_PASSWORD` (8+ characters) and optional `SEED_TEACHER_NAME` in `apps/api/.env`.

```sh
pnpm --filter @kanbit/api db:seed         # creates the teacher if it does not exist (idempotent)
```

The API also runs the same idempotent seed at boot whenever those variables are set, so production only needs them in the Railway variables. A seed username that already belongs to a student is an error.

## Phase 1: accounts, groups and teams

**Session.** Login and registration set one `kanbit_session` cookie: a 7-day JWT, `HttpOnly`, `SameSite=Lax`, `Secure` in production, and `Domain=COOKIE_DOMAIN` when that variable is set (`.kanbit.app` in production, unset locally). There are no refresh tokens. Failed logins answer one generic 401, and login/registration are rate limited per IP.

**Teacher flow.**

1. Sign in as the seeded teacher; `/teacher` lists your groups. Create one.
2. Open the group: copy the registration link (`https://kanbit.app/register?code=XXXXXX`) and share it. You can regenerate the code (the old one stops working) and open or close registration.
3. Students register with the link (name, username, password). They land on "Mi equipo" with no team yet.
4. Create teams and tick their members; ticking a student from another team moves them. Pick the moderator (the first member is the default).
5. Add projects per team. The moderator can also create and rename them from "Mi equipo"; other members see the list.

Forgotten passwords: the teacher presses "Restablecer contraseña" next to the student and reads out the temporary password, which is shown once. Students change it in "Mi perfil".

**API endpoints** (prefix `/api/v1`; errors are `{ error: { code, message, details? } }`):

| Endpoint | Who |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` | anyone / signed in |
| `POST /users/:id/reset-password` → `{ temporaryPassword }` | teacher of the student's group |
| `GET /groups`, `POST /groups`, `GET /groups/:id`, `PATCH /groups/:id` (`name`, `accessOpen`), `POST /groups/:id/access-code/regenerate` | teacher |
| `GET /groups/:id/teams`, `POST /groups/:id/teams`, `PATCH /teams/:id`, `DELETE /teams/:id`, `PUT /teams/:id/members`, `PATCH /teams/:id/moderator` | teacher |
| `GET /teams/:id/projects` | team member or teacher |
| `POST /teams/:id/projects`, `PATCH /projects/:id` | moderator or teacher |

`PUT /teams/:id/members` replaces the whole member set (array order is the board row order) and moves students out of their previous team. A team that already has cards cannot be deleted (`409 TEAM_HAS_CARDS`).

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `pnpm dev` | API (tsx watch) and web (Vite) in parallel |
| `pnpm build` | Builds every package (`prisma generate` + tsup for the API, Vite for the web) |
| `pnpm test` | Vitest in every package (no database needed) |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm --filter @kanbit/api db:migrate` | Create/apply a migration in development |
| `pnpm --filter @kanbit/api db:seed` | Create the seeded teacher (`SEED_TEACHER_*`) |
| `pnpm --filter @kanbit/web icons` | Regenerate the placeholder PWA icons |

## Deploy

Domains and cookies (spec §13.1): the web runs on `kanbit.app` and the API on `api.kanbit.app` so the session cookie (`Domain=.kanbit.app`, `HttpOnly`, `Secure`, `SameSite=Lax`) is first-party, including in installed PWAs on iOS.

**Railway (API + PostgreSQL)**

- Add a PostgreSQL service (enable backups) and an API service from this repo.
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @kanbit/api build`
- Start command: `pnpm --filter @kanbit/api start` (runs `prisma migrate deploy`, then `node dist/index.js`)
- Health check path: `/api/v1/health`
- Variables: `DATABASE_URL`, `JWT_SECRET`, `COOKIE_DOMAIN=.kanbit.app`, `CORS_ORIGIN=https://kanbit.app`, `NODE_ENV=production`, optional `SEED_TEACHER_USERNAME` / `SEED_TEACHER_PASSWORD` / `SEED_TEACHER_NAME` (see `apps/api/.env.example`).
- Custom domain `api.kanbit.app`; add the `CNAME api` record Railway shows in Vercel DNS.

**Vercel (web)**

- Root directory: `apps/web`, framework preset Vite.
- Variable: `VITE_API_URL=https://api.kanbit.app/api/v1`.
- `apps/web/vercel.json` rewrites all routes to `/index.html` and serves `sw.js` and `manifest.webmanifest` with `Cache-Control: no-cache`.
- Domain `kanbit.app` (with `www.kanbit.app` redirecting to it).
