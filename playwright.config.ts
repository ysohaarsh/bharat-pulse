import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Make .env.local visible to the test process too (Next loads it for the server itself),
// so specs can decide whether DB-dependent / CRON_SECRET checks should run.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = 3303;
const CI = !!process.env.CI;

/**
 * E2E suite. Runs against a production build (`next build && next start`).
 * Env (NEXT_PUBLIC_SUPABASE_*, CRON_SECRET) comes from the process env; locally
 * Next also loads `.env.local`. Specs skip DB-dependent assertions when
 * NEXT_PUBLIC_SUPABASE_URL is unset (see e2e/helpers.ts).
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["list"], ["html", { open: "never", outputFolder: "e2e/.report" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      // iPhone 13 viewport/touch/UA, rendered by Chromium (the only browser we install).
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
      testMatch: /home\.spec\.ts$/,
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 300_000,
    stderr: "pipe",
  },
});
