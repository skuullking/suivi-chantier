import { HardHat, Mail, Phone, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentTable } from "@/components/app/document-table";
import { PageHeader } from "@/components/app/page-header";
import { ProgressBar, SiteStatusBadge } from "@/components/app/status";
import { UploadZone } from "@/components/app/upload-zone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDay } from "@/lib/format";
import { CLIENT_TYPE_LABELS } from "@/lib/labels";
import { updateClientAction } from "@/server/actions/business";
import { requireManager } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { clientHistory, clientOptions, getClient } from "@/server/services/clients";
import { listDocuments } from "@/server/services/documents";
import { AUDIT_ACTION_LABELS } from "@/server/services/settings";
import { siteOptions } from "@/server/services/sites";
import { ClientForm } from "../client-form";
import { ArchiveClientButton } from "./archive-button";
import { PrivacyActions } from "./privacy-card";

export const metadata: Metadata = { title: "Fiche client" };

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  const client = await getClient(ctx, id).catch((e: unknown) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [documents, history, sites, clients] = await Promise.all([
    listDocuments(ctx, { clientId: id }),
    clientHistory(ctx, id),
    siteOptions(ctx, true),
    clientOptions(ctx),
  ]);
  const update = updateClientAction.bind(null, id);

  return (
    <>
      <PageHeader
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {CLIENT_TYPE_LABELS[client.type]}
            {client.companyName ? ` · ${client.companyName}` : ""}
            {client.archivedAt ? <Badge variant="secondary">Archivé</Badge> : null}
            {client.anonymizedAt ? <Badge variant="secondary">Anonymisé</Badge> : null}
            {client.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </span>
        }
        actions={
          <>
            <Button asChild>
              <Link href={`/app/chantiers/nouveau?client=${client.id}`}>
                <Plus aria-hidden /> Nouveau chantier
              </Link>
            </Button>
            <ArchiveClientButton clientId={client.id} archived={Boolean(client.archivedAt)} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Chantiers ({client.sites.length})</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {client.sites.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun chantier pour ce client.</p>
              ) : (
                client.sites.map((s) => (
                  <Link
                    key={s.id}
                    href={`/app/chantiers/${s.id}`}
                    className="grid gap-2 rounded-lg border p-3 hover:bg-stone-50 sm:grid-cols-[1fr_200px] sm:items-center"
                  >
                    <div>
                      <p className="flex items-center gap-2 font-medium">
                        <HardHat className="size-4 text-stone-400" aria-hidden /> {s.title}
                        <SiteStatusBadge status={s.status} />
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {s.code}
                        {s.city ? ` · ${s.city}` : ""}
                        {s.plannedStart ? ` · du ${formatDay(s.plannedStart)}` : ""}
                        {s.plannedEnd ? ` au ${formatDay(s.plannedEnd)}` : ""}
                      </p>
                    </div>
                    <ProgressBar value={s.progress} label={`Progression de ${s.title}`} />
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <UploadZone clientId={client.id} />
              {documents.length > 0 ? (
                <DocumentTable
                  documents={documents}
                  canEdit
                  sites={sites.map((s) => ({ value: s.id, label: `${s.title} (${s.code})` }))}
                  clients={clients.map((c) => ({ value: c.id, label: c.name }))}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modifier la fiche</CardTitle>
            </CardHeader>
            <CardContent>
              <ClientForm action={update} defaults={client} submitLabel="Enregistrer" />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Coordonnées</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {client.phones.map((p) => (
                <a
                  key={p}
                  href={`tel:${p.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <Phone className="size-4 text-stone-400" aria-hidden /> {p}
                </a>
              ))}
              {client.emails.map((e) => (
                <a key={e} href={`mailto:${e}`} className="flex items-center gap-2 break-all hover:underline">
                  <Mail className="size-4 text-stone-400" aria-hidden /> {e}
                </a>
              ))}
              {client.addresses.map((a) => (
                <p key={a} className="text-stone-700">
                  {a}
                </p>
              ))}
              <p className="text-muted-foreground text-xs">
                Communications : {client.consentCommunications ? "acceptées" : "non consenties"}
              </p>
              {client.notes ? (
                <div className="mt-2 rounded-lg bg-stone-50 p-3 whitespace-pre-wrap text-stone-700">
                  {client.notes}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Données personnelles</CardTitle>
            </CardHeader>
            <CardContent>
              <PrivacyActions clientId={client.id} anonymized={Boolean(client.anonymizedAt)} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historique</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-2 text-sm">
                {history.map((h) => (
                  <li key={h.id}>
                    <p>{AUDIT_ACTION_LABELS[h.action] ?? h.action}</p>
                    <p className="text-muted-foreground text-xs">{formatDateTime(h.createdAt)}</p>
                  </li>
                ))}
                {history.length === 0 ? <p className="text-muted-foreground">Aucun historique.</p> : null}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
