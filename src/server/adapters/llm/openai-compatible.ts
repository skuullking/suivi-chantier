/**
 * Real AI through any OpenAI-compatible chat API: Groq (free tier), OpenAI, Mistral, or a local Ollama server.
 * JSON mode + the JSON schema in the instructions, then strict validation with Zod.
 */
import { z } from "zod";
import { FallbackError, StructuredLlmProvider } from "./structured";

type ChatResponse = { choices?: { message?: { content?: string | null } }[] };

export class OpenAiCompatibleLlmProvider extends StructuredLlmProvider {
  readonly name = "openai";
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly model: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    super();
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  protected async parse<S extends z.ZodType>(schema: S, system: string, prompt: string): Promise<z.infer<S>> {
    const jsonSchema = JSON.stringify(z.toJSONSchema(schema));
    const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `${system}\n\nRéponds uniquement avec un objet JSON valide, conforme à ce schéma JSON :\n${jsonSchema}`,
          },
          { role: "user", content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new FallbackError(`Réponse ${res.status} du service d'IA`);
    const content = ((await res.json()) as ChatResponse).choices?.[0]?.message?.content;
    if (!content) throw new FallbackError("empty output");
    const parsed = schema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new FallbackError("invalid output");
    return parsed.data as z.infer<S>;
  }
}
