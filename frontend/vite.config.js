import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // Mirrors the Docker image's nginx proxy.
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  preview: { allowedHosts: true },
  // Unit and component tests. Browser flows live in e2e/ (Playwright).
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 20_000,
    restoreMocks: true,
    clearMocks: true,
  },
});
