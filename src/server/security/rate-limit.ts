import { db } from "@/server/db";
import { RateLimitError } from "@/server/errors";

export type RateLimitResult = { allowed: boolean; count: number; limit: number; resetAt: Date };

function multiplier() {
  const m = Number(process.env.RATE_LIMIT_MULTIPLIER ?? 1);
  return Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * Fixed-window rate limiter stored in PostgreSQL (atomic upsert), safe across several app instances.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const effectiveLimit = Math.ceil(limit * multiplier());
  const rows = await db.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowStart", "expiresAt")
    VALUES (${key}, 1, now(), now() + make_interval(secs => ${windowSeconds}::int))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowStart" = CASE WHEN "RateLimit"."expiresAt" <= now() THEN now() ELSE "RateLimit"."windowStart" END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= now()
        THEN now() + make_interval(secs => ${windowSeconds}::int) ELSE "RateLimit"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  const row = rows[0]!;
  return {
    allowed: row.count <= effectiveLimit,
    count: row.count,
    limit: effectiveLimit,
    resetAt: row.expiresAt,
  };
}

export async function enforceRateLimit(key: string, limit: number, windowSeconds: number, message?: string) {
  const result = await consumeRateLimit(key, limit, windowSeconds);
  if (!result.allowed) throw new RateLimitError(message);
  return result;
}

export async function purgeExpiredRateLimits() {
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
