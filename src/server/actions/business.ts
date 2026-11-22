"use server";

/** Server actions of the back-office (clients, sites, steps, templates, planning, tasks, notes, settings). */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formValues, type ActionState } from "@/lib/action-state";
import {
  assignmentSchema,
  clientSchema,
  documentUpdateSchema,
  type NewSiteInput,
  noteSchema,
  organizationSettingsSchema,
  SITE_STATUSES,
  siteInfoSchema,
  STEP_STATUSES,
  stepSchema,
  taskSchema,
  templateSchema,
  validationSettingsSchema,
} from "@/lib/validation/business";
import { requireAuth, requireManager, requireOwner } from "@/server/auth/context";
import { createClient, setClientArchived, updateClient } from "@/server/services/clients";
import {
  deleteDocument,
  setDocumentVisibility,
  updateDocument,
  uploadDocuments,
} from "@/server/services/documents";
import { createNote } from "@/server/services/notes";
import { markNotificationsRead } from "@/server/services/notifications";
import {
  createAssignment,
  deleteAssignment,
  moveAssignment,
  updateAssignment,
} from "@/server/services/planning";
import { updateOrganization, updateValidationSettings } from "@/server/services/settings";
import { createSite, deleteSite, setSiteMembers, setSiteStatus, updateSite } from "@/server/services/sites";
import { createTemplate, deleteTemplate, updateTemplate } from "@/server/services/step-templates";
import { addStep, deleteStep, reorderSteps, setStepStatus, updateStep } from "@/server/services/steps";
import { createTask, deleteTask, setTaskDone } from "@/server/services/tasks";
import { attempt, parseForm } from "./helpers";

const id = z.string().min(1).max(64);

// ───────────── Clients ─────────────

