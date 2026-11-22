import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";
import { listPortalLinks } from "@/server/services/portal";
import { loadSite } from "../site-data";
import { DocumentVisibilityToggle, PortalLinks, StepVisibilityToggle } from "./portal-links";

export default async function ClientSpacePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  const site = await loadSite(ctx, id);
  const [links, documents, approvedPhotos, summaries, org] = await Promise.all([
    listPortalLinks(ctx, id),
    db.document.findMany({
      where: { organizationId: ctx.organizationId, siteId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, type: true, visibleToClient: true },
    }),
    db.media.count({
      where: { organizationId: ctx.organizationId, siteId: id, kind: "PHOTO", validationStatus: "APPROVED" },
    }),
    db.dailySummary.count({
      where: { organizationId: ctx.organizationId, siteId: id, status: { in: ["APPROVED", "SENT"] } },
    }),
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } }),
  ]);
  const phone = site.client.phones[0] ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid content-start gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Lien de suivi du client</CardTitle>
          </CardHeader>
          <CardContent>
            <PortalLinks
              siteId={id}
              siteTitle={site.title}
              organizationName={org.name}
              clientName={site.client.name}
              clientEmail={site.client.emails[0] ?? null}
              clientPhone={phone}
              consent={site.client.consentCommunications}
              links={links.map((l) => ({
                id: l.id,
                url: l.url,
                active: l.active,
                createdAt: formatDateTime(l.createdAt),
                expiresAt: l.expiresAt ? formatDateTime(l.expiresAt) : null,
                revokedAt: l.revokedAt ? formatDateTime(l.revokedAt) : null,
                lastAccessAt: l.lastAccessAt ? formatDateTime(l.lastAccessAt) : null,
                accessCount: l.accessCount,
              }))}
            />
          </CardContent>
        </Card>
      </div>
      <Card className="content-start">
        <CardHeader>
          <CardTitle>Ce que voit le client</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          <p className="text-muted-foreground">
            {approvedPhotos} photo(s) validée(s) et {summaries} résumé(s) du jour publiés. Les notes internes
            et les problèmes ne sont jamais visibles.
          </p>
          <div>
            <p className="mb-2 font-medium">Étapes affichées</p>
            <ul className="grid gap-1">
              {site.steps.map((s) => (
                <li key={s.id}>
                  <StepVisibilityToggle
                    siteId={id}
                    stepId={s.id}
                    title={s.title}
                    visible={s.visibleToClient}
                  />
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 font-medium">Documents partagés</p>
            {documents.length === 0 ? <p className="text-muted-foreground">Aucun document.</p> : null}
            <ul className="grid gap-1">
              {documents.map((d) => (
                <li key={d.id}>
                  <DocumentVisibilityToggle
                    documentId={d.id}
                    title={`${d.name} (${DOCUMENT_TYPE_LABELS[d.type]})`}
                    visible={d.visibleToClient}
                  />
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
