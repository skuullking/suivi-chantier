"use client";

import { Check, Clock, ImagePlus, Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { enqueueUpload, flushQueue } from "@/lib/offline-queue";
import { newClientUploadId } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { useUploadStatuses } from "../offline-sync";
import { TargetPicker, type UploadTarget } from "../target-picker";

type Sent = {
  key: string;
  preview: string;
};

/**
 * Full-screen camera (getUserMedia). One tap = the photo is sent to the active site / step.
 * Fallback (no camera permission, old browser): the native picker with `capture`.
 */
export function CameraCapture({
  targets,
  initialSiteId,
}: {
  targets: UploadTarget[];
  initialSiteId: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [siteId, setSiteId] = useState(initialSiteId);
  const [stepId, setStepId] = useState(targets.find((t) => t.id === initialSiteId)?.defaultStepId ?? "");
  const [caption, setCaption] = useState("");
  const [cameraState, setCameraState] = useState<"starting" | "ready" | "unavailable">("starting");
  const [sent, setSent] = useState<Sent[]>([]);
  const [flash, setFlash] = useState(false);
  const position = useRef<GeolocationPosition | null>(null);
  const statuses = useUploadStatuses(sent.map((x) => x.key));

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setCameraState("unavailable"));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play().catch(() => {});
        }
        setCameraState("ready");
      })
      .catch(() => setCameraState("unavailable"));
    // Best effort position (helps the office to check the site); never blocking.
    navigator.geolocation?.getCurrentPosition(
      (p) => (position.current = p),
      () => {},
      { maximumAge: 120_000, timeout: 10_000 },
    );
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function changeSite(id: string) {
    setSiteId(id);
    setStepId(targets.find((t) => t.id === id)?.defaultStepId ?? "");
  }

  async function upload(blob: Blob, fileName: string) {
    const key = newClientUploadId();
    // Stored locally first (IndexedDB), then sent: nothing is lost without network.
    await enqueueUpload({
      file: blob,
      fileName,
      siteId,
      stepId: stepId || null,
      caption: caption || null,
      kind: "PHOTO",
      capturedAt: new Date().toISOString(),
      clientUploadId: key,
      latitude: position.current?.coords.latitude ?? null,
      longitude: position.current?.coords.longitude ?? null,
    });
    setSent((list) => [{ key, preview: URL.createObjectURL(blob) }, ...list].slice(0, 12));
    setCaption("");
    void flushQueue();
  }

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    navigator.vibrate?.(30);
    canvas.toBlob((blob) => blob && void upload(blob, `photo-${Date.now()}.jpg`), "image/jpeg", 0.9);
  }

  return (
    <div className="-mx-4 -mt-4 grid gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-black">
        {cameraState !== "unavailable" ? (
          <video
            ref={video}
            playsInline
            muted
            className="size-full object-cover"
            aria-label="Aperçu de l'appareil photo"
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <p className="text-lg font-semibold">Appareil photo indisponible ici.</p>
            <p className="text-white/70">Utilisez le bouton ci-dessous pour prendre ou choisir une photo.</p>
          </div>
        )}
        {cameraState === "starting" ? (
          <Loader2
            className="absolute top-1/2 left-1/2 size-10 -translate-1/2 animate-spin text-white"
            aria-label="Démarrage"
          />
        ) : null}
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-white transition-opacity",
            flash ? "opacity-70" : "opacity-0",
          )}
        />
        <div className="absolute inset-x-0 top-0 p-3">
          <TargetPicker
            targets={targets}
            siteId={siteId}
            stepId={stepId}
            onSite={changeSite}
            onStep={setStepId}
            dark
          />
        </div>
        {cameraState === "ready" ? (
          <button
            type="button"
            onClick={shoot}
            aria-label="Prendre la photo"
            className="absolute bottom-5 left-1/2 size-20 -translate-x-1/2 rounded-full border-[6px] border-white bg-white/30 shadow-lg active:scale-95"
          />
        ) : null}
      </div>

      <div className="grid gap-3 px-4">
        <input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Légende (facultatif)"
          aria-label="Légende de la prochaine photo"
          className="h-12 rounded-xl border bg-white px-3 text-base"
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-stone-800 bg-white text-base font-bold"
        >
          <ImagePlus className="size-6" aria-hidden />
          {cameraState === "unavailable" ? "Prendre une photo" : "Choisir dans la galerie"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture={cameraState === "unavailable" ? "environment" : undefined}
          multiple
          className="sr-only"
          data-testid="photo-input"
          aria-label="Choisir des photos"
          onChange={(e) => {
            for (const f of Array.from(e.target.files ?? [])) void upload(f, f.name);
            e.target.value = "";
          }}
        />

        {sent.length ? (
          <ul className="grid grid-cols-4 gap-2" aria-label="Photos envoyées">
            {sent
              .map((item) => ({ ...item, ...(statuses[item.key] ?? { status: "sending" as const }) }))
              .map((s) => (
                <li
                  key={s.key}
                  className="relative aspect-square overflow-hidden rounded-lg bg-stone-200"
                  data-testid="sent-photo"
                  data-status={s.status}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={s.preview} alt="" className="size-full object-cover" />
                  <span
                    className={cn(
                      "absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full text-white",
                      s.status === "sent" && "bg-emerald-600",
                      s.status === "sending" && "bg-stone-700",
                      s.status === "waiting" && "bg-amber-600",
                      s.status === "error" && "bg-red-600",
                    )}
                    title={s.error}
                    aria-label={
                      s.status === "sent"
                        ? "Envoyée"
                        : s.status === "sending"
                          ? "Envoi en cours"
                          : s.status === "waiting"
                            ? "En attente de réseau"
                            : `Erreur : ${s.error}`
                    }
                  >
                    {s.status === "sent" ? <Check className="size-4" /> : null}
                    {s.status === "sending" ? <RefreshCw className="size-3.5 animate-spin" /> : null}
                    {s.status === "waiting" ? <Clock className="size-4" /> : null}
                    {s.status === "error" ? <X className="size-4" /> : null}
                  </span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-stone-500">
            Un appui = photo envoyée au chantier sélectionné.
          </p>
        )}
      </div>
    </div>
  );
}
