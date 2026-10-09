# Frontend rewrite: architecture and rules

This is a from-scratch rewrite of the Thingport web UI. The **backend and its HTTP API are unchanged**. The old
frontend (`../frontend/`) is the behaviour reference: read it to learn _what_ a screen does, then build it fresh here.
Do not copy its structure or MUI code. When done, `frontend-next/` replaces `frontend/`.

## Stack

React 19 · Vite 8 · TypeScript 6 (strict) · **Tailwind CSS v4** (tokens in `src/styles.css`) · **Radix UI** primitives
wrapped in our own kit (`src/ui`) · **lucide-react** icons · **TanStack Query** for all server state · React Router 7
(declarative `<Routes>`) · dnd-kit (drag-and-drop) · three.js / occt-import-js (3D). English only: strings are inline,
there is no i18n layer. No MUI, no emotion, no i18next.

## Layout

```
src/
  api/          typed fetch clients, one per backend area. REUSE as-is (add functions if truly missing).
  utils/ hooks/ constants/   plain logic from the old app. REUSE. Pure helpers only; no UI.
  ui/           the design-system kit (Button, Modal, Menu, Select, Field, Toast, Confirm, …). Import from "@/ui".
  app/          providers (auth, theme, query client), preferences. Already done; don't restructure.
  layout/       the signed-in frame: AppLayout, Sidebar, TopBar, search, notifications, user menu, add menu.
  features/     shared, multi-page building blocks, one folder per domain (prints, imports, …).
  pages/        one folder per route; `index.tsx` default-exports the page. Pages compose features + ui.
  routes.tsx    the route table (lazy pages). Paths are fixed; don't change them.
```

`@/` is an alias for `src/`. Use it for cross-folder imports (`@/ui`, `@/api/prints`); use relative imports inside
a folder.

## The rules that make this one app instead of ten

1. **Use the kit.** Buttons are `Button`/`IconButton`, dialogs `Modal`, dropdowns `Menu`, fields `Field`+`Input`,
   choices `Select`/`Segmented`/`Checkbox`/`Switch`, feedback `Alert`/`EmptyState`/`Skeleton`/`PageLoading`,
   notifications `useToast()`, confirmations `useConfirm()`. Read `src/ui/*.tsx` before writing UI. If the kit lacks
   something small (a prop, a variant), add it _additively_ in `src/ui` (never change existing behaviour); if it's
   bigger, build it in your own folder.
2. **Style with tokens only.** Colours are `bg-bg bg-surface bg-surface-2 border-border text-fg text-muted
text-subtle bg-accent text-accent-text bg-accent-soft text-danger …`. Never hard-code hex or `dark:` pairs: the
   tokens already switch in dark mode. Radii: `rounded-control` (inputs/buttons), `rounded-card`, `rounded-dialog`.
   Shadows: `shadow-card/hover/overlay`.
3. **Everything that navigates is a real link** (`<Link to>` / `Button asChild` / `MenuItem asChild`), so Ctrl/Cmd-click
   and "open in new tab" work. Whole-card links use a stretched-link overlay (`features/prints/CardLink`, built by the
   prints kit) with the card's own buttons raised above it. Buttons never navigate via `onClick` + `navigate()`.
4. **Primary actions are visible.** No hiding the main action in a "⋮" menu or behind hover. Secondary actions go in a
   `Menu`. Icon-only controls need a `label` (it is the accessible name and the tooltip).
5. **Server state = React Query.** `useQuery` for reads, `useMutation` for writes, then `invalidateQueries` on the
   prefix of every list that shows the data. Keys: `["prints", …]`, `["print", id]`, `["collections"]`,
   `["collection", id]`, `["categories"]`, `["tags"]`, `["bookmarks"]`, `["notifications"]`, `["dashboard"]`,
   `["authors"]`, `["author", id]`, `["admin", …]`, `["settings", …]`, `["users"]`. Paginated lists use
   `useInfiniteQuery` (the prints API is offset-based and returns `hasMore`); see `hooks/useInfiniteScroll`.
   No hand-rolled `useEffect` fetching, no version counters, no prop-drilled refresh callbacks.
6. **No `onUnauthorized` props.** A 401 from any query/mutation signs the user out centrally. If you call `fetch`
   outside React Query and catch `UnauthorizedError`, call `useAuth().onUnauthorized()`.
