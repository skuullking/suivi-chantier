"use client";

import { Check, Crop, Droplets, Pencil, RotateCcw, Undo2, X } from "lucide-react";
import { useCallback, useRef, useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { editPhotoAction, updateMediaCaptionAction, validateMediaAction } from "@/server/actions/field";

export type GridPhoto = {
  id: string;
  thumbnail: string | null;
  display: string;
  original: string | null;
  caption: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  author: string | null;
  step: string | null;
  site: string | null;
  takenAt: string;
  edited: boolean;
};

const STATUS_STYLE = {
  PENDING: "bg-signal-400",
  APPROVED: "bg-emerald-600",
  REJECTED: "bg-red-600",
} as const;
const STATUS_LABEL = { PENDING: "À valider", APPROVED: "Validée", REJECTED: "Refusée" } as const;

/**
 * Photo grid with batch validation. Keyboard: arrows to move, Space to select, A = approve, R = reject,
 * Enter = open. The selection (or the focused photo) is the target of A / R.
 */
export function PhotoGrid({ photos, canValidate }: { photos: GridPhoto[]; canValidate: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [open, setOpen] = useState<GridPhoto | null>(null);
  const [pending, startTransition] = useTransition();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const act = useCallback(
    (ids: string[], status: "APPROVED" | "REJECTED" | "PENDING") => {
      if (!canValidate || ids.length === 0) return;
      startTransition(async () => {
        notify(await validateMediaAction(ids, status));
        setSelected(new Set());
      });
    },
    [canValidate],
  );

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    const cols = Math.max(
      1,
      Math.round((e.currentTarget.parentElement?.parentElement?.clientWidth ?? 800) / 190),
    );
    const move = (to: number) => {
      const i = Math.max(0, Math.min(photos.length - 1, to));
      setFocus(i);
      refs.current[i]?.focus();
    };
    const target = selected.size ? [...selected] : [photos[index]!.id];
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        move(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(index - 1);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(index + cols);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(index - cols);
        break;
      case " ":
        e.preventDefault();
        toggle(photos[index]!.id);
        break;
      case "a":
      case "A":
        e.preventDefault();
        act(target, "APPROVED");
        break;
      case "r":
      case "R":
        e.preventDefault();
        act(target, "REJECTED");
        break;
    }
  }

  if (photos.length === 0) return null;
  return (
    <div className="grid gap-3">
      {canValidate ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(selected.size === photos.length ? new Set() : new Set(photos.map((p) => p.id)))
            }
          >
            {selected.size === photos.length ? "Tout désélectionner" : "Tout sélectionner"}
          </Button>
          <span className="text-muted-foreground text-sm">{selected.size} sélectionnée(s)</span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              disabled={pending || selected.size === 0}
              onClick={() => act([...selected], "APPROVED")}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <Check aria-hidden /> Valider
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || selected.size === 0}
              onClick={() => act([...selected], "REJECTED")}
            >
              <X aria-hidden /> Refuser
            </Button>
          </div>
          <p className="text-muted-foreground w-full px-2 text-xs">
            Raccourcis : flèches pour se déplacer, Espace pour sélectionner, A valider, R refuser, Entrée pour
            ouvrir.
          </p>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" role="list">
        {photos.map((p, i) => (
          <li key={p.id} className="relative" data-testid="photo-tile" data-status={p.status}>
            <button
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              tabIndex={i === focus ? 0 : -1}
              onFocus={() => setFocus(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setOpen(p);
                else onKeyDown(e, i);
              }}
              onClick={(e) => (e.shiftKey || e.metaKey || e.ctrlKey ? toggle(p.id) : setOpen(p))}
              aria-label={`Photo ${p.caption ?? ""} — ${STATUS_LABEL[p.status]}${selected.has(p.id) ? ", sélectionnée" : ""}`}
              className={cn(
                "bg-ink-200 focus-visible:ring-signal-400 block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 focus:outline-none focus-visible:ring-4",
                selected.has(p.id) ? "border-signal-500" : "border-transparent",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
              <img
                src={p.thumbnail ?? p.display}
                alt={p.caption ?? ""}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
            {canValidate ? (
              <input
                type="checkbox"
                className="accent-signal-600 absolute top-2 left-2 size-5"
                checked={selected.has(p.id)}
                onChange={() => toggle(p.id)}
                aria-label="Sélectionner"
              />
            ) : null}
            <span
              className={cn(
                "absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white",
                STATUS_STYLE[p.status],
              )}
            >
              {STATUS_LABEL[p.status]}
            </span>
            <p className="text-ink-700 mt-1 truncate text-xs">
              {p.caption ?? p.step ?? "Sans légende"}
              {p.edited ? " · retouchée" : ""}
            </p>
            <p className="text-muted-foreground truncate text-[11px]">
              {[p.author, p.takenAt, p.site].filter(Boolean).join(" · ")}
            </p>
          </li>
        ))}
      </ul>
      <PhotoViewer photo={open} onClose={() => setOpen(null)} canValidate={canValidate} onValidate={act} />
    </div>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

function PhotoViewer({
  photo,
  onClose,
  canValidate,
  onValidate,
}: {
  photo: GridPhoto | null;
  onClose: () => void;
  canValidate: boolean;
  onValidate: (ids: string[], status: "APPROVED" | "REJECTED" | "PENDING") => void;
}) {
  const [mode, setMode] = useState<"view" | "crop" | "blur">("view");
  const [crop, setCrop] = useState<Rect | null>(null);
  const [blurs, setBlurs] = useState<Rect[]>([]);
  const [drawing, setDrawing] = useState<{ x0: number; y0: number; rect: Rect } | null>(null);
  const [caption, setCaption] = useState("");
  const [current, setCurrent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  if (photo && photo.id !== current) {
    setCurrent(photo.id);
    setMode("view");
    setCrop(null);
    setBlurs([]);
    setCaption(photo.caption ?? "");
  }

  const rel = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  function down(e: React.PointerEvent) {
    if (mode === "view") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = rel(e);
    setDrawing({ x0: p.x, y0: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } });
  }
  function move(e: React.PointerEvent) {
    if (!drawing) return;
    const p = rel(e);
    setDrawing({
      ...drawing,
      rect: {
        x: Math.min(drawing.x0, p.x),
        y: Math.min(drawing.y0, p.y),
        w: Math.abs(p.x - drawing.x0),
        h: Math.abs(p.y - drawing.y0),
      },
    });
  }
  function up() {
    if (!drawing) return;
    if (drawing.rect.w > 0.02 && drawing.rect.h > 0.02) {
      if (mode === "crop") setCrop(drawing.rect);
      else setBlurs((b) => [...b, drawing.rect]);
    }
    setDrawing(null);
  }

  const save = () =>
    photo &&
    startTransition(async () => {
      const result = await editPhotoAction(photo.id, { crop, blurs });
      notify(result);
      if (result.ok) onClose();
    });

  const rects = [...(crop ? [{ ...crop, kind: "crop" }] : []), ...blurs.map((b) => ({ ...b, kind: "blur" }))];
  if (drawing) rects.push({ ...drawing.rect, kind: mode });

  return (
    <Dialog open={photo !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[95vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{photo?.caption ?? photo?.step ?? "Photo"}</DialogTitle>
          <DialogDescription>
            {[photo?.site, photo?.step, photo?.author, photo?.takenAt].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        {photo ? (
          <div className="grid gap-3">
            <div
              ref={box}
              className={cn(
                "relative mx-auto w-fit touch-none select-none",
                mode !== "view" && "cursor-crosshair",
              )}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
              <img
                src={photo.display}
                alt={photo.caption ?? ""}
                className="max-h-[60vh] w-auto rounded-lg"
                draggable={false}
              />
              {rects.map((r, i) => (
                <div
                  key={i}
                  className={cn(
                    "pointer-events-none absolute border-2",
                    r.kind === "crop"
                      ? "border-signal-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                      : "border-ink-800 bg-ink-800/30 backdrop-blur-md",
                  )}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                  }}
                />
              ))}
            </div>
            {canValidate ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={mode === "crop" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setMode(mode === "crop" ? "view" : "crop")}
                  >
                    <Crop aria-hidden /> Recadrer
                  </Button>
                  <Button
                    variant={mode === "blur" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setMode(mode === "blur" ? "view" : "blur")}
                  >
                    <Droplets aria-hidden /> Flouter une zone
                  </Button>
                  {crop || blurs.length ? (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => (setCrop(null), setBlurs([]))}>
                        <Undo2 aria-hidden /> Effacer les zones
                      </Button>
                      <Button size="sm" disabled={pending} onClick={save}>
                        <Pencil aria-hidden /> Enregistrer la retouche
                      </Button>
                    </>
                  ) : null}
                  {photo.edited ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          notify(await editPhotoAction(photo.id, { reset: true }));
                          onClose();
                        })
                      }
                    >
                      <RotateCcw aria-hidden /> Rétablir l&apos;original
                    </Button>
                  ) : null}
                </div>
                {mode !== "view" ? (
                  <p className="text-muted-foreground text-sm">
                    {mode === "crop"
                      ? "Tracez le cadre à conserver."
                      : "Tracez un rectangle sur chaque visage ou plaque à flouter."}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <Input
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    aria-label="Légende"
                    placeholder="Légende"
                  />
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => notify(await updateMediaCaptionAction(photo.id, caption)))
                    }
                  >
                    Enregistrer
                  </Button>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                  {photo.original ? (
                    <Button asChild variant="ghost" size="sm" className="mr-auto">
                      <a href={photo.original}>Télécharger l&apos;original</a>
                    </Button>
                  ) : null}
                  <Button
                    variant="destructive"
                    onClick={() => {
                      onValidate([photo.id], "REJECTED");
                      onClose();
                    }}
                  >
                    <X aria-hidden /> Refuser
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      onValidate([photo.id], "APPROVED");
                      onClose();
                    }}
                  >
                    <Check aria-hidden /> Valider
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
