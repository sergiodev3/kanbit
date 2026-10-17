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
- [x] T2 API groups/teams/projects + `http/authz.ts`, access code, `planMembers` rules, tests (~700 forecast, ~2250
  actual: mostly tests and the in-memory store) — route: delegated — api 109 tests, shared 21 (writer + parent spot check)
- [x] T3 Web auth + routing: api helpers, session, role guard, login/register/profile, layout, tests (~500 forecast,
  ~1355 actual, half tests) — route: delegated — web 35 tests (writer + parent spot check); branch
  `feat/phase-1-web-auth` stacked on the T2 branch — commit 5b48536
- [x] T3b Web session resilience from T3 review (user-authorized): keep the cached session when a background `/auth/me`
  refetch fails (offline level 1), logout always clears the local session, register form resets a stale server
  error on client validation failure — route: delegated — web 44 tests (writer + parent spot check). The 401 "loop"
  finding was not real (`fetchMe` maps 401 to null). Note: a network-failed logout leaves the server cookie valid;
  an amber notice tells the user.
- [x] T3c Offline logout on shared devices (user-authorized from PR 3 review, all 4 lenses): persist a pending-logout
  marker and retry `POST /auth/logout` on reconnect/app start before trusting `/auth/me` — route: delegated, after T4
  (same branch; no parallel writers) — web 74 tests (writer + parent spot check). Login/register also retry the
  pending logout first. Known edge: an in-flight retry finishing after a new login signs the new user out (fails safe).
- [x] T4 Web teacher panel, my-team placeholder, projects panel, README, deploy + production smoke test (~650) — route: delegated

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

- PR 1 #4 merged (8107815). Railway env added after merge (`COOKIE_DOMAIN`, `SEED_TEACHER_*`), redeployed.
  Production smoke (Oct 15): health 200 db ok; `/auth/me` 401; bad login 401; bad code register 404; CORS allows
  `https://kanbit.app` with credentials. Teacher login not verified by the agent (password stays with the user).
- T2 (branch `feat/phase-1-groups-teams-api` from main 8107815): all slices RED→GREEN; end-to-end done-criterion test
  `phase1-flow` over the in-memory store. Deviations accepted: no `expectedUpdatedAt` on group/team/project PATCH
  (spec §5.3.1 names only cards, check-ins, notes, comments); released cards also clear `sprintId`/validation;
  a moved student's old team is re-planned (renumber, moderator, release cards); 409 `MEMBERS_CONFLICT` on races.
  Prisma repositories still not run against Postgres.
- T2 API contract for T4: lists are bare arrays, dates ISO. Group `{id,name,accessCode,accessOpen,updatedAt}`
  (+`teamCount,studentCount` in list; +`students[{id,name,username,teamId}]`, `teams[{id,name,moderatorId,memberCount}]`
  in detail). Team `{id,groupId,name,moderatorId,updatedAt,members[{userId,name,username,isModerator,rowOrder}]}`.
  Project `{id,teamId,name,updatedAt}`. Errors: `FORBIDDEN` 403; `GROUP_/TEAM_/PROJECT_NOT_FOUND` 404;
  `INVALID_MEMBERS` 400 (details.userIds); `NOT_A_TEAM_MEMBER` 400; `TEAM_HAS_CARDS` 409; `MEMBERS_CONFLICT` 409.
  Name limits: group 80, team 60, project 80. `PUT members` max 50 distinct ids.
- Slices: PR 2 = T2 (025bb99).
- T2 RDD: assessed high; user granted; 4-lens review approved, acknowledged (burned). Advisories (follow-ups):
  concurrent `PUT members` on the same team can surface a 500 (P2025) instead of 409; Prisma repositories unproved
  against Postgres (no unique on `rowOrder`/moderator in the schema, so one-by-one updates are safe).

