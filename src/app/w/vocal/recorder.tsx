"use client";

import { Check, Clock, Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { newClientUploadId, sendMedia } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { TargetPicker, type UploadTarget } from "../target-picker";

type Sent = {
  key: string;
  seconds: number;
  status: "sending" | "sent" | "waiting" | "error";
  error?: string;
};

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/** One big button: record / stop. The recording is sent automatically (transcribed in the background). */
export function VoiceRecorder({
  targets,
  initialSiteId,
}: {
  targets: UploadTarget[];
  initialSiteId: string;
}) {
  const [siteId, setSiteId] = useState(initialSiteId);
  const [stepId, setStepId] = useState(targets.find((t) => t.id === initialSiteId)?.defaultStepId ?? "");
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef<number>(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const supported =
    typeof window !== "undefined" && pickMimeType() !== null && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - startedAt.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => () => recorder.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function upload(blob: Blob, fileName: string, duration: number) {
    const key = newClientUploadId();
    setSent((list) => [{ key, seconds: duration, status: "sending" as const }, ...list]);
    const result = await sendMedia({
      file: blob,
      fileName,
      siteId,
      stepId: stepId || null,
      kind: "VOICE",
      capturedAt: new Date(startedAt.current || Date.now()).toISOString(),
      clientUploadId: key,
    });
    setSent((list) =>
      list.map((s) =>
        s.key === key
          ? result.ok
            ? { ...s, status: "sent" }
            : { ...s, status: result.retry ? "waiting" : "error", error: result.error }
          : s,
      ),
    );
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType() || undefined;
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const type = r.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const duration = Math.round((Date.now() - startedAt.current) / 1000);
        if (blob.size > 0) void upload(blob, `vocal-${Date.now()}.${ext}`, duration);
      };
      startedAt.current = Date.now();
      setSeconds(0);
      r.start(1000);
      recorder.current = r;
      setRecording(true);
      navigator.vibrate?.(40);
    } catch {
      setError("Micro indisponible. Autorisez l'accès au micro dans le navigateur.");
    }
  }

  function stop() {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
    navigator.vibrate?.([30, 50, 30]);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="grid gap-6">
      <TargetPicker
        targets={targets}
        siteId={siteId}
        stepId={stepId}
        onSite={(id) => {
          setSiteId(id);
          setStepId(targets.find((t) => t.id === id)?.defaultStepId ?? "");
        }}
        onStep={setStepId}
      />
      <div className="flex flex-col items-center gap-4 py-6">
        <button
          type="button"
          onClick={recording ? stop : supported ? start : () => fileInput.current?.click()}
          aria-label={recording ? "Arrêter et envoyer" : "Commencer l'enregistrement"}
          aria-pressed={recording}
          className={cn(
            "flex size-44 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95",
            recording ? "animate-pulse bg-red-600" : "bg-sky-700",
          )}
        >
          {recording ? <Square className="size-16" fill="currentColor" /> : <Mic className="size-20" />}
        </button>
        <p className="text-3xl font-bold tabular-nums" aria-live="polite">
          {recording ? `${mm}:${ss}` : "Appuyez pour parler"}
        </p>
        <p className="text-center text-stone-600">
          {recording
            ? "Appuyez à nouveau pour arrêter : le vocal part tout seul."
            : "Le message est transcrit et ajouté au journal du chantier."}
        </p>
        {error ? <p className="text-center font-medium text-red-700">{error}</p> : null}
        <input
          ref={fileInput}
          type="file"
          accept="audio/*"
          capture="user"
          className="sr-only"
          aria-label="Enregistrer un vocal"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f, f.name, 0);
            e.target.value = "";
          }}
        />
      </div>
      {sent.length ? (
        <ul className="grid gap-2" aria-label="Vocaux envoyés">
          {sent.map((s) => (
            <li key={s.key} className="flex min-h-12 items-center gap-3 rounded-xl bg-white px-4">
              <Mic className="size-5 text-sky-700" aria-hidden />
              <span className="flex-1">Vocal {s.seconds ? `de ${s.seconds} s` : ""}</span>
              {s.status === "sent" ? <Check className="size-5 text-emerald-600" aria-label="Envoyé" /> : null}
              {s.status === "sending" || s.status === "waiting" ? (
                <Clock className="size-5 text-amber-600" aria-label="En attente" />
              ) : null}
              {s.status === "error" ? <X className="size-5 text-red-600" aria-label={s.error} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
