# Kanbit — agent guide

Kanbit is a PWA for weekly Kanban sprints and daily stand-ups in a classroom. `spec.md` is the source of truth; v1.0 scope is spec §12.1 — build nothing outside it (no abstractions for later versions).

## Workspace

pnpm workspace: `apps/api` (Express 5 + Prisma 7 → Railway), `apps/web` (React 19 + Vite 8 + Tailwind 4 + vite-plugin-pwa → Vercel), `packages/shared` (`@kanbit/shared`: zod enums/DTOs, consumed as TS source). Scripts live in each `package.json`; from the root `pnpm -r typecheck | test | build`, `pnpm dev`.

## Pinned versions (do not "upgrade to latest")

- `prisma` / `@prisma/client` / `@prisma/adapter-pg` **7.10.0 exact**. npm `latest` is an 8.0 RC — never install it.
- `typescript ~5.9.3` (TS 7 native port still breaks tooling).
- Node ≥ 22.12 (Vitest 5 requires it; Node 20 is EOL).
- pnpm enforces a minimum release age: when a just-published version is rejected, pick the previous mature version instead of adding `minimumReleaseAgeExclude`.

## Conventions

- Language: UI copy in Spanish (es-MX); code, identifiers, tables, commits in English.
- Strict TypeScript; `any` only with a comment justifying it.
- Shared enums and request/response schemas go in `packages/shared`; the API and web import them from `@kanbit/shared`.
- API layering per module (`src/modules/<name>/`): routes → controllers → services → prisma. Business rules (spec §7) live in services, with unit tests.
- Errors: throw `AppError(status, code, message)` from `src/http/errors.ts`; zod errors become `400 VALIDATION_ERROR`. Response shape is always `{ error: { code, message, details? } }`.
- All date/time logic goes through `src/lib/clock.ts` (`createClock(now)` is injectable; default zone `America/Monterrey`). Never call `new Date()` for business logic.
- Authorization lives in reusable helpers (`requireTeacher`, `requireTeamMember`, `requireModerator`, `canMoveCard`), checked on every endpoint.
- Offline-ready writes (spec §5.3.1): the client generates cuid2 ids and sends them in `POST`; a repeated `POST` with an existing id from the same author returns `200` with the existing record; `PATCH` accepts optional `expectedUpdatedAt` and returns `409` on mismatch.
- Web code is organised by feature: `src/features/{auth,board,sprint,meetings,teacher,...}`; cross-cutting UI in `src/shared/`.
- No file or image uploads anywhere.
- The service worker precaches the app shell only; it never caches API responses.

## Gotchas

- `createApp(deps)` in `apps/api/src/app.ts` has no side effects; tests inject a fake `pingDb` and clock. Only `src/index.ts` reads env and opens the DB.
- Prisma 7: the generated client is in `apps/api/src/generated/prisma` (git-ignored, produced by `postinstall`/`build`); the CLI reads `apps/api/prisma.config.ts`, not a `url` in the schema. `migrate dev` no longer runs `generate`.
- `Card.position` is a fractional index: order it bytewise (`ORDER BY position COLLATE "C"` or plain JS string compare), never with locale-aware collation.
- "One OPEN sprint per team" is a partial unique index declared in the schema (`partialIndexes` preview feature).
- Every stage ends with tests passing, `README.md` updated, and a versioned Prisma migration.

## Commits

Conventional Commits in English. No AI attribution or `Co-Authored-By` lines.
