"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formValues, type ActionState, zodFieldErrors } from "@/lib/action-state";
import { invitationSchema, ROLES } from "@/lib/validation/auth";
import { requireOwner } from "@/server/auth/context";
import {
  changeMemberRole,
  createInvitation,
  removeMember,
  revokeInvitation,
  setMemberWhatsApp,
} from "@/server/services/team";
import { toActionError } from "./helpers";

export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOwner();
  const values = formValues(formData);
  const parsed = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error), values };
  try {
    const result = await createInvitation(ctx, parsed.data);
    revalidatePath("/app/equipe");
    return {
      ok: true,
      message: `Invitation envoyée à ${parsed.data.email}.`,
      data: { url: result.url },
    };
  } catch (error) {
    return toActionError(error, values);
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  try {
    await revokeInvitation(ctx, z.string().min(1).parse(invitationId));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Invitation annulée." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changeRoleAction(membershipId: string, role: string): Promise<ActionState> {
  const ctx = await requireOwner();
  try {
    await changeMemberRole(ctx, z.string().min(1).parse(membershipId), z.enum(ROLES).parse(role));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Rôle mis à jour." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeMemberAction(membershipId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  try {
    await removeMember(ctx, z.string().min(1).parse(membershipId));
    revalidatePath("/app/equipe");
    return { ok: true, message: "Membre retiré de l'équipe." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setWhatsAppAction(membershipId: string, phone: string): Promise<ActionState> {
  const ctx = await requireOwner();
  try {
    const e164 = await setMemberWhatsApp(
      ctx,
      z.string().min(1).parse(membershipId),
      z.string().max(30).parse(phone) || null,
    );
    revalidatePath("/app/equipe");
    return { ok: true, message: e164 ? `WhatsApp associé : ${e164}` : "Numéro WhatsApp retiré." };
  } catch (error) {
    return toActionError(error);
  }
}
