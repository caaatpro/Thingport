import { defineConfig, devices } from "@playwright/test";

// Run through ../scripts/e2e.sh, which starts a throwaway stack. To point at one you started
// yourself: E2E_BASE_URL=http://localhost:18090 npx playwright test
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:18090";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // The specs share one database and some of them change it, so they run one after another.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/admin.json",
      },
    },
  ],
});
