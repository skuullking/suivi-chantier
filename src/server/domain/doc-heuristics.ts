/**
 * Local document classification (no AI): type, supplier, date, amount, site / client (pure, unit-tested).
 * Used by the mock LLM and as a fallback when the real AI is unavailable.
 */
import type { DocumentType } from "@/generated/prisma/enums";
import { normalizeText } from "@/lib/slug";

const TYPE_RULES: { type: DocumentType; patterns: RegExp[] }[] = [
  { type: "PURCHASE_ORDER", patterns: [/bon de commande/, /\bbc[- ]?\d+/, /commande (n|no|numero)/] },
  {
    type: "EXPENSE",
    patterns: [
      /note de frais/,
      /ticket( de caisse)?/,
      /\bcarburant\b/,
      /\brestaurant\b/,
      /\bpeage\b/,
      /\brecu\b/,
    ],
  },
  { type: "INVOICE", patterns: [/\bfacture\b/, /\binvoice\b/, /\bacompte\b/] },
  { type: "QUOTE", patterns: [/\bdevis\b/, /\bestimation\b/, /proposition commerciale/] },
  { type: "CONTRACT", patterns: [/\bcontrat\b/, /conditions particulieres/] },
  { type: "PLAN", patterns: [/\bplan\b/, /\bcoupe\b/, /\belevation\b/, /\bindice [a-z]\b/] },
];

export function detectType(text: string): { type: DocumentType; matched: boolean } {
  const t = normalizeText(text);
  // Titles first (file name / first lines are the strongest signal).
  for (const rule of TYPE_RULES) {
    if (rule.patterns.some((p) => p.test(t))) return { type: rule.type, matched: true };
  }
  return { type: "OTHER", matched: false };
}

/** "1 234,56 €", "1234.56 EUR", "Total TTC : 4 740,00" → cents. Prefers the amount next to "total". */
export function detectAmountCents(text: string): number | null {
  const re = /(\d{1,3}(?:[   .]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))\s*(?:€|eur\b|euros?\b)/gi;
  // "Total TTC" first, otherwise the last "Total" (never "Sous-total").
  const totalRe =
    /(?<![\w-])total(\s+ttc)?\s*[:\-]?\s*(\d{1,3}(?:[   .]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))/gi;
  const parse = (s: string) => {
    const clean = s.replace(/[   ]/g, "");
    const normalized = /,\d{2}$/.test(clean)
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
    const value = Number(normalized);
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  };
  const totals = [...text.matchAll(totalRe)];
  const total = totals.find((m) => m[1]) ?? totals.at(-1);
  if (total) return parse(total[2]!);
  const amounts = [...text.matchAll(re)].map((m) => parse(m[1]!)).filter((v): v is number => v !== null);
  return amounts.length ? Math.max(...amounts) : null;
}

const MONTHS = [
  "janvier",
  "fevrier",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "aout",
  "septembre",
  "octobre",
  "novembre",
  "decembre",
];

/** First plausible date → "YYYY-MM-DD". */
export function detectDate(text: string): string | null {
  const t = normalizeText(text);
  const pad = (n: number) => String(n).padStart(2, "0");
  const valid = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m - 1, d));
    return y > 1990 && y < 2100 && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  };
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (iso && valid(+iso[1]!, +iso[2]!, +iso[3]!)) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/.exec(t);
  if (fr) {
    const y = fr[3]!.length === 2 ? 2000 + +fr[3]! : +fr[3]!;
    if (valid(y, +fr[2]!, +fr[1]!)) return `${y}-${pad(+fr[2]!)}-${pad(+fr[1]!)}`;
  }
  const long = new RegExp(`\\b(\\d{1,2})(?:er)? (${MONTHS.join("|")}) (\\d{4})\\b`).exec(t);
  if (long) {
    const m = MONTHS.indexOf(long[2]!) + 1;
    if (valid(+long[3]!, m, +long[1]!)) return `${long[3]}-${pad(m)}-${pad(+long[1]!)}`;
  }
  return null;
}

const COMPANY = /\b(sarl|sas|sasu|eurl|sa|sci|scierie|ets|etablissements|societe|entreprise)\b/i;

export function detectSupplier(text: string, fromName?: string | null): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 2 && l.length < 80);
  const company = lines.find((l) => COMPANY.test(l));
  if (company) return company.replace(/\s{2,}/g, " ");
  if (fromName) return fromName;
  return lines[0] ?? null;
}

function distinctiveTokens(s: string) {
  return normalizeText(s)
    .split(/[^a-z0-9]+/)
    .filter(
      (t) =>
        t.length >= 4 &&
        ![
          "chantier",
          "maison",
          "charpente",
          "renovation",
          "toiture",
          "extension",
          "madame",
          "monsieur",
        ].includes(t),
    );
}

export function matchLabel<T extends { id: string; label: string }>(text: string, items: T[]): T | null {
  const words = new Set(distinctiveTokens(text));
  const scored = items
    .map((i) => ({ i, n: distinctiveTokens(i.label).filter((t) => words.has(t)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (!scored.length || (scored[1] && scored[1].n === scored[0]!.n)) return null;
  return scored[0]!.i;
}

export function classifyHeuristic(input: {
  fileName: string;
  text: string;
  emailSubject?: string | null;
  fromName?: string | null;
  sites: { id: string; label: string; clientId: string }[];
  clients: { id: string; label: string }[];
}) {
  const head = `${input.emailSubject ?? ""}\n${input.fileName}\n${input.text.slice(0, 600)}`;
  const { type, matched } = detectType(head).matched ? detectType(head) : detectType(input.text);
  const all = `${head}\n${input.text}`;
  const site = matchLabel(all, input.sites);
  const client = site
    ? (input.clients.find((c) => c.id === site.clientId) ?? null)
    : matchLabel(all, input.clients);
  const amountCents = detectAmountCents(input.text);
  const documentDate = detectDate(input.text);
  let confidence = 0;
  const reasons: string[] = [];
  if (matched) {
    confidence += 0.45;
    reasons.push("type reconnu");
  }
  if (site) {
    confidence += 0.35;
    reasons.push(`chantier « ${site.label} » cité`);
  } else if (client) {
    confidence += 0.25;
    reasons.push(`client « ${client.label} » cité`);
  }
  if (amountCents !== null) confidence += 0.1;
  if (documentDate) confidence += 0.05;
  return {
    type,
    supplier: detectSupplier(input.text, input.fromName),
    documentDate,
    amountCents,
    siteId: site?.id ?? null,
    clientId: client?.id ?? null,
    confidence: Math.round(Math.min(0.95, confidence) * 100) / 100,
    reason: reasons.join(", ") || "Aucun indice fiable",
  };
}
