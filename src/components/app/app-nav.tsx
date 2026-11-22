"use client";

import {
  CalendarDays,
  FileText,
  HardHat,
  Inbox,
  LayoutDashboard,
  Menu,
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
  { href: "/app/clients", label: "Clients", icon: UsersRound },
  { href: "/app/planning", label: "Planning", icon: CalendarDays },
  { href: "/app/a-traiter", label: "À traiter", icon: Inbox, badgeKey: "inbox" },
  { href: "/app/documents", label: "Documents", icon: FileText },
  { href: "/app/equipe", label: "Équipe", icon: Users, ownerOnly: true },
  { href: "/app/parametres", label: "Paramètres", icon: Settings, ownerOnly: true },
];

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
    <nav aria-label="Navigation principale" className="grid gap-1">
      {ITEMS.filter((i) => isOwner || !i.ownerOnly).map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-orange-50 text-orange-800" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            <item.icon className="size-4" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.badgeKey === "inbox" && inboxCount > 0 ? (
              <span className="rounded-full bg-orange-600 px-2 py-0.5 text-xs font-semibold text-white">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
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
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r bg-white p-4 lg:flex">
      <Link href="/app" className="flex items-center gap-2 px-2">
        <LogoMark />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{organizationName}</p>
          <p className="text-muted-foreground text-xs">ChantierLink</p>
        </div>
      </Link>
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
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Ouvrir le menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="p-0">
          <SheetTitle className="flex items-center gap-2">
            <LogoMark /> {organizationName}
          </SheetTitle>
        </SheetHeader>
        <NavLinks isOwner={isOwner} inboxCount={inboxCount} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
