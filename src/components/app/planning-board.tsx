"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useActionState, useOptimistic, useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Field, FormAlert, SubmitButton } from "@/components/forms/form-parts";
import { NativeSelect } from "@/components/forms/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type ActionState, initialActionState } from "@/lib/action-state";
import { SLOT_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  deleteAssignmentAction,
  moveAssignmentAction,
  saveAssignmentAction,
} from "@/server/actions/business";

export type BoardAssignment = {
  id: string;
  date: string;
  userId: string;
  userName: string;
  siteId: string;
  siteTitle: string;
  siteCode: string;
  slot: "FULL_DAY" | "MORNING" | "AFTERNOON";
  startTime: string | null;
  stepId: string | null;
  instructions: string | null;
  conflict: boolean;
};

type Option = { value: string; label: string };
type Row = { id: string; label: string; sublabel?: string };
type DayCol = { key: string; label: string; weekday: string; isToday: boolean; outside?: boolean };

const SITE_COLORS = [
  "bg-orange-100 border-orange-300 text-orange-950",
  "bg-sky-100 border-sky-300 text-sky-950",
  "bg-emerald-100 border-emerald-300 text-emerald-950",
  "bg-violet-100 border-violet-300 text-violet-950",
  "bg-amber-100 border-amber-300 text-amber-950",
  "bg-rose-100 border-rose-300 text-rose-950",
  "bg-teal-100 border-teal-300 text-teal-950",
];

