import { FileText, ImageIcon } from "lucide-react";
import Link from "next/link";
import type { DocumentType } from "@/generated/prisma/enums";
import { toDateKey } from "@/lib/dates";
import { formatAmount, formatBytes, formatDate, formatDay } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { documentUrls } from "@/server/services/documents";
import { DocumentActions } from "./document-actions";

export type DocumentRow = {
  id: string;
  name: string;
  type: DocumentType;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  siteId: string | null;
  clientId: string | null;
  documentDate: Date | null;
  amountCents: number | null;
  supplier: string | null;
  tags: string[];
  visibleToClient: boolean;
  processingStatus: string;
  createdAt: Date;
  site?: { id: string; title: string; code: string } | null;
  client?: { id: string; name: string } | null;
};

type Option = { value: string; label: string };

/** Documents table with preview / download / edit actions. */
export function DocumentTable({
  documents,
  sites,
  clients,
  canEdit,
  showSite = true,
  highlightId,
}: {
  documents: DocumentRow[];
  sites: Option[];
  clients: Option[];
  canEdit: boolean;
  showSite?: boolean;
  highlightId?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-left text-xs text-stone-600 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Document</th>
            <th className="hidden px-4 py-3 font-medium sm:table-cell">Type</th>
            {showSite ? (
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Chantier / client</th>
            ) : null}
            <th className="hidden px-4 py-3 font-medium md:table-cell">Date</th>
            <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Montant</th>
            <th className="px-4 py-3 text-right font-medium">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {documents.map((d) => {
            const urls = documentUrls(d);
            const Icon = d.mimeType.startsWith("image/") ? ImageIcon : FileText;
            return (
              <tr
                key={d.id}
                data-testid="document-row"
                className={highlightId === d.id ? "bg-orange-50" : "hover:bg-stone-50"}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 shrink-0 text-stone-400" aria-hidden />
                    <div className="min-w-0">
                      <a
                        href={urls.preview}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-medium hover:underline"
                      >
                        {d.name}
                      </a>
                      <p className="text-muted-foreground text-xs">
                        {formatBytes(d.sizeBytes)}
                        {d.supplier ? ` · ${d.supplier}` : ""}
                        {d.visibleToClient ? " · visible client" : ""}
                        {d.processingStatus === "PENDING" || d.processingStatus === "PROCESSING"
                          ? " · analyse en cours…"
                          : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">{DOCUMENT_TYPE_LABELS[d.type]}</td>
                {showSite ? (
                  <td className="hidden px-4 py-3 lg:table-cell">
                    {d.site ? (
                      <Link href={`/app/chantiers/${d.site.id}/documents`} className="hover:underline">
                        {d.site.title}
                      </Link>
                    ) : d.client ? (
                      <Link href={`/app/clients/${d.client.id}`} className="hover:underline">
                        {d.client.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ) : null}
                <td className="hidden px-4 py-3 md:table-cell">
                  {d.documentDate ? formatDay(d.documentDate) : formatDate(d.createdAt)}
                </td>
                <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                  {formatAmount(d.amountCents)}
                </td>
                <td className="px-2 py-2">
                  <DocumentActions
                    canEdit={canEdit}
                    sites={sites}
                    clients={clients}
                    doc={{
                      id: d.id,
                      name: d.name,
                      type: d.type,
                      siteId: d.siteId,
                      clientId: d.clientId,
                      documentDate: d.documentDate ? toDateKey(d.documentDate) : null,
                      amount:
                        d.amountCents != null ? (d.amountCents / 100).toFixed(2).replace(".", ",") : null,
                      supplier: d.supplier,
                      tags: d.tags,
                      visibleToClient: d.visibleToClient,
                      previewUrl: urls.preview,
                      downloadUrl: urls.download,
                      mimeType: d.mimeType,
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
