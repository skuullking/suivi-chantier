import type { Trade } from "@/generated/prisma/enums";

export type DefaultTemplate = { trade: Trade; name: string; steps: string[] };

/** Pre-filled step templates (copied into each organization at sign-up, then editable). */
export const DEFAULT_STEP_TEMPLATES: DefaultTemplate[] = [
  {
    trade: "CARPENTER",
    name: "Charpente",
    steps: [
      "Prise de côtes",
      "Plans / commande des bois",
      "Taille en atelier",
      "Livraison",
      "Pose charpente",
      "Couverture",
      "Finitions",
      "Nettoyage et réception",
    ],
  },
  {
    trade: "JOINER",
    name: "Menuiserie",
    steps: [
      "Relevé de mesures",
      "Validation des plans",
      "Fabrication",
      "Livraison",
      "Pose",
      "Finitions",
      "Réception",
    ],
  },
  {
    trade: "POOL",
    name: "Piscine",
    steps: [
      "Terrassement",
      "Coque / structure",
      "Plomberie et électricité",
      "Finitions",
      "Mise en eau",
      "Réception",
    ],
  },
  {
    trade: "RENOVATION",
    name: "Rénovation intérieure",
    steps: [
      "Diagnostic",
      "Démolition",
      "Gros œuvre",
      "Réseaux",
      "Isolation et cloisons",
      "Finitions",
      "Réception",
    ],
  },
  {
    trade: "LANDSCAPER",
    name: "Aménagement paysager",
    steps: ["Relevé", "Terrassement", "Réseaux d'arrosage", "Plantations", "Finitions", "Réception"],
  },
];