function colorFor(siteId: string) {
  let h = 0;
  for (const c of siteId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SITE_COLORS[h % SITE_COLORS.length];
}

type Editing = { assignment?: BoardAssignment; date: string; userId?: string; siteId?: string } | null;

export function PlanningBoard({
  view,
  groupBy,
  days,
  weeks,
  rows,
  assignments,
  members,
  sites,
  fixedSiteId,
  stepsBySite = {},
}: {
  view: "week" | "month";
  groupBy: "person" | "site";
  days: DayCol[];
  /** Month view: list of weeks of days. */
  weeks?: DayCol[][];
  rows: Row[];
  assignments: BoardAssignment[];
  members: Option[];
  sites: Option[];
  fixedSiteId?: string;
  stepsBySite?: Record<string, Option[]>;
}) {
  const [items, move] = useOptimistic(
    assignments,
    (state, m: { id: string; date: string; userId?: string }) =>
      state.map((a) => (a.id === m.id ? { ...a, date: m.date, userId: m.userId ?? a.userId } : a)),
  );
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    if (!over) return;
    const [rowId, date] = over.split("|") as [string, string];
    const current = items.find((a) => a.id === id);
    if (!current) return;
    const userId = groupBy === "person" && rowId !== "all" ? rowId : undefined;
    if (current.date === date && (!userId || userId === current.userId)) return;
    startTransition(async () => {
      move({ id, date, userId });
      const result = await moveAssignmentAction(id, date, userId);
      if (result.error) notify(result);
      else if ((result.data?.warnings as string[] | undefined)?.length) notify({ error: result.message });
    });
  }

  const cellItems = (rowId: string, date: string) =>
    items.filter(
      (a) =>
        a.date === date &&
        (rowId === "all" || (groupBy === "person" ? a.userId === rowId : a.siteId === rowId)),
    );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {view === "week" ? (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-stone-50">
                <th className="w-44 border-b px-3 py-2 text-left text-xs font-medium text-stone-600 uppercase">
                  {groupBy === "person" ? "Personne" : "Chantier"}
                </th>
                {days.map((d) => (
                  <th
                    key={d.key}
                    className={cn(
                      "border-b border-l px-2 py-2 text-left text-xs font-medium",
                      d.isToday ? "bg-orange-50 text-orange-800" : "text-stone-600",
                    )}
                  >
                    <span className="capitalize">{d.weekday}</span> {d.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="border-b px-3 py-2 text-left align-top font-medium">
                    {row.label}
                    {row.sublabel ? (
                      <span className="text-muted-foreground block text-xs font-normal">{row.sublabel}</span>
                    ) : null}
                  </th>
                  {days.map((d) => (
                    <DropCell
                      key={d.key}
                      id={`${row.id}|${d.key}`}
                      highlight={d.isToday}
                      onAdd={() =>
                        setEditing({
                          date: d.key,
                          userId: groupBy === "person" ? row.id : undefined,
                          siteId: groupBy === "site" ? row.id : fixedSiteId,
                        })
                      }
                      addLabel={`Ajouter une affectation le ${d.weekday} ${d.label} pour ${row.label}`}
                    >
                      {cellItems(row.id, d.key).map((a) => (
                        <Chip
                          key={a.id}
                          a={a}
                          groupBy={groupBy}
                          onOpen={() => setEditing({ assignment: a, date: a.date })}
                        />
                      ))}
                    </DropCell>
                  ))}
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 1} className="text-muted-foreground p-8 text-center">
                    Rien à afficher.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[800px] table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-stone-50">
                {(weeks?.[0] ?? []).map((d) => (
                  <th
                    key={d.key}
                    className="border-b px-2 py-2 text-left text-xs font-medium text-stone-600 capitalize"
                  >
                    {d.weekday}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(weeks ?? []).map((week) => (
                <tr key={week[0]!.key}>
                  {week.map((d) => (
                    <DropCell
                      key={d.key}
                      id={`all|${d.key}`}
                      highlight={d.isToday}
                      muted={d.outside}
                      tall
                      onAdd={() => setEditing({ date: d.key, siteId: fixedSiteId })}
                      addLabel={`Ajouter une affectation le ${d.label}`}
                      header={d.label}
                    >
                      {cellItems("all", d.key).map((a) => (
                        <Chip
                          key={a.id}
                          a={a}
                          groupBy="month"
                          onOpen={() => setEditing({ assignment: a, date: a.date })}
                        />
                      ))}
                    </DropCell>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AssignmentDialog
        editing={editing}
        onClose={() => setEditing(null)}
        members={members}
        sites={sites}
        fixedSiteId={fixedSiteId}
        stepsBySite={stepsBySite}
      />
    </DndContext>
  );
}

function DropCell({
  id,
  children,
  onAdd,
  addLabel,
  highlight,
  muted,
  tall,
  header,
}: {
  id: string;
  children: React.ReactNode;
  onAdd: () => void;
  addLabel: string;
  highlight?: boolean;
  muted?: boolean;
  tall?: boolean;
  header?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <td
      ref={setNodeRef}
      data-testid="planning-cell"
      data-cell={id}
      data-today={highlight ? "true" : undefined}
      className={cn(
        "group border-b border-l p-1 align-top",
        tall ? "h-28" : "h-20",
        highlight && "bg-orange-50/40",
        muted && "bg-stone-50 text-stone-400",
        isOver && "bg-orange-100",
      )}
    >
      <div className="flex h-full flex-col gap-1">
        {header ? <span className="text-xs font-medium">{header}</span> : null}
        {children}
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="mt-auto flex items-center justify-center rounded border border-dashed border-transparent py-0.5 text-stone-400 opacity-0 group-hover:border-stone-300 group-hover:opacity-100 focus:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </td>
  );
}

function Chip({
  a,
  groupBy,
  onOpen,
}: {
  a: BoardAssignment;
  groupBy: "person" | "site" | "month";
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: a.id });
  const label =
    groupBy === "site"
      ? a.userName
      : groupBy === "person"
        ? a.siteTitle
        : `${a.userName.split(" ")[0]} · ${a.siteTitle}`;
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-testid="planning-chip"
      onClick={onOpen}
      title={a.conflict ? "Conflit : cette personne est déjà prévue sur ce créneau." : undefined}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(
        "w-full cursor-grab touch-none rounded-md border px-1.5 py-1 text-left text-xs leading-tight shadow-xs",
        colorFor(a.siteId),
        a.conflict && "ring-2 ring-red-500",
        isDragging && "relative z-20 cursor-grabbing opacity-80 shadow-lg",
      )}
      {...attributes}
      {...listeners}
    >
      <span className="flex items-center gap-1 font-medium">
        {a.conflict ? <AlertTriangle className="size-3 shrink-0 text-red-600" aria-label="Conflit" /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="opacity-75">
        {a.slot === "FULL_DAY" ? "Journée" : SLOT_LABELS[a.slot]}
        {a.startTime ? ` · ${a.startTime}` : ""}
      </span>
    </button>
  );
}

function AssignmentDialog({
  editing,
  onClose,
  members,
  sites,
  fixedSiteId,
  stepsBySite,
}: {
  editing: Editing;
  onClose: () => void;
  members: Option[];
  sites: Option[];
  fixedSiteId?: string;
  stepsBySite: Record<string, Option[]>;
}) {
  const a = editing?.assignment;
  const [siteId, setSiteId] = useState<string>("");
  const [lastEditing, setLastEditing] = useState<Editing>(null);
  if (editing !== lastEditing) {
    setLastEditing(editing);
    setSiteId(a?.siteId ?? editing?.siteId ?? fixedSiteId ?? "");
  }
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await saveAssignmentAction(a?.id ?? null, prev, fd);
    if (result.ok) {
      notify(result);
      onClose();
    }
    return result;
  }, initialActionState);
  const fe = state.fieldErrors ?? {};
  const steps = stepsBySite[siteId] ?? [];

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a ? "Modifier l'affectation" : "Nouvelle affectation"}</DialogTitle>
          <DialogDescription>Qui intervient, où et quand.</DialogDescription>
        </DialogHeader>
        {editing ? (
          <form
            action={formAction}
            className="grid gap-3"
            key={a?.id ?? `${editing.date}-${editing.userId}-${editing.siteId}`}
          >
            <FormAlert error={state.error} />
            {fixedSiteId ? (
              <input type="hidden" name="siteId" value={fixedSiteId} />
            ) : (
              <NativeSelect
                name="siteId"
                label="Chantier"
                placeholder="Choisir un chantier"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
                options={sites}
                errors={fe.siteId}
              />
            )}
            <NativeSelect
              name="userId"
              label="Personne"
              placeholder="Choisir une personne"
              defaultValue={a?.userId ?? editing.userId ?? ""}
              options={members}
              errors={fe.userId}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                name="date"
                label="Date"
                type="date"
                defaultValue={a?.date ?? editing.date}
                errors={fe.date}
              />
              <NativeSelect
                name="slot"
                label="Créneau"
                defaultValue={a?.slot ?? "FULL_DAY"}
                options={Object.entries(SLOT_LABELS).map(([value, label]) => ({ value, label }))}
              />
              <Field
                name="startTime"
                label="Heure"
                type="time"
                defaultValue={a?.startTime ?? "08:00"}
                errors={fe.startTime}
              />
            </div>
            {steps.length ? (
              <NativeSelect
                name="stepId"
                label="Étape (facultatif)"
                placeholder="Aucune étape"
                defaultValue={a?.stepId ?? ""}
                options={steps}
              />
            ) : null}
            <Field
              name="instructions"
              label="Consignes du jour"
              multiline
              rows={2}
              defaultValue={a?.instructions ?? ""}
            />
            <div className="flex items-center justify-between gap-2">
              {a ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await deleteAssignmentAction(a.id);
                      notify(result);
                      if (result.ok) onClose();
                    })
                  }
                >
                  <Trash2 aria-hidden /> Supprimer
                </Button>
              ) : (
                <span />
              )}
              <SubmitButton>{a ? "Enregistrer" : "Ajouter"}</SubmitButton>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