- T3: 7 slices RED→GREEN; typecheck/build ok; `sw.js` precaches 16 app-shell entries with `/index.html` navigation
  fallback (`/api/` denied), no API caching. Deviations accepted: redirect after login/register driven by the `['me']`
  cache (only same-app `from`); `useMe` maps 401 to `null`; any 401 sets `['me']` to null; queries never retry 4xx;
  login/register/logout clear all cached data except `['me']`; logged-in users on `/login`/`/register` go home; unknown
  paths redirect to `/`; router test mocks `UpdatePrompt` (Vite can't resolve the PWA virtual module in tests).
- T3 notes for T4: routes `/login`, `/register?code=`, `/profile`, `/status`; role areas `<RequireAuth role>` →
  `teacher`, `team` (placeholders to replace). Hooks in `features/auth/auth.api.ts` (`useMe`, `ME_QUERY_KEY`,
  `homePathFor`). `lib/api.ts` `apiGet/Post/Patch/Put/Delete`, `isApiError`. `lib/error-messages.ts` covers T1+T2
  codes. `shared/forms/` (`TextField`, `ErrorSummary`, `SubmitButton`, `fieldErrorsFrom`). Test utils `test/utils.tsx`.
- PR 2 review: an extra full-T2 review requested by the stop hook was granted by the user but refused by the provider
  before start (`invalid_request`, untracked T3 files in the tree; nothing mutated).

- `AGENTS.md` (user-created copy of the agent guide) committed at the user's request.
- T3 RDD: assessed high; user granted; approved, acknowledged (burned). A combined T2+T3 review (stop hook, user
  granted) stopped with `lens_context_budget_exceeded` (not started; terminal; slices already reviewed).

- T3b RDD: assessed high; user granted; approved, acknowledged (burned). Advisories (follow-ups): after an offline
  logout the still-valid cookie can restore the session on reconnect (no pending-logout marker); the 401-logout router
  test assertion is weak; notice wording. A second combined review (T2+T3+T3b, stop hook, user granted) stopped with
  `lens_context_budget_exceeded` again.

- PR 2 #5 merged (2f3d538); Railway deployed (`GET /groups` → 401). PR 3 #6 opened (T3, T3b, AGENTS.md); a full-slice
  review (stop hook, user granted) approved, acknowledged (burned) — all 4 lenses flagged offline logout → T3c.
- T4 (branch `feat/phase-1-teacher-panel`, stacked on T3): 5 slices RED→GREEN; web 63 tests (writer + parent spot check);
  typecheck/build ok; `sw.js` unchanged (app shell only). Pages: `/teacher` GroupsPage, `/teacher/groups/:groupId`
  GroupDetailPage (copy link, regenerate with in-app confirm, open/close, students + "Sin equipo", reset password shown
  once), TeamEditor (members incl. moves, moderator, delete), ProjectsPanel (teacher + moderator; members read-only),
  `/team` TeamHomePage. Shared UI: `Dialog`/`ConfirmDialog` (focus trap), `CopyButton`, `NameForm`. README Phase 1 docs.
  Deviations accepted: responses typed, not zod-parsed at runtime; reset asks for confirmation; group create opens detail.

- PR 3 #6 merged; `https://kanbit.app/login` → 200. A T3+T3b+T4 accumulated review (stop hook, user granted) approved,
  acknowledged (burned).
- T4 RDD: assessed medium (`slice_budget_reached`); user granted; reliability lens approved, acknowledged (burned).
- T3c RDD: assessed high; user granted; approved, acknowledged (burned). PR 4 slice review (T4+T3c, stop hook, user
  granted): approved, acknowledged (burned).
- T3d (user-authorized from the PR 4 review): the pending-logout retry gives up after 5 s (aborts the request, keeps
  the marker) so login/register never hang — commit b7328ee, RED→GREEN; RDD high, user granted, approved,
  acknowledged. A full PR 4 review (stop hook, user granted) approved, acknowledged.
- Web suite note: under machine load 2–3 teacher-panel tests exceed Vitest's 5 s default timeout in the full run
  (also on the base without T3d, verified with `git stash`); they pass when run alone.
- Open advisories (follow-ups): saving a team is two non-atomic requests (PUT members then PATCH moderator); an
  in-flight retry can revoke a just-issued session (fails safe) and later callers inherit the first caller's timeout;
  the amber notice shows for any non-401 logout failure (also 5xx while online); a failed code regeneration does not
  resync the page.
- Slices: PR 4 #7 = T4 (955e891) + T3c (d329111) + T3d (b7328ee); merged (2025000).
- Production smoke (Oct 16, by the user on https://kanbit.app): the teacher created a group, two students registered
  with the code, both were put in a team and one was made moderator — done criterion met. This was also the first run
  of the Prisma repositories against Postgres.

## Status
Phase 1 done: the teacher creates a group; two students register with the code and end up in a team.

## Next step
Phase 2 (Fri 16, spec §12.1): board — rows per member + "Sin asignar", 4 fixed columns, card CRUD, drag & drop with
`@dnd-kit` and fractional ordering, move permissions in the API, mobile view. Propose the file plan first (spec §14).
