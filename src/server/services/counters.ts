/** Counters shown on several parts of the same page (layout badges + dashboard), memoized per request. */
import { cache } from "react";
import { db } from "@/server/db";

export const pendingPhotoCount = cache((organizationId: string) =>
  db.media.count({ where: { organizationId, kind: "PHOTO", validationStatus: "PENDING" } }),
);

export const openInboxCount = cache((organizationId: string) =>
  db.inboxItem.count({ where: { organizationId, status: "OPEN" } }),
);
