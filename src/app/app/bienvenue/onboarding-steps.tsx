"use client";

import { Check, ExternalLink, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TRADE_OPTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { chooseTradeAction, createDemoSiteAction } from "@/server/actions/account";

function StepCard({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn(done && "border-emerald-200")} data-testid={`onboarding-step-${index}`}>
      <CardHeader className="flex flex-row items-center gap-3">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            done ? "bg-emerald-600 text-white" : "bg-orange-100 text-orange-800",
          )}
        >
          {done ? <Check className="size-4" aria-label="Fait" /> : index}
        </span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">{children}</CardContent>
    </Card>
  );
}

export function OnboardingSteps(props: {
  isOwner: boolean;
  trade: string;
  templates: Record<string, string[]>;
  done: { trade: boolean; worker: boolean; client: boolean; site: boolean; portal: boolean };
  firstSite: { id: string; title: string } | null;
  portalUrl: string | null;
}) {
  const [trade, setTrade] = useState(props.trade);
  const [portalUrl, setPortalUrl] = useState(props.portalUrl);
  const [pending, startTransition] = useTransition();
  const steps = props.templates[trade] ?? [];

  return (
    <div className="grid max-w-3xl gap-4">
      <StepCard index={1} title="Votre métier et ses étapes" done>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Votre métier"
            value={trade}
            disabled={!props.isOwner || pending}
            onChange={(e) => {
              const value = e.target.value;
              setTrade(value);
              startTransition(async () => notify(await chooseTradeAction(value)));
            }}
            className="h-9 rounded-lg border bg-white px-2"
          >
            {TRADE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground">Modèle d&apos;étapes chargé :</span>
        </div>
        <p className="text-stone-700">
          {steps.length ? steps.join(" → ") : "Vous créerez vos propres étapes."}
        </p>
        <Link href="/app/parametres/modeles" className="w-fit text-orange-700 hover:underline">
          Personnaliser les modèles
        </Link>
      </StepCard>

      <StepCard index={2} title="Invitez un ouvrier" done={props.done.worker}>
        <p className="text-muted-foreground">
          Il reçoit un lien par e-mail, choisit son mot de passe et voit sa journée sur son téléphone.
          Associez aussi son numéro WhatsApp pour qu&apos;il puisse envoyer photos et vocaux.
        </p>
        <Button asChild variant={props.done.worker ? "outline" : "default"} className="w-fit">
          <Link href="/app/equipe">{props.done.worker ? "Gérer l'équipe" : "Inviter un ouvrier"}</Link>
        </Button>
      </StepCard>

      <StepCard index={3} title="Créez votre premier chantier" done={props.done.site}>
        {props.firstSite ? (
          <p>
            Premier chantier :{" "}
            <Link
              href={`/app/chantiers/${props.firstSite.id}`}
              className="font-medium text-orange-700 hover:underline"
            >
              {props.firstSite.title}
            </Link>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Avec un vrai client, ou un client fictif pour découvrir l&apos;outil.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant={props.done.site ? "outline" : "default"}>
            <Link href="/app/chantiers/nouveau">Créer un chantier</Link>
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createDemoSiteAction();
                notify(result);
                if (result.ok) setPortalUrl(String(result.data?.portalUrl ?? ""));
              })
            }
          >
            <Sparkles aria-hidden /> Créer un chantier d&apos;exemple
          </Button>
        </div>
      </StepCard>

      <StepCard
        index={4}
        title="Voyez ce que voit votre client"
        done={Boolean(portalUrl) || props.done.portal}
      >
        <p className="text-muted-foreground">
          Chaque chantier a un lien privé pour le client : avancement, photos validées, résumé du jour,
          documents. Sans compte ni mot de passe.
        </p>
        {portalUrl ? (
          <div className="flex flex-wrap items-center gap-2">
            <code
              className="max-w-full truncate rounded bg-stone-100 px-2 py-1 text-xs"
              data-testid="onboarding-portal-url"
            >
              {portalUrl}
            </code>
            <Button asChild size="sm">
              <a href={portalUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Ouvrir l&apos;espace client
              </a>
            </Button>
          </div>
        ) : (
          <p>Créez un chantier puis, dans son onglet « Espace client », générez le lien.</p>
        )}
      </StepCard>

      <Button asChild variant="ghost" className="w-fit">
        <Link href="/app">Aller au tableau de bord</Link>
      </Button>
    </div>
  );
}
