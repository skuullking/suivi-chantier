import type { DocumentType } from "@/generated/prisma/enums";
import type { Resolution, SiteCandidate } from "@/server/domain/site-resolver";
import type { DaySummaryInput } from "@/server/domain/summary-heuristics";

export type ResolveSiteInput = {
  senderName: string;
  text: string | null;
  mediaKind: "PHOTO" | "VOICE" | "TEXT" | "DOCUMENT";
  gps: { lat: number; lng: number } | null;
  candidates: SiteCandidate[];
};

export type DocumentCandidate = { id: string; label: string };

export type ClassifyDocumentInput = {
  fileName: string;
  text: string;
  emailSubject?: string | null;
  sites: (DocumentCandidate & { clientId: string })[];
  clients: DocumentCandidate[];
};

export type DocumentClassification = {
  type: DocumentType;
  supplier: string | null;
  documentDate: string | null;
  amountCents: number | null;
  siteId: string | null;
  clientId: string | null;
  confidence: number;
  reason: string;
};

export interface LlmProvider {
  readonly name: string;
  resolveSite(input: ResolveSiteInput): Promise<Resolution>;
  summarizeDay(input: DaySummaryInput): Promise<string>;
  classifyDocument(input: ClassifyDocumentInput): Promise<DocumentClassification>;
}
