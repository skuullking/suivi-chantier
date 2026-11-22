"use client";

import { Check, FileText, Mic, Pencil, RefreshCw, Send, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  approveSummaryAction,
  dismissInboxAction,
  regenerateSummaryAction,
  resolveInboxAction,
} from "@/server/actions/inbox";

type SiteOption = { id: string; label: string; steps: { id: string; label: string }[] };
type Preview =
  | { kind: "photo"; url: string }
  | { kind: "audio"; url: string; transcription: string | null }
  | { kind: "document"; url: string; name: string }
  | { kind: "text" };

export type InboxCardItem = {
  id: string;
  kind: "MEDIA" | "MESSAGE" | "DOCUMENT";
  text: string | null;
  author: string;
  receivedAt: string;
  confidence: number | null;
  reason: string | null;
  proposedSiteId: string | null;
  proposedStepId: string | null;
  proposedClientId: string | null;
  proposedLabel: string;
  proposedDocumentType: string | null;
  preview: Preview;
};

export function InboxItemCard({
  item,
  sites,
  clients,
}: {
  item: InboxCardItem;
  sites: SiteOption[];
  clients: { id: string; label: string }[];
}) {
  const [changing, setChanging] = useState(false);
  const [siteId, setSiteId] = useState(item.proposedSiteId ?? "");
  const [stepId, setStepId] = useState(item.proposedStepId ?? "");
  const [clientId, setClientId] = useState(item.proposedClientId ?? "");
  const [docType, setDocType] = useState(item.proposedDocumentType ?? "OTHER");
  const [pending, startTransition] = useTransition();
  const site = sites.find((s) => s.id === siteId);
  const confidence = item.confidence !== null ? Math.round(item.confidence * 100) : null;
  const canAccept =
    Boolean(item.proposedSiteId) ||
    (item.kind === "DOCUMENT" && Boolean(item.proposedClientId || item.proposedDocumentType));

  return (
    <article className="grid gap-3 rounded-xl border bg-white p-4" data-testid="inbox-item">
      <div className="flex gap-3">
        <div className="bg-ink-100 size-24 shrink-0 overflow-hidden rounded-lg">
          {item.preview.kind === "photo" ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed private URL
            <img src={item.preview.url} alt="Photo reçue" className="size-full object-cover" />
          ) : item.preview.kind === "audio" ? (
            <div className="flex size-full items-center justify-center">
              <Mic className="text-ink-800 size-8" aria-hidden />
            </div>
          ) : (
            <div className="flex size-full items-center justify-center">
              <FileText className="text-ink-500 size-8" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">
            {item.kind === "DOCUMENT"
              ? "Document"
              : item.kind === "MESSAGE"
                ? "Message"
                : item.preview.kind === "audio"
                  ? "Vocal"
                  : "Photo"}{" "}
            de {item.author}
          </p>
          <p className="text-muted-foreground text-xs">{item.receivedAt}</p>
          {item.text ? <p className="mt-1 line-clamp-3 italic">« {item.text} »</p> : null}
          {item.preview.kind === "audio" ? (
            <>
              <audio controls preload="none" src={item.preview.url} className="mt-1 h-8 w-full" />
              {item.preview.transcription ? (
                <p className="mt-1 line-clamp-3 italic">« {item.preview.transcription} »</p>
              ) : null}
            </>
          ) : null}
          {item.preview.kind === "document" ? (
            <a
              href={item.preview.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-signal-700 mt-1 block truncate underline"
            >
              {item.preview.name}
            </a>
          ) : null}
        </div>
      </div>

      <div className="bg-ink-50 rounded-lg p-3 text-sm">
        <p className="text-muted-foreground text-xs uppercase">Proposition</p>
        {item.proposedLabel ? (
          <p className="font-medium">{item.proposedLabel}</p>
        ) : (
          <p className="text-ink-500">Aucune proposition</p>
        )}
        {confidence !== null ? (
          <p className="text-xs">
            Confiance{" "}
            <span
              className={cn(
                "font-semibold",
                confidence >= 75 ? "text-emerald-700" : confidence >= 40 ? "text-ink-900" : "text-red-700",
              )}
            >
              {confidence} %
            </span>
            {item.reason ? ` — ${item.reason}` : ""}
          </p>
        ) : null}
      </div>

      {changing ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            aria-label="Chantier"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setStepId("");
            }}
            className="h-9 rounded-lg border bg-white px-2 text-sm"
          >
            <option value="">{item.kind === "DOCUMENT" ? "Aucun chantier" : "Choisir un chantier"}</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {item.kind !== "DOCUMENT" ? (
            <select
              aria-label="Étape"
              value={stepId}
              onChange={(e) => setStepId(e.target.value)}
              className="h-9 rounded-lg border bg-white px-2 text-sm"
            >
              <option value="">Sans étape</option>
              {(site?.steps ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <>
              <select
                aria-label="Type de document"
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="h-9 rounded-lg border bg-white px-2 text-sm"
              >
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-9 rounded-lg border bg-white px-2 text-sm sm:col-span-2"
              >
                <option value="">Client du chantier / aucun</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button
            className="sm:col-span-2"
            disabled={pending || (item.kind !== "DOCUMENT" && !siteId)}
            onClick={() =>
              startTransition(async () =>
                notify(
                  await resolveInboxAction(item.id, {
                    siteId: siteId || null,
                    stepId: stepId || null,
                    clientId: clientId || null,
                    documentType: item.kind === "DOCUMENT" ? docType : null,
                  }),
                ),
              )
            }
          >
            <Check aria-hidden /> Classer ici
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || !canAccept}
            onClick={() => startTransition(async () => notify(await resolveInboxAction(item.id)))}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Check aria-hidden /> OK
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setChanging(true)}>
            <Pencil aria-hidden /> Changer
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            disabled={pending}
            onClick={() => startTransition(async () => notify(await dismissInboxAction(item.id)))}
          >
            <X aria-hidden /> Ignorer
          </Button>
        </div>
      )}
    </article>
  );
}

export function SummaryCard({
  summary,
}: {
  summary: {
    id: string;
    siteId: string;
    siteTitle: string;
    dateLabel: string;
    text: string;
    clientEmail: string | null;
  };
}) {
  const [text, setText] = useState(summary.text);
  const [source, setSource] = useState(summary.text);
  if (source !== summary.text) {
    setSource(summary.text);
    setText(summary.text);
  }
  const [pending, startTransition] = useTransition();
  return (
    <article className="border-ink-200 grid gap-3 rounded-xl border bg-white p-4" data-testid="summary-draft">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Link href={`/app/chantiers/${summary.siteId}/journal`} className="font-semibold hover:underline">
          {summary.siteTitle}
        </Link>
        <span className="text-muted-foreground text-sm capitalize">{summary.dateLabel}</span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        aria-label={`Résumé pour ${summary.siteTitle}`}
      />
      <p className="text-muted-foreground text-xs">
        {summary.clientEmail
          ? `Sera envoyé à ${summary.clientEmail} et publié sur l'espace client.`
          : "Sera publié sur l'espace client (pas d'e-mail : adresse ou accord du client manquant)."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending || text.trim().length < 10}
          onClick={() =>
            startTransition(async () =>
              notify(await approveSummaryAction(summary.id, text === summary.text ? "" : text)),
            )
          }
        >
          <Send aria-hidden /> Approuver et envoyer
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(async () => notify(await regenerateSummaryAction(summary.id)))}
        >
          <RefreshCw aria-hidden /> Régénérer
        </Button>
      </div>
    </article>
  );
}
