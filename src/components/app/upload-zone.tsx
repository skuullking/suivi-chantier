"use client";

import { FileUp, Loader2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { notify } from "@/components/app/notify";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/format";
import { DOCUMENT_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { uploadDocumentsAction } from "@/server/actions/business";

const ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.docx,.xlsx,.odt,.ods,.txt,.csv,application/pdf,image/*";

/** Drag & drop zone for one or several documents. Files are validated again on the server. */
export function UploadZone({
  siteId,
  clientId,
  defaultType = "",
  allowVisibility = true,
  types,
}: {
  siteId?: string;
  clientId?: string;
  defaultType?: string;
  allowVisibility?: boolean;
  /** Restrict selectable types (workers). */
  types?: string[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [type, setType] = useState(defaultType);
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();
  const typeOptions = (types ?? Object.keys(DOCUMENT_TYPE_LABELS)) as (keyof typeof DOCUMENT_TYPE_LABELS)[];

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFiles((current) => [...current, ...Array.from(list)].slice(0, 20));
  }

  function submit() {
    if (files.length === 0) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    if (siteId) fd.set("siteId", siteId);
    if (clientId) fd.set("clientId", clientId);
    if (type) fd.set("type", type);
    if (visible) fd.set("visibleToClient", "on");
    startTransition(async () => {
      const result = await uploadDocumentsAction({}, fd);
      notify(result);
      if (result.ok || (result.data?.created as unknown[] | undefined)?.length) {
        setFiles([]);
        if (input.current) input.current.value = "";
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Déposer des fichiers ou cliquer pour choisir"
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-signal-500 bg-signal-50" : "border-ink-300 hover:border-signal-400 bg-white",
        )}
      >
        <FileUp className="text-ink-400 size-8" aria-hidden />
        <p className="text-sm font-medium">Glissez vos fichiers ici ou cliquez pour choisir</p>
        <p className="text-muted-foreground text-xs">PDF, images, Word, Excel — 20 fichiers maximum</p>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          data-testid="upload-input"
          aria-label="Choisir des fichiers"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div className="grid gap-3 rounded-xl border bg-white p-3">
          <ul className="grid gap-1 text-sm">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-muted-foreground text-xs">{formatBytes(f.size)}</span>
                <button
                  type="button"
                  className="hover:bg-ink-100 rounded p-1"
                  aria-label={`Retirer ${f.name}`}
                  onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="h-9 rounded-lg border bg-white px-2 text-sm"
                aria-label="Type de document"
              >
                {types ? null : <option value="">Détection automatique</option>}
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
            {allowVisibility ? (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="upload-visible"
                  checked={visible}
                  onCheckedChange={(c) => setVisible(c === true)}
                />
                <Label htmlFor="upload-visible" className="font-normal">
                  Visible par le client
                </Label>
              </div>
            ) : null}
            <Button type="button" onClick={submit} disabled={pending} className="ml-auto">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
              Envoyer {files.length} fichier{files.length > 1 ? "s" : ""}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
