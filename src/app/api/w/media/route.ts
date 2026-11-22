import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/server/auth/context";
import { AppError } from "@/server/errors";
import { enqueue } from "@/server/jobs/queue";
import { logger } from "@/server/logger";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { isSameOrigin } from "@/server/security/request";
import { uploadMediaFromApp } from "@/server/services/media";

export const dynamic = "force-dynamic";

const fieldsSchema = z.object({
  siteId: z.string().min(1).max(64),
  stepId: z
    .string()
    .max(64)
    .optional()
    .transform((v) => v || null),
  caption: z
    .string()
    .max(500)
    .optional()
    .transform((v) => v?.trim() || null),
  capturedAt: z
    .string()
    .optional()
    .transform((v) => {
      const d = v ? new Date(v) : null;
      return d && !Number.isNaN(d.getTime()) ? d : null;
    }),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  kind: z.enum(["PHOTO", "VOICE"]).optional(),
  clientUploadId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{8,64}$/)
    .optional(),
});

/**
 * Upload of a photo / voice note from the worker app (also used by the offline queue: idempotent thanks to
 * `clientUploadId`). Cookie authentication + same-origin check (CSRF).
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Session expirée, reconnectez-vous." }, { status: 401 });
  try {
    await enforceRateLimit(`media-upload:${ctx.userId}`, 300, 3600);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Fichier manquant." }, { status: 400 });
    }
    const fields = fieldsSchema.safeParse(
      Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")),
    );
    if (!fields.success) return NextResponse.json({ error: "Paramètres invalides." }, { status: 400 });
    const { media, duplicate } = await uploadMediaFromApp(ctx, {
      ...fields.data,
      kindHint: fields.data.kind,
      latitude: fields.data.latitude ?? null,
      longitude: fields.data.longitude ?? null,
      file: { name: file.name || "capture", bytes: new Uint8Array(await file.arrayBuffer()) },
    });
    if (!duplicate) await enqueue("media.process", { mediaId: media.id });
    return NextResponse.json(
      { id: media.id, kind: media.kind, duplicate, validationStatus: media.validationStatus },
      { status: duplicate ? 200 : 201 },
    );
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    logger.error({ err: error }, "Échec de l'envoi d'un média");
    return NextResponse.json({ error: "Erreur inattendue." }, { status: 500 });
  }
}
