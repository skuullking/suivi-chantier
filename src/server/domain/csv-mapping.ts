/** Guided column mapping for the client CSV import (pure, unit-tested). */
import { normalizeText } from "@/lib/slug";

export const CLIENT_IMPORT_FIELDS = [
  { key: "name", label: "Nom du client", required: true },
  { key: "firstName", label: "Prénom (ajouté au nom)", required: false },
  { key: "companyName", label: "Société", required: false },
  { key: "type", label: "Type (particulier / professionnel)", required: false },
  { key: "email", label: "E-mail", required: false },
  { key: "phone", label: "Téléphone", required: false },
  { key: "address", label: "Adresse", required: false },
  { key: "postalCode", label: "Code postal", required: false },
  { key: "city", label: "Ville", required: false },
  { key: "tags", label: "Étiquettes", required: false },
  { key: "notes", label: "Notes", required: false },
] as const;

export type ClientImportField = (typeof CLIENT_IMPORT_FIELDS)[number]["key"];
export type ClientMapping = Partial<Record<ClientImportField, string | null>>;

const SYNONYMS: Record<ClientImportField, string[]> = {
  name: [
    "nom",
    "name",
    "client",
    "nom du client",
    "nom complet",
    "contact",
    "nom client",
    "last name",
    "nom de famille",
  ],
  firstName: ["prenom", "first name", "firstname"],
  companyName: ["societe", "entreprise", "raison sociale", "company", "organisation"],
  type: ["type", "type de client", "categorie client", "particulier/pro"],
  email: ["email", "e-mail", "mail", "courriel", "adresse email", "adresse e-mail", "adresse mail"],
  phone: ["telephone", "tel", "tel.", "portable", "mobile", "phone", "gsm", "numero"],
  address: ["adresse", "rue", "address", "adresse postale", "voie"],
  postalCode: ["code postal", "cp", "postal code", "zip", "code_postal"],
  city: ["ville", "commune", "city", "localite"],
  tags: ["tags", "etiquettes", "etiquette", "categorie", "categories", "groupe"],
  notes: ["notes", "note", "commentaire", "commentaires", "remarques", "observations"],
};

const clean = (s: string) => normalizeText(s).replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/** Best guess of the mapping from the CSV headers. */
export function guessClientMapping(headers: string[]): ClientMapping {
  const mapping: ClientMapping = {};
  const used = new Set<string>();
  for (const field of CLIENT_IMPORT_FIELDS) {
    const exact = headers.find((h) => !used.has(h) && SYNONYMS[field.key].includes(clean(h)));
    const partial =
      exact ??
      headers.find(
        (h) => !used.has(h) && SYNONYMS[field.key].some((s) => s.length > 3 && clean(h).includes(s)),
      );
    if (partial) {
      mapping[field.key] = partial;
      used.add(partial);
    }
  }
  return mapping;
}

export type MappedClient = {
  type: "INDIVIDUAL" | "PROFESSIONAL";
  name: string;
  companyName?: string;
  emails: string;
  phones: string;
  addresses: string;
  tags: string;
  notes?: string;
};

/** Raw form-like values (validated afterwards by the client Zod schema). */
export function mapClientRow(row: Record<string, string | undefined>, mapping: ClientMapping): MappedClient {
  const get = (f: ClientImportField) => {
    const header = mapping[f];
    return header ? (row[header] ?? "").trim() : "";
  };
  const typeRaw = clean(get("type"));
  const company = get("companyName");
  const name = [get("firstName"), get("name")].filter(Boolean).join(" ") || company;
  const street = get("address");
  const cityLine = [get("postalCode"), get("city")].filter(Boolean).join(" ");
  return {
    type:
      /pro|entreprise|societe|sci|sarl|sas/.test(typeRaw) || (!typeRaw && company && !get("name"))
        ? "PROFESSIONAL"
        : "INDIVIDUAL",
    name,
    companyName: company || undefined,
    emails: get("email"),
    phones: get("phone"),
    addresses: [street, cityLine].filter(Boolean).join(", "),
    tags: get("tags"),
    notes: get("notes") || undefined,
  };
}
