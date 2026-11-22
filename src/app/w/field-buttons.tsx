"use client";

import { Camera, CheckCircle2, Loader2, MapPinCheck, Mic } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { setStepStatusAction, setTaskDoneAction } from "@/server/actions/business";
import { arriveAction } from "@/server/actions/field";
import { enqueueAction, type FieldAction, flushQueue } from "@/lib/offline-queue";
import type { ActionState } from "@/lib/action-state";

/** Runs a server action; without network the action is queued locally and replayed later. */
async function runOrQueue(run: () => Promise<ActionState>, offline: FieldAction): Promise<ActionState> {
  if (navigator.onLine) {
    try {
      return await run();
    } catch {
      // network failure: queue below
    }
  }
  await enqueueAction(offline);
  void flushQueue();
  return { ok: true, message: "Enregistré ⏳ — envoi au retour du réseau." };
}

const big =
  "flex min-h-16 items-center justify-center gap-2 rounded-2xl border-2 border-ink-900 px-4 text-lg font-bold active:scale-[0.98] transition disabled:opacity-60";

export function FieldButtons({
  siteId,
  arrivedAt,
  currentStep,
}: {
  siteId: string;
  arrivedAt: string | null;
  currentStep: { id: string; title: string } | null;
}) {
  const [arrived, setArrived] = useState(arrivedAt);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={pending || Boolean(arrived)}
        onClick={() =>
          startTransition(async () => {
            const result = await runOrQueue(() => arriveAction(siteId), { type: "arrive", siteId });
            notify(result);
            if (result.ok) setArrived(new Date().toISOString());
          })
        }
        className={cn(
          big,
          "font-heading col-span-2 min-h-[76px] text-2xl font-extrabold",
          arrived ? "border-emerald-700 bg-emerald-100 text-emerald-900" : "bg-signal-400 text-ink-900",
        )}
      >
        {pending ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <MapPinCheck className="size-6" aria-hidden />
        )}
        {arrived ? "Arrivé ✔" : "J'arrive"}
      </button>
      <Link
        href={`/w/photo?chantier=${siteId}`}
        className={cn(big, "text-ink-900 min-h-24 flex-col gap-1 bg-white")}
      >
        <Camera className="size-6" aria-hidden /> Photo
      </Link>
      <Link
        href={`/w/vocal?chantier=${siteId}`}
        className={cn(big, "text-ink-900 min-h-24 flex-col gap-1 bg-white")}
      >
        <Mic className="size-6" aria-hidden /> Vocal
      </Link>
      <button
        type="button"
        disabled={!currentStep || pending}
        onClick={() => setConfirm(true)}
        className={cn(big, "text-ink-900 col-span-2 bg-transparent")}
      >
        <CheckCircle2 className="size-6" aria-hidden /> Étape terminée
      </button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer « {currentStep?.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le bureau sera prévenu et l&apos;avancement mis à jour.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12">Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="h-12"
              onClick={() =>
                currentStep &&
                startTransition(async () =>
                  notify(
                    await runOrQueue(() => setStepStatusAction(currentStep.id, "DONE"), {
                      type: "step_done",
                      stepId: currentStep.id,
                    }),
                  ),
                )
              }
            >
              Oui, c&apos;est terminé
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function WorkerTasks({ tasks }: { tasks: { id: string; title: string; done: boolean }[] }) {
  const [items, toggle] = useOptimistic(tasks, (state, change: { id: string; done: boolean }) =>
    state.map((t) => (t.id === change.id ? { ...t, done: change.done } : t)),
  );
  const [, startTransition] = useTransition();
  if (items.length === 0) return null;
  return (
    <ul className="grid gap-2" aria-label="Tâches du jour">
      {items.map((t) => (
        <li key={t.id}>
          <label className="flex min-h-14 items-center gap-3 rounded-xl border bg-white px-4 text-base">
            <input
              type="checkbox"
              className="accent-ink-900 size-6"
              checked={t.done}
              onChange={(e) => {
                const done = e.target.checked;
                startTransition(async () => {
                  toggle({ id: t.id, done });
                  notify(
                    await runOrQueue(() => setTaskDoneAction(t.id, done), {
                      type: "task",
                      taskId: t.id,
                      done,
                    }),
                  );
                });
              }}
            />
            <span className={t.done ? "text-ink-400 line-through" : ""}>{t.title}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}
