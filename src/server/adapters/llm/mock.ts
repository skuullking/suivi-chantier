/** Deterministic "LLM" used in development, tests and when no API key is configured. */
import { classifyHeuristic } from "@/server/domain/doc-heuristics";
import { resolveHeuristic } from "@/server/domain/site-resolver";
import { heuristicDaySummary } from "@/server/domain/summary-heuristics";
import type { LlmProvider } from "./types";

export class MockLlmProvider implements LlmProvider {
  readonly name = "mock";

  async resolveSite(input: Parameters<LlmProvider["resolveSite"]>[0]) {
    return resolveHeuristic({ text: input.text, gps: input.gps, candidates: input.candidates });
  }

  async summarizeDay(input: Parameters<LlmProvider["summarizeDay"]>[0]) {
    return heuristicDaySummary(input);
  }

  async classifyDocument(input: Parameters<LlmProvider["classifyDocument"]>[0]) {
    return classifyHeuristic(input);
  }
}
