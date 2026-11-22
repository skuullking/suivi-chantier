"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markNotificationsReadAction } from "@/server/actions/business";

export type BellNotification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  read: boolean;
};

export function NotificationBell({ items, unread }: { items: BellNotification[]; unread: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread ? `Notifications (${unread} non lues)` : "Notifications"}
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 ? (
            <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unread > 0 ? (
            <button
              type="button"
              disabled={pending}
              className="text-xs font-normal text-orange-700 hover:underline"
              onClick={() => startTransition(async () => void (await markNotificationsReadAction()))}
            >
              Tout marquer comme lu
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-6 text-center text-sm">Aucune notification.</p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem key={n.id} asChild>
              <Link
                href={n.link ?? "/app/notifications"}
                className="flex flex-col items-start gap-0.5"
                onClick={() => {
                  if (!n.read) startTransition(async () => void (await markNotificationsReadAction([n.id])));
                }}
              >
                <span className={n.read ? "text-stone-600" : "font-semibold"}>{n.title}</span>
                {n.body ? <span className="text-muted-foreground line-clamp-2 text-xs">{n.body}</span> : null}
                <span className="text-muted-foreground text-[11px]">{n.createdAt}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/notifications" className="justify-center text-sm">
            Voir toutes les notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
