import { Camera, FileText, Inbox, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { toGridPhotos } from "@/components/app/photo-data";
import { PhotoGrid } from "@/components/app/photo-grid";
import { formatDateTime, formatDayLong } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";
import { documentUrls } from "@/server/services/documents";
import { can } from "@/server/permissions/can";
import { listInbox } from "@/server/services/inbox";
import { mediaUrls, pendingPhotos } from "@/server/services/media";
import { listDraftSummaries } from "@/server/services/summaries";
import { InboxItemCard, SummaryCard } from "./inbox-cards";

export const metadata: Metadata = { title: "À traiter" };

export default async function InboxPage() {
  const ctx = await requireManager();
  const canValidate = can(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const [photos, items, summaries, sites, clients] = await Promise.all([
    canValidate ? pendingPhotos(ctx) : Promise.resolve([]),
    listInbox(ctx),
    listDraftSummaries(ctx),
    db.site.findMany({
      where: { organizationId: ctx.organizationId, status: { notIn: ["ARCHIVED"] } },
      select: {
        id: true,
        title: true,
        code: true,
        steps: { select: { id: true, title: true }, orderBy: { order: "asc" } },
      },
      orderBy: { title: "asc" },
    }),
    db.client.findMany({
      where: { organizationId: ctx.organizationId, archivedAt: null, anonymizedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const siteOptions = sites.map((s) => ({
    id: s.id,
    label: `${s.title} (${s.code})`,
    steps: s.steps.map((st) => ({ id: st.id, label: st.title })),
  }));
  const total = photos.length + items.length + summaries.length;

  return (
    <>
      <PageHeader
        title="À traiter"
        description={
          total
            ? `${total} élément(s) en attente : photos à valider, éléments reçus à classer, résumés à approuver.`
            : "Tout est à jour."
        }
      />

      <div className="grid gap-8">
        <section className="grid gap-3" aria-labelledby="summaries-title">
          <h2 id="summaries-title" className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="size-5 text-violet-700" aria-hidden /> Résumés du jour à approuver (
            {summaries.length})
          </h2>
          {summaries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun résumé en attente.</p>
          ) : (
            summaries.map((s) => (
              <SummaryCard
                key={s.id}
                summary={{
                  id: s.id,
                  siteId: s.site.id,
                  siteTitle: s.site.title,
                  dateLabel: formatDayLong(s.date),
                  text: s.editedText ?? s.generatedText,
                  clientEmail: s.site.client.consentCommunications ? (s.site.client.emails[0] ?? null) : null,
                }}
              />
            ))
          )}
        </section>

        <section className="grid gap-3" aria-labelledby="items-title">
          <h2 id="items-title" className="flex items-center gap-2 text-lg font-semibold">
            <Inbox className="size-5 text-sky-700" aria-hidden /> Éléments reçus à classer ({items.length})
          </h2>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Rien à classer : tout a été rangé automatiquement.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {items.map((item) => {
                const media = item.media;
                const preview =
                  media?.kind === "PHOTO"
                    ? { kind: "photo" as const, url: mediaUrls(media).thumbnail ?? mediaUrls(media).display }
                    : media
                      ? {
                          kind: "audio" as const,
                          url: mediaUrls(media).display,
                          transcription: media.transcription,
                        }
                      : item.document
                        ? {
                            kind: "document" as const,
                            url: documentUrls(item.document).preview,
                            name: item.document.name,
                          }
                        : { kind: "text" as const };
                return (
                  <InboxItemCard
                    key={item.id}
                    item={{
                      id: item.id,
                      kind: item.kind,
                      text: item.messageText,
                      author: item.authorName ?? item.fromPhone ?? item.fromEmail ?? "Inconnu",
                      receivedAt: formatDateTime(item.createdAt),
                      confidence: item.confidence,
                      reason: item.reason,
                      proposedSiteId: item.proposedSiteId,
                      proposedStepId: item.proposedStepId,
                      proposedClientId: item.proposedClientId,
                      proposedLabel: [
                        item.proposedSite?.title,
                        item.proposedStep?.title,
                        item.proposedClient && !item.proposedSite ? item.proposedClient.name : null,
                        item.proposedDocumentType ? DOCUMENT_TYPE_LABELS[item.proposedDocumentType] : null,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                      proposedDocumentType: item.proposedDocumentType,
                      preview,
                    }}
                    sites={siteOptions}
                    clients={clients.map((c) => ({ id: c.id, label: c.name }))}
                  />
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-3" aria-labelledby="photos-title">
          <h2 id="photos-title" className="flex items-center gap-2 text-lg font-semibold">
            <Camera className="size-5 text-orange-700" aria-hidden /> Photos à valider ({photos.length})
          </h2>
          {!canValidate ? (
            <p className="text-muted-foreground text-sm">La validation des photos est réservée au patron.</p>
          ) : photos.length === 0 ? (
            <EmptyState icon={FileText} title="Aucune photo à valider" description="Tout est à jour." />
          ) : (
            <PhotoGrid photos={toGridPhotos(photos, true)} canValidate />
          )}
        </section>
      </div>
    </>
  );
}
