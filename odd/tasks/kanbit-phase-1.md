# Feature: kanbit-phase-1

## Objective
Phase 1 of spec §12.1 (Thu Oct 15, 2026): full auth, teacher seed, and the teacher panel for groups, teams,
moderator and projects.

## Done criteria (spec)
The teacher creates a group; two students register with the code and end up in a team.

## Scope (spec §12.1 rows Auth, Docente–grupos, Docente–equipos, Proyectos)
- Auth: username/password login, student registration with a group code, teacher seed, change password,
  the teacher resets passwords. One 7-day JWT in an `HttpOnly` cookie (no refresh tokens).
- Groups: create, view/regenerate code, open/close registration. No `GroupSchedule`.
- Teams: create, assign students, designate moderator. No drag between teams, no size validation.
- Projects: create/rename (moderator or teacher). No archive.

## Constraints / decisions (approved by the user, Oct 15)
- No new migration: the init migration already holds User, Group, GroupMember, Team, TeamMember, Project.
- Env already in `apps/api/src/config/env.ts`: `JWT_SECRET` (single secret), `COOKIE_DOMAIN`, `SEED_TEACHER_*`.
- New API deps: `jose` (JWT), `@node-rs/argon2` (hashing; fallback `bcryptjs` if Railway breaks).
- Cookie `kanbit_session`: HttpOnly, SameSite=Lax, Domain=`COOKIE_DOMAIN` when set, `secure` in production, 7d.
- Register creates User (STUDENT) + GroupMember only; the teacher assigns teams via `PUT /teams/:id/members`.
- `PUT /teams/:id/members` replaces the set in one transaction; a student from another team in the group is moved;
  `rowOrder` = array index; if no moderator remains, the first member becomes moderator (spec §6.1).
- Removing a member: their unfinished cards go back to BACKLOG with assignee null (spec §6.1; no cards exist yet).
- Stateless JWT is not revocable; no `mustChangePassword` (avoids a migration). Temp password shown once.
- Existing username registering again → 409 `USERNAME_TAKEN`. Login failures → one generic 401.
- Teacher seed: idempotent `ensureSeedTeacher` at boot when `SEED_TEACHER_*` is set, plus `pnpm db:seed` locally.
- Tests run without a DB: pure rule tests + supertest with fake services injected via `AppDeps`.
- English URL paths; share link `/register?code=XXXXXX`. UI copy es-MX.
- Rate limit login/register, per route per 15 min: 10 failures per IP + username; 50 guesses (401/403/404) per IP.

## Endpoints (`/api/v1`, spec §10)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`.
- Users: `POST /users/:id/reset-password` (teacher of a group the student belongs to).
- Groups: `GET|POST /groups`, `GET|PATCH /groups/:id` (name, accessOpen), `POST /groups/:id/access-code/regenerate`.
- Teams: `GET|POST /groups/:id/teams`, `PATCH|DELETE /teams/:id`, `PUT /teams/:id/members`, `PATCH /teams/:id/moderator`.
- Projects: `GET /teams/:id/projects` (member or teacher), `POST /teams/:id/projects`, `PATCH /projects/:id`
  (moderator or teacher).

## Tasks
- [x] T1 Shared auth/users DTOs + API auth core: `http/auth.ts`, `lib/password.ts`, auth + users modules, seed,
  rate limit, `AppDeps` changes, tests (~650 lines forecast, 1638 actual) — route: delegated (2+ non-trivial files)
  — commit 9dba977
- [x] T1b Auth hardening from T1 review advisories (user-authorized): per-IP failure limiter (50/15 min, per route)
  alongside IP+username, hash after cheap register checks, seed after `listen`, seed conflict with a STUDENT username
  fails loudly (`db:seed` exits 1) — route: delegated — api 51 tests green (writer + parent spot check) — commit fbe6f7b
- [x] T1c Per-IP limiter counts only guesses (401/403/404); 400/409/429 no longer drain a classroom's budget;
  JSDoc states budgets are per route (user-authorized from T1b + branch review advisories) — route: inline
  (one mechanical file + tests) — RED 2 failing → GREEN api 53 tests
- [ ] T2 API groups/teams/projects + `http/authz.ts`, access code, `planMembers` rules, tests (~700) — route: delegated
- [ ] T3 Web auth + routing: api helpers, session, role guard, login/register/profile, layout, tests (~500) — route: delegated
- [ ] T4 Web teacher panel, my-team placeholder, projects panel, README, deploy + production smoke test (~650) — route: delegated

## Checks
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` green.
- Production smoke: teacher creates group; two students register with the code; teacher puts both in a team.

## Delivery
- Forecast ~2500 authored lines (> 400): strategy `ask-on-risk`; chain strategy `stacked-to-main` (user, Oct 15).
- Slices: PR 1 = T1 (9dba977).

## Progress / evidence
- Branch `feat/phase-1-auth-teacher` from `main` d9b34b8.
- RDD: on (default).
- T1 writer: `pnpm -r typecheck` ok; `pnpm -r test` shared 11, api 43, web 3 (web flaked once with "no tests" under
  parallel load, green on re-run); `pnpm -r build` ok (jose/argon2/rate-limit external); `prisma validate` ok;
  built server boots with unreachable DB (seed failure logged). Parent spot check: api typecheck + 43 tests green.
- T1 deviations accepted: `*.repository.ts` Prisma adapters behind service interfaces (HTTP tests run real services
  on an in-memory store); rate limit keyed by IP + username counting failures only (spec §13.2; avoids locking a
  classroom behind one IP), 429 `RATE_LIMITED`; empty `SEED_TEACHER_*` treated as unset; optional `SEED_TEACHER_NAME`.
- T1 API contract for T3: login 200 / register 201 return `MeResponse` + cookie; logout and change-password 204;
  `INVALID_CURRENT_PASSWORD` 400, `INVALID_ACCESS_CODE` 404, `REGISTRATION_CLOSED` 403, `USERNAME_TAKEN` 409,
  `USER_NOT_FOUND` 404, `FORBIDDEN` 403; messages in English, web localises by `code`. Access codes uppercase;
  usernames 3–32 `[a-z0-9._-]`, passwords 8–128.
- T1 RDD: assessed high (`hot_path` auth); user granted; 4-lens review approved, acknowledged (authority burned).
  12 advisories; the user authorized T1b for the rate-limit bypass, hash order, boot seed, and seed conflict.
  Remaining advisories (not fixed): reset doesn't revoke sessions (accepted for v1.0), login username max magic number,
  sync throws in async handlers (Express 5 forwards them).
- T1b RDD: assessed high; user granted; approved, acknowledged (burned). Branch review (main..fbe6f7b, requested by the
  stop hook, user granted): approved, acknowledged (burned). Both flagged the per-IP limiter → T1c.
  Remaining advisories: session not revoked on password change/reset (accepted v1.0), Prisma repositories unproved
  against a real DB, seed race untested.
- Not yet run against a real DB: Prisma repositories, `pnpm db:seed`.

- T1c RDD: assessed high; user granted; approved, acknowledged (burned). Second branch review (main..d5b25c6, stop hook,
  user granted): approved, acknowledged (burned).
- Open advisories (follow-ups, not fixed): sessions not revoked on password change/reset (accepted v1.0); register 409
  reveals usernames to holders of an open group code; IP+username limiter counts 5xx; boot seed is not retried (if it
  fails on deploy, restart the service once the DB is up); login username max 64 is a bare literal; seed password has
  no 128 max; duplicated password-update repository code.

## Next step
Open PR 1 (T1, T1b, T1c) against `main`, then T2.
