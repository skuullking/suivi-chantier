import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Hors connexion", robots: { index: false } };

/** Offline fallback served by the service worker. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stone-100 p-6 text-center">
      <WifiOff className="size-12 text-stone-400" aria-hidden />
      <h1 className="text-2xl font-bold">Pas de réseau</h1>
      <p className="max-w-sm text-stone-600">
        Cette page n&apos;est pas disponible hors connexion. Vos photos et vocaux enregistrés partiront
        automatiquement au retour du réseau.
      </p>
      <Link href="/w" className="rounded-xl bg-orange-700 px-5 py-3 font-semibold text-white">
        Retour à ma journée
      </Link>
    </main>
  );
}
