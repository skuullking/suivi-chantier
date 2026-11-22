import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { createClientAction } from "@/server/actions/business";
import { requireManager } from "@/server/auth/context";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Nouveau client" };

export default async function NewClientPage() {
  await requireManager();
  return (
    <>
      <PageHeader title="Nouveau client" description="Particulier ou professionnel." />
      <Card className="max-w-3xl">
        <CardContent className="pt-6">
          <ClientForm action={createClientAction} submitLabel="Créer le client" />
        </CardContent>
      </Card>
    </>
  );
}
