# Thingport Modernization — Audit & Implementation Plan

> Status: **Draft for review.** No code changes yet (beyond the already-merged edit-dialog fixes in `fix/edit-preview-upload-cascade`). This document is the audit + plan requested before implementation. Nothing here is implemented until approved.

Goal: turn Thingport into a modern, fast, convenient **personal/team 3D-model library** — global drag & drop upload, collection-aware upload, automatic async processing, private/shared visibility, modern UI — **without breaking existing libraries, files, users, or the self-hosted nature of the app.**

---

## 0. System at a glance (verified from code)

- **Services (docker compose):** `db` (PostgreSQL 16), `flaresolverr` (anti-bot helper for web imports), `backend` (Node/TS, Express, Prisma, multer, sharp, three + meshoptimizer), `frontend` (React 18 + Vite + MUI v6 + react-router v6, served by nginx which proxies `/api/*` → backend).
- **Storage model:** Thingport **owns** its storage dir (`/app/storage`). Files are laid out on disk under a **`u-<userId>`** segment, then a template (`{category}/{model}/{filename}` by default). Subdirs: `thumbs/`, `previews/`, `model-previews/`, `normalized-3mf/`, `bundles/`. Persistent volumes: `thingport_storage`, `thingport_db`.
- **Auth:** JWT (`Authorization: Bearer` or `?token=` for `<img>`/download links). Roles `ADMIN` / `MEMBER`. First registered account = admin.
- **Deploy note (this server):** currently running a build from this fork (branch `fix/edit-preview-upload-cascade`), same volumes, data preserved.

---

## 1. Current architecture

### 1.1 Upload & processing pipeline (mostly synchronous)

`POST /api/upload` (`backend/src/routes/prints.ts`) → multer writes temp files → `createPrint` / `addPlatesToPrint` (`services/printCreation.ts`). **Inside the HTTP request, blocking the response**, it:

1. Validates category ownership, de-dupes name.
2. Creates `Print` + `Plate` rows.
3. Moves files into managed storage (`fs.rename`, EXDEV→copy).
4. **Generates thumbnails synchronously** (`sharp`): for `.3mf` it extracts the embedded PNG; for images it resizes.
5. **Extracts prepared-print metadata synchronously** (`services/preparedPrint.ts`) — only for sliced files (`.gcode`, `.gcode.3mf`, `.bgcode`).

The **only** deferred work is **GLB 3D-preview generation**, and only when the instance setting `PreviewMode = automatic`, and **only for `.3mf`**: fired `void` (not awaited), run in a **worker thread** on a module-level **serial queue** (one render at a time, RSS watchdog + 180s timeout), cached to disk at `model-previews/<plateId>.v3.glb`. In `on-demand` mode the GLB is built lazily on first view (`GET /plate/:id/preview.glb` returns 404 + a code while generating).

**Thumbnails for STL / OBJ / STEP are generated on the CLIENT** — the detail page renders a three.js snapshot and uploads it back (`POST /plate/:id/thumbnail-generated`). → **A model that is uploaded but never opened has no thumbnail** (except 3MF, which has a server-extracted embedded PNG). This is a key gap for a "drop and forget" flow.

**Search indexing is free:** `Print.searchVector` / `Collection.searchVector` are **Postgres generated `tsvector` columns** (hand-written migration) — no app-side index step.

### 1.2 Background jobs

There **is** a DB-persisted job system — but it is **import-specific**: Prisma model `ImportJob` (`type` COLLECTION/ZIP/PROFILES, `status` RUNNING/DONE/ERROR), dispatched **fire-and-forget on the main event loop**, progress **polled** by the client. One RUNNING job per user acts as a lock. On restart, in-flight jobs are **reset to ERROR** (not resumed). There is **no generic reusable queue** and **no worker pool**. Two ad-hoc worker-thread + serial-queue caches exist (GLB previews, 3MF normalization), each a copy of the same pattern.

### 1.3 Permissions & data model

**There is no sharing / visibility / public concept anywhere today.** Every content row (`Print`, `Collection`, `Category`, `Plate`, `PrintFile`, `PreviewImage`, `Bookmark`, `ImportJob`, `Notification`) is single-owner (`userId`) and **every read query is hard-scoped to the requesting user**. Admins **cannot** see other users' content (only aggregate counts). So Thingport today is effectively N isolated single-user libraries sharing one instance.

