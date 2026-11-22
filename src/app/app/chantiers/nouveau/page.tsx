import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { requireManager } from "@/server/auth/context";
import { clientOptions } from "@/server/services/clients";
import { planningMembers } from "@/server/services/planning";
import { listTemplates } from "@/server/services/step-templates";
import { db } from "@/server/db";
import { NewSiteWizard } from "./wizard";

export const metadata: Metadata = { title: "Nouveau chantier" };

export default async function NewSitePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const ctx = await requireManager();
  const sp = await searchParams;
  const [clients, templates, members, org] = await Promise.all([
    clientOptions(ctx),
    listTemplates(ctx),
    planningMembers(ctx),
    db.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { trade: true } }),
  ]);
  const defaultTemplate = templates.find((t) => t.trade === org.trade) ?? templates[0];
  return (
    <>
      <PageHeader
        title="Nouveau chantier"
        description="Trois étapes : le client, le chantier, les étapes et l'équipe."
      />
      <NewSiteWizard
        clients={clients.map((c) => ({ id: c.id, name: c.name, address: c.addresses[0] ?? "" }))}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          items: t.items.map((i) => i.title),
        }))}
        members={members.map((m) => ({ id: m.userId, name: m.user.name, role: m.role }))}
        defaultClientId={clients.some((c) => c.id === sp.client) ? sp.client : undefined}
        defaultTemplateId={defaultTemplate?.id}
      />
    </>
  );
}
