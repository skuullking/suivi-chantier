import type { GridPhoto } from "@/components/app/photo-grid";
import { formatDateTime } from "@/lib/format";
import { mediaUrls } from "@/server/services/media";

type MediaRow = Parameters<typeof mediaUrls>[0] & {
  caption: string | null;
  validationStatus: GridPhoto["status"];
  capturedAt: Date | null;
  receivedAt: Date;
  author?: { name: string } | null;
  step?: { title: string } | null;
  site?: { title: string } | null;
};

/** Server → client mapping of photos (signed URLs). */
export function toGridPhotos(rows: MediaRow[], withSite = false): GridPhoto[] {
  return rows
    .filter((m) => m.kind === "PHOTO")
    .map((m) => {
      const urls = mediaUrls(m);
      return {
        id: m.id,
        thumbnail: urls.thumbnail,
        display: urls.display,
        original: urls.original,
        caption: m.caption,
        status: m.validationStatus,
        author: m.author?.name ?? null,
        step: m.step?.title ?? null,
        site: withSite ? (m.site?.title ?? null) : null,
        takenAt: formatDateTime(m.capturedAt ?? m.receivedAt),
        edited: Boolean(m.editedKey),
      };
    });
}
