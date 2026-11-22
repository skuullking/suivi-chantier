import { HardHat } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireManager } from "@/server/auth/context";

export const metadata: Metadata = { title: "Tableau de bord" };

export default async function DashboardPage() {
  const ctx = await requireManager();
  return (
    <>
      <PageHeader title={`Bonjour ${ctx.user.name.split(" ")[0]}`} description={ctx.organization.name} />
      <EmptyState
        icon={HardHat}
        title="Votre tableau de bord"
        description="Vos chantiers en cours, alertes et activité récente apparaîtront ici."
        action={
          <Button asChild>
            <Link href="/app/equipe">Inviter un ouvrier</Link>
          </Button>
        }
      />
    </>
  );
}
