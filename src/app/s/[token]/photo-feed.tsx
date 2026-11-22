"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";

type Photo = { id: string; thumbnail: string; display: string; caption: string; takenAt: string };

/** Photo grid with a simple full-screen viewer (keyboard: ← → Échap). */
export function PhotoFeed({ photos }: { photos: Photo[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const current = index === null ? null : photos[index];

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIndex(null);
      if (e.key === "ArrowRight") setIndex((i) => (i === null ? i : Math.min(photos.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setIndex((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photos.length]);

  return (
    <>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              className="block aspect-[4/3] w-full overflow-hidden rounded-xl bg-stone-200"
              aria-label={`Agrandir la photo ${p.caption}`}
              data-testid="portal-photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
              <img src={p.thumbnail} alt={p.caption} loading="lazy" className="size-full object-cover" />
            </button>
            {p.caption ? <p className="mt-1 truncate text-xs text-stone-600">{p.caption}</p> : null}
          </li>
        ))}
      </ul>
      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption || "Photo"}
          className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
        >
          <div className="flex items-center gap-2 p-3">
            <p className="flex-1 truncate text-sm">
              {current.caption} · {current.takenAt}
            </p>
            <button
              type="button"
              onClick={() => setIndex(null)}
              className="rounded-full p-2 hover:bg-white/10"
              aria-label="Fermer"
            >
              <X className="size-6" />
            </button>
          </div>
          <div className="relative flex flex-1 items-center justify-center p-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- signed private URL */}
            <img
              src={current.display}
              alt={current.caption}
              className="max-h-full max-w-full object-contain"
            />
            {index! > 0 ? (
              <button
                type="button"
                onClick={() => setIndex(index! - 1)}
                className="absolute left-2 rounded-full bg-black/50 p-3"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="size-6" />
              </button>
            ) : null}
            {index! < photos.length - 1 ? (
              <button
                type="button"
                onClick={() => setIndex(index! + 1)}
                className="absolute right-2 rounded-full bg-black/50 p-3"
                aria-label="Photo suivante"
              >
                <ChevronRight className="size-6" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
