"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { flushQueue, listQueue, onQueueChange } from "@/lib/offline-queue";

/**
 * Registers the service worker, pre-caches the pages of the day and flushes the offline queue when the network
 * comes back, when the app is reopened and on Background Sync.
 */
export function OfflineSync({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "true") return;
    const pages = key.split("|").filter(Boolean);
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => registration.active?.postMessage({ type: "cache-urls", urls: pages }))
      .catch(() => {});
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "flush") void flushQueue();
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [key]);

  useEffect(() => {
    const flush = () => {
      if (navigator.onLine) void flushQueue();
    };
    flush();
    const onVisible = () => document.visibilityState === "visible" && flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onVisible);
    // Retries with backoff while items are waiting.
    const timer = setInterval(flush, 20_000);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);
  return null;
}

/** Number of items waiting in the offline queue (badge). */
export function useQueueCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listQueue()
        .then(({ uploads, actions }) => alive && setCount(uploads.length + actions.length))
        .catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);
  return count;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export type ItemStatus = { status: "sending" | "sent" | "waiting" | "error"; error?: string };

/** Live status of uploads by clientUploadId (absent from the queue = sent). */
export function useUploadStatuses(keys: string[]) {
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({});
  const online = useOnline();
  const joined = keys.join("|");
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      listQueue()
        .then(({ uploads }) => {
          if (!alive) return;
          const byKey = new Map(uploads.map((u) => [u.clientUploadId, u]));
          const next: Record<string, ItemStatus> = {};
          for (const key of joined.split("|").filter(Boolean)) {
            const item = byKey.get(key);
            if (!item) next[key] = { status: "sent" };
            else if (item.status === "error") next[key] = { status: "error", error: item.lastError };
            else if (item.status === "sending" || (item.attempts === 0 && navigator.onLine))
              next[key] = { status: "sending" };
            else next[key] = { status: "waiting", error: item.lastError };
          }
          setStatuses(next);
        })
        .catch(() => {});
    refresh();
    const off = onQueueChange(refresh);
    return () => {
      alive = false;
      off();
    };
  }, [joined, online]);
  return statuses;
}
