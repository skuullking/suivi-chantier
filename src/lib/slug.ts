/** Lowercase ASCII slug ("Charpentes Martin" → "charpentes-martin"). */
export function slugify(input: string, maxLength = 40): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

/** Removes accents and lowercases (for tolerant comparisons). */
export function normalizeText(input: string): string {
  return input.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
