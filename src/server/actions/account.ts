"use server";

/** Subscription, GDPR, account and onboarding actions. */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formValues, type ActionState } from "@/lib/action-state";
import { requireManager, requireOwner } from "@/server/auth/context";
import { SESSION_COOKIE } from "@/server/auth/session";
import { mockCancel, mockSubscribe, openBillingPortal, startCheckout } from "@/server/services/billing";
import {
  anonymizeClient,
  deleteClientCompletely,
  deleteOrganization,
  updateRetention,
} from "@/server/services/gdpr";
import { chooseTrade, createDemoSite, dismissOnboarding } from "@/server/services/onboarding";
import { attempt } from "./helpers";

const id = z.string().min(1).max(64);
const plan = z.enum(["SOLO", "TEAM", "PRO"]);
const trade = z.enum(["CARPENTER", "JOINER", "POOL", "RENOVATION", "LANDSCAPER", "OTHER"]);

export async function startCheckoutAction(planId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  let url = "";
  const result = await attempt(async () => {
    url = await startCheckout(ctx, plan.parse(planId));
  });
  if (!result.ok) return result;
  redirect(url);
}

export async function openPortalAction(): Promise<ActionState> {
  const ctx = await requireOwner();
  let url = "";
  const result = await attempt(async () => {
    url = await openBillingPortal(ctx);
  });
  if (!result.ok) return result;
  redirect(url);
}

export async function mockSubscribeAction(planId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  const result = await attempt(async () => {
    await mockSubscribe(ctx, plan.parse(planId));
  });
  if (!result.ok) return result;
  revalidatePath("/app", "layout");
  redirect("/app/parametres/abonnement?paiement=ok");
}

export async function mockCancelAction(): Promise<ActionState> {
  const ctx = await requireOwner();
  return attempt(async () => {
    await mockCancel(ctx);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Abonnement résilié (simulation)." };
  });
}

export async function anonymizeClientAction(clientId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await anonymizeClient(ctx, id.parse(clientId));
    revalidatePath("/app/clients", "layout");
    return { ok: true, message: "Client anonymisé : ses coordonnées ont été effacées." };
  });
}

export async function deleteClientAction(clientId: string, confirmation: string): Promise<ActionState> {
  const ctx = await requireManager();
  const result = await attempt(async () => {
    await deleteClientCompletely(ctx, id.parse(clientId), confirmation);
  });
  if (!result.ok) return result;
  revalidatePath("/app", "layout");
  redirect("/app/clients");
}

const retentionSchema = z.object({
  retentionDocumentsYears: z.coerce.number().int().min(10).max(30),
  retentionMediaYears: z.coerce.number().int().min(1).max(30),
  retentionPurgeEnabled: z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "on"),
});

export async function updateRetentionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOwner();
  const parsed = retentionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Durées invalides (documents : 10 ans minimum)." };
  return attempt(async () => {
    await updateRetention(ctx, parsed.data);
    revalidatePath("/app/parametres", "layout");
    return { ok: true, message: "Durées de conservation enregistrées." };
  }, formValues(formData));
}

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOwner();
  const input = z
    .object({
      organizationName: z.string().min(1, "Indiquez le nom de l'entreprise."),
      password: z.string().min(1, "Indiquez votre mot de passe."),
    })
    .safeParse({ organizationName: formData.get("organizationName"), password: formData.get("password") });
  if (!input.success) return { ok: false, error: input.error.issues[0]?.message };
  const result = await attempt(async () => {
    await deleteOrganization(ctx, input.data);
  }, formValues(formData));
  if (!result.ok) return result;
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/?compte=supprime");
}

export async function chooseTradeAction(tradeId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  return attempt(async () => {
    await chooseTrade(ctx, trade.parse(tradeId));
    revalidatePath("/app", "layout");
    return { ok: true, message: "Métier enregistré, modèle d'étapes prêt." };
  });
}

export async function createDemoSiteAction(): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const { siteId, portalUrl } = await createDemoSite(ctx);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Chantier d'exemple créé.", data: { siteId, portalUrl } };
  });
}

export async function dismissOnboardingAction(): Promise<ActionState> {
  const ctx = await requireOwner();
  return attempt(async () => {
    await dismissOnboarding(ctx);
    revalidatePath("/app", "layout");
  });
}
