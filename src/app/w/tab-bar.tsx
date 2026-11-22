"use client";

import { Camera, CircleUserRound, Mic, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/w", label: "Aujourd'hui", icon: Sun },
  { href: "/w/photo", label: "Photo", icon: Camera },
  { href: "/w/vocal", label: "Vocal", icon: Mic },
  { href: "/w/moi", label: "Moi", icon: CircleUserRound },
];

/** Bottom navigation (thumb reachable, 64 px targets). */
export function WorkerTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation terrain"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4">
        {TABS.map((tab) => {
          const active =
            tab.href === "/w"
              ? pathname === "/w" || pathname.startsWith("/w/chantier")
              : pathname.startsWith(tab.href);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold",
                  active ? "text-orange-700" : "text-stone-500",
                )}
              >
                <tab.icon className="size-6" aria-hidden />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
