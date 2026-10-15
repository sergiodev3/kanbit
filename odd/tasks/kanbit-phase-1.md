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
- Rate limit login/register: 10 per 15 min.

## Endpoints (`/api/v1`, spec §10)
- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`.
- Users: `POST /users/:id/reset-password` (teacher of a group the student belongs to).
- Groups: `GET|POST /groups`, `GET|PATCH /groups/:id` (name, accessOpen), `POST /groups/:id/access-code/regenerate`.
- Teams: `GET|POST /groups/:id/teams`, `PATCH|DELETE /teams/:id`, `PUT /teams/:id/members`, `PATCH /teams/:id/moderator`.
- Projects: `GET /teams/:id/projects` (member or teacher), `POST /teams/:id/projects`, `PATCH /projects/:id`
  (moderator or teacher).

## Tasks
- [ ] T1 Shared auth/users DTOs + API auth core: `http/auth.ts`, `lib/password.ts`, auth + users modules, seed,
  rate limit, `AppDeps` changes, tests (~650 lines) — route: delegated (2+ non-trivial files)
- [ ] T2 API groups/teams/projects + `http/authz.ts`, access code, `planMembers` rules, tests (~700) — route: delegated
- [ ] T3 Web auth + routing: api helpers, session, role guard, login/register/profile, layout, tests (~500) — route: delegated
- [ ] T4 Web teacher panel, my-team placeholder, projects panel, README, deploy + production smoke test (~650) — route: delegated

## Checks
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r build` green.
- Production smoke: teacher creates group; two students register with the code; teacher puts both in a team.

## Delivery
- Forecast ~2500 authored lines (> 400): strategy `ask-on-risk`; chain strategy pending user answer.

## Progress / evidence
- Branch `feat/phase-1-auth-teacher` from `main` d9b34b8.
- RDD: on (default).

## Next step
T1.
