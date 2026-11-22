"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { toDateKey } from "@/lib/dates";
import { DOCUMENT_TYPES } from "@/lib/validation/business";
import { requireManager } from "@/server/auth/context";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { dismissInboxItem, resolveInboxItem } from "@/server/services/inbox";
import { approveAndSend, generateDailySummary, generateSummaryNow } from "@/server/services/summaries";
import { attempt } from "./helpers";

const id = z.string().min(1).max(64);
const decisionSchema = z.object({
  siteId: id.nullable().optional(),
  stepId: id.nullable().optional(),
  clientId: id.nullable().optional(),
  documentType: z.enum(DOCUMENT_TYPES).nullable().optional(),
});

export async function resolveInboxAction(itemId: string, decision: unknown = {}): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await resolveInboxItem(ctx, id.parse(itemId), decisionSchema.parse(decision));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Classé ✔" };
  });
}

export async function dismissInboxAction(itemId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await dismissInboxItem(ctx, id.parse(itemId));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Élément ignoré." };
  });
}

export async function approveSummaryAction(summaryId: string, text: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const { emailedTo } = await approveAndSend(ctx, id.parse(summaryId), z.string().max(3000).parse(text));
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message: emailedTo
        ? `Résumé publié sur l'espace client et envoyé à ${emailedTo}.`
        : "Résumé publié sur l'espace client (pas d'envoi e-mail : adresse ou accord du client manquant).",
    };
  });
}

export async function regenerateSummaryAction(summaryId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const summary = await db.dailySummary.findFirst({
      where: { id: id.parse(summaryId), organizationId: ctx.organizationId },
    });
    if (!summary) throw new NotFoundError("Résumé introuvable.");
    await generateDailySummary(ctx.organizationId, summary.siteId, toDateKey(summary.date), { force: true });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Résumé régénéré." };
  });
}

export async function generateSummaryNowAction(siteId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const summary = await generateSummaryNow(ctx, id.parse(siteId));
    revalidatePath("/app", "layout");
    return {
      ok: true,
      message:
        summary?.status === "DRAFT"
          ? "Résumé du jour prêt : approuvez-le dans « À traiter »."
          : "Le résumé du jour a déjà été envoyé.",
    };
  });
}
