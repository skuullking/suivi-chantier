/** Real AI through the Anthropic API (Claude), with native structured outputs validated by Zod. */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { FallbackError, StructuredLlmProvider } from "./structured";

export class AnthropicLlmProvider extends StructuredLlmProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    super();
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  protected async parse<S extends z.ZodType>(
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
}
