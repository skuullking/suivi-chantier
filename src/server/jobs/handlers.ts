/** Job registry: name → payload type → handler. */
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";
import { generateHandover } from "@/server/services/handover";
import { deliverPendingNotifications } from "@/server/services/notify-channels";
import { runDayBeforeReminders } from "@/server/services/reminders";
import { processDocument } from "@/server/services/document-pipeline";
import { processMedia } from "@/server/services/media";
import { generateDailySummary, runDailySummaries } from "@/server/services/summaries";
import { processInboundWhatsApp, transcribeMedia } from "@/server/services/whatsapp";

export type JobPayloads = {
  "media.process": { mediaId: string };
  "media.transcribe": { mediaId: string };
  "whatsapp.process": { messageLogId: string };
  "document.process": { documentId: string; emailSubject?: string | null; fromName?: string | null };
  "summary.generate": { organizationId: string; siteId: string; dayKey: string };
  "summaries.tick": Record<string, never>;
  "maintenance.daily": Record<string, never>;
  "handover.generate": { organizationId: string; siteId: string; userId: string; signatures: boolean };
  "notifications.deliver": Record<string, never>;
  "reminders.tick": Record<string, never>;
};

export type JobName = keyof JobPayloads;

export const JOB_HANDLERS: { [N in JobName]: (payload: JobPayloads[N]) => Promise<unknown> } = {
  "media.process": ({ mediaId }) => processMedia(mediaId),
  "media.transcribe": ({ mediaId }) => transcribeMedia(mediaId),
  "whatsapp.process": ({ messageLogId }) => processInboundWhatsApp(messageLogId),
  "document.process": ({ documentId, emailSubject, fromName }) =>
    processDocument(documentId, { emailSubject, fromName }),
  "summary.generate": ({ organizationId, siteId, dayKey }) =>
    generateDailySummary(organizationId, siteId, dayKey),
  "summaries.tick": () => runDailySummaries(),
  "maintenance.daily": () => purgeExpiredRateLimits(),
  "handover.generate": (p) => generateHandover(p),
  "notifications.deliver": () => deliverPendingNotifications(),
  "reminders.tick": () => runDayBeforeReminders(),
};
