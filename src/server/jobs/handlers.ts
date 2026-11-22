/** Job registry: name → payload type → handler. */
import { processMedia } from "@/server/services/media";

export type JobPayloads = {
  "media.process": { mediaId: string };
};

export type JobName = keyof JobPayloads;

export const JOB_HANDLERS: { [N in JobName]: (payload: JobPayloads[N]) => Promise<unknown> } = {
  "media.process": ({ mediaId }) => processMedia(mediaId),
};
