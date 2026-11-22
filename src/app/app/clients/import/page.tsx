import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { requireManager } from "@/server/auth/context";
import { ClientImport } from "./client-import";

export const metadata: Metadata = { title: "Importer des clients" };

export default async function ImportClientsPage() {
  await requireManager();
  return (
    <>
      <PageHeader
        title="Importer des clients (CSV)"
        description="Depuis Excel, votre logiciel de devis ou un autre outil : enregistrez la liste au format CSV, puis associez les colonnes."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/clients">Retour aux clients</Link>
          </Button>
        }
      />
      <ClientImport />
    </>
  );
}
