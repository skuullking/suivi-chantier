import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/server/auth/context";
import { getOrganization } from "@/server/services/settings";
import { DeleteAccountForm, RetentionForm } from "./data-forms";

export const metadata: Metadata = { title: "Données et RGPD" };

export default async function DataPage() {
  const ctx = await requireOwner();
  const org = await getOrganization(ctx);
  return (
    <>
      <PageHeader
        title="Données et RGPD"
        description="Vos données vous appartiennent : exportez-les, réglez leur durée de conservation, supprimez votre compte."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/parametres">Retour aux paramètres</Link>
          </Button>
        }
      />
      <div className="grid max-w-3xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Export complet</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Une archive ZIP avec toutes vos données (fichier JSON lisible) et tous vos fichiers originaux :
              documents, photos, vocaux. Utile pour un changement d&apos;outil ou une demande de portabilité.
            </p>
            <Button asChild className="w-fit">
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download (API route) */}
              <a href="/api/export/organization">
                <Download aria-hidden /> Télécharger l&apos;export complet
              </a>
            </Button>
            <p className="text-muted-foreground">
              Pour un client précis (droit d&apos;accès, effacement), utilisez les boutons « Données
              personnelles » de sa fiche.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Durées de conservation</CardTitle>
          </CardHeader>
          <CardContent>
            <RetentionForm
              defaults={{
                retentionDocumentsYears: org.retentionDocumentsYears,
                retentionMediaYears: org.retentionMediaYears,
                retentionPurgeEnabled: org.retentionPurgeEnabled,
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-800">Supprimer le compte</CardTitle>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm organizationName={org.name} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
