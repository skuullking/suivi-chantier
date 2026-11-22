import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

/** Environment shared by the app server, the worker and the E2E global setup. */
export const E2E_ENV: Record<string, string> = {
  NODE_ENV: "production",
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink_e2e",
  APP_URL: BASE_URL,
  APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
  ENABLE_DEV_TOOLS: "true",
  MAIL_DRIVER: "dev",
  STORAGE_DRIVER: "local",
  STORAGE_LOCAL_DIR: ".local/e2e-storage",
  RATE_LIMIT_MULTIPLIER: "50",
  LOG_LEVEL: "warn",
  WHATSAPP_PROVIDER: "mock",
  LLM_PROVIDER: "mock",
  OCR_PROVIDER: "mock",
  TRANSCRIPTION_PROVIDER: "mock",
  WORKER_POLL_INTERVAL_SECONDS: "1",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `pnpm exec next start -p ${PORT}`,
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: E2E_ENV,
    },
  ],
});
