# Developing Thingport Grab

How to work on the Thingport Grab browser extension: running it locally, how the code is laid out,
building and packaging it for each browser's store, and how releases are signed. What the extension
does and how to install it is in the **[README](README.md)**; the branch, commit and pull request
workflow shared by the whole repo is in the root **[CONTRIBUTING.md](../CONTRIBUTING.md)**.

## Getting started

The extension is TypeScript, bundled with [esbuild](https://esbuild.github.io/), with styles in
SCSS. You need Node.js 20 or newer. Everything below runs from this `extension/` folder:

```bash
npm install
npm run dev         # build dist/chrome and rebuild on every change
npm run dev:firefox # same for dist/firefox
```

Load the build output as an unpacked extension, and reload it (the circular arrow on its card in
`chrome://extensions`, or **Reload** in `about:debugging`) after a rebuild:

- **Chrome / Edge**: `chrome://extensions` -> **Developer mode** -> **Load unpacked** -> `dist/chrome`
  (or `dist/edge`).
- **Firefox**: `about:debugging#/runtime/this-firefox` -> **Load Temporary Add-on** ->
  `dist/firefox/manifest.json`.

### Layout

```
src/
  shared/       code used by more than one script: storage keys, provider URL matching,
                the typed message protocol (messages.ts), API types, the inline icon
  background/   background script -- config/auth, every request to the Thingport instance,
                imports, the guided MakerWorld collection job, recent imports, toolbar icon
  content/      content script -- the floating icon, its panel flows (panels/), the setup dialog,
                overlays, MakerWorld page-data and download-URL resolution, and the injected
                Download normalized button (makerworld/)
    styles/     its SCSS, compiled into the bundle and injected into its shadow root
  normalizer/   the Bambu 3MF normalizer and the worker that runs it
  popup/        toolbar popup (popup.html, its script and styles/)
  styles/       SCSS design tokens and mixins shared by the popup and the content UI
  assets/       the Thingport icon SVG (inlined into the bundles)
public/         copied into every build as-is (the toolbar icon PNGs)
scripts/        build.ts, manifest.ts (per-browser manifest), zip.ts, screenshots.ts
```

The content script and the popup never call the Thingport instance themselves: they send a
message to the background script, which owns the credentials and the instance's host permission.
Every message and its reply is typed in `src/shared/messages.ts`.

`src/normalizer/threeMfNormalizer.ts` is a copy of the backend's
`backend/src/services/threeMfNormalizer.ts` (the Mozilla source zip can only hold this folder), and
`src/shared/slicers.ts` mirrors the web app's list of slicers that need it. Change them together.
The normalizer runs in a worker, bundled into the content script as a string through the build's
`?worker` imports; where a page's CSP blocks that worker, it runs on the page's main thread instead.

Colors, spacing and type live in `src/styles/_tokens.scss`. Colors are CSS custom properties with a
light and a dark palette: the popup follows the browser's color scheme, while the in-page UI always
uses the light one.

### Before opening a pull request

- `npm run verify` passes (typecheck, lint, all three builds).
- The commit type says what the change means for users -- `feat:`, `fix:`, or `!` for breaking --
  since it decides the next version (see [Versioning](#versioning-how-the-next-version-is-picked)).
- The change works in Chrome **and** Firefox: load `dist/chrome` and `dist/firefox` and try it on
  the provider pages it touches. The background runs as a service worker in Chrome/Edge but as an
  event page in Firefox, so keep top-level background code free of anything only one supports.
- If it changes anything visible, run `npm run screenshots` and commit the updated images.
- If it adds a runtime message, add it to `src/shared/messages.ts` so both ends stay typed.
- Provider URL patterns in `src/shared/urls.ts` are duplicated from the web app and backend (see
  the comment there) -- change them in all three places.

### Scripts

| Command                                                 | What it does                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev` / `dev:firefox`                           | Watch build of `dist/chrome` / `dist/firefox`                                |
| `npm run build`                                         | Builds `dist/chrome`, `dist/firefox` and `dist/edge`                         |
| `npm run build:chrome` / `build:firefox` / `build:edge` | Builds one browser                                                           |
| `npm run zip`                                           | Builds everything and packages the store zips (below)                        |
| `npm run zip:chrome` / `zip:firefox` / `zip:edge`       | Same for one store                                                           |
| `npm run typecheck`                                     | `tsc --noEmit`                                                               |
| `npm run lint`                                          | oxlint (also run on commit by the repo's pre-commit hook)                    |
| `npm run lint:firefox`                                  | Builds for Firefox and runs `web-ext lint` on the result                     |
| `npm run screenshots`                                   | Regenerates the README screenshots (see below)                               |
| `npm run verify`                                        | Typecheck + lint + build                                                     |
| `npm run release:dry-run`                               | Shows the next version semantic-release would release, and why (Node 22.14+) |

The only difference between the browser builds is `manifest.json` (see `scripts/manifest.ts`):
Chrome and Edge run the background as a service worker, Firefox as an event page
(`background.scripts`) with its `browser_specific_settings.gecko` block. The version comes from
`package.json`.

## Releases (CI)

Two workflows, for two different jobs.

**Every merge -- `.github/workflows/extension-release.yml`.** Runs on every push and pull request
touching this folder: typecheck, lint, the Chrome/Edge build, and `web-ext lint` on the Firefox
build. On a push to `main` it also signs the Firefox build through AMO's unlisted channel and
publishes `thingport-grab-chrome.zip`, `thingport-grab-edge.zip` and `thingport-grab-firefox.xpi`
to the `extension-latest` release, for installing by hand (the in-app Download page links the
store listings instead).
It never changes the version: AMO rejects a version number it has already signed, so CI signs a
copy of the built manifest with the run number appended (e.g. `1.1.2.456`).

**Versioned releases -- `.github/workflows/extension-store-release.yml`.** Every **Friday at 13:00
Polish time**, or whenever you start it (**Actions > Extension store release > Run workflow**, or
`gh workflow run extension-store-release.yml`), it releases whatever changed in the extension since
the last release, with [semantic-release](https://semantic-release.gitbook.io/) (see below): bumps
the version, writes `CHANGELOG.md`, commits both to `main`, tags it, creates a GitHub release with
the store zips, and publishes to the Chrome Web Store, Edge Add-ons and Firefox Add-ons. If nothing
releasable changed,
the run just ends.

### Versioning: how the next version is picked

Nobody edits `version` in `package.json` by hand -- semantic-release derives it from the
[Conventional Commit](https://www.conventionalcommits.org/) messages since the last release tag
(`thingport-grab-v<version>`). Only commits that changed files under `extension/` count
(`semantic-release-monorepo`, configured in `.releaserc.json`), so backend, frontend and web
commits never move the extension's version. Of those:

| Commit                                                             | Release                |
| ------------------------------------------------------------------ | ---------------------- |
| `feat: ...`                                                        | minor -- 1.2.0 → 1.3.0 |
| `fix: ...`, `perf: ...`                                            | patch -- 1.2.0 → 1.2.1 |
| `feat!: ...`, or a `BREAKING CHANGE:` footer                       | major -- 1.2.0 → 2.0.0 |
| `docs:`, `refactor:`, `chore:`, `ci:`, `test:`, `style:`, `build:` | none on its own        |

The highest one wins, so a week of three fixes and one feature is one minor release. Two things
follow from this:

- **Pick the type for extension users, not for the code.** A "refactor" that changes what users
  see or fixes something for them is a `fix:` or `feat:` -- otherwise it's never released.
- **Mark breaking changes**, e.g. when the extension starts needing a newer Thingport server:
  `feat!: require Thingport 2.x for ...`. Without the `!` (or footer) it's only a minor bump.

The commit messages also become the changelog and the GitHub release notes, so write them for a
reader.

To see what the next release would be, without releasing anything (needs Node 22.14+):

```bash
npm run release:dry-run
```

### Signing a Firefox build by hand

You need a Mozilla Add-on Developer account's API credentials (see below), and a version in the
built manifest that AMO hasn't signed before:

```bash
npm run build:firefox
npx web-ext sign --source-dir dist/firefox --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" --api-secret "$AMO_JWT_SECRET"
```

## Regenerating the icons

The toolbar icon PNGs (`public/icons/thingport-icon-{color,dark}-{16,32,48,128}.png`) and
`src/assets/thingport-icon-color.svg` (inlined into the popup header and the in-page UI) are
rendered once from `frontend/src/assets/logos/thingport-icon-{color,dark}.svg` and checked in
rather than built on the fly -- with a tighter `viewBox` than the source files use. The source
SVGs' own 80x80 canvas leaves a fairly generous margin around the glyph (fine at logo size, but at
a 16-19px toolbar icon it reads as "too small" -- most of the square is empty). This crops to the
glyph's actual bounding box (including its stroke width) plus a small ~6% padding: `4 4 72 72`
instead of `0 0 80 80`. Regenerate (e.g. after the source SVGs change) from the repo root -- if the
glyph's proportions change, recompute the crop rather than reusing `4 4 72 72` as-is:

```bash
node -e "
const sharp = require('./backend/node_modules/sharp');
const fs = require('fs');
const sizes = [16, 32, 48, 128];
const jobs = [
  ['frontend/src/assets/logos/thingport-icon-color.svg', 'extension/public/icons/thingport-icon-color', 'extension/src/assets/thingport-icon-color.svg'],
  ['frontend/src/assets/logos/thingport-icon-dark.svg', 'extension/public/icons/thingport-icon-dark', null],
];
(async () => {
  for (const [src, outBase, svgOut] of jobs) {
    const svg = fs.readFileSync(src, 'utf8').replace('viewBox=\"0 0 80 80\"', 'viewBox=\"4 4 72 72\"');
    if (svgOut) fs.writeFileSync(svgOut, svg);
    for (const size of sizes) {
      await sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toFile(\`\${outBase}-\${size}.png\`);
    }
  }
})();
"
```
