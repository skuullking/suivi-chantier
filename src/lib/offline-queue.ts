/**
 * Offline queue (IndexedDB): photos and voice notes are stored locally first, then sent to the server, in order,
 * with retries (exponential backoff). Each item has a `clientUploadId` so a retry never creates a duplicate.
 * Field actions (arrival, step done, task) are queued the same way and replayed (they are idempotent server-side).
 */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { type MediaUpload, newClientUploadId, sendMedia } from "./upload-client";

export type QueueStatus = "pending" | "sending" | "error";

export type QueuedUpload = Omit<MediaUpload, "file"> & {
  blob: Blob;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt: number;
  createdAt: number;
};

export type FieldAction =
  | { type: "arrive"; siteId: string }
  | { type: "step_done"; stepId: string }
  | { type: "task"; taskId: string; done: boolean };

export type QueuedAction = {
  id: string;
  action: FieldAction;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  nextAttemptAt: number;
  createdAt: number;
};

interface QueueDb extends DBSchema {
  uploads: { key: string; value: QueuedUpload; indexes: { byCreated: number } };
  actions: { key: string; value: QueuedAction; indexes: { byCreated: number } };
}

let dbPromise: Promise<IDBPDatabase<QueueDb>> | null = null;

function database() {
  dbPromise ??= openDB<QueueDb>("chantierlink-offline", 1, {
    upgrade(db) {
      db.createObjectStore("uploads", { keyPath: "clientUploadId" }).createIndex("byCreated", "createdAt");
      db.createObjectStore("actions", { keyPath: "id" }).createIndex("byCreated", "createdAt");
    },
  });
  return dbPromise;
}

const EVENT = "cl-queue-changed";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("cl-queue") : null;

function changed() {
  window.dispatchEvent(new Event(EVENT));
  channel?.postMessage("changed");
}

export function onQueueChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  const onMessage = () => listener();
  channel?.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener(EVENT, listener);
    channel?.removeEventListener("message", onMessage);
  };
}

export async function enqueueUpload(upload: MediaUpload): Promise<string> {
  const db = await database();
  const { file, ...rest } = upload;
  await db.put("uploads", {
    ...rest,
    blob: file,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  });
  changed();
  void requestSync();
  return upload.clientUploadId;
}

export async function enqueueAction(action: FieldAction): Promise<string> {
  const db = await database();
  const id = newClientUploadId();
  await db.put("actions", {
    id,
    action,
    status: "pending",
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
  });
  changed();
  void requestSync();
  return id;
}

export async function listQueue() {
  const db = await database();
  const [uploads, actions] = await Promise.all([
    db.getAllFromIndex("uploads", "byCreated"),
    db.getAllFromIndex("actions", "byCreated"),
  ]);
  return { uploads, actions };
}

export async function queueSize() {
  const db = await database();
  return (await db.count("uploads")) + (await db.count("actions"));
}

export async function removeFromQueue(store: "uploads" | "actions", key: string) {
  const db = await database();
  await db.delete(store, key);
  changed();
}

/** Makes every failed item eligible again (manual "Réessayer"). */
export async function retryAll() {
  const db = await database();
  for (const store of ["uploads", "actions"] as const) {
    const tx = db.transaction(store, "readwrite");
    for (const item of await tx.store.getAll()) {
      await tx.store.put({ ...item, status: "pending", nextAttemptAt: 0 } as never);
    }
    await tx.done;
  }
  changed();
  return flushQueue();
}

const backoff = (attempts: number) => Math.min(10 * 60_000, 5_000 * 2 ** attempts);

async function sendAction(action: FieldAction): Promise<{ ok: boolean; retry: boolean; error?: string }> {
  try {
    const res = await fetch("/api/w/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(action),
    });
    if (res.ok) return { ok: true, retry: false };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return {
      ok: false,
      retry: res.status >= 500 || [401, 408, 429].includes(res.status),
      error: body.error ?? `Erreur ${res.status}`,
    };
  } catch {
    return { ok: false, retry: true, error: "Pas de réseau" };
  }
}

let flushing: Promise<{ sent: number; remaining: number }> | null = null;

/** Sends what can be sent now. Stops at the first network failure (no need to hammer a dead network). */
export function flushQueue(): Promise<{ sent: number; remaining: number }> {
  flushing ??= (async () => {
    const db = await database();
    let sent = 0;
    try {
      for (const item of await db.getAllFromIndex("uploads", "byCreated")) {
        if (item.status === "error" || item.nextAttemptAt > Date.now()) continue;
        await db.put("uploads", { ...item, status: "sending" });
        changed();
        const {
          blob,
          status: _s,
          attempts,
          lastError: _l,
          nextAttemptAt: _n,
          createdAt: _c,
          ...upload
        } = item;
        const result = await sendMedia({ ...upload, file: blob });
        if (result.ok) {
          await db.delete("uploads", item.clientUploadId);
          sent++;
        } else {
          await db.put("uploads", {
            ...item,
            status: result.retry ? "pending" : "error",
            attempts: attempts + 1,
            lastError: result.error,
            nextAttemptAt: Date.now() + backoff(attempts),
          });
          if (result.retry) break;
        }
        changed();
      }
      for (const item of await db.getAllFromIndex("actions", "byCreated")) {
        if (item.status === "error" || item.nextAttemptAt > Date.now()) continue;
        const result = await sendAction(item.action);
        if (result.ok) {
          await db.delete("actions", item.id);
          sent++;
        } else {
          await db.put("actions", {
            ...item,
            status: result.retry ? "pending" : "error",
            attempts: item.attempts + 1,
            lastError: result.error,
            nextAttemptAt: Date.now() + backoff(item.attempts),
          });
          if (result.retry) break;
        }
        changed();
      }
    } finally {
      changed();
    }
    return { sent, remaining: await queueSize() };
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Background Sync when supported (Chrome / Android); otherwise the page flushes on "online". */
async function requestSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (
      registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }
    )?.sync;
    await sync?.register("cl-sync");
  } catch {
    // not supported
  }
}
