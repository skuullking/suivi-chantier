/**
 * Real AI through the Anthropic API (Claude). Structured outputs are validated with Zod.
 * On any failure (refusal, network, invalid output) the local heuristic is used instead, so the product keeps
 * working — low-confidence results simply go to "À traiter".
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { DOCUMENT_TYPES } from "@/lib/validation/business";
import { logger } from "@/server/logger";
import { MockLlmProvider } from "./mock";
import type { ClassifyDocumentInput, DocumentClassification, LlmProvider, ResolveSiteInput } from "./types";

const SiteChoice = z.object({
  site_id: z
    .string()
    .nullable()
    .describe("Identifiant du chantier choisi, ou null si impossible à déterminer"),
  confidence: z.number().describe("Confiance entre 0 et 1"),
  reason: z.string().describe("Justification courte en français"),
});

const Summary = z.object({ summary: z.string().describe("Résumé de 2 à 4 phrases pour le client") });

const Classification = z.object({
  type: z.enum(DOCUMENT_TYPES),
  supplier: z.string().nullable(),
  document_date: z.string().nullable().describe("Date du document au format AAAA-MM-JJ"),
  amount_eur: z.number().nullable().describe("Montant total TTC en euros"),
  site_id: z.string().nullable(),
  client_id: z.string().nullable(),
  confidence: z.number().describe("Confiance globale entre 0 et 1"),
  reason: z.string(),
});

class FallbackError extends Error {}

export class AnthropicLlmProvider implements LlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly fallback = new MockLlmProvider();

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  private async parse<S extends z.ZodType>(
    schema: S,
    system: string,
    prompt: string,
    effort: "low" | "medium",
  ): Promise<z.infer<S>> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 4000,
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { format: zodOutputFormat(schema), effort },
    });
    if (response.stop_reason === "refusal") throw new FallbackError("refusal");
    if (!response.parsed_output) throw new FallbackError("unparsable output");
    return response.parsed_output as z.infer<S>;
  }

  async resolveSite(input: ResolveSiteInput) {
    const candidates = input.candidates.map((c) => ({
      id: c.id,
      code: c.code,
      titre: c.title,
      client: c.clientName,
      ville: c.city,
      adresse: c.address,
      gps: c.latitude != null && c.longitude != null ? [c.latitude, c.longitude] : null,
      prevu_aujourd_hui: c.plannedToday,
      prevu_cette_semaine: c.plannedThisWeek,
    }));
    try {
      const out = await this.parse(
        SiteChoice,
        "Tu aides une entreprise du bâtiment à ranger les messages WhatsApp de ses ouvriers. Choisis le chantier concerné parmi la liste fournie uniquement. Si tu n'es pas sûr, baisse la confiance ; n'invente jamais d'identifiant.",
        JSON.stringify({
          expediteur: input.senderName,
          type: input.mediaKind,
          texte: input.text,
          gps_photo: input.gps,
          chantiers: candidates,
        }),
        "low",
      );
      const site = input.candidates.find((c) => c.id === out.site_id);
      if (!site) return { siteId: null, stepId: null, confidence: 0, reason: out.reason };
      const steps = [...site.steps].sort((a, b) => a.order - b.order);
      const step = steps.find((s) => s.status === "IN_PROGRESS") ?? steps.find((s) => s.status === "TODO");
      return {
        siteId: site.id,
        stepId: step?.id ?? null,
        confidence: Math.max(0, Math.min(1, out.confidence)),
        reason: `IA : ${out.reason}`,
      };
    } catch (error) {
      logger.warn({ err: error }, "Rattachement IA indisponible, heuristique locale utilisée");
      return this.fallback.resolveSite(input);
    }
  }

  async summarizeDay(input: Parameters<LlmProvider["summarizeDay"]>[0]) {
    try {
      const out = await this.parse(
        Summary,
        "Tu rédiges pour un artisan le résumé de la journée envoyé à son client particulier. 2 à 4 phrases, ton chaleureux et professionnel, sans jargon technique, en français. N'invente rien : n'utilise que les faits fournis. Ne mentionne jamais de problème, de retard interne, de prix ou de nom de fournisseur.",
        JSON.stringify(input),
        "medium",
      );
      return out.summary.trim();
    } catch (error) {
      logger.warn({ err: error }, "Résumé IA indisponible, rédaction locale utilisée");
      return this.fallback.summarizeDay(input);
    }
  }

  async classifyDocument(input: ClassifyDocumentInput): Promise<DocumentClassification> {
    try {
      const out = await this.parse(
        Classification,
        "Tu classes les papiers d'une entreprise du bâtiment (devis, factures, bons de commande, notes de frais, contrats, plans). Utilise uniquement les identifiants de chantier et de client fournis, sinon null. Montant : total TTC.",
        JSON.stringify({
          fichier: input.fileName,
          objet_email: input.emailSubject,
          texte: input.text.slice(0, 12_000),
          chantiers: input.sites,
          clients: input.clients,
        }),
        "low",
      );
      const site = input.sites.find((s) => s.id === out.site_id) ?? null;
      const client = input.clients.find((c) => c.id === out.client_id) ?? null;
      return {
        type: out.type,
        supplier: out.supplier,
        documentDate:
          out.document_date && /^\d{4}-\d{2}-\d{2}$/.test(out.document_date) ? out.document_date : null,
        amountCents: out.amount_eur === null ? null : Math.round(out.amount_eur * 100),
        siteId: site?.id ?? null,
        clientId: client?.id ?? site?.clientId ?? null,
        confidence: Math.max(0, Math.min(1, out.confidence)),
        reason: `IA : ${out.reason}`,
      };
    } catch (error) {
      logger.warn({ err: error }, "Classement IA indisponible, heuristique locale utilisée");
      return this.fallback.classifyDocument(input);
    }
  }
}
