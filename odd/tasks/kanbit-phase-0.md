# Feature: kanbit-phase-0

## Objective
Phase 0 of spec §12.1 (Wed Oct 14, 2026): pnpm monorepo, Prisma + Postgres schema, `GET /api/v1/health`,
minimal PWA, `CLAUDE.md`, deploy to Vercel (`kanbit.app`) and Railway (`api.kanbit.app`).

## Done criteria (spec)
The installed PWA on a phone shows the production health.

## Constraints / decisions
- Pin `prisma@7.10.0` + `@prisma/client@7.10.0` (npm `latest` is 8.0.0-rc.22 — do not use).
- TypeScript 5.9.x (TS 7 native port still breaks parts of the tooling ecosystem).
- pnpm 12.11.2 workspaces; `packages/shared` consumed as TS source; API bundled with tsup.
- IDs `cuid(2)`; `@db.Date` for sprint/meeting dates; `TeamMember.groupId` + unique `(groupId, userId)`;
  partial unique index for one OPEN sprint per team; single 7-day JWT secret in v1.0.
- Commits: Conventional Commits, no AI attribution (user rule).

## Tasks
- [x] T1 Workspace scaffold: root config, shared package, CLAUDE.md, README — route: delegated (2+ non-trivial files) — commits e5b3474, (gitignore .atl) follow-up
- [x] T2 API: express skeleton, env, clock, error handler, health route, Prisma schema + first migration, tests — route: delegated — commit d8456c6
- [x] T3 Web: Vite + React + Tailwind + PWA (manifest, icons, install, update prompt), health page — route: delegated — commit 01afb45
- [x] T4 Deploy: Railway (Postgres + API + domain) and Vercel (web + domain) — route: user-run dashboards, values provided — fix PR #2 (root `start`, `engines.pnpm`)

## Checks
- `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck` green.
- `curl https://api.kanbit.app/api/v1/health` → 200.
- Lighthouse: PWA installable.

## Progress / evidence
- Writer: `pnpm install`, `pnpm -r typecheck`, `pnpm -r test` (18 pass), `pnpm -r build`, `prisma validate` all green, no DB.
- Parent spot check: `pnpm -r test` green (api 13, web 3, shared 2).
- Deviations accepted: Node 22 (`>=22.12`, Vitest 5 requires it); pnpm 12 minimumReleaseAge → tsup 8.5.1, react 19.3.0;
  partial unique index via Prisma `partialIndexes` preview; TeamMember composite FKs.
- Follow-ups: bump react to ~19.3.1 once mature; `Card.position` must sort with `COLLATE "C"`; migration never applied to a real DB yet.
- RDD: assessed medium (`slice_budget_reached`); user granted; reliability lens approved, acknowledged (authority burned).
  Advisory follow-ups (non-blocking): graceful shutdown should close idle keep-alive connections (apps/api/src/index.ts:41-43);
  tests for health ping timeout, env validation, and apiFetch non-envelope/invalid-schema errors.

- T4 deploy evidence (Oct 15, 2026):
  - Railway: Railpack uses pnpm 12.11.2 via `engines.pnpm`; `prisma migrate deploy` applied the init migration; healthcheck passed.
  - `GET https://api.kanbit.app/api/v1/health` → 200 `{"status":"ok","db":"ok"}` (needed CNAME `api` + TXT `_railway-verify.api`).
  - Vercel: root `apps/web`, `ENABLE_EXPERIMENTAL_COREPACK=1` (else Vercel ignores `packageManager`), `VITE_API_URL` baked into bundle.
  - `https://kanbit.app` → 200; `https://www.kanbit.app/*` → 308 to apex (apex must be primary: CORS allows only `https://kanbit.app`).
  - `manifest.webmanifest` and `sw.js` served with `Cache-Control: no-cache`.
  - User test on iPhone (installed to home screen): online shows "En línea"; airplane mode opens app with offline banner.
- Pending manual checks: Android Chrome install; Lighthouse PWA audit.

## Status
Phase 0 done-criteria met: the installed PWA on a phone shows production health.

## Next step
Phase 1 (Thu Oct 15): auth + teacher seed + teacher panel for groups, teams, moderator, projects — propose file plan first (spec §14).
