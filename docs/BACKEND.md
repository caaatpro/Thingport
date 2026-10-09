# Backend architecture and conventions

The API server (`backend/`): Node 24, Express 5, Prisma 7 (PostgreSQL), zod 4, TypeScript (CommonJS output).

## Invariants (what a refactor must not change)

These are the contract with the frontend, the browser extension, deployed databases and files on disk:

1. **The HTTP API**: paths, methods, status codes, JSON field names and shapes (`{ detail, code? }` for errors),
   headers such as `X-Has-More`, auth rules.
2. **The database schema and migrations** (`prisma/`). Behaviour changes that need a column need a migration; pure
   refactors don't touch the schema.
3. **The on-disk layout** of stored models, previews and thumbnails (`services/printService` path rules, storage
   templates) and the cache file names of generated previews.
4. **Environment variables** and their defaults.

## Layout

```
src/
  server.ts            boot: serve, recover jobs, start the processing queue
  app.ts               createApp(): middleware, mounts every module's routers under /api
  config.ts            the only place that reads process.env
  db.ts                the Prisma client (and the admin database switch)
  http/                the web layer shared by every module
    route.ts           createRouter(): typed routes with access + zod body/query + return-the-JSON handlers
    errors.ts          HttpError and badRequest / unauthorized / forbidden / notFound / conflict
    errorHandler.ts    the one place errors become { detail, code? }
    requestLogger.ts, validate.ts (parse), upload.ts (multer)
  lib/                 framework-free helpers (logger, files, zip, urls, concurrency, tags …)
  modules/<name>/      one folder per feature area; the unit of ownership
    routes.ts          the module's routers (thin: auth, validation, call a service)
    service.ts …       business logic, no Express types in here
    schemas.ts         zod schemas for its requests
    dto.ts             DB row → API JSON mappers (snake_case, as the API always was)
    index.ts           the module's public surface: the ONLY file other modules may import from
    *.test.ts          tests live next to the code
  generated/           Prisma client (git-ignored)
```

Modules: `accounts` (sign-in, users, tokens, invitations, mail), `system` (health, settings, notifications,
audit log), `admin`, `prints` (models, plates, preview images, files, sharing, downloads), `library` (categories,
collections, bookmarks, tags, authors, search, dashboard), `processing` (thumbnails, previews, 3MF normalisation,
the job queue and its workers), `imports` (provider clients and the import pipeline).

## Rules

- **Routes are thin.** Declare them with `createRouter()` and state the access per route (`public | user | session |
admin`; default `user`). Validate with the `body`/`query` options (zod); return the JSON from the handler; use
  `ctx.res` only for files and streams. No `req.userId!`, no hand-rolled `try/catch`, no router-wide `requireAuth`.
- **Services hold the logic** and know nothing about Express. Throw `HttpError`s (`notFound(...)`, `forbidden(...)`)
  for expected failures; anything else becomes a 500.
- **Module boundaries.** Import another module only through its `index.ts`. Never reach into its files. Keep a module's
  exports small and named for what they do. A cycle between modules means the boundary is wrong: move the shared
  piece down into `lib/` or the module that owns it.
- **Config.** Read environment variables only in `config.ts`; everything else imports typed values from it.
- **Logging.** Use `logger` from `lib/logger` (levels via `LOG_LEVEL`), never `console.*`.
- **Authorisation lives next to the data access.** Use the helpers in the prints/library access code
  (`printReadWhere`, `printWriteWhere`, `requireCollectionRole`, …) rather than writing ad-hoc `userId` filters.
- **Database.** Select what you need; page and sort in SQL; avoid N+1 (batch with `in` queries or `include`).
  Wrap multi-row writes in `$transaction`.
- **Dead code goes.** No unused exports; no commented-out code; comments explain _why_.
- **Tests.** Vitest; HTTP tests use supertest against `createApp()` and the test database; unit tests cover pure
  logic. Test files share one database and run one after another. Keep tests deterministic (unique names via a
  timestamp stamp, clean up what you create). New behaviour gets a test.
- **Lint** is strict (oxlint): no shadowed names, hoist functions that capture nothing, no empty exports.

## Checking

```sh
npm --prefix backend run lint
npm --prefix backend test # needs DATABASE_URL pointing at a throwaway Postgres
```

CI builds the image (`tsc`) and runs the e2e suite; locally the throwaway-database run is wrapped by the repo's
Docker scripts.
