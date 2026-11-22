"use client";

import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { ConfirmButton } from "@/components/app/confirm-button";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TRADE_OPTIONS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { deleteTemplateAction, saveTemplateAction } from "@/server/actions/business";

type Item = { title: string; weight: number; visibleToClient: boolean };
type Template = { id: string | null; name: string; trade: string; items: Item[] };

export function TemplatesEditor({ templates }: { templates: Template[] }) {
  const [selected, setSelected] = useState<string | null>(templates[0]?.id ?? null);
  const [draft, setDraft] = useState<Template | null>(null);
  const current = draft ?? templates.find((t) => t.id === selected) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <nav aria-label="Modèles" className="grid content-start gap-1">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setDraft(null);
              setSelected(t.id);
            }}
            aria-current={!draft && selected === t.id ? "true" : undefined}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm",
              !draft && selected === t.id ? "border-signal-400 bg-signal-50" : "hover:bg-ink-50 bg-white",
            )}
          >
            <span className="font-medium">{t.name}</span>
            <span className="text-muted-foreground block text-xs">{t.items.length} étapes</span>
          </button>
        ))}
        <Button
          variant="outline"
          className="mt-2"
          onClick={() =>
            setDraft({
              id: null,
              name: "Nouveau modèle",
              trade: "OTHER",
              items: [{ title: "Première étape", weight: 1, visibleToClient: true }],
            })
          }
        >
          <Plus aria-hidden /> Nouveau modèle
        </Button>
      </nav>
      {current ? (
        <TemplateForm
          key={current.id ?? "new"}
          template={current}
          onDuplicate={() => setDraft({ ...current, id: null, name: `${current.name} (copie)` })}
          onSaved={() => setDraft(null)}
        />
      ) : (
        <p className="text-muted-foreground">Aucun modèle.</p>
      )}
    </div>
  );
}

function TemplateForm({
  template,
  onDuplicate,
  onSaved,
}: {
  template: Template;
  onDuplicate: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template.name);
  const [trade, setTrade] = useState(template.trade);
  const [items, setItems] = useState<Item[]>(template.items);
  const [pending, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Item>) =>
    setItems((list) => list.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const moveItem = (i: number, dir: -1 | 1) =>
    setItems((list) => {
      const next = [...list];
      const j = i + dir;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{template.id ? "Modifier le modèle" : "Nouveau modèle"}</CardTitle>
        {template.id ? (
          <Button variant="ghost" size="sm" onClick={onDuplicate}>
            <Copy aria-hidden /> Dupliquer
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Nom du modèle
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Métier
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="h-9 rounded-lg border bg-white px-2 text-sm font-normal"
            >
              {TRADE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ol className="grid gap-2" aria-label="Étapes du modèle">
          {items.map((item, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
              <span className="text-ink-400 w-6 text-right text-sm tabular-nums">{i + 1}</span>
              <Input
                value={item.title}
                onChange={(e) => update(i, { title: e.target.value })}
                aria-label={`Nom de l'étape ${i + 1}`}
                className="min-w-48 flex-1"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={item.weight}
                onChange={(e) => update(i, { weight: Number(e.target.value) })}
                aria-label={`Poids de l'étape ${i + 1}`}
                className="w-20"
              />
              <label className="flex items-center gap-1 text-xs">
                <Checkbox
                  checked={item.visibleToClient}
                  onCheckedChange={(c) => update(i, { visibleToClient: c === true })}
                />
                Client
              </label>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Monter"
                onClick={() => moveItem(i, -1)}
                disabled={i === 0}
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Descendre"
                onClick={() => moveItem(i, 1)}
                disabled={i === items.length - 1}
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Supprimer l'étape ${i + 1}`}
                onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="outline"
            onClick={() => setItems((list) => [...list, { title: "", weight: 1, visibleToClient: true }])}
          >
            <Plus aria-hidden /> Ajouter une étape
          </Button>
          <div className="flex gap-2">
            {template.id ? (
              <ConfirmButton
                title="Supprimer ce modèle ?"
                description="Les chantiers créés avec ce modèle ne sont pas modifiés."
                confirmLabel="Supprimer"
                onConfirm={async () => notify(await deleteTemplateAction(template.id!))}
              >
                <Button variant="ghost" className="text-destructive">
                  Supprimer
                </Button>
              </ConfirmButton>
            ) : null}
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveTemplateAction(template.id, { name, trade, items });
                  notify(result);
                  if (result.ok) onSaved();
                })
              }
            >
              Enregistrer le modèle
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
