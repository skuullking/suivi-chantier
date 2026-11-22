/** Local (no AI) writing of the client daily summary: 2-4 warm sentences, no jargon, no internal detail. */

export type DaySummaryInput = {
  organizationName: string;
  siteTitle: string;
  clientName: string;
  dateLabel: string;
  completedSteps: string[];
  currentStep: string | null;
  nextSteps: string[];
  photoCaptions: string[];
  photoCount: number;
  /** Client-visible notes and voice transcriptions (problems and internal notes are never passed). */
  updates: string[];
};

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} et ${items.at(-1)}`;
}

function lowerFirst(s: string) {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function heuristicDaySummary(input: DaySummaryInput): string {
  const sentences: string[] = [];
  const completed = input.completedSteps.map((s) => `« ${lowerFirst(s)} »`);
  if (completed.length === 1) {
    sentences.push(`Bonne nouvelle : l'étape ${completed[0]} est terminée sur votre chantier.`);
  } else if (completed.length > 1) {
    sentences.push(`Bonne nouvelle : les étapes ${list(completed)} sont terminées sur votre chantier.`);
  } else if (input.currentStep) {
    sentences.push(
      `Aujourd'hui, l'équipe a avancé sur l'étape « ${lowerFirst(input.currentStep)} » de votre chantier.`,
    );
  } else {
    sentences.push("Aujourd'hui, l'équipe était présente sur votre chantier.");
  }
  const captions = input.photoCaptions.filter(Boolean).slice(0, 2);
  if (captions.length) {
    sentences.push(`Au programme de la journée : ${list(captions.map(lowerFirst))}.`);
  }
  if (input.photoCount > 0) {
    sentences.push(
      `${input.photoCount > 1 ? `${input.photoCount} nouvelles photos sont disponibles` : "Une nouvelle photo est disponible"} dans votre espace de suivi.`,
    );
  }
  if (input.nextSteps.length) {
    sentences.push(`Prochaine étape : ${lowerFirst(input.nextSteps[0]!)}.`);
  }
  return sentences.slice(0, 4).join(" ");
}
