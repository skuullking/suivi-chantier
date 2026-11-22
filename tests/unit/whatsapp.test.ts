import { describe, expect, it } from "vitest";
import { classifyHeuristic, detectAmountCents, detectDate, detectType } from "@/server/domain/doc-heuristics";
import {
  currentStepId,
  distanceKm,
  resolveDeterministic,
  resolveHeuristic,
  type SiteCandidate,
} from "@/server/domain/site-resolver";
import { heuristicDaySummary } from "@/server/domain/summary-heuristics";
import { parseWhatsAppText, toE164 } from "@/server/domain/whatsapp-commands";
import { signWhatsAppBody, verifyWhatsAppSignature } from "@/server/security/webhook-signature";

describe("WhatsApp commands", () => {
  it.each([
    ["J'arrive", "arrive"],
    ["j’arrive 👍", "arrive"],
    ["JARRIVE", "arrive"],
    ["Je suis arrivé", "arrive"],
    ["Terminé", "finished"],
    ["fini pour aujourd'hui", "finished"],
    ["Étape terminée", "step_done"],
    ["etape finie !", "step_done"],
    ["On a terminé l'étape", "step_done"],
  ])("« %s » → %s", (text, type) => {
    expect(parseWhatsAppText(text).command.type).toBe(type);
  });

  it("keeps the original text of a problem", () => {
    expect(parseWhatsAppText("Problème : la panne est fendue").command).toEqual({
      type: "problem",
      text: "la panne est fendue",
    });
    expect(parseWhatsAppText("probleme - fuite sur la toiture").command).toEqual({
      type: "problem",
      text: "fuite sur la toiture",
    });
  });

  it("everything else is a note", () => {
    expect(parseWhatsAppText("Le client passe demain à 10 h").command).toEqual({
      type: "note",
      text: "Le client passe demain à 10 h",
    });
    // A long sentence starting with "arrivé" is a note, not a command.
    expect(
      parseWhatsAppText("Arrivé ce matin, le bois a été livré mais il manque deux pannes de 6 m").command
        .type,
    ).toBe("note");
  });

  it("extracts a site code anywhere in the message", () => {
    expect(parseWhatsAppText("DUP-1 j'arrive")).toEqual({ command: { type: "arrive" }, siteCode: "DUP-1" });
    expect(parseWhatsAppText("Problème sur gar-2 : bâche arrachée")).toMatchObject({
      siteCode: "GAR-2",
      command: { type: "problem" },
    });
  });

  it("normalizes phone numbers to E.164", () => {
    expect(toE164("33612345678")).toBe("+33612345678");
    expect(toE164("06 12 34 56 78")).toBe("+33612345678");
    expect(toE164("0033612345678")).toBe("+33612345678");
    expect(toE164("+33 6 12 34 56 78")).toBe("+33612345678");
  });
});

const site = (o: Partial<SiteCandidate> & { id: string }): SiteCandidate => ({
  code: "XXX-1",
  title: "Chantier",
  clientName: "Client",
  city: null,
  address: "1 rue",
  latitude: null,
  longitude: null,
  plannedToday: false,
  plannedThisWeek: false,
  steps: [
    { id: `${o.id}-s1`, title: "Étape 1", status: "DONE", order: 1 },
    { id: `${o.id}-s2`, title: "Étape 2", status: "IN_PROGRESS", order: 2 },
    { id: `${o.id}-s3`, title: "Étape 3", status: "TODO", order: 3 },
  ],
  ...o,
});

