"use client";

import Link from "next/link";

export default function WorkerError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid gap-4 rounded-2xl bg-white p-6 text-center shadow-sm" role="alert">
      <p className="text-lg font-semibold">Oups, quelque chose n&apos;a pas marché.</p>
      <p className="text-ink-600">
        Vérifiez votre réseau puis réessayez. Vos photos en attente ne sont pas perdues.
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-signal-700 min-h-14 rounded-2xl font-bold text-white"
      >
        Réessayer
      </button>
      <Link href="/w" className="text-signal-700 font-semibold underline">
        Retour à ma journée
      </Link>
    </div>
  );
}
