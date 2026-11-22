"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const SITE_TABS = [
  { slug: "", label: "Résumé" },
  { slug: "etapes", label: "Étapes" },
  { slug: "planning", label: "Planning" },
  { slug: "photos", label: "Photos & médias" },
  { slug: "documents", label: "Documents" },
  { slug: "journal", label: "Journal" },
  { slug: "espace-client", label: "Espace client" },
] as const;

export function SiteTabs({ siteId, hidden = [] }: { siteId: string; hidden?: string[] }) {
  const pathname = usePathname();
  const base = `/app/chantiers/${siteId}`;
  return (
    <nav aria-label="Sections du chantier" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1.5">
        {SITE_TABS.filter((t) => !hidden.includes(t.slug)).map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={tab.slug || "resume"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-[10px] border px-3.5 text-sm transition-colors",
                  active
                    ? "border-ink-900 bg-ink-900 font-semibold text-white"
                    : "border-ink-200 text-ink-800 hover:border-ink-900 bg-white font-medium",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
