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
    <nav aria-label="Sections du chantier" className="-mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {SITE_TABS.filter((t) => !hidden.includes(t.slug)).map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug ? pathname.startsWith(href) : pathname === base;
          return (
            <li key={tab.slug || "resume"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "border-orange-600 text-orange-800"
                    : "border-transparent text-stone-600 hover:border-stone-300 hover:text-stone-900",
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
