"use client";

import { Camera, Check, Clock, Mic, MousePointerClick, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import {
  flushQueue,
  listQueue,
  onQueueChange,
  type QueuedAction,
  type QueuedUpload,
  removeFromQueue,
  retryAll,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";
import { useOnline } from "../offline-sync";

const ACTION_LABELS: Record<QueuedAction["action"]["type"], string> = {
  arrive: "Arrivée sur le chantier",
  step_done: "Étape terminée",
  task: "Tâche cochée",
};

/** Network state + offline queue (visible, retry on error). */
export function SyncStatus() {
  const online = useOnline();
  const [uploads, setUploads] = useState<QueuedUpload[]>([]);
  const [actions, setActions] = useState<QueuedAction[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listQueue()
        .then((q) => {
          if (!alive) return;
          setUploads(q.uploads);
          setActions(q.actions);
        })
        .catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const total = uploads.length + actions.length;
  return (
    <section
      className="grid gap-3 rounded-2xl bg-white p-5 shadow-sm"
      aria-live="polite"
      data-testid="sync-status"
    >
      <div className="flex items-center gap-3">
        {online ? (
          <Wifi className="size-6 text-emerald-600" aria-hidden />
        ) : (
          <WifiOff className="size-6 text-amber-600" aria-hidden />
        )}
        <div className="flex-1">
          <p className="font-semibold">{online ? "Connecté" : "Hors connexion"}</p>
          <p className="text-sm text-stone-600" data-testid="queue-summary">
            {total === 0
              ? "Tout est envoyé ✔"
              : `${total} envoi${total > 1 ? "s" : ""} en attente${online ? "" : " du réseau"} ⏳`}
          </p>
        </div>
        {total > 0 ? (
          <button
            type="button"
            disabled={busy || !online}
            onClick={async () => {
              setBusy(true);
              await retryAll().finally(() => setBusy(false));
            }}
            className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-stone-800 px-3 font-semibold disabled:opacity-50"
          >
            <RefreshCw className={cn("size-5", busy && "animate-spin")} aria-hidden /> Envoyer
          </button>
        ) : null}
      </div>
      {total > 0 ? (
        <ul className="grid gap-2" aria-label="File d'attente">
          {uploads.map((u) => (
            <li
              key={u.clientUploadId}
              className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm"
            >
              {u.kind === "VOICE" ? (
                <Mic className="size-5 text-sky-700" aria-hidden />
              ) : (
                <Camera className="size-5 text-orange-700" aria-hidden />
              )}
              <span className="flex-1">
                {u.kind === "VOICE" ? "Vocal" : "Photo"} du{" "}
                {new Date(u.capturedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                {u.lastError ? <span className="block text-xs text-red-700">{u.lastError}</span> : null}
              </span>
              {u.status === "error" ? (
                <button
                  type="button"
                  aria-label="Supprimer de la file"
                  onClick={() => removeFromQueue("uploads", u.clientUploadId)}
                  className="p-2"
                >
                  <Trash2 className="size-5 text-red-700" />
                </button>
              ) : (
                <Clock className="size-5 text-amber-600" aria-label="En attente" />
              )}
            </li>
          ))}
          {actions.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2 text-sm">
              <MousePointerClick className="size-5 text-stone-600" aria-hidden />
              <span className="flex-1">
                {ACTION_LABELS[a.action.type]}
                {a.lastError ? <span className="block text-xs text-red-700">{a.lastError}</span> : null}
              </span>
              {a.status === "error" ? (
                <button
                  type="button"
                  aria-label="Supprimer de la file"
                  onClick={() => removeFromQueue("actions", a.id)}
                  className="p-2"
                >
                  <Trash2 className="size-5 text-red-700" />
                </button>
              ) : (
                <Clock className="size-5 text-amber-600" aria-label="En attente" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-emerald-700">
          <Check className="size-4" aria-hidden /> Vos photos, vocaux et actions sont synchronisés.
        </p>
      )}
      {online && total > 0 ? (
        <button
          type="button"
          className="text-left text-sm text-stone-500 underline"
          onClick={() => void flushQueue()}
        >
          Synchroniser maintenant
        </button>
      ) : null}
    </section>
  );
}
