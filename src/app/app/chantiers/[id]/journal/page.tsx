import { AlertTriangle, History, Lock, MessageSquareText, Mic, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDayLong } from "@/lib/format";
import { requireManager } from "@/server/auth/context";
import { loadSite } from "../site-data";
import { describeEvent } from "@/server/services/events";
import { siteJournal } from "@/server/services/notes";
import { NoteForm } from "./note-form";

const SUMMARY_LABELS = {
  DRAFT: "Brouillon à approuver",
  APPROVED: "Approuvé",
  SENT: "Envoyé au client",
} as const;

export default async function SiteJournalPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireManager();
  const { id } = await params;
  await loadSite(ctx, id);
  const { notes, summaries, events } = await siteJournal(ctx, id);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid content-start gap-6 lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Ajouter au journal</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm siteId={id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Résumés du jour</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {summaries.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Les résumés générés chaque soir pour le client apparaîtront ici.
              </p>
            ) : (
              summaries.map((s) => (
                <article key={s.id} className="rounded-lg border p-3" data-testid="journal-summary">
                  <p className="flex items-center gap-2 text-sm font-medium capitalize">
                    <Sparkles className="size-4 text-orange-600" aria-hidden /> {formatDayLong(s.date)}
                    <span className="text-muted-foreground text-xs font-normal normal-case">
                      — {SUMMARY_LABELS[s.status]}
                    </span>
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap text-stone-700">
                    {s.editedText ?? s.generatedText}
                  </p>
                </article>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes et problèmes</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {notes.length === 0 ? <p className="text-muted-foreground text-sm">Aucune note.</p> : null}
            {notes.map((n) => {
              const Icon =
                n.kind === "PROBLEM" ? AlertTriangle : n.kind === "VOICE" ? Mic : MessageSquareText;
              return (
                <article
                  key={n.id}
                  data-testid="journal-note"
                  className={
                    n.kind === "PROBLEM"
                      ? "rounded-lg border border-red-200 bg-red-50 p-3"
                      : "rounded-lg border p-3"
                  }
                >
                  <p className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                    <Icon
                      className={n.kind === "PROBLEM" ? "size-4 text-red-600" : "size-4 text-stone-400"}
                      aria-hidden
                    />
                    <strong className="text-stone-800">{n.author?.name ?? "Système"}</strong>
                    {formatDateTime(n.createdAt)}
                    {n.kind === "PROBLEM" ? (
                      <span className="font-semibold text-red-700">Problème</span>
                    ) : null}
                    {n.kind === "VOICE" ? <span>Transcription d&apos;un vocal</span> : null}
                    {n.internal ? (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="size-3" aria-hidden /> interne
                      </span>
                    ) : (
                      <span>visible client</span>
                    )}
                  </p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{n.text}</p>
                </article>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="content-start">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden /> Historique
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 text-sm">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-stone-200 pl-3">
                <p>
                  <strong>{e.actorName ?? "ChantierLink"}</strong> {describeEvent(e.type, e.payload)}
                </p>
                <p className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</p>
              </li>
            ))}
            {events.length === 0 ? <p className="text-muted-foreground">Aucun événement.</p> : null}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
