import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Plan } from "@/generated/prisma/enums";
import { billing } from "@/server/adapters/billing";
import { requireOwner } from "@/server/auth/context";
import { PLANS } from "@/server/services/plan-limits";
import { ConfirmMockPayment } from "../billing-buttons";

export const metadata: Metadata = { title: "Paiement (simulation)" };

/** Simulated checkout (BILLING_PROVIDER=mock): no card, no payment. */
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ formule?: string }>;
}) {
  await requireOwner();
  if (billing().name !== "mock") notFound();
  const { formule } = await searchParams;
  const plan = PLANS[(formule as Plan) ?? "TEAM"];
  if (!plan) notFound();
  return (
    <>
      <PageHeader
        title="Paiement (simulation)"
        description="Aucun prélèvement : la facturation réelle passe par Stripe."
      />
      <Card className="max-w-lg">
        <CardContent className="grid gap-4 pt-6">
          <p className="text-lg">
            Formule <strong>{plan.name}</strong> — {plan.priceEurosPerMonth} € HT / mois
          </p>
          <ConfirmMockPayment plan={plan.id} />
          <Button asChild variant="ghost">
            <Link href="/app/parametres/abonnement">Annuler</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
