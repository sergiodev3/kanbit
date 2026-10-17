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

## Phase 2: board

**Using the board.** "Mi equipo" shows one row per member plus "Sin asignar" (first), and the four columns Backlog, Por hacer, En marcha and Terminado. "Nueva tarjeta" always creates the card in the unassigned Backlog. To move a card:

- **Mouse / touch:** drag the card (on phones, press and hold briefly). Clicking or tapping it opens its details instead.
- **Keyboard:** Tab to the card's "Arrastrar tarjeta" handle, press Space or Enter to pick it up, use the arrow keys to choose the cell and position, then Space or Enter to drop it (Escape cancels). Moves are announced in Spanish to screen readers.
- **"Mover a":** open the card and pick the column and row in its "Mover a" section; the card goes to the end of that cell. This is the main path on phones, where the board shows one row per tab.

Taking a card out of the Backlog needs a responsible member, an estimated day and a done criterion; dragging an incomplete card out opens "Mover a" prefilled with the target so you can fill them in. Only the cards you may move have a handle, and drops you are not allowed to make send nothing. "Solo mis tarjetas" shows only your row. The board refreshes every 10 seconds (paused while you drag) and when the window regains focus; offline, the board is read-only. The teacher opens a team's board from the group page, read-only.

**Move permissions** (spec §3, enforced by the API; the web only mirrors them):

| Who | Can move / edit |
|---|---|
| Member | Their own cards, into their own row or back to the unassigned Backlog; they can also take an unassigned Backlog card into their row |
| Moderator | Any card of the team, into any row |
| Teacher | Nothing (read-only, `403 FORBIDDEN`) |
| Anyone else | `404` |

Cards can only be deleted while in the Backlog (`409 CARD_NOT_IN_BACKLOG`). Moving to Terminado sets `completedAt`; leaving it clears it.

**API endpoints** (prefix `/api/v1`):

| Endpoint | Who |
|---|---|
| `GET /teams/:id/board` → team, members (rows), open sprint or `null`, projects, cards | team member or teacher |
| `POST /teams/:id/cards` | team member |
| `GET /cards/:id` | team member or teacher |
| `PATCH /cards/:id`, `DELETE /cards/:id` | see move permissions |
| `POST /cards/:id/move` `{ status, assigneeId, position, dueWeekday?, doneCriteria?, expectedUpdatedAt? }` | see move permissions |

Move errors: `400 VALIDATION_ERROR`, `404 CARD_NOT_FOUND`, `403 FORBIDDEN`, `409 CARD_CONFLICT`, `400 INVALID_POSITION`, `400 NOT_A_TEAM_MEMBER`, `400 CARD_INCOMPLETE`. Every create, edit and move writes a `CardEvent` (`CREATED`, `EDITED`, `MOVED`, `ASSIGNED`); a pure reorder writes none.

**Ordering.** `Card.position` is a fractional index (`fractional-indexing`, base 62): the client computes a key between the neighbours of the drop position, so a move updates only one row. Positions are compared bytewise (`ORDER BY position COLLATE "C"`, plain JS `<`), never with locale-aware collation, with the card id as tie-break.

**Offline-ready writes** (spec §5.3.1). The client generates card ids (cuid2) and sends them in `POST`; repeating a `POST` with an existing id from the same author returns `200` with the existing card (another author gets `409 ID_CONFLICT`). `PATCH` and `move` accept an optional `expectedUpdatedAt` and answer `409 CARD_CONFLICT` when the card changed meanwhile; the web then reloads the board. Drag & drop moves are optimistic: the card moves at once and goes back, with a Spanish error message, if the server refuses.

## Phase 3: sprint

**Running the week (moderator).**

1. **Start:** in the board header, "Iniciar sprint de la semana" asks for the week's goal. The sprint covers Monday to Friday of the current week in the group's time zone; started on a Saturday or Sunday, it covers the next week. Starting mid-week is allowed, and so is a new sprint in the same week after closing one.
2. **Plan:** members take their Backlog cards into Por hacer (each needs an estimated day and a done criterion).
3. **Validate:** the moderator checks each Por hacer card and presses "Validar" in its dialog, or "Validar todas" in the header for every pending card of the sprint. The moderator may validate their own cards.
4. **Work:** validated cards move to En marcha and Terminado.
5. **Close:** "Cerrar sprint" in the header sends every unfinished card back to the Backlog, keeping its assignee and dropping its validation; finished cards stay with the closed sprint and leave the board. (The API also lets the teacher close a sprint; the web offers it to the moderator.)

**Rules** (spec §7.2, enforced by the API; the web mirrors them in "Mover a" and drag & drop):

- One open sprint per team.
- Leaving the Backlog needs an open sprint (`409 NO_OPEN_SPRINT`) and attaches the card to it. Without one, "Mover a" only offers the Backlog and explains why, and drops outside the Backlog are refused with a notice.
- En marcha and Terminado need the moderator's validation (`409 CARD_NOT_VALIDATED`); "Mover a" hides them for unvalidated cards and says so.
- Back to the Backlog clears the sprint and the validation; other moves and edits keep the validation.
- The server decides "today" in the group's time zone (`today` on the board); the web never uses the device clock for dates.

**Card states on the board** (spec §7.3), always shown as text, never by color alone:

| State | When | Look |
|---|---|---|
| Por validar | In Por hacer and not validated yet | dashed border + label |
| Vence hoy | Unfinished sprint card whose estimated day is today | amber label |
| Atrasada | Unfinished sprint card whose estimated day has passed (or the sprint week is over) | red label |

Backlog and Terminado cards never show a due state.

**Deadline notice.** From Wednesday of the sprint week the header shows a banner to everyone, teacher included: "Quedan 3 días de sprint · N tarjetas sin terminar." (blue), the same with 2 days on Thursday (amber) and "Hoy cierra el sprint · N tarjetas sin terminar." on Friday (red). It uses the server's `today`, and disappears when every sprint card is done. There are no push notifications.

**API endpoints** (prefix `/api/v1`):

| Endpoint | Who |
|---|---|
| `POST /teams/:id/sprints` `{ goal }` → `201` sprint (`409 SPRINT_ALREADY_OPEN`) | moderator |
| `POST /sprints/:id/close` → `{ sprint, returnedCardIds }` (`404 SPRINT_NOT_FOUND`, `409 SPRINT_CLOSED`) | moderator or teacher |
| `POST /cards/:id/validate` `{ expectedUpdatedAt? }` → card (`409 CARD_NOT_IN_TODO`; already validated → `200`, no change) | moderator |
| `POST /teams/:id/cards/validate-all` → `{ validatedIds }` (`409 NO_OPEN_SPRINT`) | moderator |
| `GET /teams/:id/board` now includes `today: { date, weekday }` (`weekday` is `null` on weekends) | team member or teacher |

Move errors gain `409 NO_OPEN_SPRINT` and `409 CARD_NOT_VALIDATED`, checked after the Phase 2 errors.

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
