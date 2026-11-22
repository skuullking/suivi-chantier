import type { Metadata } from "next";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { db } from "@/server/db";
import { inboundAddress } from "@/server/services/inbound-mail";
import { AutoRefresh } from "../auto-refresh";
import { InboundMailForm } from "./inbound-form";

export const metadata: Metadata = { title: "E-mail entrant (simulation)" };

export default async function InboundMailPage() {
  const [orgs, logs, docs] = await Promise.all([
    db.organization.findMany({ select: { name: true, slug: true }, orderBy: { name: "asc" } }),
    db.messageLog.findMany({
      where: { channel: "EMAIL", direction: "INBOUND" },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.document.findMany({
      where: { source: "EMAIL" },
      include: { site: { select: { title: true } }, organization: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AutoRefresh seconds={3} />
      <section className="grid content-start gap-3">
        <h1 className="text-2xl font-bold">E-mail entrant</h1>
        <p className="text-muted-foreground text-sm">
          Simule un e-mail transféré à l&apos;adresse « documents » d&apos;une entreprise. Le message MIME est
          envoyé au vrai webhook <code>/api/webhooks/inbound-mail</code>.
        </p>
        <InboundMailForm addresses={orgs.map((o) => ({ label: o.name, address: inboundAddress(o.slug) }))} />
      </section>
      <section className="grid content-start gap-4">
        <div>
          <h2 className="mb-2 font-semibold">Derniers e-mails reçus</h2>
          <ul className="grid gap-2 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border bg-white p-2" data-testid="inbound-log">
                <p className="font-medium">{l.subject || "(sans objet)"}</p>
                <p className="text-muted-foreground text-xs">
                  {l.fromAddress} → {l.toAddress} · {formatDateTime(l.createdAt)} · {l.status}
                </p>
              </li>
            ))}
            {logs.length === 0 ? <li className="text-muted-foreground">Aucun.</li> : null}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-semibold">Documents créés</h2>
          <ul className="grid gap-2 text-sm">
            {docs.map((d) => (
              <li key={d.id} className="rounded-lg border bg-white p-2" data-testid="inbound-document">
                <p className="font-medium">{d.name}</p>
                <p className="text-muted-foreground text-xs">
                  {d.organization.name} · {DOCUMENT_TYPE_LABELS[d.type]} · {d.site?.title ?? "sans chantier"}{" "}
                  ·{" "}
                  {d.processingStatus === "DONE"
                    ? `confiance ${Math.round((d.classificationConfidence ?? 0) * 100)} %`
                    : "analyse…"}
                </p>
              </li>
            ))}
            {docs.length === 0 ? <li className="text-muted-foreground">Aucun.</li> : null}
          </ul>
        </div>
      </section>
    </div>
  );
}
