"use server";

/** Server actions for the field: worker space, photo validation, client portal management. */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { requireAuth, requireManager } from "@/server/auth/context";
import {
  deleteMedia,
  editPhoto,
  reassignMedia,
  updateMediaCaption,
  validateMedia,
} from "@/server/services/media";
import { createPortalLink, emailPortalLink, revokePortalLink } from "@/server/services/portal";
import { setStepVisibility } from "@/server/services/steps";
import { arriveOnSite } from "@/server/services/worker";
import { attempt } from "./helpers";

const id = z.string().min(1).max(64);
const rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

export async function arriveAction(siteId: string): Promise<ActionState> {
  const ctx = await requireAuth();
  return attempt(async () => {
    await arriveOnSite(ctx, id.parse(siteId));
    revalidatePath("/w");
    return { ok: true, message: "Arrivée enregistrée ✔" };
  });
}

export async function validateMediaAction(ids: string[], status: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const list = z.array(id).min(1).max(200).parse(ids);
    const parsed = z.enum(["APPROVED", "REJECTED", "PENDING"]).parse(status);
    await validateMedia(ctx, list, parsed);
    revalidatePath("/app", "layout");
    const n = list.length;
    return {
      ok: true,
      message:
        parsed === "APPROVED"
          ? `${n} photo${n > 1 ? "s" : ""} validée${n > 1 ? "s" : ""}.`
          : parsed === "REJECTED"
            ? `${n} photo${n > 1 ? "s" : ""} refusée${n > 1 ? "s" : ""}.`
            : "Remis en attente.",
    };
  });
}

export async function editPhotoAction(
  mediaId: string,
  edit: { crop?: unknown; blurs?: unknown; reset?: boolean },
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await editPhoto(ctx, id.parse(mediaId), {
      crop: edit.crop ? rect.parse(edit.crop) : null,
      blurs: edit.blurs ? z.array(rect).max(30).parse(edit.blurs) : [],
      reset: edit.reset === true,
    });
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message: edit.reset ? "Photo d'origine rétablie." : "Photo modifiée (l'original est conservé).",
    };
  });
}

export async function updateMediaCaptionAction(mediaId: string, caption: string): Promise<ActionState> {
  const ctx = await requireAuth();
  return attempt(async () => {
    await updateMediaCaption(ctx, id.parse(mediaId), z.string().max(500).parse(caption));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Légende enregistrée." };
  });
}

export async function reassignMediaAction(
  mediaId: string,
  siteId: string,
  stepId?: string,
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await reassignMedia(ctx, id.parse(mediaId), id.parse(siteId), stepId ? id.parse(stepId) : null);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Média déplacé." };
  });
}

export async function deleteMediaAction(mediaId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await deleteMedia(ctx, id.parse(mediaId));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Média supprimé." };
  });
}

export async function createPortalLinkAction(
  siteId: string,
  expiresInDays: number | null,
  replace: boolean,
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const days = expiresInDays === null ? null : z.number().int().min(1).max(3650).parse(expiresInDays);
    const { url } = await createPortalLink(ctx, id.parse(siteId), { expiresInDays: days, replace });
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return {
      ok: true,
      message: replace ? "Nouveau lien créé, l'ancien ne fonctionne plus." : "Lien créé.",
      data: { url },
    };
  });
}

export async function revokePortalLinkAction(siteId: string, linkId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await revokePortalLink(ctx, id.parse(linkId));
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Lien révoqué : il affiche désormais « lien expiré »." };
  });
}

export async function emailPortalLinkAction(linkId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const { to } = await emailPortalLink(ctx, id.parse(linkId));
    return { ok: true, message: `Lien envoyé à ${to}.` };
  });
}

export async function setStepVisibilityAction(
  siteId: string,
  stepId: string,
  visible: boolean,
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await setStepVisibility(ctx, id.parse(stepId), visible);
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
  });
}
