import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Hors connexion", robots: { index: false } };

/** Offline fallback served by the service worker. */
export default function OfflinePage() {
  return (
    <main className="bg-ink-100 flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <WifiOff className="text-ink-400 size-12" aria-hidden />
      <h1 className="text-2xl font-bold">Pas de réseau</h1>
      <p className="text-ink-600 max-w-sm">
        Cette page n&apos;est pas disponible hors connexion. Vos photos et vocaux enregistrés partiront
        automatiquement au retour du réseau.
      </p>
      <Link href="/w" className="bg-signal-700 rounded-xl px-5 py-3 font-semibold text-white">
        Retour à ma journée
      </Link>
    </main>
  );
}
