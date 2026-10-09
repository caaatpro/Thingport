# Backend migration to feature modules (temporary working document)

Goal: move `backend/src` from a flat `routes/` + `services/` + `utils/` layout to the module layout described in
[BACKEND.md](BACKEND.md), improving the code as it moves, **without changing behaviour**. Several people work at
the same time, each on one module, in the same working tree. Read BACKEND.md first.

## The contract you must not break

API (paths, methods, status codes, JSON shapes, headers), database schema, on-disk layout, env vars. Three nets catch
mistakes: the Vitest suite (HTTP-level and unit), the frontend's Playwright e2e suite, and a recorded-response diff of
about 70 endpoints against the pre-migration backend. If a test seems to contradict how you think it _should_ work,
the test wins; if you believe it encodes a bug, keep the behaviour and say so in your report.

## How to move code safely while others do the same

1. Work only in your module's folder `src/modules/<name>/` and on the old files listed in your brief.
2. Moving a file means: create the new file (improved), then replace the old file with a one-line shim so everyone
   else's imports keep compiling until the final cleanup: `export * from "../modules/<name>/<file>";` (add
   `export { default } from "..."` when the old file had a default export). Do not delete shims; cleanup is a later step.
3. Inside your module import siblings relatively. For things owned by other modules import the **old path** for
   now (it works through the shims); the cleanup step rewrites those to module `index.ts` imports.
4. Give your module an `index.ts` that exports exactly what other modules need (look at who imports your old files:
   `git grep -n "services/<oldname>"`). Keep the exported names stable: others are coding against the old names.
5. Routes: replace the legacy `Router` + `asyncHandler` + `parseBody` + `req.userId!` style with `createRouter()`
   from `src/http/route.ts` (per-route access, zod `body`/`query` options, handlers return the JSON). Move request
   schemas to `schemas.ts`. Update `src/modules/<name>/routes.ts` so it exports `routers: Router[]` built from
   your `ApiRouter.router` objects (it currently re-exports legacy routers; keep the export name and type). While some
   modules are still legacy, order in `src/modules/index.ts` matters, so do not reorder it, but you may remove a
   legacy router there only by replacing it in your module's `routes.ts`.
6. Tests: move the tests that belong to your module next to the code (`git mv tests/x.test.ts
   src/modules/<name>/x.test.ts`, fix the imports, keep every assertion). Add tests for new helpers. A test file that
   mostly imports another module's files is not yours; leave it.
7. Quality bar while moving: thin routes, logic in services, no Express types in services, `logger` instead of
   `console`, no unused exports, no dead code, comments that say why. Fix real inefficiencies you notice (N+1 queries,
   sorting/paging in JS that SQL can do, repeated reads) as long as output stays identical; mention them in your report.
8. Never run `git add/commit/stash/checkout/reset`. Never touch another module's files (other than making a shim for
   a file you moved). Never edit `prisma/`, `package.json`, the lockfile or `Dockerfile`; if you need a new
   dependency or a schema change, say so in your report instead.
9. Verify with `backend/check.sh` (Docker, own throwaway database per run, safe in parallel):
   `./check.sh src/modules/<name> src/<oldpath…> -- <test-file-substrings>` while you work, and one plain
   `./check.sh` at the end. Failures in files you don't own can be someone mid-edit: wait a minute and rerun before
   suspecting your own change. A pre-commit-style secret filter rejects tool inputs containing the literal name of
   the env file or an event's `.key` property; avoid writing those.
10. Finish with a short report: what moved where, the module's public surface, behaviour risks you saw, tests added,
    anything other modules must know.
