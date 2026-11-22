/**
 * Parsing of the simple text commands sent by workers on WhatsApp (pure, unit-tested).
 *   J'arrive · Terminé · Étape terminée · Problème : … — anything else is a note.
 * A site code (« DUP-1 ») anywhere in the message designates the site explicitly.
 */

export type WhatsAppCommand =
  | { type: "arrive" }
  | { type: "finished" }
  | { type: "step_done" }
  | { type: "problem"; text: string }
  | { type: "note"; text: string };

export type ParsedMessage = { command: WhatsAppCommand; siteCode: string | null };

const SITE_CODE = /\b([A-Za-z]{3}-\d{1,6})\b/;

/** Lowercase, no accents, no emoji, normalized apostrophes and spaces. */
export function normalizeCommandText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\p{Extended_Pictographic}|️/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const ARRIVE = [
  /^j'?\s?arrive\b/,
  /^je suis (arrive|sur place|sur le chantier)\b/,
  /^(bien )?arrive\b/,
  /^sur place\b/,
  /^on arrive\b/,
];
const FINISHED = [
  /^termine\b(?!.*etape)/,
  /^(j'?ai |on a )?fini\b(?!.*etape)/,
  /^fin de (la )?journee\b/,
  /^je (pars|quitte le chantier)\b/,
  /^journee terminee\b/,
];
const STEP_DONE = [/^etape (terminee|finie|faite|ok|validee)\b/, /^(j'?ai |on a )?(termine|fini) l'?etape\b/];
const PROBLEM = /^(probleme|souci|pb|alerte)\s*[:\-–—!]?\s*/;

export function parseWhatsAppText(raw: string): ParsedMessage {
  const codeMatch = SITE_CODE.exec(raw);
  const siteCode = codeMatch ? codeMatch[1]!.toUpperCase() : null;
  const withoutCode = (codeMatch ? raw.replace(codeMatch[0], " ") : raw).replace(/^[\s:,\-–—]+/, "").trim();
  const text = normalizeCommandText(withoutCode).replace(/^[.!:,\-\s]+/, "");

  const problem = PROBLEM.exec(text);
  if (problem) {
    // Keep the original wording (accents, case) after the keyword.
    const original = withoutCode.replace(/^\s*(probl[eè]me|souci|pb|alerte)\s*[:\-–—!]?\s*/i, "").trim();
    return { command: { type: "problem", text: original || withoutCode }, siteCode };
  }
  if (STEP_DONE.some((r) => r.test(text))) return { command: { type: "step_done" }, siteCode };
  if (ARRIVE.some((r) => r.test(text)) && text.length < 60) return { command: { type: "arrive" }, siteCode };
  if (FINISHED.some((r) => r.test(text)) && text.length < 60)
    return { command: { type: "finished" }, siteCode };
  return { command: { type: "note", text: withoutCode || raw.trim() }, siteCode };
}

/** E.164 from a WhatsApp `wa_id` ("33612345678") or a French local number. */
export function toE164(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `+${digits.slice(1).replace(/\D/g, "")}`;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length === 10) return `+33${digits.slice(1)}`;
  return `+${digits}`;
}
