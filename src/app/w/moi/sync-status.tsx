"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Network state (the offline queue is added in phase 6). */
export function SyncStatus() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <section className="flex items-center gap-3 rounded-2xl bg-white p-5 shadow-sm" aria-live="polite">
      {online ? (
        <Wifi className="size-6 text-emerald-600" aria-hidden />
      ) : (
        <WifiOff className="size-6 text-amber-600" aria-hidden />
      )}
      <div>
        <p className="font-semibold">{online ? "Connecté" : "Hors connexion"}</p>
        <p className="text-sm text-stone-600">
          {online
            ? "Tout ce que vous envoyez part immédiatement."
            : "Vos envois partiront au retour du réseau."}
        </p>
      </div>
    </section>
  );
}
