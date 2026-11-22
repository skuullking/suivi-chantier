"use client";

import { Trash2 } from "lucide-react";
import { useActionState, useOptimistic, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { createTaskAction, deleteTaskAction, setTaskDoneAction } from "@/server/actions/business";

type Task = { id: string; title: string; done: boolean; date: string | null; assignee: string | null };
type Option = { value: string; label: string };

export function TaskList({
  siteId,
  tasks,
  members,
  steps,
  defaultDate,
}: {
  siteId: string;
  tasks: Task[];
  members: Option[];
  steps: Option[];
  defaultDate: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, update: { id: string; done: boolean }) =>
    state.map((t) => (t.id === update.id ? { ...t, done: update.done } : t)),
  );
  const [, startTransition] = useTransition();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await createTaskAction(prev, fd);
    if (result.ok) notify(result);
    return result;
  }, initialActionState);

  return (
    <div className="grid gap-4">
      {optimistic.length === 0 ? <p className="text-muted-foreground text-sm">Aucune tâche.</p> : null}
      <ul className="grid gap-1">
        {optimistic.map((t) => (
          <li key={t.id} className="hover:bg-ink-50 flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Checkbox
              id={`task-${t.id}`}
              checked={t.done}
              onCheckedChange={(c) =>
                startTransition(async () => {
                  setOptimistic({ id: t.id, done: c === true });
                  notify(await setTaskDoneAction(t.id, c === true));
                })
              }
            />
            <label htmlFor={`task-${t.id}`} className="flex-1 text-sm">
              <span className={t.done ? "text-ink-400 line-through" : ""}>{t.title}</span>
              <span className="text-muted-foreground block text-xs">
                {[t.date, t.assignee].filter(Boolean).join(" · ") || "Sans date"}
              </span>
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Supprimer la tâche ${t.title}`}
              onClick={() => startTransition(async () => notify(await deleteTaskAction(t.id)))}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <form
        action={formAction}
        className="bg-ink-50 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_auto_auto]"
      >
        <input type="hidden" name="siteId" value={siteId} />
        <div className="sm:col-span-3">
          <FormAlert error={state.error} />
        </div>
        <Input
          name="title"
          placeholder="Nouvelle tâche (ex. commander les liteaux)"
          aria-label="Nouvelle tâche"
        />
        <Input name="date" type="date" defaultValue={defaultDate} aria-label="Date de la tâche" />
        <select
          name="assigneeId"
          aria-label="Personne"
          className="h-9 rounded-lg border bg-white px-2 text-sm"
        >
          <option value="">Tout le monde</option>
          {members.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        {steps.length ? (
          <select
            name="stepId"
            aria-label="Étape"
            className="h-9 rounded-lg border bg-white px-2 text-sm sm:col-span-2"
          >
            <option value="">Aucune étape</option>
            {steps.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        ) : null}
        <SubmitButton size="sm">Ajouter</SubmitButton>
      </form>
    </div>
  );
}
