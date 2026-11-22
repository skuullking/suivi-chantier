import type { Metadata } from "next";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { db } from "@/server/db";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "../auto-refresh";
import { SimulatorForm } from "./simulator-form";

export const metadata: Metadata = { title: "Simulateur WhatsApp" };

const UNKNOWN = "+33700000000";

export default async function WhatsAppSimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ tel?: string }>;
}) {
  const { tel } = await searchParams;
  const contacts = await db.whatsAppContact.findMany({
    include: { user: { select: { name: true } }, organization: { select: { name: true } } },
    orderBy: [{ organization: { name: "asc" } }, { label: "asc" }],
  });
  const phone = tel ?? contacts[0]?.phoneE164 ?? UNKNOWN;
  const current = contacts.find((c) => c.phoneE164 === phone);
  const messages = await db.messageLog.findMany({
    where: { channel: "WHATSAPP", OR: [{ fromAddress: phone }, { toAddress: phone }] },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <AutoRefresh seconds={2} />
      <aside className="grid content-start gap-2">
        <h1 className="text-lg font-bold">Simulateur WhatsApp</h1>
        <p className="text-muted-foreground text-sm">
          Envoyez des messages comme un ouvrier. Ils passent par le vrai webhook (payload Meta signé).
        </p>
        <nav aria-label="Expéditeurs" className="grid gap-1">
          {contacts.map((c) => (
            <Link
              key={c.id}
              href={`?tel=${encodeURIComponent(c.phoneE164)}`}
              className={cn(
                "rounded-lg border bg-white px-3 py-2 text-sm",
                c.phoneE164 === phone && "border-emerald-500 bg-emerald-50",
              )}
            >
              <span className="block font-medium">{c.user?.name ?? c.label}</span>
              <span className="text-muted-foreground text-xs">
                {c.phoneE164} · {c.organization.name}
              </span>
            </Link>
          ))}
          <Link
            href={`?tel=${encodeURIComponent(UNKNOWN)}`}
            className={cn(
              "rounded-lg border bg-white px-3 py-2 text-sm",
              phone === UNKNOWN && "border-emerald-500 bg-emerald-50",
            )}
          >
            <span className="block font-medium">Numéro inconnu</span>
            <span className="text-muted-foreground text-xs">{UNKNOWN}</span>
          </Link>
        </nav>
      </aside>
      <section className="grid min-h-[70vh] grid-rows-[auto_1fr_auto] overflow-hidden rounded-xl border bg-[#efeae2]">
        <header className="bg-emerald-800 px-4 py-3 text-white">
          <p className="font-semibold">{current?.user?.name ?? "Numéro inconnu"}</p>
          <p className="text-xs opacity-80">{phone}</p>
        </header>
        <ol
          className="flex flex-col gap-2 overflow-y-auto p-4"
          aria-label="Conversation"
          data-testid="wa-conversation"
        >
          {messages.length === 0 ? (
            <li className="text-center text-sm text-stone-500">Aucun message.</li>
          ) : null}
          {messages.map((m) => {
            const inbound = m.direction === "INBOUND";
            const payload = m.payload as { type?: string } | null;
            const label =
              payload?.type && payload.type !== "text"
                ? `[${payload.type === "image" ? "Photo" : payload.type === "audio" ? "Vocal" : "Document"}] `
                : "";
            return (
              <li
                key={m.id}
                data-testid={inbound ? "wa-sent" : "wa-reply"}
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
                  inbound ? "self-end bg-[#d9fdd3]" : "self-start bg-white",
                )}
              >
                <p className="whitespace-pre-wrap">
                  {label}
                  {m.body ?? ""}
                </p>
                <p className="mt-1 text-right text-[10px] text-stone-500">
                  {formatTime(m.createdAt)}
                  {inbound && m.status ? ` · ${m.status}` : ""}
                </p>
              </li>
            );
          })}
        </ol>
        <SimulatorForm from={phone} name={current?.user?.name ?? "Inconnu"} />
      </section>
    </div>
  );
}
