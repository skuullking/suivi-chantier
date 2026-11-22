import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink_test";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          env: { APP_SECRET: "unit-test-secret-unit-test-secret-1234567890", NODE_ENV: "test" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
          setupFiles: ["tests/integration/setup.ts"],
          // Tests share one database: run files sequentially.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            APP_SECRET: "integration-test-secret-integration-test-secret",
            APP_URL: "http://localhost:3000",
            NODE_ENV: "test",
            MAIL_DRIVER: "dev",
            STORAGE_DRIVER: "local",
            STORAGE_LOCAL_DIR: ".local/test-storage",
            LOG_LEVEL: "silent",
          },
        },
      },
    ],
  },
});