7. **The URL is the state** for anything shareable: filters, sort, scope, selected category, view mode
   (`/models?category=ID&sort=popular&scope=shared`). Read/write with `useSearchParams`. Keep UI-only preferences
   (grid/list, sidebar collapsed) in `localStorage`, wrapped in try/catch.
8. **Handle all four states** of every data view: loading (skeletons that match the final layout), error (an `Alert`
   with a retry), empty (an `EmptyState` that tells the user what to do), and loaded. Disable buttons while a mutation
   runs and show a spinner (`Button loading`).
9. **Accessibility is not optional.** Landmarks, one `<h1>` per page (`PageHeader`), labelled controls, visible focus
   (global ring already set), `aria-pressed`/`aria-current` where applicable, dialogs via `Modal`.
10. **Performance.** Pages are lazy chunks already. Don't import three.js or big libs into shared code that the
    shell loads; keep 3D behind `React.lazy` boundaries. Memoise only where it's measurably needed.
11. **Speak plainly.** UI text is short, sentence case, active ("Add to collection", "Couldn't save. Try again.").
    Errors say what failed and what to do; use `errorMessage(err)` from `@/app/queryClient` for server text.

## Acceptance: the e2e suite

`e2e/*.spec.ts` (Playwright) is the contract for the whole rewrite; it passed against the old UI and must pass against
this one. It finds things by accessible name, so these names are **fixed**: headings "Dashboard", "Recently Added",
"Pick up where you left off", "Favorites"; buttons "Sign in", "Log out", "More actions" (model menu), "More"
(collection menu), "List"/"Grid" (view toggle, `aria-pressed`), "Add" (top-bar menu, with a menuitem "Upload"),
"Add tags", "Update", "Save", "Delete", "New Collection", "Upload models"; menus/menuitems "Edit", "Delete",
"Share…", "Password reset link…", "Disable account", "Enable account", "Edit name…", "Make regular member"/"Delete user";
labels `Email`, `Password` (sign-in), "User actions" (user menu trigger), `Select <model title>` (card checkbox);
placeholders `Search models…` (global search) and `Type a tag and press Enter`; roles: `toolbar` (bulk bar),
`dialog`, `row` (tables), `link` for every card/nav/result, `combobox` "Permission for <name>"; text "Library"
(sidebar group), "Administration", "Shared by <name> · Can upload", "Tags added", "Shared with 1 person.",
"Private — only you can see this". When in doubt, grep `e2e/` for what you're building. If a test needs updating
because the UI intentionally changed, change the test minimally and say so in your report.

Run browser tests with `E2E_NEXT=1 scripts/e2e.sh -g "<name>"` from the repo root (slow: it builds the whole stack,
so do it rarely and only once your pages compile). It serves `frontend-next/` on port 18090.

## Working rules for parallel work

- You own only the files named in your brief. Other people are building the rest right now, so **other areas may not
  compile yet**: judge your work with `./check.sh <your paths>` (type errors, lint, unit tests restricted to your
  paths; it runs in Docker). Do not run `vite build`/`npm install`, and do not edit `package.json`, the lockfile,
  `routes.tsx`, `app/*` or other people's folders. If you truly need a new dependency, say so in your report instead.
- **Do not commit.** Leave changes in the working tree.
- Reuse old logic by reading `../frontend/src/...` (read-only): API usage, edge cases, validation, keyboard handling,
  permission rules (`utils/access.ts` `hasRole`, `access_role`/`my_role` fields) must keep working.
- Write tests where logic is non-trivial (Vitest + Testing Library; render with `renderWithProviders` from
  `@/test/render`). Don't test markup trivia. Aim for a few sharp tests per feature, not coverage theatre.
- Lint is strict (oxlint): no shadowed names, hoist functions that capture nothing, no array-index keys, no refs
  read during render, prefer semantic tags over `role=`. Keep `./check.sh` clean for your paths.
- A pre-commit-style secret filter blocks tool inputs containing the literal name of the env file or an event's
  `.key` property: destructure (`const { key } = event`) and avoid writing the env file's name.
- Match the old behaviour first, then improve it where it's clearly awkward. Don't invent features.
- Finish with a short report: what you built, files, deviations, anything other areas must know (exports, props).