export async function createClientAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(clientSchema, formData);
  if (!parsed.ok) return parsed.state;
  let clientId = "";
  const result = await attempt(async () => {
    clientId = (await createClient(ctx, parsed.data)).id;
  }, formValues(formData));
  if (!result.ok) return result;
  revalidatePath("/app/clients");
  redirect(`/app/clients/${clientId}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(clientSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await updateClient(ctx, id.parse(clientId), parsed.data);
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: "Fiche client enregistrée." };
  }, formValues(formData));
}

export async function archiveClientAction(clientId: string, archived: boolean): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await setClientArchived(ctx, id.parse(clientId), archived);
    revalidatePath("/app/clients");
    revalidatePath(`/app/clients/${clientId}`);
    return { ok: true, message: archived ? "Client archivé." : "Client réactivé." };
  });
}

// ───────────── Sites ─────────────

export async function createSiteAction(input: NewSiteInput): Promise<ActionState> {
  const ctx = await requireManager();
  let siteId = "";
  const result = await attempt(async () => {
    siteId = (await createSite(ctx, input)).id;
  });
  if (!result.ok) return result;
  revalidatePath("/app/chantiers");
  redirect(`/app/chantiers/${siteId}`);
}

export async function updateSiteAction(
  siteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(siteInfoSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await updateSite(ctx, id.parse(siteId), parsed.data);
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Chantier enregistré." };
  }, formValues(formData));
}

export async function setSiteStatusAction(siteId: string, status: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await setSiteStatus(ctx, id.parse(siteId), z.enum(SITE_STATUSES).parse(status));
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    revalidatePath("/app/chantiers");
    return { ok: true, message: "Statut mis à jour." };
  });
}

export async function setSiteMembersAction(siteId: string, userIds: string[]): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await setSiteMembers(ctx, id.parse(siteId), z.array(id).max(100).parse(userIds));
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Équipe mise à jour." };
  });
}

export async function deleteSiteAction(siteId: string, confirmation: string): Promise<ActionState> {
  const ctx = await requireManager();
  if (confirmation.trim().toUpperCase() !== "SUPPRIMER") {
    return { ok: false, error: "Tapez SUPPRIMER pour confirmer." };
  }
  const result = await attempt(async () => {
    await deleteSite(ctx, id.parse(siteId));
  });
  if (!result.ok) return result;
  revalidatePath("/app/chantiers");
  redirect("/app/chantiers");
}

// ───────────── Steps ─────────────

export async function addStepAction(
  siteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(stepSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await addStep(ctx, id.parse(siteId), parsed.data);
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Étape ajoutée." };
  }, formValues(formData));
}

export async function updateStepAction(
  siteId: string,
  stepId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(stepSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await updateStep(ctx, id.parse(stepId), parsed.data);
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Étape enregistrée." };
  }, formValues(formData));
}

export async function setStepStatusAction(stepId: string, status: string): Promise<ActionState> {
  const ctx = await requireAuth();
  return attempt(async () => {
    const { step, progress } = await setStepStatus(
      ctx,
      id.parse(stepId),
      z.enum(STEP_STATUSES).parse(status),
    );
    revalidatePath(`/app/chantiers/${step.siteId}`, "layout");
    revalidatePath(`/w/chantier/${step.siteId}`);
    revalidatePath("/w");
    return { ok: true, message: `Étape mise à jour — progression ${progress} %.`, data: { progress } };
  });
}

export async function reorderStepsAction(siteId: string, orderedIds: string[]): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await reorderSteps(ctx, id.parse(siteId), z.array(id).max(200).parse(orderedIds));
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
  });
}

export async function deleteStepAction(siteId: string, stepId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await deleteStep(ctx, id.parse(stepId));
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    return { ok: true, message: "Étape supprimée." };
  });
}

// ───────────── Step templates ─────────────

export async function saveTemplateAction(templateId: string | null, input: unknown): Promise<ActionState> {
  const ctx = await requireOwner();
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Modèle invalide." };
  return attempt(async () => {
    if (templateId) await updateTemplate(ctx, id.parse(templateId), parsed.data);
    else await createTemplate(ctx, parsed.data);
    revalidatePath("/app/parametres/modeles");
    return { ok: true, message: "Modèle enregistré." };
  });
}

export async function deleteTemplateAction(templateId: string): Promise<ActionState> {
  const ctx = await requireOwner();
  return attempt(async () => {
    await deleteTemplate(ctx, id.parse(templateId));
    revalidatePath("/app/parametres/modeles");
    return { ok: true, message: "Modèle supprimé." };
  });
}

// ───────────── Documents ─────────────

const uploadOptionsSchema = z.object({
  siteId: z
    .string()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
  clientId: z
    .string()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
  type: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.enum(["QUOTE", "INVOICE", "PURCHASE_ORDER", "EXPENSE", "CONTRACT", "PLAN", "OTHER"]).optional()),
  visibleToClient: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

export async function uploadDocumentsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireAuth();
  const options = uploadOptionsSchema.safeParse({
    siteId: formData.get("siteId") ?? undefined,
    clientId: formData.get("clientId") ?? undefined,
    type: formData.get("type") ?? undefined,
    visibleToClient: formData.get("visibleToClient") ?? undefined,
  });
  if (!options.success) return { ok: false, error: "Paramètres d'envoi invalides." };
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "Choisissez au moins un fichier." };
  if (files.length > 20) return { ok: false, error: "20 fichiers maximum par envoi." };
  return attempt(async () => {
    const uploaded = await Promise.all(
      files.map(async (f) => ({ name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    const { created, errors } = await uploadDocuments(ctx, uploaded, options.data);
    revalidatePath("/app/documents");
    if (options.data.siteId) revalidatePath(`/app/chantiers/${options.data.siteId}`, "layout");
    if (options.data.clientId) revalidatePath(`/app/clients/${options.data.clientId}`);
    return {
      ok: errors.length === 0,
      message: created.length ? `${created.length} document(s) ajouté(s).` : undefined,
      error: errors.length ? errors.join(" ") : undefined,
      data: { created },
    };
  });
}

export async function updateDocumentAction(
  documentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(documentUpdateSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    const doc = await updateDocument(ctx, id.parse(documentId), parsed.data);
    revalidatePath("/app/documents");
    if (doc.siteId) revalidatePath(`/app/chantiers/${doc.siteId}`, "layout");
    return { ok: true, message: "Document enregistré." };
  }, formValues(formData));
}

export async function setDocumentVisibilityAction(
  documentId: string,
  visible: boolean,
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await setDocumentVisibility(ctx, id.parse(documentId), visible);
    revalidatePath("/app/documents");
    revalidatePath("/app/chantiers", "layout");
    return { ok: true, message: visible ? "Visible par le client." : "Masqué au client." };
  });
}

export async function deleteDocumentAction(documentId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await deleteDocument(ctx, id.parse(documentId));
    revalidatePath("/app/documents");
    revalidatePath("/app/chantiers", "layout");
    return { ok: true, message: "Document supprimé." };
  });
}

// ───────────── Planning ─────────────

export async function saveAssignmentAction(
  assignmentId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(assignmentSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    const { warnings } = assignmentId
      ? await updateAssignment(ctx, id.parse(assignmentId), parsed.data)
      : await createAssignment(ctx, parsed.data);
    revalidatePath("/app/planning");
    revalidatePath(`/app/chantiers/${parsed.data.siteId}`, "layout");
    return {
      ok: true,
      message: warnings.length ? `Enregistré. Attention : ${warnings.join(" ")}` : "Affectation enregistrée.",
      data: { warnings },
    };
  }, formValues(formData));
}

export async function moveAssignmentAction(
  assignmentId: string,
  date: string,
  userId?: string,
): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    const { warnings } = await moveAssignment(ctx, id.parse(assignmentId), {
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(date),
      userId: userId ? id.parse(userId) : undefined,
    });
    revalidatePath("/app/planning");
    return {
      ok: true,
      message: warnings.length ? `Déplacé. Attention : ${warnings.join(" ")}` : "Affectation déplacée.",
      data: { warnings },
    };
  });
}

export async function deleteAssignmentAction(assignmentId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await deleteAssignment(ctx, id.parse(assignmentId));
    revalidatePath("/app/planning");
    revalidatePath("/app/chantiers", "layout");
    return { ok: true, message: "Affectation supprimée." };
  });
}

// ───────────── Tasks & notes ─────────────

export async function createTaskAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireManager();
  const parsed = parseForm(taskSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await createTask(ctx, parsed.data);
    revalidatePath(`/app/chantiers/${parsed.data.siteId}`, "layout");
    return { ok: true, message: "Tâche ajoutée." };
  }, formValues(formData));
}

export async function setTaskDoneAction(taskId: string, done: boolean): Promise<ActionState> {
  const ctx = await requireAuth();
  return attempt(async () => {
    await setTaskDone(ctx, id.parse(taskId), done);
    revalidatePath("/app/chantiers", "layout");
    revalidatePath("/w", "layout");
  });
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  const ctx = await requireManager();
  return attempt(async () => {
    await deleteTask(ctx, id.parse(taskId));
    revalidatePath("/app/chantiers", "layout");
    return { ok: true, message: "Tâche supprimée." };
  });
}

export async function createNoteAction(
  siteId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAuth();
  const parsed = parseForm(noteSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await createNote(ctx, id.parse(siteId), parsed.data);
    revalidatePath(`/app/chantiers/${siteId}`, "layout");
    revalidatePath(`/w/chantier/${siteId}`);
    return { ok: true, message: parsed.data.kind === "PROBLEM" ? "Problème signalé." : "Note ajoutée." };
  }, formValues(formData));
}

export async function markNotificationsReadAction(ids?: string[]): Promise<ActionState> {
  const ctx = await requireAuth();
  return attempt(async () => {
    await markNotificationsRead(ctx, ids ? z.array(id).max(200).parse(ids) : undefined);
    revalidatePath("/app", "layout");
  });
}

// ───────────── Settings ─────────────

export async function updateOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOwner();
  const parsed = parseForm(organizationSettingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await updateOrganization(ctx, parsed.data);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Informations de l'entreprise enregistrées." };
  }, formValues(formData));
}

export async function updateValidationSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireOwner();
  const parsed = parseForm(validationSettingsSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(async () => {
    await updateValidationSettings(ctx, parsed.data);
    revalidatePath("/app/parametres");
    return { ok: true, message: "Réglages enregistrés." };
  }, formValues(formData));
}
