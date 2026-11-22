"use client";

import { WifiOff } from "lucide-react";
import { useOnline } from "./offline-sync";

export function NetworkBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <span
      className="ml-auto flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950"
      role="status"
    >
      <WifiOff className="size-3.5" aria-hidden /> Hors ligne
    </span>
  );
}
