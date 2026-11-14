import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  // The dev server compiles routes on first hit; give assertions room for that.
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    // Matomo on, so e2e/analytics.spec.ts sees the tracker's /stat requests. Forwarding goes to a
    // closed port (fails fast, a lost hit never breaks a page). Integrations: an e2e-only key and the
    // ClickUp stand-in that e2e/integrations.spec.ts starts on port 3199.
    env: {
      MATOMO_URL: "http://127.0.0.1:9",
      MATOMO_SITE_ID: "4",
      MATOMO_TOKEN: "e2e-not-a-token",
      INTEGRATION_SECRET: "e2e-only-integration-secret-not-for-production",
      CLICKUP_API_URL: "http://127.0.0.1:3199/api/v2",
    },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