Key models:

- **`Print`** = "a model": `userId` (owner), `name`/`title`/`notes`/`creator`, `tags[]`, `categoryId?`, `authorId?`, `preparedMetadata` (Json), `searchVector`. Relations: `plates[]`, `previewImages[]`, `files[]` (PrintFile), `collectionItems[]`.
- **`Plate`** = a model file: `filename`, `mime`, `size`, `storagePath`, `contentSha256?`, `position`. **No geometry metadata.**
- **`Category`** — hierarchical (parent/child tree), per-user, **one per print**, drives the storage path.
- **`Collection`** — flat, per-user, **many-to-many** with prints via **`CollectionItem`** join (a print can be in multiple collections). `favorites` / `history` are **virtual** (derived from `Print.favoritedAt` / `lastViewedAt`), not rows.
- **`Author`** — global/instance-wide (shared across users), claimed per-user via `AuthorLink`.

**Files on disk are partitioned under `u-<ownerId>`** and all file-serving routes scope `print: { userId: req.userId }`. → For "shared" viewing, file-serving must resolve the **owner's** segment while authorizing a **non-owner** viewer. This is the main plumbing gotcha for visibility.

### 1.4 Search

Two surfaces:

- **Global `/search`** — Postgres `tsvector`, **prefix** (type-ahead) query, ranked by `ts_rank`. Weighted: name+title (A), tags (B), notes (C), creator (D). Config `simple` (no stemming). Caps 6 models / 4 collections / 5 tags.
- **Library list `/prints`** — plain **ILIKE** `contains` on name/title/notes/creator (does **not** use tsvector, does **not** search tags). Filters: `category_id`, `author_id`, `collection_id`, `tags`. Sort: newest / popular / downloads. Offset pagination via `X-Has-More` / `X-Next-Offset` headers.

### 1.5 Metadata

Per plate: `filename`, `mime`, `size`, `contentSha256`. **No geometry** (no bounding box, dimensions, units, triangle/vertex counts, materials). Geometry **is computed** for 3MF during GLB render (and by the 3MF normalizer) but **stored only inside the GLB `userData`, never in the DB**. The only DB-persisted extracted metadata is slicer data (`preparedMetadata`) for sliced files.

### 1.6 Formats (from real code)

| Format        | Upload                                      | Storage                                                   | Preview                             | Metadata                                                   | Thumbnail                                   | Search             |
| ------------- | ------------------------------------------- | --------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------- | ------------------------------------------- | ------------------ |
| **STL**       | ✅ allowed+renderable                       | ✅ Plate                                                  | ✅ client three.js `STLLoader`      | size/mime/filename only                                    | ⚠️ client snapshot only (none until opened) | text fields + tags |
| **3MF**       | ✅ (top import priority)                    | ✅ Plate                                                  | ✅ **server GLB** (worker) + client | ✅ slicer meta if sliced; geometry computed but not stored | ✅ **server** embedded PNG                  | text + tags        |
| **OBJ**       | ✅ (absent from import priority)            | ✅ Plate                                                  | ✅ client `OBJLoader`               | size/mime/filename                                         | ⚠️ client snapshot only                     | text + tags        |
| **STEP/STP**  | ✅                                          | ✅ Plate                                                  | ✅ client **occt-import-js** (wasm) | size/mime/filename                                         | ⚠️ client snapshot only                     | text + tags        |
| **IGES/.igs** | ❌ not allowed                              | ⚠️ only as non-renderable SUPPORTING file (manual upload) | ❌                                  | size/mime/filename                                         | ❌ placeholder                              | text only          |
| **F3D**       | ⚠️ in UI `accept` only, otherwise unhandled | ⚠️ non-renderable file                                    | ❌                                  | size/mime/filename                                         | ❌ placeholder                              | text only          |
| **F3Z**       | ❌ not referenced anywhere                  | ⚠️ raw manual upload only                                 | ❌                                  | size/mime/filename                                         | ❌ placeholder                              | text only          |

