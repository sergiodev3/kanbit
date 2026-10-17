# Feature: kanbit-phase-3

## Objective
Phase 3 of spec §12.1 (Sat Oct 17, 2026): the weekly sprint — start the week's sprint (with goal), Backlog exit
rules, moderator validation (single + "validar todas"), no "En marcha" without validation, visual card states
(por validar / vence hoy / atrasada), simple close (unfinished cards back to Backlog keeping the assignee).

## Done criteria (spec)
A Mon–Fri cycle simulated with the injectable `clock` passes the tests.

## Scope (spec §12.1 rows Sprint, Tarjeta)
- In: start, close, validate, validate-all, Backlog exit attaches the open sprint, validation gate, visual states,
  server-owned "today" on the board, web controls and badges.
- Out: close wizard per card, carry-over to next sprint (`carriedOverCount++`), unclosed-sprint warning,
  "Arrastrada ×N" label, blockers ⚠, sprint history endpoints (`GET /teams/:id/sprints`, `GET /sprints/:id`, summary).

## Constraints / decisions (approved by the user, Oct 17)
- No migration: `Sprint` (schema.prisma:155-176), card validation fields and the one-OPEN partial index exist.
- Sprint dates via a new `clock.sprintWeek(tz)`: Mon–Fri of the current ISO week on weekdays; next week on weekends.
  Group timezone (`Group.timezone`) is used for "today" and the week.
- Start (`POST /teams/:id/sprints {goal}`): moderator only (teacher/member 403, outsider 404); goal required 1..200;
  `number` = max+1; existing OPEN → 409 `SPRINT_ALREADY_OPEN` (also on P2002 races); server-generated id.
  Starting mid-week allowed; a new sprint in the same week after a close is allowed.
  Start adopts orphan non-Backlog cards with `sprintId = null` (validation untouched).
- Close (`POST /sprints/:id/close`): moderator or teacher; not visible → 404 `SPRINT_NOT_FOUND`; CLOSED → 409
  `SPRINT_CLOSED`. One transaction: every unfinished card → BACKLOG, `sprintId` null, validation cleared, assignee
  kept, appended at the end of its (assignee, BACKLOG) cell, MOVED event; DONE cards keep the closed sprint (leave the
  board); `carriedOverCount` untouched. Teacher approval not required (spec §15).
- Validate (`POST /cards/:id/validate`): moderator only; card must be TODO (409 `CARD_NOT_IN_TODO`); already validated
  → 200 no-op; sets `validated`, `validatedById`, event VALIDATED. The moderator may validate own cards.
- Validate-all (`POST /teams/:id/cards/validate-all`): moderator only; TODO, unvalidated, open sprint; no open sprint
  → 409 `NO_OPEN_SPRINT`; returns `{validatedIds}`.
- Move: leaving BACKLOG requires an open sprint (409 `NO_OPEN_SPRINT`) and attaches it; entering DOING or DONE requires
  `validated` (409 `CARD_NOT_VALIDATED`); back to BACKLOG clears sprint and validation; other moves keep validation.
  PATCH does not reset validation.
- Visual states: pure `cardVisualState(card, sprint, today)` in `packages/shared`; `BoardResponse.today {date, weekday}`
  computed by the server; the client never uses its own clock.

## Endpoints (`/api/v1`, spec §10 L550, L554-555)
- `POST /teams/:id/sprints`, `POST /sprints/:id/close`, `POST /cards/:id/validate`,
  `POST /teams/:id/cards/validate-all`; `GET /teams/:id/board` gains `today`.

## Tasks
- [x] T1 API sprint cycle: shared sprint DTOs, `clock.sprintWeek`, sprints module (start/close/adopt), `planMove` open
  sprint + validation gate, existing tests updated (~900 forecast, ~1250 actual) — route: delegated — api 197,
  shared 41 (writer + parent spot check)
- [x] T2 API validation + today: validate/validate-all, `assertTeamModerator`, `BoardResponse.today`, shared
  `card-state`, Mon–Fri `phase3-flow` test (~650 forecast, ~700 actual) — route: delegated — api 209, shared 49;
  the writer stopped at a web fixture outside its surface (`today` missing); the parent added it inline, then
  typecheck/build/api tests green
- [ ] T3 Web sprint controls: sprint.api, SprintHeader, start/close dialogs, Validar / Validar todas, messages (~800) —
  route: delegated
- [ ] T4 Web states + gates: tile badges, "Mover a" and dnd gates, `applyMove` sprint/validation, README, deploy +
  production smoke (~550) — route: delegated. First to trim if time runs short (spec §12.1 cut order).

## Checks
- `pnpm -r typecheck`, per-package tests, `pnpm -r build` green.
- Production smoke: moderator starts the sprint; members move cards to Por hacer; unvalidated → En marcha refused;
  moderator validates; cards advance; moderator closes; unfinished back in Backlog with assignee.

## Delivery
- Forecast ~2900 authored lines (> 400): `ask-on-risk`, chain strategy `stacked-to-main` (cached). One PR per task.

## Progress / evidence
- Branch `feat/phase-3-sprint-api` from `main` dedd9f9.

- T1: slices RED→GREEN (HTTP NO_OPEN_SPRINT/CARD_NOT_VALIDATED cases written after the rules change; their RED was at
  the rules level). Deviations accepted: close uses version-guarded per-card updates (a concurrent change rolls back with
  409 `CARD_CONFLICT`); adoption bumps `updatedAt`; a non-Backlog card still pointing at a closed sprint is not
  re-attached on move; `phase2-flow` sets `validated` directly until T2's endpoint.
- T1 contract: `POST /teams/:id/sprints {goal}` → 201 `{id, teamId, number, startDate, endDate, goal, status,
  updatedAt}`; `POST /sprints/:id/close` → 200 `{sprint, returnedCardIds}`. Move error order: CARD_NOT_FOUND 404 →
  FORBIDDEN 403 → CARD_CONFLICT 409 → INVALID_POSITION / NOT_A_TEAM_MEMBER / CARD_INCOMPLETE 400 → NO_OPEN_SPRINT →
  CARD_NOT_VALIDATED 409 (only when the status changes into DOING/DONE).
- Deploy note: once T1 is live, the Phase 2 web can no longer move cards out of the Backlog until a sprint is started
  (UI arrives in T3), and the new codes show the generic message until T3. No real users before Monday.

- T1 RDD: reliability lens approved (no findings), acknowledged. PR 1 #14 opened.
- T2: slices RED→GREEN (`phase3-flow` written after the implementation; its behaviours went RED in `validation.test`).
  DONE CRITERION: `phase3-flow` simulates Sat → Mon–Fri → next Mon with the injected clock and passes.
  Deviations accepted: validate order 404 → 403 → already-validated no-op (200, before the stale check so offline
  replays don't 409) → CARD_CONFLICT → CARD_NOT_IN_TODO; shared `ValidateCardRequest {expectedUpdatedAt?}` (body
  optional); validate-all reuses `listBoardCards` with version-guarded updates (409 `CARD_CONFLICT` on races).
- T2 contract for T3/T4: `POST /cards/:id/validate` → 200 CardResponse; `POST /teams/:id/cards/validate-all` → 200
  `{validatedIds}`; `BoardResponse.today {date, weekday|null}`; shared `cardVisualState(card, sprint, today)` →
  `{pendingValidation, due: 'TODAY'|'OVERDUE'|null}`, `WEEKDAY_ORDER`.

## Next step
Commit T2, review, open PR 2, then T3.
