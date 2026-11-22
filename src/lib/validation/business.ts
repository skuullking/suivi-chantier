/** Zod schemas of the business forms (shared by server actions and tests). */
import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Optional trimmed text: "" → undefined. */
export const optionalText = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum.`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => v === undefined || DATE_RE.test(v), "Date invalide.");

export const requiredDate = z.string().trim().regex(DATE_RE, "Date invalide.");

/** Checkbox value from a FormData ("on" / "true" / "1"). */
export const checkbox = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true" || v === "1");

/** "a, b ; c" or multi-line → unique trimmed list. */
export const stringList = (itemMax = 200, separators: RegExp = /[\n,;]+/) =>
  z
    .string()
    .optional()
    .transform((v) =>
      Array.from(
        new Set(
          (v ?? "")
            .split(separators)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => s.slice(0, itemMax)),
        ),
      ),
    );

const emailList = stringList(254).superRefine((list, ctx) => {
  for (const email of list) {
    if (!z.email().safeParse(email).success) {
      ctx.addIssue({ code: "custom", message: `Adresse e-mail invalide : ${email}` });
    }
  }
});

const phoneList = stringList(30).superRefine((list, ctx) => {
  for (const phone of list) {
    if (!/^[+0-9 ().-]{6,30}$/.test(phone)) {
      ctx.addIssue({ code: "custom", message: `Numéro invalide : ${phone}` });
    }
  }
});

export const clientSchema = z.object({
  type: z.enum(["INDIVIDUAL", "PROFESSIONAL"]).default("INDIVIDUAL"),
  name: z.string().trim().min(2, "Indiquez le nom du client.").max(120),
  companyName: optionalText(120),
  emails: emailList,
  phones: phoneList,
  // Addresses contain commas: one per line.
  addresses: stringList(300, /\n+/),
  tags: stringList(40),
  notes: optionalText(5000),
  consentCommunications: checkbox,
});
export type ClientInput = z.output<typeof clientSchema>;

export const siteInfoSchema = z
  .object({
    title: z.string().trim().min(2, "Donnez un titre au chantier.").max(120),
    address: z.string().trim().min(3, "Indiquez l'adresse du chantier.").max(300),
    postalCode: optionalText(10),
    city: optionalText(100),
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
    description: optionalText(5000),
    instructions: optionalText(5000),
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedStart <= v.plannedEnd, {
    message: "La date de fin doit être après la date de début.",
    path: ["plannedEnd"],
  });
export type SiteInfoInput = z.output<typeof siteInfoSchema>;

export const newSiteSchema = z.object({
  clientId: z.string().optional(),
  newClient: clientSchema.optional(),
  info: siteInfoSchema,
  templateId: z.string().optional(),
  memberIds: z.array(z.string()).default([]),
});
export type NewSiteInput = z.input<typeof newSiteSchema>;

export const SITE_STATUSES = ["DRAFT", "PLANNED", "IN_PROGRESS", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export const STEP_STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
export const SLOTS = ["FULL_DAY", "MORNING", "AFTERNOON"] as const;
export const DOCUMENT_TYPES = [
  "QUOTE",
  "INVOICE",
  "PURCHASE_ORDER",
  "EXPENSE",
  "CONTRACT",
  "PLAN",
  "OTHER",
] as const;

export const stepSchema = z
  .object({
    title: z.string().trim().min(2, "Donnez un nom à l'étape.").max(120),
    weight: z.coerce
      .number()
      .int()
      .min(0, "Poids entre 0 et 100.")
      .max(100, "Poids entre 0 et 100.")
      .default(1),
    visibleToClient: checkbox,
    plannedStart: optionalDate,
    plannedEnd: optionalDate,
  })
  .refine((v) => !v.plannedStart || !v.plannedEnd || v.plannedStart <= v.plannedEnd, {
    message: "La date de fin doit être après la date de début.",
    path: ["plannedEnd"],
  });
export type StepInput = z.output<typeof stepSchema>;

export const templateSchema = z.object({
  name: z.string().trim().min(2, "Donnez un nom au modèle.").max(80),
  trade: z.enum(["CARPENTER", "JOINER", "POOL", "RENOVATION", "LANDSCAPER", "OTHER"]),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(2, "Chaque étape doit avoir un nom.").max(120),
        weight: z.coerce.number().int().min(0).max(100).default(1),
        visibleToClient: z.boolean().default(true),
      }),
    )
    .min(1, "Ajoutez au moins une étape.")
    .max(50),
});
export type TemplateInput = z.output<typeof templateSchema>;

export const assignmentSchema = z.object({
  siteId: z.string().min(1, "Choisissez un chantier."),
  userId: z.string().min(1, "Choisissez une personne."),
  date: requiredDate,
  slot: z.enum(SLOTS).default("FULL_DAY"),
  startTime: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => v === undefined || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), "Heure invalide (HH:MM)."),
  stepId: optionalText(40),
  instructions: optionalText(2000),
});
export type AssignmentInput = z.output<typeof assignmentSchema>;

export const taskSchema = z.object({
  siteId: z.string().min(1),
  title: z.string().trim().min(2, "Décrivez la tâche.").max(200),
  date: optionalDate,
  assigneeId: optionalText(40),
  stepId: optionalText(40),
});
export type TaskInput = z.output<typeof taskSchema>;

export const noteSchema = z.object({
  text: z.string().trim().min(1, "La note est vide.").max(5000),
  kind: z.enum(["NOTE", "PROBLEM"]).default("NOTE"),
  internal: checkbox,
});
export type NoteInput = z.output<typeof noteSchema>;

export const documentUpdateSchema = z.object({
  name: z.string().trim().min(1, "Donnez un nom au document.").max(200),
  type: z.enum(DOCUMENT_TYPES),
  siteId: optionalText(40),
  clientId: optionalText(40),
  documentDate: optionalDate,
  amount: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\s/g, "").replace(",", ".") : undefined))
    .refine((v) => v === undefined || /^-?\d+(\.\d{1,2})?$/.test(v), "Montant invalide.")
    .transform((v) => (v === undefined ? undefined : Math.round(Number(v) * 100))),
  supplier: optionalText(200),
  tags: stringList(40),
  visibleToClient: checkbox,
});
export type DocumentUpdateInput = z.output<typeof documentUpdateSchema>;

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de l'entreprise.").max(120),
  trade: z.enum(["CARPENTER", "JOINER", "POOL", "RENOVATION", "LANDSCAPER", "OTHER"]),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : undefined))
    .refine((v) => v === undefined || z.email().safeParse(v).success, "Adresse e-mail invalide."),
  address: optionalText(300),
  timezone: z.string().trim().min(3).max(60).default("Europe/Paris"),
});

export const validationSettingsSchema = z.object({
  photosAutoApprove: checkbox,
  officeCanValidatePhotos: checkbox,
  summaryAutoSend: checkbox,
  summaryHour: z.coerce.number().int().min(12).max(23),
  reminderHour: z.coerce.number().int().min(12).max(23),
});
