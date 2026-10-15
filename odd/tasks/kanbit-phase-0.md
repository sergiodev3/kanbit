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
- [ ] T1 Workspace scaffold: root config, shared package, CLAUDE.md, README — route: delegated (2+ non-trivial files)
- [ ] T2 API: express skeleton, env, clock, error handler, health route, Prisma schema + first migration, tests — route: delegated
- [ ] T3 Web: Vite + React + Tailwind + PWA (manifest, icons, install, update prompt), health page — route: delegated
- [ ] T4 Deploy: Railway (Postgres + API + domain) and Vercel (web + domain) — route: user-run dashboards, values provided

## Checks
- `pnpm -r build`, `pnpm -r test`, `pnpm -r typecheck` green.
- `curl https://api.kanbit.app/api/v1/health` → 200.
- Lighthouse: PWA installable.

## Progress / evidence
(none yet)

## Next step
T1–T3 via one delegated writer.
