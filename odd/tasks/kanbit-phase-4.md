# Feature: kanbit-phase-4

## Objective
Phase 4 of spec §12.1 (Sun Oct 18, 2026): meetings and the daily check-in — the suggested meeting of the day, start/end
with saved duration, each member's check-in from their phone (the moderator can capture another member's), notes and
agreements, and the projection mode with the 15-minute timer.

## Done criteria (spec acceptance checklist)
- Monday suggests Arranque, Tuesday–Thursday Seguimiento, Friday Cierre.
- A check-in sent from the phone shows in the projection in <= 15 s (polling 10 s).
- The 15-min timer changes color and the duration is saved.

## Scope
- In: `Meeting`/`MeetingCheckin` API (no migration: both models exist in `schema.prisma:237-284`), shared DTOs, meeting
  type by weekday, start/end, check-in upsert, moderator capture, notes and agreements, web `features/meetings`,
  projection mode (timer, large check-ins, compact board, Wake Lock).
- Out: turns / `secondsSpoken`, meetings outside the suggested type, GroupSchedule, comments, blockers as entity,
  Dexie check-in queue, socket events, teacher "meeting done/pending" indicator (Phase 5 with offline read).

## Constraints / decisions
- A `Meeting` has no `teamId`: team access goes through `sprint.teamId`; the suggested meeting needs an open sprint.
- One meeting per sprint and day (`@@unique([sprintId, date])`); today and weekday come from the injectable clock in the
  group timezone, never `new Date()`.
- Check-in ids are client-generated cuid2; a repeated PUT is an idempotent upsert; `capturedById` records who captured.
- Roles: teacher and moderator open/conduct/close; moderator and members register their own check-in; teacher reads.
- Polling `refetchInterval` 10 s on the active meeting, plus focus/reconnect; no Socket.IO; Zustand for projection/timer UI.

## Endpoints (`/api/v1`, spec §10 L561-565)
- `GET /teams/:id/meetings/today`, `POST /teams/:id/meetings`, `GET|PATCH /meetings/:id`, `POST /meetings/:id/start`,
  `POST /meetings/:id/end`, `PUT /meetings/:id/checkins/me`, `PATCH /meetings/:id/checkins/:userId` (moderator capture).

## Tasks
- [x] T1 API meetings: shared DTOs + meeting-type rule, meetings module (today, create, get, patch notes/agreements,
  start, end with duration), tests, README (~600 forecast) — route: delegated — shared 54, api 248 (writer + parent
  spot check, mutation Math.floor→ceil caught); branch `feat/phase-4-meetings-api`
- [ ] T2 API check-in: `PUT .../checkins/me` idempotent upsert, moderator capture with `capturedById`, tests, README
- [ ] T3 Web meeting and check-in: `features/meetings`, suggestion of the day, check-in form, notes and agreements
- [ ] T4 Web projection: timer (green / yellow from min 10 / red from min 14 / blink at 0), large check-ins with polling,
  compact board, Wake Lock, duration saved

## Checks
- `pnpm -r typecheck`, per-package tests, `pnpm -r build` green.
- Production smoke: moderator opens the day's meeting; a member sends a check-in from the phone; it shows in the
  projection within 15 s; the timer changes color; ending saves the duration.

## Delivery
- Forecast ~2400 authored lines (> 400): `ask-on-risk`, chain `stacked-to-main` (as Phase 3). One PR per task.

## Progress / evidence
- Branch `feat/phase-4-meetings-api` from `main` b8860f2. Explorer map of spec/schema done (no migration needed).

- T1 deviations accepted: the API tests were written after the implementation (RED not observed; the parent's
  mutation check failed 2 tests, so they bite). Notes/agreements capped at 10000 chars. Create is 201 with a server id
  (no idempotent replay). Errors: NO_OPEN_SPRINT, NO_MEETING_TODAY, MEETING_ALREADY_EXISTS (also on P2002),
  MEETING_NOT_FOUND, MEETING_CONFLICT, MEETING_ENDED, MEETING_NOT_STARTED; order 404 → 403 → 409.
- T1 contract for T2/T3: `GET /teams/:id/meetings/today` → `{suggestedType, date, meeting}` (nulls with no open sprint
  or on a weekend; the web tells them apart with the board's `today.weekday` and `sprint`); `MeetingResponse`
  {id, sprintId, teamId, type, date, startedAt, endedAt, durationSeconds, notesMd, agreements, facilitatorId,
  updatedAt}; ports in `meetings.service.ts`; start/end idempotent. T2 must decide whether check-ins are allowed
  before start / after end.

## Next step
Open PR 1 (T1), then T2 (check-in API).
