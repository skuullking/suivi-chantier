/** French UI labels for enum values (shared by server and client components). */
import type {
  ClientType,
  DocumentType,
  MediaSource,
  Role,
  SiteStatus,
  Slot,
  StepStatus,
  Trade,
  ValidationStatus,
} from "@/generated/prisma/enums";

export const TRADE_LABELS: Record<Trade, string> = {
  CARPENTER: "Charpentier",
  JOINER: "Menuisier",
  POOL: "Pisciniste",
  RENOVATION: "Rénovation intérieure",
  LANDSCAPER: "Paysagiste",
  OTHER: "Autre métier du bâtiment",
};

export const TRADE_OPTIONS = (Object.keys(TRADE_LABELS) as Trade[]).map((value) => ({
  value,
  label: TRADE_LABELS[value],
}));

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Patron",
  OFFICE: "Bureau",
  WORKER: "Ouvrier",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  OWNER: "Accès complet, paramètres, abonnement et équipe.",
  OFFICE: "Gère clients, chantiers, documents et planning.",
  WORKER: "Voit ses chantiers du jour, envoie photos et vocaux.",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  DRAFT: "Brouillon",
  PLANNED: "Planifié",
  IN_PROGRESS: "En cours",
  PAUSED: "En pause",
  COMPLETED: "Terminé",
  ARCHIVED: "Archivé",
};

export const STEP_STATUS_LABELS: Record<StepStatus, string> = {
  TODO: "À venir",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
};

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  INDIVIDUAL: "Particulier",
  PROFESSIONAL: "Professionnel",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  QUOTE: "Devis",
  INVOICE: "Facture",
  PURCHASE_ORDER: "Bon de commande",
  EXPENSE: "Note de frais",
  CONTRACT: "Contrat",
  PLAN: "Plan",
  OTHER: "Autre",
};

export const SLOT_LABELS: Record<Slot, string> = {
  FULL_DAY: "Journée",
  MORNING: "Matin",
  AFTERNOON: "Après-midi",
};

export const VALIDATION_LABELS: Record<ValidationStatus, string> = {
  PENDING: "À valider",
  APPROVED: "Validée",
  REJECTED: "Refusée",
};

export const MEDIA_SOURCE_LABELS: Record<MediaSource, string> = {
  APP: "Application",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
};
