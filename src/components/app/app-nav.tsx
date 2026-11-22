"use client";

import {
  CalendarDays,
  FileText,
  HardHat,
  Inbox,
  LayoutDashboard,
  Menu,
  Plus,
  Settings,
  Users,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  ownerOnly?: boolean;
  badgeKey?: "inbox";
};

const ITEMS: NavItem[] = [
  { href: "/app", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/app/chantiers", label: "Chantiers", icon: HardHat },
  { href: "/app/planning", label: "Planning", icon: CalendarDays },
  { href: "/app/a-traiter", label: "À traiter", icon: Inbox, badgeKey: "inbox" },
  { href: "/app/clients", label: "Clients", icon: UsersRound },
  { href: "/app/documents", label: "Documents", icon: FileText },
  { href: "/app/equipe", label: "Équipe", icon: Users, ownerOnly: true },
  { href: "/app/parametres", label: "Paramètres", icon: Settings, ownerOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/app" ? pathname === "/app" : pathname.startsWith(href);
}

function countLabel(n: number) {
  return n > 99 ? "99+" : String(n);
}

function NavLinks({
  isOwner,
  inboxCount,
  onNavigate,
}: {
  isOwner: boolean;
  inboxCount: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Navigation principale" className="grid gap-0.5">
      {ITEMS.filter((i) => isOwner || !i.ownerOnly).map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[15px] transition-colors",
              active
                ? "bg-signal-400 text-ink-900 font-bold"
                : "text-sidebar-foreground hover:bg-sidebar-accent font-medium hover:text-white",
            )}
          >
            <item.icon className="size-[18px]" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badgeKey === "inbox" && inboxCount > 0 ? (
              <span
                className={cn(
                  "text-ink-900 flex h-[22px] min-w-[22px] items-center justify-center rounded-md px-1.5 font-mono text-xs font-bold",
                  active ? "bg-white" : "bg-signal-400",
                )}
              >
                {countLabel(inboxCount)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ organizationName }: { organizationName: string }) {
  return (
    <Link href="/app" className="flex items-center gap-2.5 px-2 text-white">
      <LogoMark className="size-8" />
      <span className="min-w-0">
        <span className="font-heading block text-[1.15rem] leading-tight font-extrabold tracking-[-0.03em]">
          chantierlink
        </span>
        <span className="text-sidebar-foreground block truncate text-xs">{organizationName}</span>
      </span>
    </Link>
  );
}

export function AppSidebar({
  organizationName,
  isOwner,
  inboxCount,
}: {
  organizationName: string;
  isOwner: boolean;
  inboxCount: number;
}) {
  return (
    <aside className="bg-sidebar sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-7 px-3.5 py-5 lg:flex">
      <Brand organizationName={organizationName} />
      <NavLinks isOwner={isOwner} inboxCount={inboxCount} />
    </aside>
  );
}

export function MobileNav({
  organizationName,
  isOwner,
  inboxCount,
}: {
  organizationName: string;
  isOwner: boolean;
  inboxCount: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="bg-sidebar w-72 border-0 p-4 text-white">
        <SheetHeader className="p-0">
          <SheetTitle className="text-white">
            <Brand organizationName={organizationName} />
          </SheetTitle>
        </SheetHeader>
        <NavLinks isOwner={isOwner} inboxCount={inboxCount} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

const TABS = [
  { href: "/app", label: "Accueil", icon: LayoutDashboard },
  { href: "/app/chantiers", label: "Chantiers", icon: HardHat },
  { href: "/app/chantiers/nouveau", label: "Ajouter", icon: Plus, isNew: true },
  { href: "/app/a-traiter", label: "À traiter", icon: Inbox, badge: true },
  { href: "/app/planning", label: "Planning", icon: CalendarDays },
];

/** Bottom tab bar for owners / office staff on a phone (hidden from lg up). */
export function ManagerTabBar({ inboxCount }: { inboxCount: number }) {
  const pathname = usePathname();
  const activeHref =
    TABS.filter((t) => isActive(pathname, t.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ??
    null;
  return (
    <nav
      aria-label="Navigation rapide"
      className="bg-sidebar fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {TABS.map((t) => {
        const active = t.href === activeHref;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            aria-label={t.badge && inboxCount > 0 ? `${t.label}, ${inboxCount} en attente` : undefined}
            className={cn(
              "relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold",
              active ? "bg-signal-400 text-ink-900" : "text-sidebar-foreground",
              t.isNew && !active && "border-ink-700 border-[1.5px] text-white",
            )}
          >
            <t.icon className="size-[22px]" aria-hidden />
            {t.label}
            {t.badge && inboxCount > 0 && !active ? (
              <span className="bg-signal-400 text-ink-900 absolute top-1 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] px-1 font-mono text-[10px] font-bold">
                {countLabel(inboxCount)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
