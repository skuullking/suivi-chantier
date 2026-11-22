import { NextResponse } from "next/server";
import { storage } from "@/server/adapters/storage";
import { db } from "@/server/db";
import { logger } from "@/server/logger";

export const dynamic = "force-dynamic";

/** Liveness / readiness probe used by Docker healthchecks. */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch (error) {
    logger.error({ err: error }, "Healthcheck : base de données indisponible");
    checks.database = "error";
  }
  try {
    await storage().healthcheck();
    checks.storage = "ok";
  } catch (error) {
    logger.error({ err: error }, "Healthcheck : stockage indisponible");
    checks.storage = "error";
  }
  const ok = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
