"use client";

import { Camera, CircleUserRound, Mic, Sun } from "lucide-react";
import Link from "next/link";
import { usePendingHref } from "@/components/app/navigation-feedback";
import { cn } from "@/lib/utils";
import { useQueueCount } from "./offline-sync";

const TABS = [
  { href: "/w", label: "Aujourd'hui", icon: Sun },
  { href: "/w/photo", label: "Photo", icon: Camera },
  { href: "/w/vocal", label: "Vocal", icon: Mic },
  { href: "/w/moi", label: "Moi", icon: CircleUserRound },
];

/** Bottom navigation (thumb reachable, 64 px targets). */
export function WorkerTabBar() {
  const { current: pathname, onNavigate } = usePendingHref();
  const queued = useQueueCount();
  return (
    <nav
      aria-label="Navigation terrain"
      className="bg-ink-900 fixed inset-x-0 bottom-0 z-40 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 gap-1.5">
        {TABS.map((tab) => {
          const active =
            tab.href === "/w"
              ? pathname === "/w" || pathname.startsWith("/w/chantier")
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                onClick={() => onNavigate(tab.href)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-xs font-bold",
                  active ? "bg-signal-400 text-ink-900" : "text-ink-300",
                )}
              >
                <span className="relative">
                  <tab.icon className="size-6" aria-hidden />
                  {tab.href === "/w/moi" && queued > 0 ? (
                    <span
                      className="bg-signal-400 text-ink-900 border-ink-900 absolute -top-1.5 -right-3 flex h-5 min-w-5 items-center justify-center rounded-md border-[1.5px] px-1 font-mono text-[11px] font-bold"
                      aria-label={`${queued} envoi(s) en attente`}
                      data-testid="queue-badge"
                    >
                      {queued}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
