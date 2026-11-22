"use client";

import { Copy, ExternalLink, Link2, Mail, MessageCircle, RefreshCw, Smartphone, X } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { setDocumentVisibilityAction } from "@/server/actions/business";
import {
  createPortalLinkAction,
  emailPortalLinkAction,
  revokePortalLinkAction,
  setStepVisibilityAction,
} from "@/server/actions/field";

type LinkRow = {
  id: string;
  url: string | null;
  active: boolean;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastAccessAt: string | null;
  accessCount: number;
};

function waNumber(phone: string) {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("0")) return `33${digits.slice(1)}`;
  return digits;
}

export function PortalLinks(props: {
  siteId: string;
  siteTitle: string;
  organizationName: string;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
  consent: boolean;
  links: LinkRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [expires, setExpires] = useState("");
  const active = props.links.find((l) => l.active && l.url);
  const message = active
    ? `Bonjour ${props.clientName}, suivez l'avancement de votre chantier « ${props.siteTitle} » ici : ${active.url} — ${props.organizationName}`
    : "";

  const create = (replace: boolean) =>
    startTransition(async () =>
      notify(await createPortalLinkAction(props.siteId, expires ? Number(expires) : null, replace)),
    );

  return (
    <div className="grid gap-4">
      {active?.url ? (
        <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-sm font-medium text-emerald-900">Lien actif</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 text-xs" data-testid="portal-url">
              {active.url}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(active.url!);
                notify({ ok: true, message: "Lien copié." });
              }}
            >
              <Copy aria-hidden /> Copier
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href={active.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden /> Aperçu client
              </a>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !props.clientEmail}
              title={props.clientEmail ? undefined : "Ajoutez un e-mail sur la fiche client"}
              onClick={() => startTransition(async () => notify(await emailPortalLinkAction(active.id)))}
            >
              <Mail aria-hidden /> Envoyer par e-mail
            </Button>
            {props.clientPhone ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <a href={`sms:${props.clientPhone.replace(/\s/g, "")}?body=${encodeURIComponent(message)}`}>
                    <Smartphone aria-hidden /> SMS
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a
                    href={`https://wa.me/${waNumber(props.clientPhone)}?text=${encodeURIComponent(message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle aria-hidden /> WhatsApp
                  </a>
                </Button>
              </>
            ) : null}
          </div>
          {!props.consent ? (
            <p className="text-ink-900 text-xs">
              Le client n&apos;a pas donné son accord pour recevoir des messages : envoyez-lui le lien
              seulement s&apos;il l&apos;a demandé.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <ConfirmButton
              title="Générer un nouveau lien ?"
              description="L'ancien lien affichera « lien expiré ». Pensez à envoyer le nouveau au client."
              confirmLabel="Régénérer"
              destructive={false}
              onConfirm={() => create(true)}
            >
              <Button size="sm" variant="ghost">
                <RefreshCw aria-hidden /> Régénérer
              </Button>
            </ConfirmButton>
            <ConfirmButton
              title="Révoquer ce lien ?"
              description="Le client ne pourra plus voir le chantier avec ce lien."
              confirmLabel="Révoquer"
              onConfirm={async () => notify(await revokePortalLinkAction(props.siteId, active.id))}
            >
              <Button size="sm" variant="ghost" className="text-destructive">
                <X aria-hidden /> Révoquer
              </Button>
            </ConfirmButton>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 rounded-xl border border-dashed p-4">
          <p className="text-sm">
            Créez un lien personnel pour que votre client suive son chantier sans compte ni mot de passe :
            avancement, photos validées, résumés et documents partagés.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              aria-label="Durée de validité"
              className="h-9 rounded-lg border bg-white px-2 text-sm"
            >
              <option value="">Sans expiration</option>
              <option value="30">30 jours</option>
              <option value="90">3 mois</option>
              <option value="365">1 an</option>
            </select>
            <Button disabled={pending} onClick={() => create(false)}>
              <Link2 aria-hidden /> Créer le lien client
            </Button>
          </div>
        </div>
      )}

      {props.links.length ? (
        <div>
          <p className="mb-2 text-sm font-medium">Historique des liens</p>
          <ul className="grid gap-1 text-sm">
            {props.links.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0"
                data-testid="portal-link-row"
              >
                <span>
                  Créé le {l.createdAt}
                  {l.expiresAt ? ` · expire le ${l.expiresAt}` : ""}
                </span>
                <span className="text-muted-foreground">
                  {l.revokedAt ? `révoqué le ${l.revokedAt}` : l.active ? "actif" : "expiré"} ·{" "}
                  {l.accessCount} visite(s)
                  {l.lastAccessAt ? `, dernière le ${l.lastAccessAt}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function StepVisibilityToggle(props: {
  siteId: string;
  stepId: string;
  title: string;
  visible: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2">
      <Checkbox
        checked={props.visible}
        disabled={pending}
        onCheckedChange={(c) =>
          startTransition(async () =>
            notify(await setStepVisibilityAction(props.siteId, props.stepId, c === true)),
          )
        }
      />
      {props.title}
    </label>
  );
}

export function DocumentVisibilityToggle(props: { documentId: string; title: string; visible: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2">
      <Checkbox
        checked={props.visible}
        disabled={pending}
        onCheckedChange={(c) =>
          startTransition(async () => notify(await setDocumentVisibilityAction(props.documentId, c === true)))
        }
      />
      <span className="truncate">{props.title}</span>
    </label>
  );
}
