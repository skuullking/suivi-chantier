import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireOwner } from "@/server/auth/context";
import { listTemplates } from "@/server/services/step-templates";
import { TemplatesEditor } from "./templates-editor";

export const metadata: Metadata = { title: "Modèles d'étapes" };

export default async function TemplatesPage() {
  const ctx = await requireOwner();
  const templates = await listTemplates(ctx);
  return (
    <>
      <PageHeader
        title="Modèles d'étapes"
        description="Modifier un modèle ne change pas les chantiers déjà créés."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/parametres">Retour aux paramètres</Link>
          </Button>
        }
      />
      <TemplatesEditor
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          trade: t.trade,
          items: t.items.map((i) => ({
            title: i.title,
            weight: i.weight,
            visibleToClient: i.visibleToClient,
          })),
        }))}
      />
    </>
  );
}
