import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/brand/logo";
import { devToolsEnabled } from "@/server/env";

export const metadata: Metadata = { title: "Outils de développement", robots: { index: false } };

const LINKS = [
  { href: "/dev/mails", label: "Boîte mail" },
  { href: "/dev/whatsapp", label: "Simulateur WhatsApp" },
  { href: "/dev/inbound-mail", label: "E-mail entrant" },
];

/** Development tools are disabled in production unless ENABLE_DEV_TOOLS=true. */
export default function DevLayout({ children }: { children: React.ReactNode }) {
  if (!devToolsEnabled()) notFound();
  return (
    <div className="bg-ink-100 min-h-screen">
      <header className="bg-signal-50 border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <LogoMark className="size-6" /> Outils de dev
          </Link>
          <nav className="flex flex-wrap gap-3 text-sm">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-ink-700 hover:underline">
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="bg-signal-200 text-ink-900 ml-auto rounded px-2 py-0.5 text-xs font-medium">
            Simulation — aucune donnée réelle n&apos;est envoyée
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
