import { Bell } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { PushToggle } from "@/components/app/push-toggle";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireManager } from "@/server/auth/context";
import { env } from "@/server/env";
import { listNotifications } from "@/server/services/notifications";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  const ctx = await requireManager();
  const items = await listNotifications(ctx, 100);
  const vapid = env().VAPID_PUBLIC_KEY ?? null;
  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {vapid ? (
              <PushToggle publicKey={vapid} className="min-h-9 w-auto rounded-lg border px-3 text-sm" />
            ) : null}
            <MarkAllRead />
          </div>
        }
      />
      {items.length === 0 ? (
        <EmptyState icon={Bell} title="Aucune notification" />
      ) : (
        <ul className="divide-y rounded-xl border bg-white">
          {items.map((n) => (
            <li key={n.id} className={cn("px-4 py-3", !n.readAt && "bg-signal-50/40")}>
              <Link href={n.link ?? "#"} className="block hover:underline">
                <p className={n.readAt ? "" : "font-semibold"}>{n.title}</p>
                {n.body ? <p className="text-muted-foreground text-sm">{n.body}</p> : null}
              </Link>
              <p className="text-muted-foreground text-xs">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
