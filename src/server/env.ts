import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32, "APP_SECRET doit contenir au moins 32 caractères"),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgresql://chantierlink:chantierlink@localhost:5433/chantierlink"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  ENABLE_DEV_TOOLS: bool,
  JOBS_MODE: z.enum(["inline", "queue"]).default("inline"),
  WORKER_POLL_INTERVAL_SECONDS: z.coerce.number().min(0.5).default(2),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default(".local/storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("eu-west-3"),
  S3_BUCKET: z.string().default("chantierlink"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(25),

  MAIL_DRIVER: z.enum(["dev", "console", "smtp"]).default("dev"),
  MAIL_FROM: z.string().default("ChantierLink <no-reply@chantierlink.local>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  INBOUND_MAIL_DOMAIN: z.string().default("docs.chantierlink.local"),
  INBOUND_MAIL_SECRET: z.string().default("dev-inbound-secret"),

  WHATSAPP_PROVIDER: z.enum(["mock", "meta"]).default("mock"),
  WHATSAPP_VERIFY_TOKEN: z.string().default("dev-verify-token"),
  WHATSAPP_APP_SECRET: z.string().default("dev-whatsapp-app-secret"),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default("v23.0"),
  WHATSAPP_BUSINESS_NUMBER: z.string().default("+33600000000"),

  TRANSCRIPTION_PROVIDER: z.enum(["mock", "whisper"]).default("mock"),
  WHISPER_API_URL: z.string().default("https://api.openai.com/v1/audio/transcriptions"),
  WHISPER_API_KEY: z.string().optional(),
  WHISPER_MODEL: z.string().default("whisper-1"),

  LLM_PROVIDER: z.enum(["mock", "anthropic", "openai"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  // LLM_PROVIDER=openai: any OpenAI-compatible API (Groq by default, or OpenAI, Mistral, a local Ollama…).
  LLM_API_URL: z.string().default("https://api.groq.com/openai/v1"),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default("llama-3.3-70b-versatile"),
  AUTO_CLASSIFY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),

  OCR_PROVIDER: z.enum(["mock", "tesseract"]).default("mock"),

  BILLING_ENABLED: bool,
  BILLING_PROVIDER: z.enum(["mock", "stripe"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_SOLO: z.string().optional(),
  STRIPE_PRICE_TEAM: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:contact@chantierlink.local"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/** Validated environment, parsed lazily (so that `next build` does not require runtime secrets). */
export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Variables d'environnement invalides :\n${details}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function isProduction() {
  return env().NODE_ENV === "production";
}

/** `/dev/*` tools are available outside production, or when explicitly enabled (demo). */
export function devToolsEnabled() {
  const e = env();
  return e.NODE_ENV !== "production" || e.ENABLE_DEV_TOOLS;
}

export function appUrl(path = "") {
  return new URL(path, env().APP_URL).toString();
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}
