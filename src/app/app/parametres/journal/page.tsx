import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { requireOwner } from "@/server/auth/context";
import { AUDIT_ACTION_LABELS, listAuditLog } from "@/server/services/settings";

export const metadata: Metadata = { title: "Journal d'audit" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const ctx = await requireOwner();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const { rows, pages, total } = await listAuditLog(ctx, page);
  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description={`${total} action(s) sensible(s) enregistrée(s) : connexions, accès, modifications, suppressions.`}
        actions={
          <Button asChild variant="outline">
            <Link href="/app/parametres">Retour aux paramètres</Link>
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs text-stone-600 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Qui</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">Détail</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">Adresse IP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} data-testid="audit-row">
                <td className="px-4 py-2 whitespace-nowrap">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-2">{r.actorName}</td>
                <td className="px-4 py-2">{AUDIT_ACTION_LABELS[r.action] ?? r.action}</td>
                <td className="text-muted-foreground hidden max-w-md truncate px-4 py-2 font-mono text-xs md:table-cell">
                  {r.after ? JSON.stringify(r.after) : r.before ? JSON.stringify(r.before) : ""}
                </td>
                <td className="text-muted-foreground hidden px-4 py-2 lg:table-cell">{r.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`?page=${page - 1}`}>Précédent</Link>
            </Button>
          ) : null}
          <span className="text-sm">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`?page=${page + 1}`}>Suivant</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
