# Feature: kanbit-phase-2

## Objective
Phase 2 of spec §12.1 (Fri Oct 16, 2026): the team board — rows per member + "Sin asignar", 4 fixed columns,
card create/edit/delete, drag & drop with `@dnd-kit` and fractional ordering, move permissions in the API,
mobile view (one row per tab), "solo mis tarjetas" filter.

## Done criteria (spec)
Two students move their own cards; moving another student's card → 403.

## Scope (spec §12.1 rows Tablero, Tarjeta; day plan Fri 16)
- In: board read, card CRUD with client cuid2 ids (idempotent POST, PATCH `expectedUpdatedAt` → 409), `CardEvent`
  rows, move endpoint with permissions, rows/columns UI, mobile tabs, mine filter, drag & drop, 10 s polling
  (+ focus/reconnect refetch), writes disabled offline, teacher read-only board.
- Out (Sat 17): sprint start/close, Backlog exit attaching the sprint, moderator validation, visual states
  "por validar / vence hoy / atrasada". Out (Sun 18): offline level 1 persistence. Not v1.0: visible card history.

## Constraints / decisions (approved by the user, Oct 16)
- No migration: `Card`/`CardEvent` already have every field (`apps/api/prisma/schema.prisma:178-235`).
- Ordering: board cards sorted in JS bytewise (`a < b`, tie-break by id); never `localeCompare`.
- Move rules (spec §3): member moves only own cards (target assignee = self, or null for Backlog) and may claim an
  unassigned card into their row; moderator moves any card anywhere; teacher read-only (403); non-member 404.
- Without an open sprint (until Sat), leaving BACKLOG requires assignee + dueWeekday + doneCriteria
  (400 `CARD_INCOMPLETE`); sprintId stays null. A card outside BACKLOG must have an assignee who is a team member.
