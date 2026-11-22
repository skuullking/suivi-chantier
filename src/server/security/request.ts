/** Helpers to read request metadata (behind a reverse proxy such as Caddy). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}

/**
 * CSRF protection for route handlers that mutate data with cookie authentication:
 * the Origin (or Referer) must match the Host. Server Actions already perform this check.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    return originHost === host;
  } catch {
    return false;
  }
}
