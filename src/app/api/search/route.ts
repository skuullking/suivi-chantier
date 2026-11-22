import { NextResponse } from "next/server";
import { getAuthContext } from "@/server/auth/context";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { globalSearch } from "@/server/services/search";

export async function GET(request: Request) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  try {
    await enforceRateLimit(`search:${ctx.userId}`, 120, 60);
  } catch {
    return NextResponse.json({ error: "Trop de requêtes" }, { status: 429 });
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await globalSearch(ctx, q);
  return NextResponse.json({ results }, { headers: { "Cache-Control": "no-store" } });
}
