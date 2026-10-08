# Browser tests

Playwright drives a real Chromium against a throwaway Thingport stack: fresh database, storage kept
in memory, its own port (18090). Nothing here touches your real instance.

```sh
scripts/e2e.sh                   # build and start the stack, run everything, tear it down
scripts/e2e.sh -g "sign in"      # extra arguments go to `playwright test`
E2E_KEEP=1 scripts/e2e.sh        # leave the stack up afterwards (http://localhost:18090)

# against a stack that is already running (specs can be repeated; they use unique names)
cd frontend && E2E_BASE_URL=http://localhost:18090 npx playwright test
```

First time on a machine: `cd frontend && npm ci && npx playwright install chromium`.

`global-setup.ts` registers an admin (the first account on a fresh stack is the admin) and a member,
uploads three models, makes a collection, and saves signed-in browser states in `e2e/.auth/` (git-ignored).
Specs start signed in as the admin; `auth.spec.ts` starts signed out and the sharing and admin specs open
a second browser context as the member.

What is covered: every main page opens without console errors, sign-in (wrong password, disabled account,
no captcha, sign-out), the library (search, rename, upload, delete), sharing a model or a collection with
another account (including models added to the collection later), and administration (adding users,
disabling an account cutting off its open session, password reset links, a member being kept out).

Unit and component tests live next to the code (`src/**/*.test.ts(x)`, `npm run test:run`).
