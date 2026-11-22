import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/auth/context";
import { isSameOrigin } from "@/server/security/request";
import { deletePushSubscription, pushEnabled, savePushSubscription } from "@/server/services/notify-channels";

export const dynamic = "force-dynamic";

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Registers the Web Push subscription of the current browser. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (!pushEnabled())
    return NextResponse.json({ error: "Notifications push non configurées." }, { status: 503 });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Abonnement invalide." }, { status: 400 });
  await savePushSubscription(ctx.userId, parsed.data);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (body.endpoint) await deletePushSubscription(ctx.userId, body.endpoint);
  return NextResponse.json({ ok: true });
}