describe("site attachment", () => {
  const dupont = site({
    id: "dup",
    code: "DUP-1",
    title: "Charpente maison Dupont",
    clientName: "M. et Mme Dupont",
    city: "Castanet",
    latitude: 43.5164,
    longitude: 1.4986,
  });
  const garcia = site({
    id: "gar",
    code: "GAR-2",
    title: "Extension Garcia",
    clientName: "Isabelle Garcia",
    city: "Balma",
    latitude: 43.6107,
    longitude: 1.4996,
  });

  it("(a) the single site of the day wins with 0.95", () => {
    const r = resolveDeterministic({ text: null, candidates: [{ ...dupont, plannedToday: true }, garcia] });
    expect(r).toMatchObject({ siteId: "dup", stepId: "dup-s2", confidence: 0.95 });
  });

  it("(b) a named site (code or name) → 0.9, even if another site is planned today", () => {
    expect(
      resolveDeterministic({ text: "photo", siteCode: "GAR-2", candidates: [dupont, garcia] }),
    ).toMatchObject({ siteId: "gar", confidence: 0.9 });
    expect(
      resolveDeterministic({
        text: "Chez Garcia ce matin",
        candidates: [{ ...dupont, plannedToday: true }, garcia],
      }),
    ).toMatchObject({
      siteId: "gar",
      confidence: 0.9,
    });
  });

  it("(c) no deterministic answer with two sites of the day", () => {
    expect(
      resolveDeterministic({
        text: null,
        candidates: [
          { ...dupont, plannedToday: true },
          { ...garcia, plannedToday: true },
        ],
      }),
    ).toBeNull();
  });

  it("heuristic: GPS of the photo close to a site gives a high confidence", () => {
    const r = resolveHeuristic({
      text: null,
      gps: { lat: 43.5166, lng: 1.4988 },
      candidates: [dupont, garcia],
    });
    expect(r.siteId).toBe("dup");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("heuristic: ambiguous planning gives a low confidence (→ À traiter)", () => {
    const r = resolveHeuristic({
      text: null,
      candidates: [
        { ...dupont, plannedThisWeek: true },
        { ...garcia, plannedThisWeek: true },
      ],
    });
    expect(r.confidence).toBeLessThan(0.75);
  });

  it("heuristic: nothing known → no site", () => {
    expect(resolveHeuristic({ text: "ok", candidates: [dupont, garcia] }).siteId).toBeNull();
  });

  it("distance and current step helpers", () => {
    expect(distanceKm({ lat: 43.5164, lng: 1.4986 }, { lat: 43.6107, lng: 1.4996 })).toBeCloseTo(10.5, 0);
    expect(currentStepId([{ id: "a", title: "A", status: "DONE", order: 1 }])).toBeNull();
  });
});

describe("webhook signature", () => {
  it("accepts the exact HMAC and rejects anything else", () => {
    const body = '{"entry":[]}';
    const sig = signWhatsAppBody(body, "secret");
    expect(verifyWhatsAppSignature(body, sig, "secret")).toBe(true);
    expect(verifyWhatsAppSignature(`${body} `, sig, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, sig, "other")).toBe(false);
    expect(verifyWhatsAppSignature(body, null, "secret")).toBe(false);
    expect(verifyWhatsAppSignature(body, "sha256=00", "secret")).toBe(false);
  });
});

describe("document heuristics", () => {
  it("detects type, amount and date", () => {
    expect(detectType("FACTURE n° F-2026-112").type).toBe("INVOICE");
    expect(detectType("Devis D-2026-041").type).toBe("QUOTE");
    expect(detectType("Bon de commande BC-7781").type).toBe("PURCHASE_ORDER");
    expect(detectType("Ticket de caisse station carburant").type).toBe("EXPENSE");
    expect(detectAmountCents("Sous-total 100,00 €\nTotal TTC : 1 234,56 €")).toBe(123456);
    expect(detectAmountCents("Montant 4 740,00 € et frais 12,00 €")).toBe(474000);
    expect(detectAmountCents("aucun montant")).toBeNull();
    expect(detectDate("Toulouse, le 12/11/2026")).toBe("2026-11-12");
    expect(detectDate("le 3 novembre 2026")).toBe("2026-11-03");
    expect(detectDate("31/02/2026")).toBeNull();
  });

  it("proposes the site and client from the content", () => {
    const r = classifyHeuristic({
      fileName: "facture.pdf",
      text: "SCIERIE DU COMMINGES SARL\nFacture F-881\nLivraison chantier Dupont Castanet\nTotal TTC 5 130,00 €\n12/11/2026",
      sites: [
        { id: "dup", label: "Charpente maison Dupont DUP-1 M. et Mme Dupont Castanet", clientId: "c-dup" },
        { id: "gar", label: "Extension Garcia GAR-2 Isabelle Garcia Balma", clientId: "c-gar" },
      ],
      clients: [
        { id: "c-dup", label: "M. et Mme Dupont" },
        { id: "c-gar", label: "Isabelle Garcia" },
      ],
    });
    expect(r).toMatchObject({
      type: "INVOICE",
      siteId: "dup",
      clientId: "c-dup",
      amountCents: 513000,
      documentDate: "2026-11-12",
    });
    expect(r.supplier).toContain("SCIERIE");
    expect(r.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("local daily summary", () => {
  it("writes 2-4 sentences from the facts only", () => {
    const text = heuristicDaySummary({
      organizationName: "Charpentes Martin",
      siteTitle: "Charpente Dupont",
      clientName: "M. Dupont",
      dateLabel: "lundi 23 novembre",
      completedSteps: ["Pose charpente"],
      currentStep: null,
      nextSteps: ["Couverture"],
      photoCaptions: ["Faîtage posé"],
      photoCount: 3,
      updates: [],
    });
    expect(text).toContain("« pose charpente » est terminée");
    expect(text).toContain("3 nouvelles photos");
    expect(text).toContain("Prochaine étape : couverture.");
    const sentences = text.split(/(?<=\.)\s/);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
  });
});