- Edit/delete: same people as move. Delete only in BACKLOG (409 `CARD_NOT_IN_BACKLOG`).
- DONE sets `completedAt` (clock); leaving DONE clears it; back to BACKLOG clears sprintId/validated.
- Events: CREATED, EDITED, MOVED (status change), ASSIGNED (assignee change); pure reorder writes none.
- Position: client computes with `positionBetween`; server validates the format; create appends to the cell end.
- `expectedUpdatedAt` also accepted on `/move`.
- `releaseUnfinishedCards` (Phase 1 teams repository) also writes events (T2).
- Teacher read-only board ships Fri (reuses BoardPage readOnly).
- New deps: web `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2,
  `@paralleldrive/cuid2` ^3.0.5; shared `fractional-indexing` 3.2.0 exact.

## Endpoints (`/api/v1`, spec §10 L546-549)
- `GET /teams/:id/board` (member or teacher) → team, members (rows), sprint (nullable), projects, cards.
- `POST /teams/:id/cards` (member/moderator; teacher 403): repeated id same author → 200; other author → 409 `ID_CONFLICT`.
- `GET /cards/:id` (member or teacher; else 404), `PATCH /cards/:id`, `DELETE /cards/:id`.
- `POST /cards/:id/move` `{status, assigneeId, position, dueWeekday?, doneCriteria?, expectedUpdatedAt?}`.

## Tasks
- [x] T1 Shared card DTOs + position helpers; API board read + card CRUD (idempotent create, PATCH 409, delete,
  events), memory-db, tests (~1000 forecast, ~1700 actual) — route: delegated — api 134, shared 37 (writer + parent
  spot check)
- [x] T2 API move: `canMoveCard`/`canEditCard`, `card.rules.ts`, `/move`, `releaseUnfinishedCards` events,
  `phase2-flow` done-criterion test (~650 forecast, ~740 actual) — route: delegated — api 163, shared 37 (writer +
  parent spot check); branch `feat/phase-2-card-move`
- [x] T3 Web board read + CRUD: board model, BoardPage, rows/columns, mobile tabs, CardDialog with "Mover a",
  mine filter, polling, offline write disable, teacher read-only route (~1000 forecast, ~1980 actual, ~880 tests) —
  route: delegated — web 126 tests (writer + parent spot check); branch `feat/phase-2-web-board`
- [x] T4 Web drag & drop: dnd-kit grid, sensors, optimistic move with
  rollback, polling paused while dragging, README, deploy + production smoke (~550) — route: delegated — web 148
  tests (writer + parent spot check); branch `feat/phase-2-board-dnd`

## Checks
- `pnpm -r typecheck`, per-package tests, `pnpm -r build` green.
- Production smoke: two students move their own cards; moving the other's → 403; moderator can move any.

## Delivery
- Forecast ~3200 authored lines (> 400): strategy `ask-on-risk`, chain strategy `stacked-to-main` (cached from Phase 1).
  One PR per task.

## Progress / evidence
- Branch `feat/phase-2-cards-api` from `main` 02be7bb.

- T1: 7 slices RED→GREEN; typecheck/build ok; tsup bundles `fractional-indexing` into the API dist. Deviations
  accepted: create never assigns (new cards always BACKLOG unassigned at the cell end; taking a card into a row is a
  move, T2); PATCH accepts null/blank to clear doneCriteria/dueWeekday (400 `CARD_INCOMPLETE` outside BACKLOG);
  optimistic lock in the adapter (writes only while `updatedAt` matches → 409 `CARD_CONFLICT`); a replayed POST
  must match author AND team, else 409 `ID_CONFLICT`; `isValidPosition` also enforces base-62 and ≤128 chars.
- T1 contract for T3: `CardResponse {id, teamId, projectId, sprintId, assigneeId, title, doneCriteria, dueWeekday,
  status, position, validated, validatedById, carriedOverCount, completedAt, createdById, createdAt, updatedAt}`;
  `BoardResponse {team{id,name,groupId,moderatorId}, members[{userId,name,username,isModerator,rowOrder}],
  sprint{id,number,startDate,endDate,goal,status,updatedAt}|null, projects, cards}` (cards = backlog + open sprint,
  sorted column → bytewise position → id). Errors: `TEAM_NOT_FOUND`, `CARD_NOT_FOUND` 404; `FORBIDDEN` 403;
  `ID_CONFLICT`, `CARD_CONFLICT`, `CARD_NOT_IN_BACKLOG` 409; `INVALID_PROJECT`, `CARD_INCOMPLETE` 400.

- T1 committed 91bf122; RDD assessed medium (`slice_budget_reached`), user granted, reliability lens running.
- T2 runs on the same branch (stacked) while the T1 review captures read the immutable T1 tree.

- T1 RDD: reliability lens approved, acknowledged (burned); one suggestion (lock race untested). PR 1 #9 merged
  (9dd74f2); production `GET /teams/:id/board` → 401 without session.
- T2: 4 slices RED→GREEN; done-criterion test `phase2-flow` (two students move own cards 200; other's 403; moderator
  200; teacher 403). Deviations accepted: `MoveCardRequest.position` is a plain string so the service returns
  `INVALID_POSITION`; `planMove(card, target, {now, memberIds})`; any non-null target assignee must be a team member;
  `releaseUnfinishedCards(…, actorId)` writes MOVED/ASSIGNED events authored by the teacher; move never checks
  `validated` (Sat).
- T2 move contract for T3/T4: `POST /cards/:id/move {status, assigneeId|null, position, dueWeekday?, doneCriteria?,
  expectedUpdatedAt?}` → 200 CardResponse. Error order: VALIDATION_ERROR 400 → CARD_NOT_FOUND 404 → FORBIDDEN 403 →
  CARD_CONFLICT 409 → INVALID_POSITION 400 → NOT_A_TEAM_MEMBER 400 → CARD_INCOMPLETE 400. Member: own card or claim an
  unassigned BACKLOG card, target own row or `null`+BACKLOG; moderator any; teacher 403.

- T2 RDD: reliability lens approved, acknowledged (burned); one suggestion. PR 2 #10 merged (e169153); production
  `POST /cards/:id/move` → 401 without session.
- T3: slices RED→GREEN (ids test written after the code). Deviations accepted: on CARD_CONFLICT forms reset to the
  reloaded card; "Sin asignar" row first (also holds cards of ex-members); mine filter shows only the viewer's row;
  filter and "Nueva tarjeta" for members only (disabled without projects); phones open on the viewer's tab; route
  `handle.wide` gives board pages `max-w-7xl`; projects mutations invalidate the `['teams', id]` prefix; moderator
  badge moved to the board header. Build warning: main chunk 530 kB (> Vite 500 kB) — cuid2 pulls `bignumber.js` and
  `@noble/hashes`; consider code-splitting later.
- T3 notes for T4: wrap `BoardGrid`/`BoardTabs` in `DndContext`; `BoardCell` droppable keyed by (assigneeId, status);
  sortable `<li>` around `CardTile`; use `canMoveCard`/`moveTargetRows`, `positionAt(cellCards(...), index, id)`,
  `positionAtEnd`; `useMoveCard(teamId)` gets `onMutate`/`onError` optimistic rollback; pause polling while dragging;
  drags out of BACKLOG on incomplete cards open `CardDialog`.

- T3 RDD: reliability lens approved (no findings), acknowledged. PR 3 #11 merged. A mid-T4 candidate (dnd-kit deps in
  `package.json`/lockfile, stop hook, user granted) approved, acknowledged.
- T4: pure `resolveDrop` (none/rejected/dialog/move) + `applyMove`; optimistic `useMoveCard` with rollback; polling
  paused while dragging or a move is pending; Spanish announcements; keyboard drag via a separate "Arrastrar tarjeta"
  handle (Enter/Space on the card opens the dialog). Deviations accepted: Mouse (distance 6) + Touch (200 ms delay,
  tolerance 8) sensors instead of Pointer (keeps phone scrolling); no cross-cell reflow mid-drag; full drops untested in
  jsdom (resolver covered by pure tests). Board route lazy-loaded: main chunk 489.67 kB (gzip 149 kB), board chunk
  95.25 kB; SW precaches 17 app-shell entries, `runtimeCaching` empty.

- T4 committed b6867a5; RDD assessed medium, user granted, reliability lens approved, acknowledged. Advisories
  (follow-ups): a failed first move's rollback can overwrite a second pending move until refetch; drop → page wiring
  untested in jsdom. An accumulated T2+T3+T4 review (stop hook) was declined by the user for that candidate
  (slices already reviewed).
- PR 4 #12 merged (67ab2bd).
- Production smoke (Oct 17, by the user): tested as teacher (read-only), moderator and student; moving own cards
  works, moving another student's card is refused, the moderator moves any card — done criterion met.
- Open follow-ups: concurrent-drag rollback; drop wiring tests; optimistic-lock race untested; `CardEvent` rows are
  deleted with their card (cascade); slow web tests near Vitest's 5 s timeout under load.

## Status
Phase 2 done: two students move their own cards; moving another's → 403.

## Next step
Phase 3 (Sat 17, spec §12.1): sprint — start the week's sprint (goal), Backlog exit rules (attach to the open sprint),
moderator validation (single + "validar todas"), no "En marcha" without validation, visual states (por validar /
vence hoy / atrasada), simple close (unfinished cards back to Backlog keeping the assignee), tested with the
injectable clock across Mon–Fri. Propose the file plan first (spec §14).
