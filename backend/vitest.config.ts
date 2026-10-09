import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Files share one database and mutate the same global rows, so parallel files race.
    fileParallelism: false,
  },
});
