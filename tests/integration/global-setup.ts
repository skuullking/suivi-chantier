import { execSync } from "node:child_process";

/** Applies migrations on the dedicated test database before the integration suite. */
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://chantierlink:chantierlink@localhost:5433/chantierlink_test";
  execSync("npx prisma migrate deploy", {
    stdio: "pipe",
    env: { ...process.env, DATABASE_URL: url },
  });
}
