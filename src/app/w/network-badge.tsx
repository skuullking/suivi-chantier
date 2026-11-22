"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "./offline-sync";

export function NetworkBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      className="bg-signal-400 text-ink-900 ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold uppercase"
      role="status"
    >
      <WifiOff className="size-3.5" aria-hidden /> Hors ligne
    </span>
  );
}
