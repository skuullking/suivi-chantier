/**
 * Attaching an incoming WhatsApp message to a site (pure, unit-tested).
 *   (a) the single site of the sender's day → 0.95
 *   (b) a site named in the message (short code, client or site name) → 0.9
 *   (c) otherwise the LLM (or the local heuristic) proposes with a confidence score.
 * At or above the threshold (AUTO_CLASSIFY_THRESHOLD, 0.75) the item is filed automatically, otherwise it goes to
 * "À traiter".
 */
import { normalizeText } from "@/lib/slug";

export type SiteCandidate = {
  id: string;
  code: string;
  title: string;
  clientName: string;
  city: string | null;
  address: string;
  latitude: number | null;
  longitude: number | null;
  /** Sender planned on this site today. */
  plannedToday: boolean;
  /** Sender planned on this site this week (or member of its team). */
  plannedThisWeek: boolean;
  steps: { id: string; title: string; status: "TODO" | "IN_PROGRESS" | "DONE"; order: number }[];
};

export type Resolution = { siteId: string | null; stepId: string | null; confidence: number; reason: string };

const STOP_WORDS = new Set([
  "chantier",
  "maison",
  "monsieur",
  "madame",
  "mme",
  "les",
  "des",
  "pour",
  "avec",
  "dans",
  "sur",
  "rue",
  "chemin",
  "avenue",
  "place",
  "allee",
  "impasse",
  "route",
  "sci",
  "sarl",
  "renovation",
  "charpente",
  "extension",
  "toiture",
]);

function tokens(s: string): string[] {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
}

/** Current step: in progress, else the first step to do. */
export function currentStepId(steps: SiteCandidate["steps"]): string | null {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  return (
    (sorted.find((s) => s.status === "IN_PROGRESS") ?? sorted.find((s) => s.status === "TODO"))?.id ?? null
  );
}

/** Sites explicitly named in the text (code or distinctive words of the client / site name). */
export function namedSites(
  text: string | null,
  candidates: SiteCandidate[],
  siteCode?: string | null,
): SiteCandidate[] {
  if (siteCode) {
    const byCode = candidates.filter((c) => c.code.toUpperCase() === siteCode.toUpperCase());
    if (byCode.length) return byCode;
  }
  if (!text) return [];
  const words = new Set(tokens(text));
  if (words.size === 0) return [];
  return candidates.filter((c) => tokens(`${c.clientName} ${c.title}`).some((t) => words.has(t)));
}

/** Deterministic rules (a) and (b). Returns null when the LLM / heuristic must decide. */
export function resolveDeterministic(input: {
  text: string | null;
  siteCode?: string | null;
  candidates: SiteCandidate[];
}): Resolution | null {
  const named = namedSites(input.text, input.candidates, input.siteCode);
  const today = input.candidates.filter((c) => c.plannedToday);
  if (today.length === 1 && (named.length === 0 || named.some((n) => n.id === today[0]!.id))) {
    const site = today[0]!;
    return {
      siteId: site.id,
      stepId: currentStepId(site.steps),
      confidence: 0.95,
      reason: "Seul chantier prévu aujourd'hui",
    };
  }
  if (named.length === 1) {
    const site = named[0]!;
    return {
      siteId: site.id,
      stepId: currentStepId(site.steps),
      confidence: 0.9,
      reason: input.siteCode ? `Code chantier ${site.code} cité` : "Chantier cité dans le message",
    };
  }
  return null;
}

/** Distance in km (haversine). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Local heuristic used by the mock LLM and as a fallback: GPS, planning and words of the message. */
export function resolveHeuristic(input: {
  text: string | null;
  gps?: { lat: number; lng: number } | null;
  candidates: SiteCandidate[];
}): Resolution {
  const words = new Set(tokens(input.text ?? ""));
  const scored = input.candidates.map((c) => {
    let score = 0;
    const reasons: string[] = [];
    if (input.gps && c.latitude != null && c.longitude != null) {
      const d = distanceKm(input.gps, { lat: c.latitude, lng: c.longitude });
      if (d < 0.3) {
        score += 0.8;
        reasons.push(`photo prise à ${Math.round(d * 1000)} m du chantier`);
      } else if (d < 1.5) {
        score += 0.55;
        reasons.push(`photo prise à ${d.toFixed(1)} km`);
      } else if (d < 10) {
        score += 0.15;
      }
    }
    if (c.plannedToday) {
      score += 0.45;
      reasons.push("prévu aujourd'hui");
    } else if (c.plannedThisWeek) {
      score += 0.25;
      reasons.push("prévu cette semaine");
    }
    const overlap = tokens(`${c.clientName} ${c.title} ${c.city ?? ""} ${c.address}`).filter((t) =>
      words.has(t),
    );
    if (overlap.length) {
      score += Math.min(0.6, 0.35 * overlap.length);
      reasons.push(`mots reconnus : ${overlap.join(", ")}`);
    }
    return { c, score: Math.min(0.9, score), reasons };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 0.1) {
    return { siteId: null, stepId: null, confidence: 0, reason: "Aucun indice pour rattacher ce message" };
  }
  // Two equally likely sites: the confidence drops.
  const ambiguous = scored[1] && scored[1].score >= best.score - 0.05;
  const confidence = Math.round((ambiguous ? best.score * 0.6 : best.score) * 100) / 100;
  return {
    siteId: best.c.id,
    stepId: currentStepId(best.c.steps),
    confidence,
    reason: `${best.reasons.join(", ") || "indice faible"}${ambiguous ? " (plusieurs chantiers possibles)" : ""}`,
  };
}
