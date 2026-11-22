"use client";

import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Enables Web Push notifications on this device (only shown when VAPID keys are configured). */
export function PushToggle({ publicKey, className }: { publicKey: string; className?: string }) {
  const [state, setState] = useState<"unsupported" | "off" | "on" | "denied" | "loading">("loading");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (alive) setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (alive) setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (alive) setState(sub ? "on" : "off");
    })().catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    setState("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }

  async function disable() {
    setState("loading");
    const registration = await navigator.serviceWorker.getRegistration();
    const sub = await registration?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    setState("off");
  }

  if (state === "unsupported") return null;
  return (
    <button
      type="button"
      disabled={state === "loading" || state === "denied"}
      onClick={state === "on" ? disable : enable}
      className={cn(
        "flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 text-base font-bold disabled:opacity-60",
        state === "on" ? "border-emerald-600 text-emerald-800" : "border-stone-800",
        className,
      )}
    >
      {state === "on" ? <BellOff className="size-5" aria-hidden /> : <Bell className="size-5" aria-hidden />}
      {state === "on"
        ? "Désactiver les notifications"
        : state === "denied"
          ? "Notifications bloquées dans le navigateur"
          : "Activer les notifications"}
    </button>
  );
}
