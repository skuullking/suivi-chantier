import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { ProgressBar } from "@/components/app/status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireOwner } from "@/server/auth/context";
import { subscriptionOverview } from "@/server/services/billing";
import { CancelMockButton, ChoosePlanButton, PortalButton } from "./billing-buttons";

export const metadata: Metadata = { title: "Abonnement" };

const STATUS = {
  TRIALING: "Essai gratuit",
  ACTIVE: "Actif",
  PAST_DUE: "Paiement en retard",
  CANCELED: "Résilié",
} as const;

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ paiement?: string }>;
}) {
  const ctx = await requireOwner();
  const sp = await searchParams;
  const o = await subscriptionOverview(ctx);
  const memberLimit = o.plan.maxMembers;
  return (
    <>
      <PageHeader
        title="Abonnement"
        description="Formules simples, sans engagement. Essai gratuit de 14 jours."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/parametres">Retour aux paramètres</Link>
          </Button>
        }
      />
      {sp.paiement === "ok" ? (
        <p
          className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900"
          role="status"
        >
          Merci ! Votre abonnement est actif.
        </p>
      ) : null}
      {!o.enabled ? (
        <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          La facturation est désactivée sur cette installation (<code>BILLING_ENABLED=false</code>) : aucune
          limite ne s&apos;applique. Les formules ci-dessous restent consultables.
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Formule {o.plan.name} — {STATUS[o.status]}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {o.trialDaysLeft !== null ? (
              <p>
                Il reste <strong>{o.trialDaysLeft} jour(s)</strong> d&apos;essai gratuit.
              </p>
            ) : null}
            {o.currentPeriodEnd ? <p>Prochaine échéance : {formatDate(o.currentPeriodEnd)}</p> : null}
            <div>
              <p className="mb-1">
                Membres : {o.usage.members}
                {o.usage.pendingInvitations ? ` (+ ${o.usage.pendingInvitations} invitation(s))` : ""}
                {memberLimit ? ` / ${memberLimit}` : " (illimité)"}
              </p>
              {memberLimit ? (
                <ProgressBar
                  value={((o.usage.members + o.usage.pendingInvitations) / memberLimit) * 100}
                  label="Membres utilisés"
                />
              ) : null}
            </div>
            <div>
              <p className="mb-1">
                Stockage : {formatBytes(o.usage.storage)} / {formatBytes(o.plan.maxStorageBytes)}
              </p>
              <ProgressBar
                value={(o.usage.storage / o.plan.maxStorageBytes) * 100}
                label="Stockage utilisé"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <PortalButton />
              {o.provider === "mock" && o.status === "ACTIVE" ? <CancelMockButton /> : null}
            </div>
            <p className="text-muted-foreground text-xs">
              Paiement{" "}
              {o.provider === "stripe"
                ? "sécurisé par Stripe"
                : "simulé (aucun prélèvement : BILLING_PROVIDER=mock)"}
              .
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {o.plans.map((p) => {
          const current = p.id === o.plan.id && o.status === "ACTIVE";
          return (
            <Card key={p.id} className={cn(current && "border-orange-400")} data-testid={`plan-${p.id}`}>
              <CardHeader>
                <CardTitle>{p.name}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>
                  <span className="text-3xl font-bold">{p.priceEurosPerMonth} €</span> HT / mois
                </p>
                <p className="text-muted-foreground">{p.description}</p>
                <ul className="grid gap-1">
                  <li className="flex gap-2">
                    <Check className="size-4 text-emerald-600" aria-hidden />
                    {p.maxMembers ? `${p.maxMembers} comptes (patron compris)` : "Comptes illimités"}
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-emerald-600" aria-hidden /> {formatBytes(p.maxStorageBytes)}{" "}
                    de stockage
                  </li>
                  <li className="flex gap-2">
                    <Check className="size-4 text-emerald-600" aria-hidden /> WhatsApp, résumés IA, portail
                    client
                  </li>
                </ul>
                {current ? (
                  <p className="font-semibold text-orange-700">Votre formule actuelle</p>
                ) : (
                  <ChoosePlanButton plan={p.id} label={`Choisir ${p.name}`} />
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
