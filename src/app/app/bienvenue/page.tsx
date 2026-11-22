import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireManager } from "@/server/auth/context";

export const metadata: Metadata = { title: "Bienvenue" };

export default async function WelcomePage() {
  const ctx = await requireManager();
  return (
    <>
      <PageHeader
        title={`Bienvenue sur ChantierLink, ${ctx.user.name.split(" ")[0]} !`}
        description="Votre entreprise est créée. Votre essai gratuit de 14 jours commence maintenant."
      />
      <Card>
        <CardContent className="grid gap-4 py-6">
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-5 text-emerald-600" /> Les modèles d&apos;étapes de votre métier
            sont chargés.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/app/equipe">Inviter un ouvrier</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Aller au tableau de bord</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
