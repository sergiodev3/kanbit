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
- [ ] T2 API move: `canMoveCard`/`canEditCard`, `card.rules.ts`, `/move`, `releaseUnfinishedCards` events,
  `phase2-flow` done-criterion test (~650) — route: delegated
- [ ] T3 Web board read + CRUD: board model, BoardPage, rows/columns, mobile tabs, CardDialog with "Mover a",
  mine filter, polling, offline write disable, teacher read-only route (~1000) — route: delegated
- [ ] T4 Web drag & drop: dnd-kit grid, sensors, optimistic move with rollback, polling paused while dragging,
  README, deploy + production smoke (~550) — route: delegated

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

## Next step
Commit T1, review, open PR 1, then T2.
