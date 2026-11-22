"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { LateBadge } from "@/components/app/status";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { formatDay } from "@/lib/format";
import { STEP_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  addStepAction,
  deleteStepAction,
  reorderStepsAction,
  setStepStatusAction,
  updateStepAction,
} from "@/server/actions/business";

type Step = {
  id: string;
  title: string;
  status: "TODO" | "IN_PROGRESS" | "DONE";
  weight: number;
  visibleToClient: boolean;
  plannedStart: string;
  plannedEnd: string;
  late: boolean;
};

const STATUS_STYLES = {
  TODO: "border-stone-200 bg-white",
  IN_PROGRESS: "border-orange-300 bg-orange-50/60",
  DONE: "border-emerald-200 bg-emerald-50/60",
} as const;

export function StepsEditor({ siteId, steps }: { siteId: string; steps: Step[] }) {
  const [items, setItems] = useState(steps);
  const [source, setSource] = useState(steps);
  const [, startTransition] = useTransition();
  // Re-sync with fresh server data after a revalidation.
  if (source !== steps) {
    setSource(steps);
    setItems(steps);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const totalWeight = items.reduce((sum, s) => sum + s.weight, 0);

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((s) => s.id === active.id);
    const newIndex = items.findIndex((s) => s.id === over.id);
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    startTransition(async () => {
      const result = await reorderStepsAction(
        siteId,
        next.map((s) => s.id),
      );
      if (!result.ok) {
        notify(result);
        setItems(steps);
      }
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Glissez-déposez les étapes pour les réordonner (ou utilisez le clavier : Espace puis flèches). La
          progression est pondérée par le poids de chaque étape.
        </p>
        <StepDialog siteId={siteId} />
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed bg-white p-8 text-center text-sm">
          Aucune étape. Ajoutez la première étape du chantier.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2" aria-label="Étapes du chantier">
              {items.map((step, index) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  index={index}
                  siteId={siteId}
                  share={totalWeight ? Math.round((step.weight / totalWeight) * 100) : 0}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function SortableStep({
  step,
  index,
  siteId,
  share,
}: {
  step: Step;
  index: number;
  siteId: string;
  share: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const [pending, startTransition] = useTransition();
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="step-row"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center",
        STATUS_STYLES[step.status],
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-stone-400 hover:bg-stone-100 active:cursor-grabbing"
          aria-label={`Déplacer l'étape ${step.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-6 text-right text-sm text-stone-400 tabular-nums">{index + 1}</span>
        <div className="min-w-0">
          <p className={cn("font-medium", step.status === "DONE" && "text-stone-500 line-through")}>
            {step.title}
          </p>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span>
              Poids {step.weight} ({share} %)
            </span>
            {step.plannedStart || step.plannedEnd ? (
              <span>
                {step.plannedStart ? formatDay(step.plannedStart) : "…"} →{" "}
                {step.plannedEnd ? formatDay(step.plannedEnd) : "…"}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              {step.visibleToClient ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
              {step.visibleToClient ? "visible client" : "interne"}
            </span>
            {step.late ? <LateBadge /> : null}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <select
          aria-label={`Statut de l'étape ${step.title}`}
          value={step.status}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.value;
            startTransition(async () => notify(await setStepStatusAction(step.id, value)));
          }}
          className="h-9 rounded-lg border bg-white px-2 text-sm"
        >
          {(Object.keys(STEP_STATUS_LABELS) as Step["status"][]).map((s) => (
            <option key={s} value={s}>
              {STEP_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <StepDialog siteId={siteId} step={step} />
        <ConfirmButton
          title={`Supprimer l'étape « ${step.title} » ?`}
          description="Les photos rattachées à cette étape seront conservées, sans étape."
          confirmLabel="Supprimer"
          onConfirm={async () => notify(await deleteStepAction(siteId, step.id))}
        >
          <Button variant="ghost" size="icon" aria-label={`Supprimer l'étape ${step.title}`}>
            <Trash2 />
          </Button>
        </ConfirmButton>
      </div>
    </li>
  );
}

function StepDialog({ siteId, step }: { siteId: string; step?: Step }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = step
      ? await updateStepAction(siteId, step.id, prev, fd)
      : await addStepAction(siteId, prev, fd);
    if (result.ok) {
      notify(result);
      setOpen(false);
    }
    return result;
  }, initialActionState);
  const fe = state.fieldErrors ?? {};
  const v = state.values;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {step ? (
          <Button variant="ghost" size="icon" aria-label={`Modifier l'étape ${step.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button>
            <Plus aria-hidden /> Ajouter une étape
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{step ? "Modifier l'étape" : "Nouvelle étape"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-3">
          <FormAlert error={state.error} />
          <Field
            name="title"
            label="Nom de l'étape"
            defaultValue={v?.title ?? step?.title ?? ""}
            errors={fe.title}
          />
          <Field
            name="weight"
            label="Poids dans la progression"
            type="number"
            min={0}
            max={100}
            hint="1 par défaut. Une étape de poids 2 compte double."
            defaultValue={v?.weight ?? String(step?.weight ?? 1)}
            errors={fe.weight}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              name="plannedStart"
              label="Début prévu"
              type="date"
              defaultValue={v?.plannedStart ?? step?.plannedStart ?? ""}
            />
            <Field
              name="plannedEnd"
              label="Fin prévue"
              type="date"
              defaultValue={v?.plannedEnd ?? step?.plannedEnd ?? ""}
              errors={fe.plannedEnd}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`step-visible-${step?.id ?? "new"}`}
              name="visibleToClient"
              defaultChecked={step?.visibleToClient ?? true}
            />
            <Label htmlFor={`step-visible-${step?.id ?? "new"}`} className="font-normal">
              Visible par le client sur son espace
            </Label>
          </div>
          <SubmitButton>{step ? "Enregistrer" : "Ajouter"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
