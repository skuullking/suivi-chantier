import { Archive, Download, FileText, Mail } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DocumentTable } from "@/components/app/document-table";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { UploadZone } from "@/components/app/upload-zone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { DocumentType } from "@/generated/prisma/enums";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { DOCUMENT_TYPES } from "@/lib/validation/business";
import { requireManager } from "@/server/auth/context";
import { clientOptions } from "@/server/services/clients";
import { listDocuments } from "@/server/services/documents";
import { inboundAddress } from "@/server/services/inbound-mail";
import { siteOptions } from "@/server/services/sites";

export const metadata: Metadata = { title: "Documents" };

type SP = {
  q?: string;
  type?: string;
  client?: string;
  chantier?: string;
  du?: string;
  au?: string;
  doc?: string;
};

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const type = (DOCUMENT_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as DocumentType)
    : undefined;
  const [documents, sites, clients] = await Promise.all([
    listDocuments(ctx, { q: sp.q, type, clientId: sp.client, siteId: sp.chantier, from: sp.du, to: sp.au }),
    siteOptions(ctx, true),
    clientOptions(ctx),
  ]);
  const filtered = Boolean(sp.q || type || sp.client || sp.chantier || sp.du || sp.au);
  const exportQuery = new URLSearchParams(
    Object.entries({ q: sp.q, type, client: sp.client, chantier: sp.chantier, du: sp.du, au: sp.au }).filter(
      (e): e is [string, string] => Boolean(e[1]),
    ),
  ).toString();
  const inbox = inboundAddress(ctx.organization.slug);

  return (
    <>
      <PageHeader
        title="Documents"
        description="Devis, factures, bons de commande, notes de frais, plans… Recherche dans le contenu des fichiers."
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`/api/export/documents.csv${exportQuery ? `?${exportQuery}` : ""}`}>
                <Download aria-hidden /> Exporter (CSV)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/export/documents.zip${exportQuery ? `?${exportQuery}` : ""}`}>
                <Archive aria-hidden /> Télécharger (ZIP)
              </a>
            </Button>
          </>
        }
      />
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-6">
            <UploadZone />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2 pt-6 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <Mail className="size-4 text-orange-700" aria-hidden /> Transférez vos factures par e-mail
            </p>
            <p className="text-muted-foreground">
              Chaque e-mail envoyé ou transféré à cette adresse est rangé automatiquement (type, fournisseur,
              montant, chantier) :
            </p>
            <code className="rounded bg-stone-100 px-2 py-1 text-xs break-all" data-testid="inbound-address">
              {inbox}
            </code>
          </CardContent>
        </Card>
      </div>
      <form
        className="mb-4 grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-2 lg:grid-cols-6"
        role="search"
      >
        <Input
          name="q"
          defaultValue={sp.q}
          placeholder="Rechercher (nom, fournisseur, texte du document)…"
          aria-label="Rechercher un document"
          className="lg:col-span-2"
        />
        <select
          name="type"
          defaultValue={type ?? ""}
          aria-label="Type"
          className="h-9 rounded-lg border bg-white px-2 text-sm"
        >
          <option value="">Tous les types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          name="client"
          defaultValue={sp.client ?? ""}
          aria-label="Client"
          className="h-9 rounded-lg border bg-white px-2 text-sm"
        >
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="chantier"
          defaultValue={sp.chantier ?? ""}
          aria-label="Chantier"
          className="h-9 rounded-lg border bg-white px-2 text-sm"
        >
          <option value="">Tous les chantiers</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <Input name="du" type="date" defaultValue={sp.du} aria-label="Du" />
          <Input name="au" type="date" defaultValue={sp.au} aria-label="Au" />
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" variant="outline">
            Filtrer
          </Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/app/documents">Réinitialiser</Link>
            </Button>
          ) : null}
          <span className="text-muted-foreground ml-auto self-center text-sm">
            {documents.length} document{documents.length > 1 ? "s" : ""}
          </span>
        </div>
      </form>
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtered ? "Aucun document ne correspond" : "Aucun document"}
          description="Déposez vos documents ci-dessus : ils sont classés et rendus cherchables."
        />
      ) : (
        <DocumentTable
          documents={documents}
          canEdit
          highlightId={sp.doc}
          sites={sites.map((s) => ({ value: s.id, label: `${s.title} (${s.code})` }))}
          clients={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
    </>
  );
}
