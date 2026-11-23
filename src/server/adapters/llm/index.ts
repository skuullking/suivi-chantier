import { env } from "@/server/env";
import { logger } from "@/server/logger";
import { AnthropicLlmProvider } from "./anthropic";
import { MockLlmProvider } from "./mock";
import { OpenAiCompatibleLlmProvider } from "./openai-compatible";
import type { LlmProvider } from "./types";

export type * from "./types";

let provider: LlmProvider | null = null;

/**
 * LLM_PROVIDER=anthropic + ANTHROPIC_API_KEY → Claude ;
 * LLM_PROVIDER=openai → OpenAI-compatible API (Groq, OpenAI, Mistral, Ollama…), key optional for a local server ;
 * otherwise the local mock.
 */
export function llm(): LlmProvider {
  if (provider) return provider;
  const e = env();
  if (e.LLM_PROVIDER === "anthropic") {
    if (e.ANTHROPIC_API_KEY) {
      provider = new AnthropicLlmProvider(e.ANTHROPIC_API_KEY, e.ANTHROPIC_MODEL);
    } else {
      logger.warn("LLM_PROVIDER=anthropic sans ANTHROPIC_API_KEY : utilisation du mode simulé");
      provider = new MockLlmProvider();
    }
  } else if (e.LLM_PROVIDER === "openai") {
    // A public API (https) needs a key; a local server (Ollama, http) does not.
    if (e.LLM_API_KEY || !e.LLM_API_URL.startsWith("https://")) {
      provider = new OpenAiCompatibleLlmProvider(e.LLM_API_URL, e.LLM_API_KEY || undefined, e.LLM_MODEL);
    } else {
      logger.warn("LLM_PROVIDER=openai sans LLM_API_KEY : utilisation du mode simulé");
      provider = new MockLlmProvider();
    }
  } else {
    provider = new MockLlmProvider();
  }
  return provider;
}

export function setLlmProvider(p: LlmProvider | null) {
  provider = p;
}
