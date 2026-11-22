/** Browser-side upload of photos / voice notes to /api/w/media (idempotent thanks to clientUploadId). */

export type MediaUpload = {
  file: Blob;
  fileName: string;
  siteId: string;
  stepId?: string | null;
  caption?: string | null;
  kind?: "PHOTO" | "VOICE";
  capturedAt: string;
  clientUploadId: string;
  latitude?: number | null;
  longitude?: number | null;
};

export type UploadResult =
  | { ok: true; id: string; duplicate: boolean }
  /** `retry`: network / server error, the upload can be retried later. */
  | { ok: false; retry: boolean; error: string };

export function newClientUploadId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export async function sendMedia(upload: MediaUpload): Promise<UploadResult> {
  const form = new FormData();
  form.set("file", upload.file, upload.fileName);
  form.set("siteId", upload.siteId);
  if (upload.stepId) form.set("stepId", upload.stepId);
  if (upload.caption) form.set("caption", upload.caption);
  if (upload.kind) form.set("kind", upload.kind);
  form.set("capturedAt", upload.capturedAt);
  form.set("clientUploadId", upload.clientUploadId);
  if (upload.latitude != null && upload.longitude != null) {
    form.set("latitude", String(upload.latitude));
    form.set("longitude", String(upload.longitude));
  }
  try {
    const res = await fetch("/api/w/media", { method: "POST", body: form, credentials: "same-origin" });
    const body = (await res.json().catch(() => ({}))) as { id?: string; duplicate?: boolean; error?: string };
    if (res.ok && body.id) return { ok: true, id: body.id, duplicate: Boolean(body.duplicate) };
    // 4xx (except 401/408/429) are definitive: the same request would fail again.
    const retry = res.status >= 500 || [401, 408, 429].includes(res.status);
    return { ok: false, retry, error: body.error ?? `Erreur ${res.status}` };
  } catch {
    return { ok: false, retry: true, error: "Pas de réseau" };
  }
}
