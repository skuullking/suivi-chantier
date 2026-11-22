import { execSync } from "node:child_process";
import { E2E_ENV } from "../playwright.config";

/** Resets the E2E database (migrations + truncate) and loads the demo seed. */
export default async function globalSetup() {
  const env = { ...process.env, ...E2E_ENV, NODE_ENV: "development" } as NodeJS.ProcessEnv;
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  execSync("npx tsx scripts/reset-database.ts", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "pipe", env });
}