Gate note: the **manual `/upload` route has no extension filter** (multer, no `fileFilter`) — it stores anything and decides renderability by `RENDERABLE_MODEL_EXTS`. URL/collection imports **do** validate against `IMPORT_ALLOWED_EXTS` (415 on reject).

### 1.7 Frontend

React 18 + MUI v6 + react-router v6. **No react-query/SWR** — plain `fetch` + `useState`/`useEffect`; cross-component refresh is a manual **nonce** that forces a full-grid refetch. `@dnd-kit` is present but used only for sidebar/category reordering.

- **Upload** = hidden `<input type=file multiple>` in `useUploadImport` triggered from the **Add menu**. Multi-file pick → `ImportModeModal` (Separate vs Multiplate). **No drag & drop is wired** — though `entriesFromDataTransfer` (recursive folder traversal) and `isFileDrag` **already exist in `utils/` with zero callers** (dead code to revive). **No upload queue / per-file progress** (just a boolean + toast; failures via `alert()`). **Not collection-aware** (upload carries only `category_id`).
- **Model card** shows preview, provider badge, favorite, title, author, view/print counts. **Missing:** format, size, tags, collection, status, date, visibility.
- **Collections** many-to-many; add/remove via a modal of toggle chips (immediate API). **No drag into collections, no multi-select/bulk.**
- **Responsive:** sidebar never collapses to a mobile drawer; hard-coded grid breakpoints; no skeletons; bare empty states; cards are `Paper`, not semantic links.

---

## 2. UX problems (what's bad, and why)

1. **Upload is a chore.** Hidden file input behind a menu; no drag & drop; a mode dialog interrupts every multi-file upload; no visibility of progress; failures are a blocking `alert()`. Nothing matches the "drop files anywhere" expectation of a 2025 asset manager.
2. **Upload isn't contextual.** Inside a collection you still can't upload into it; you upload, then separately toggle collection membership.
3. **New uploads don't appear live.** After upload the user is navigated away; the grid only updates on a full nonce-refetch — no optimistic insert, no shared cache.
4. **No thumbnails for drop-and-forget.** STL/OBJ/STEP thumbnails are rendered **client-side on the detail page**, so a model you never open shows a placeholder. Breaks the "drop → preview appears" promise.
5. **No privacy.** Zero visibility model — unacceptable for a team instance where personal and shared models must coexist. (Also means "accidentally publish" is impossible today only because nothing is shared at all.)
6. **Thin model cards.** No format/size/tags/collection/visibility/status at a glance.
7. **Weak in-list search/filters.** Grid has only a category tree + 3 sort tabs; no text filter, no facets (format, tag, visibility, date, favorite). The good tsvector search powers only the global top-bar box.
8. **Not mobile-friendly.** Fixed sidebar eats phone width; spinners not skeletons; empty states are bare one-liners.
9. **Processing blocks the request.** Thumbnail + metadata extraction run in the upload handler; fine for one small STL, poor for "drop 50 files."

---

## 3. Proposed architecture

Guiding principles: **keep it self-hosted-simple** (no Redis/RabbitMQ), **additive & reversible** migrations, **don't move existing files**, **backward-compatible APIs** (additive fields only).

### 3.1 Processing → a small, durable, generic job queue

Generalize the existing `ImportJob` pattern into a minimal **`ProcessingJob`** concept (DB-backed, no external broker), reusing the existing worker-thread + serial-queue machinery:

```
POST /upload  →  save file + create Print/Plate rows (status = PROCESSING)  →  return 201 immediately
                                   │
                                   └─ enqueue ProcessingJob(plateId)  (DB row)
                                                   │
             in-process worker loop (concurrency 1–2, bounded) drains the queue:
               validate → detect format → extract metadata → generate thumbnail (server-side)
               → generate GLB preview (existing worker) → mark Ready / Failed  (per-file)
```

