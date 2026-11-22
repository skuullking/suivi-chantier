import { Camera, Inbox } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { toGridPhotos } from "@/components/app/photo-data";
import { PhotoGrid } from "@/components/app/photo-grid";
import { requireManager } from "@/server/auth/context";
import { can } from "@/server/permissions/can";
import { pendingPhotos } from "@/server/services/media";

export const metadata: Metadata = { title: "À traiter" };

export default async function InboxPage() {
  const ctx = await requireManager();
  const canValidate = can(ctx.actor, "media.validate", { organizationId: ctx.organizationId });
  const photos = canValidate ? await pendingPhotos(ctx) : [];

  return (
    <>
      <PageHeader
        title="À traiter"
        description="Photos à valider, éléments reçus à classer et résumés du jour à approuver."
      />
      <section className="grid gap-3" aria-labelledby="photos-title">
        <h2 id="photos-title" className="flex items-center gap-2 text-lg font-semibold">
          <Camera className="size-5 text-orange-700" aria-hidden /> Photos à valider ({photos.length})
        </h2>
        {!canValidate ? (
          <p className="text-muted-foreground text-sm">La validation des photos est réservée au patron.</p>
        ) : photos.length === 0 ? (
          <EmptyState icon={Inbox} title="Aucune photo à valider" description="Tout est à jour." />
        ) : (
          <PhotoGrid photos={toGridPhotos(photos, true)} canValidate />
        )}
      </section>
    </>
  );
}
