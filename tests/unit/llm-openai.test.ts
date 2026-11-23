import { describe, expect, it, vi } from "vitest";
import { OpenAiCompatibleLlmProvider } from "@/server/adapters/llm/openai-compatible";
import { heuristicDaySummary } from "@/server/domain/summary-heuristics";

const day = {
  organizationName: "Charpentes Martin",
  siteTitle: "Charpente Dupont",
  clientName: "M. Dupont",
  dateLabel: "lundi 7 décembre",
  completedSteps: ["Pose charpente"],
  currentStep: "Couverture",
  nextSteps: ["Finitions"],
  photoCaptions: ["Fermes posées"],
  photoCount: 3,
  updates: [],
};

function fakeApi(reply: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () =>
    Response.json(typeof reply === "string" ? { choices: [{ message: { content: reply } }] } : reply, {
      status,
    }),
  );
}

describe("IA compatible OpenAI (Groq, Ollama…)", () => {
  it("envoie le modèle, la clé, le mode JSON et le schéma attendu", async () => {
    const api = fakeApi(JSON.stringify({ summary: "  La couverture a commencé aujourd'hui.  " }));
    const provider = new OpenAiCompatibleLlmProvider(
      "https://api.groq.com/openai/v1/",
      "gsk_test",
      "llama-test",
      api,
    );

    await expect(provider.summarizeDay(day)).resolves.toBe("La couverture a commencé aujourd'hui.");

    const [url, init] = api.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer gsk_test");
    const body = JSON.parse(init!.body as string);
    expect(body.model).toBe("llama-test");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages[0].content).toContain('"summary"');
    expect(JSON.parse(body.messages[1].content)).toMatchObject({ siteTitle: "Charpente Dupont" });
  });

  it("sans clé (serveur local), aucun en-tête d'autorisation n'est envoyé", async () => {
    const api = fakeApi(JSON.stringify({ summary: "Bonne journée sur le chantier." }));
    const provider = new OpenAiCompatibleLlmProvider("http://localhost:11434/v1", undefined, "mistral", api);
    await provider.summarizeDay(day);
    expect((api.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("classe un document : montant en centimes, identifiants inconnus ignorés", async () => {
    const api = fakeApi(
      JSON.stringify({
        type: "INVOICE",
        supplier: "Bois du Sud",
        document_date: "2026-12-01",
        amount_eur: 1250.5,
        site_id: "chantier-invente",
        client_id: "client-1",
        confidence: 1.4,
        reason: "Facture de bois",
      }),
    );
    const provider = new OpenAiCompatibleLlmProvider("https://api.groq.com/openai/v1", "k", "m", api);
    const out = await provider.classifyDocument({
      fileName: "facture.pdf",
      text: "Facture Bois du Sud 1 250,50 €",
      sites: [{ id: "site-1", label: "Charpente Dupont", clientId: "client-1" }],
      clients: [{ id: "client-1", label: "M. Dupont" }],
    });
    expect(out).toMatchObject({
      type: "INVOICE",
      amountCents: 125050,
      siteId: null,
      clientId: "client-1",
      confidence: 1,
      documentDate: "2026-12-01",
    });
  });

  it("revient à la rédaction locale si le service refuse, répond mal ou hors schéma", async () => {
    const local = heuristicDaySummary(day);
    for (const api of [
      fakeApi({ error: { message: "rate limit" } }, 429),
      fakeApi("ceci n'est pas du JSON"),
      fakeApi(JSON.stringify({ resume: "mauvaise clé" })),
      fakeApi({ choices: [] }),
    ]) {
      const provider = new OpenAiCompatibleLlmProvider("https://api.groq.com/openai/v1", "k", "m", api);
      await expect(provider.summarizeDay(day)).resolves.toBe(local);
    }
  });

  it("revient à l'heuristique si le réseau est coupé", async () => {
    const api = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = new OpenAiCompatibleLlmProvider("https://api.groq.com/openai/v1", "k", "m", api);
    const out = await provider.resolveSite({
      senderName: "Jean",
      text: "Photo du jour",
      mediaKind: "PHOTO",
      gps: null,
      candidates: [],
    });
    expect(out.siteId).toBeNull();
  });
});
