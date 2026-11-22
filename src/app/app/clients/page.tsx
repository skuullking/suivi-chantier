import { Archive, Plus, UsersRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { SiteStatusBadge } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLIENT_TYPE_LABELS } from "@/lib/labels";
import { requireManager } from "@/server/auth/context";
import { listClients, listClientTags } from "@/server/services/clients";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; archives?: string }>;
}) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const archived = sp.archives === "1";
  const [clients, tags] = await Promise.all([
    listClients(ctx, { q: sp.q, tag: sp.tag, archived }),
    listClientTags(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Clients"
        description={`${clients.length} client${clients.length > 1 ? "s" : ""}${archived ? " archivé(s)" : ""}`}
        actions={
          <Button asChild>
            <Link href="/app/clients/nouveau">
              <Plus aria-hidden /> Nouveau client
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex flex-wrap items-center gap-2" role="search">
        <Input
          name="q"
          defaultValue={sp.q}
          placeholder="Rechercher un nom, un téléphone, une adresse…"
          aria-label="Rechercher un client"
          className="max-w-sm bg-white"
        />
        {tags.length > 0 ? (
          <select
            name="tag"
            defaultValue={sp.tag ?? ""}
            aria-label="Filtrer par étiquette"
            className="h-9 rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">Toutes les étiquettes</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        ) : null}
        {archived ? <input type="hidden" name="archives" value="1" /> : null}
        <Button type="submit" variant="outline">
          Filtrer
        </Button>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href={archived ? "/app/clients" : "/app/clients?archives=1"}>
            <Archive aria-hidden /> {archived ? "Clients actifs" : "Voir les archivés"}
          </Link>
        </Button>
      </form>

      {clients.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={sp.q || sp.tag ? "Aucun client ne correspond" : "Aucun client pour l'instant"}
          description="Ajoutez vos clients pour créer leurs chantiers et leur partager l'avancement."
          action={
            <Button asChild>
              <Link href="/app/clients/nouveau">Ajouter un client</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">Contact</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">Chantiers en cours</th>
                <th className="px-4 py-3 text-right font-medium">Chantiers</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-stone-50" data-testid="client-row">
                  <td className="px-4 py-3">
                    <Link
                      href={`/app/clients/${c.id}`}
                      className="font-medium text-stone-900 hover:underline"
                    >
                      {c.name}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {c.companyName ? `${c.companyName} · ` : ""}
                      {CLIENT_TYPE_LABELS[c.type]}
                      {c.tags.length ? ` · ${c.tags.join(", ")}` : ""}
                    </p>
                  </td>
                  <td className="hidden px-4 py-3 text-stone-700 md:table-cell">
                    <p>{c.phones[0] ?? "—"}</p>
                    <p className="text-muted-foreground text-xs">{c.emails[0] ?? ""}</p>
                  </td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <div className="flex flex-wrap gap-2">
                      {c.sites.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                      {c.sites.map((s) => (
                        <Link
                          key={s.id}
                          href={`/app/chantiers/${s.id}`}
                          className="flex items-center gap-1 hover:underline"
                        >
                          <span className="max-w-40 truncate">{s.title}</span>
                          <SiteStatusBadge status={s.status} />
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{c._count.sites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
