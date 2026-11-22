import type { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/server/auth/context";
import { uploadTargets } from "@/server/services/worker";
import { CameraCapture } from "./camera";

export const metadata: Metadata = { title: "Photo" };

export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ chantier?: string }> }) {
  const ctx = await requireAuth();
  const { chantier } = await searchParams;
  const targets = await uploadTargets(ctx);
  if (targets.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-lg font-semibold">Aucun chantier pour l&apos;instant.</p>
        <p className="text-stone-600">
          Demandez au bureau de vous ajouter à l&apos;équipe d&apos;un chantier.
        </p>
        <Link href="/w" className="mt-4 inline-block font-semibold text-orange-700 underline">
          Retour
        </Link>
      </div>
    );
  }
  const initial = targets.find((t) => t.id === chantier) ?? targets[0]!;
  return <CameraCapture targets={targets} initialSiteId={initial.id} />;
}