- **Durable + restart-safe:** jobs are rows. On boot, re-enqueue anything left in `PROCESSING`/`QUEUED` (unlike today's import jobs which are abandoned). This satisfies the restart test.
- **Per-file isolation:** one file failing marks only that plate `FAILED`; the model still lands in the library with a clear status.
- **No new infra:** a single in-process consumer with the existing serial/worker pattern; `mapWithConcurrency` already exists. We can keep the existing bespoke GLB worker and just drive it from the queue.
- **Server-side thumbnails for all renderable formats** (new): extend the headless three.js render (already used for 3MF GLB) to STL/OBJ, and occt-import-js (already bundled, runs under Node) for STEP, so a dropped-and-forgotten model gets a thumbnail without the client. Client snapshot path stays as a fallback/override.

**Why not just keep it synchronous?** Dropping many files must not hang the request or the UI, and server-side thumbnailing is CPU-heavy — it belongs off the request. **Why not Redis?** Single-node self-hosted; a DB table + one worker loop is simpler, durable, and sufficient.

### 3.2 Visibility / permissions

Add an enum **`Visibility { PRIVATE, SHARED }`** (default **PRIVATE**) to **`Print`** and **`Collection`**.

- **Model `visibility` is the single source of truth** for whether other users can see/open a model. `SHARED` = visible to all instance users (read-only for non-owners); `PRIVATE` = owner only.
- **Collection `visibility`** controls whether the **collection listing** is visible to others. A model's visibility is **independent** of the collection's — so a SHARED collection can contain a PRIVATE model, and that model stays hidden from others (matches the required scenario: shared collection with models A/B shared, C private → C hidden). When listing a shared collection for a non-owner, filter its items to those that are `SHARED`.
- **Default-safe:** new uploads = PRIVATE (section 7 requirement). Dropping into a SHARED collection does **not** auto-share the model; we may offer a one-click "share these too" affordance, but the default never publishes.
- **Writes stay owner-only** always (edit/delete/favorite/category/tags). Non-owners get read + download of SHARED content only.
- **Instance-wide sharing, not per-user ACLs** (for now): simplest model that satisfies "all users see shared," avoids a sharing-target join table. Per-user/targeted sharing can come later as a `*Share` join without reworking this.

**Query choke points to update** (add an "owned OR (shared AND not owner)" predicate on reads): `services/printLoader.ts`, `routes/prints.ts buildPrintWhere` + per-id read guards, `services/searchService.ts` (raw SQL), `services/collectionService.ts` + `routes/collections.ts` reads, `services/dashboardService.ts` (decide if shared counts), file-serving routes (`prints.ts`, `plates.ts`, `printFiles.ts`, `previewImages.ts`) **including the `?token=` path**.

**Storage gotcha:** file-serving must resolve the **owner's `u-<ownerId>`** path when a non-owner views a SHARED model — today these routes assume `userId === req.userId`. Resolve owner from the Print row, then authorize via visibility.

### 3.3 Frontend data layer

Introduce **TanStack Query (react-query)** for list/detail fetching and cache invalidation. This makes uploads **appear live** (optimistic insert + background refetch), removes the manual nonce, and gives consistent loading/error states. Scoped, incremental adoption (start with the models grid + collection detail + upload mutations); don't rewrite everything at once.

### 3.4 Global drag & drop

App-shell-level drop handling in `AppLayout`, reviving the existing (dead) `entriesFromDataTransfer` / `isFileDrag` utilities:

- Whole window is a drop zone; on drag-over show a **soft full-page overlay** ("Drop models here" / "Add to <Collection>") that does not fully obscure content.
- On drop: overlay disappears, files go into a compact **upload queue** (bottom-corner), the user keeps working.
- **Context-aware destination** from the route: on `/models/collections/:id` → add to that collection; on a category view → that category; else the general library. No "select collection/file" dialogs.
- Folders (where the browser supports it) map to categories via the already-existing `uploadEntriesToCategory`.
- Replace the forced Separate/Multiplate modal with a smart default (separate prints) + an optional per-batch toggle in the queue, so the common case is zero clicks.

---

## 4. Proposed UX

- **Upload:** drop anywhere → instant queue chips (Uploading → Processing → Generating preview → Ready / Failed) → cards appear live in the grid; no modal, no Upload button required (the Add menu stays as a discoverable fallback).
- **Collection-aware:** dropping on a collection page files straight into it; dropping in the library leaves them uncategorized.
- **Visibility:** a clear `🔒 Private` / `👥 Shared` badge on cards and detail; a one-click toggle (no settings screen). Same for collections.
- **Model card (modernized):** preview, title, a small **format chip** (STL/3MF/STEP…), **size**, visibility badge, processing status (while not Ready), tags on hover; provider badge kept. Extra detail stays on the model page.
- **Library:** instant in-grid search (reuse the tsvector surface) + facet filters (format, tag, visibility, author, collection, favorite, date) + existing sort tabs; skeleton loaders; real empty/error states; keyboard-navigable cards (real links/buttons).
- **Mobile:** sidebar becomes a drawer with a hamburger; fluid grid; touch-friendly targets.

---

## 5. Data model changes

All additive and reversible. Backups + reversible migrations before applying (section 14).

1. **`Visibility` enum** `{ PRIVATE, SHARED }`.
2. **`Print.visibility`** `Visibility @default(PRIVATE)` + index for shared-listing queries. Backfill existing rows → `PRIVATE` (preserves today's "owner-only" behavior exactly; nobody's model suddenly becomes visible).
3. **`Collection.visibility`** `Visibility @default(PRIVATE)` + index. Backfill → `PRIVATE`.
4. **Processing status:** `ProcessingStatus { QUEUED, PROCESSING, READY, FAILED }` on **`Plate`** (per-file) and a derived/aggregate on `Print` if useful. Existing rows backfill → `READY` (they already have files/thumbs). Optional `processingError String?` on Plate for the Failed reason.
5. **`ProcessingJob`** model (generalized from `ImportJob`): `id`, `plateId`/`printId`, `kind`, `status`, `attempts`, `error?`, timestamps, index `[status]`. (Alternatively, drive purely off `Plate.processingStatus` + a boot re-scan; a dedicated table is cleaner for retries/visibility. Decide at P0.)
6. **(P2) Geometry metadata** (optional, additive): persist bounding box / dimensions / triangle count / units on `Plate` (`bboxJson`, `dimXmm/Y/Z`, `triangleCount`, `units`) — computed during the server-side render we're adding anyway. Enables size/dimension display, sorting and filtering.
7. **(P2) Fusion/CAD:** no schema change needed beyond format handling; optional `Plate.metadata` JSON for extracted component/body names.

DTO additions (`backend/src/dto.ts`): `visibility` (+ `is_owner`, `shared_by` where useful) on `PrintOut` / `CollectionOut`; `processing_status` on plate/print; optional geometry fields. **Additive → safe** for the frontend types and the browser extension (its types are optional-field-tolerant).

---

## 6. File-format support (current → proposed)

| Format    | Now                                    | Proposed                                                                                           |
| --------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| STL       | client preview, client-only thumb      | **+ server-side thumbnail** (queue), geometry metadata (P2)                                        |
| 3MF       | server GLB + embedded thumb            | keep; persist computed geometry to DB (P2)                                                         |
| OBJ       | client preview, client-only thumb      | **+ server-side thumbnail**; add to import priority list                                           |
| STEP/STP  | client occt preview, client-only thumb | **+ server-side thumbnail/GLB via occt (Node)**; geometry metadata (P2)                            |
| IGES/.igs | unsupported                            | **add** (occt reads IGES): allow + renderable + server preview (P2)                                |
| F3D       | accept-only, unhandled                 | **store + download + embedded-thumbnail extraction**; prompt STEP export for live 3D (P2) — see §7 |
| F3Z       | absent                                 | same as F3D (zip archive) (P2)                                                                     |

Also: add a real extension allow-list to the manual `/upload` route (currently none) so junk isn't silently stored, while keeping non-renderable-but-valid files as SUPPORTING.

---

## 7. Fusion 360 — what's realistically possible

**Honest ceiling: native `.f3d`/`.f3z` interactive 3D preview is NOT reliably shippable** without either Autodesk's cloud (privacy-incompatible with self-hosting) or an experimental reverse-engineered parser (too immature to depend on). `.f3d`/`.f3z` are proprietary ZIP containers around Autodesk ShapeManager (ASM) B-Rep — a closed kernel Autodesk does not license; newer files even use Zstd (ZIP method 93) that stock unzip can't inflate.

What we **will** do (all open-source, no Autodesk account, files never leave the server):

- **Native storage + download** — always works. Add `.f3d`/`.f3z` to allowed (non-renderable) uploads; never modify the original.
- **Embedded thumbnail extraction** — Fusion embeds PNG previews (`**/Previews/*.png`) in the archive; extractable with the zip tooling + `sharp` we already use for 3MF's embedded thumbnail. Fail gracefully when absent or Zstd-compressed. This gives a real card image for most files at near-zero risk. (Proven pattern: GyroidVault PR #60 using `adm-zip`.)
- **"Export STEP for live 3D" path** — prompt the user to also upload a STEP export; STEP flows through the **already-bundled occt-import-js** for an interactive preview (and a server-baked GLB via the new queue). STL export is an even simpler fallback.
- **Optional manifest metadata** — read component/body names + units from the archive's JSON manifests (text, no geometry kernel needed).

What we will **not** do: ship `ezf3d`/FreeCAD `InventorLoader` as production f3d parsers (alpha / GPL / fragile), or route private files through Autodesk APS Model Derivative by default (data leaves the server). APS could be an explicit, off-by-default opt-in later for users who don't care about privacy.

Support tiers: **Native storage ✅ · Download ✅ · Thumbnail ✅ (when embedded) · Metadata ⚠️ (names/units only) · Interactive preview ❌ native / ✅ via STEP export · Conversion ⚠️ only from exported STEP, never from raw .f3d.**

---

## 8. Implementation plan (phased)

Each phase is independently shippable and reversible. Order respects the P0/P1/P2 priorities.

### Phase 0 — Foundations (no user-visible change)

- **Data model:** add `Visibility` + `ProcessingStatus` enums; `Print.visibility`, `Collection.visibility`, `Plate.processingStatus` (+ error); optional `ProcessingJob` table. Reversible migration; backfill existing → `PRIVATE` / `READY`. **DB backup first.**
- **DTOs:** add fields (additive).
- **Tests:** migration up/down; backfill correctness; existing API responses still validate against frontend/extension types.
- **Risks:** low (additive). Verify `prisma migrate` on a copy of prod data.

### Phase 1 — P0 features

1. **Generic processing queue** (`services/processingQueue.ts`): drains `ProcessingJob`/`PROCESSING` plates; runs validate → metadata → **server-side thumbnail** (extend headless render to STL/OBJ; occt for STEP) → GLB (existing worker) → status. Boot re-enqueue of interrupted jobs.
   - Files: `services/processingQueue.ts` (new), `services/printCreation.ts` (return fast, enqueue), `services/modelPreviewCache.ts` (reuse worker), `server.ts` (boot re-scan).
   - API: `/upload` returns immediately with `processing_status`; add `GET /print/:id` (already) reflecting status; optional `GET /processing/active`.
   - Tests: upload returns before processing finishes; one bad file → that plate FAILED, others READY; **restart mid-processing → resumes**; thumbnail appears for an STL never opened.
2. **Visibility backend**: enforce "owned OR shared" on all read choke points (§3.2); writes owner-only; file-serving resolves owner segment + honors `?token=`; collection item listing filters by model visibility for non-owners.
   - Files: `printLoader.ts`, `routes/prints.ts`, `searchService.ts`, `collectionService.ts`/`routes/collections.ts`, `dashboardService.ts`, file routes.
   - API: `POST /print/:id/visibility`, `POST /collection/:id/visibility`; `visibility` in outputs.
   - Tests: the full permission matrix (§9).
3. **Global drag & drop + collection-aware upload + queue UI** (frontend):
   - Files: `components/Layout/AppLayout.tsx` (drop overlay), `components/uploads/useUploadImport.tsx` + `utils/uploadTree.ts`/`dragEvents.ts` (wire D&D, add collection target, progress queue), new `UploadQueue` component, `api/prints.ts` (`collection_id` on upload), route-context hook for destination.
   - API: `/upload` accepts optional `collection_id` (adds `CollectionItem` server-side after create).
   - Tests: drop in collection → all land in it; drop in library → uncategorized; 10 files with 1 broken → 9 Ready + 1 Failed, batch not rolled back.
4. **Visibility UI**: badges on card + detail, one-click toggle; default-private messaging.
   - Risks: the storage-segment resolution for shared files is the trickiest bit — add focused tests. Everything backfilled to PRIVATE means **zero behavior change on day one** until a user shares something.

### Phase 2 — P1 features

- **Live lists via react-query** (models grid, collection detail, upload mutations): optimistic insert so dropped files appear immediately; remove the nonce.
- **Modern model card**: format chip, size, visibility badge, processing status, tags on hover; semantic links; fluid grid.
- **In-grid search + facet filters** (format, tag, visibility, author, collection, favorite, date); reuse tsvector; unify the `/prints` list search with the tsvector surface.
- **Collection UX**: drag models into collections, multi-select/bulk add, better covers.
- **Mobile drawer + skeletons + empty/error states + keyboard nav.**
- Tests: filter/search correctness incl. visibility; responsive snapshots; a11y basics.

### Phase 3 — P2 features

- **Geometry metadata** persisted during server render (bbox/dimensions/tri count/units) → show on card/detail, enable size/dimension sort+filter.
- **Fusion 360**: store `.f3d`/`.f3z`, extract embedded thumbnail, "export STEP for live 3D" prompt, optional manifest metadata (§7).
- **IGES** support via occt; extend the format allow-list and server preview.
- Tests: format matrix regressions; Fusion thumbnail extraction (incl. "no embedded preview" and Zstd → graceful null); IGES preview.

---

## 9. Required test scenarios (acceptance)

- **Permissions.** User A: private model A → visible to A; shared model → visible. User B: private model A → **not** visible/openable (API + file-serving + search + dashboard + collection listing); shared model → visible read-only, downloadable, **not** editable/deletable.
- **Collection upload.** Open Collection A, drop 10 files → all 10 auto-added to A, no collection picker.
- **Upload failure isolation.** 10 files, 1 corrupt → 9 Ready, 1 Failed, batch not rolled back, library shows the 9.
- **Restart durability.** Upload a model, restart backend/worker mid-processing → model + metadata persist and processing **resumes** to Ready (not abandoned as ERROR like today's import jobs).
- **Default privacy.** New upload is PRIVATE unless explicitly shared; dropping into a shared collection does not auto-publish.
- **Backward compatibility.** Existing users/collections/models/files keep working; existing API responses still satisfy frontend + extension types; existing files are not moved.

---

## 10. Safety / backward compatibility (hard constraints)

- **No destructive migrations.** Additive columns with safe defaults; provide down-migrations; **back up the DB (`pg_dump`) and config before each migration**.
- **Do not relocate existing files** on disk. (The only existing instance-wide relocation is the admin storage-template change — untouched.)
- **APIs additive only.** Before any change to an existing response, we've mapped consumers: frontend `src/api/*` (typed, update together) and the browser extension (`extension/src/shared/api.ts`, optional fields — additive is safe). The desktop bridge is a slicer launcher, not an API consumer.
- **Reversibility.** Each phase can be rolled back; visibility backfilled to PRIVATE means enabling the feature changes nothing until a user acts.

---

## 11. Open decisions for you

1. **Sharing scope:** instance-wide `SHARED` (everyone) now, with targeted per-user sharing later — or do you want per-user/targeted sharing from the start? (Instance-wide is much simpler and matches your described scenarios.)
2. **Processing queue:** dedicated `ProcessingJob` table (cleaner retries/visibility) vs. driving purely off `Plate.processingStatus` + boot re-scan (fewer moving parts). I lean to the table.
3. **react-query adoption** (Phase 2): OK to add it for the live-upload experience, or keep the current fetch pattern and do a lighter optimistic-insert hack?
4. **Scope of P0:** is server-side thumbnailing for STL/OBJ/STEP in P0 (needed for true "drop-and-forget preview"), or acceptable to ship P0 with client-thumb fallback and add server thumbs in P1?
5. **Fusion 360 priority:** confirm P2 is fine (store+thumbnail+STEP-export path), given native preview is out of scope.

---

_Prepared from a full read of the backend (`routes/`, `services/`, `prisma/schema.prisma`, `config.ts`), the frontend (`App.tsx`, `components/Layout/*`, `pages/*`, `api/*`, `utils/upload*`), and open-source research on Fusion 360 formats. Nothing in the running instance was modified to produce this document._
