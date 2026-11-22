import { FileText } from "lucide-react";
import { DocumentTable } from "@/components/app/document-table";
import { EmptyState } from "@/components/app/page-header";
import { UploadZone } from "@/components/app/upload-zone";
import { requireManager } from "@/server/auth/context";
import { loadSite } from "../site-data";
import { clientOptions } from "@/server/services/clients";
import { listSiteDocuments } from "@/server/services/documents";
import { siteOptions } from "@/server/services/sites";

export default async function SiteDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  await loadSite(ctx, id);
  const [documents, sites, clients] = await Promise.all([
    listSiteDocuments(ctx, id),
    siteOptions(ctx, true),
    clientOptions(ctx),
  ]);
  return (
    <div className="grid gap-4">
      <UploadZone siteId={id} />
      {documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Devis, factures, plans, bons de commande… Déposez-les ici ou transférez-les par e-mail."
        />
      ) : (
        <DocumentTable
          documents={documents}
          canEdit
          showSite={false}
          sites={sites.map((s) => ({ value: s.id, label: `${s.title} (${s.code})` }))}
          clients={clients.map((c) => ({ value: c.id, label: c.name }))}
        />
      )}
    </div>
  );
}
