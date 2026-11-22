import { z } from "zod";

export const TRADES = ["CARPENTER", "JOINER", "POOL", "RENOVATION", "LANDSCAPER", "OTHER"] as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Adresse e-mail invalide." }));

export const passwordSchema = z
  .string()
  .min(10, { error: "Le mot de passe doit contenir au moins 10 caractères." })
  .max(200, { error: "Le mot de passe est trop long." });

const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v ? v : null));

export const signUpSchema = z.object({
  organizationName: z.string().trim().min(2, { error: "Indiquez le nom de votre entreprise." }).max(120),
  trade: z.enum(TRADES, { error: "Choisissez votre métier." }),
  name: z.string().trim().min(2, { error: "Indiquez votre nom." }).max(120),
  email,
  phone: optionalPhone,
  password: passwordSchema,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, { error: "Indiquez votre mot de passe." }).max(200),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    error: "Les mots de passe ne correspondent pas.",
    path: ["confirm"],
  });

export const acceptInvitationSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2, { error: "Indiquez votre nom." }).max(120),
  phone: optionalPhone,
  password: passwordSchema,
});

export const ROLES = ["OWNER", "OFFICE", "WORKER"] as const;

export const invitationSchema = z.object({
  email,
  name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : null)),
  role: z.enum(ROLES, { error: "Choisissez un rôle." }),
});

/** Only allow relative in-app redirects (prevents open redirects). */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
