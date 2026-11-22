import { LogOut, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { ROLE_LABELS } from "@/lib/labels";
import { signOutAction } from "@/server/actions/auth";
import { requireAuth } from "@/server/auth/context";
import { PushToggle } from "@/components/app/push-toggle";
import { env } from "@/server/env";
import { SyncStatus } from "./sync-status";

export const metadata: Metadata = { title: "Moi" };

export default async function MePage() {
  const ctx = await requireAuth();
  const vapid = env().VAPID_PUBLIC_KEY ?? null;
  return (
    <div className="grid gap-4">
      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">{ctx.user.name}</h1>
        <p className="text-stone-600">
          {ROLE_LABELS[ctx.role]} · {ctx.organization.name}
        </p>
        <div className="mt-3 grid gap-1 text-stone-700">
          <p className="flex items-center gap-2">
            <Mail className="size-4" aria-hidden /> {ctx.user.email}
          </p>
          {ctx.user.phone ? (
            <p className="flex items-center gap-2">
              <Phone className="size-4" aria-hidden /> {ctx.user.phone}
            </p>
          ) : null}
        </div>
      </section>
      <SyncStatus />
      {vapid ? <PushToggle publicKey={vapid} /> : null}
      <form action={signOutAction}>
        <button
          type="submit"
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-stone-800 bg-white text-lg font-bold"
        >
          <LogOut className="size-5" aria-hidden /> Se déconnecter
        </button>
      </form>
    </div>
  );
}
