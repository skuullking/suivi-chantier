import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/context";
import { uploadTargets } from "@/server/services/worker";
import { VoiceRecorder } from "./recorder";

export const metadata: Metadata = { title: "Vocal" };

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ chantier?: string }> }) {
  const ctx = await requireAuth();
  const { chantier } = await searchParams;
  const targets = await uploadTargets(ctx);
  if (targets.length === 0) {
    return (
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <p className="text-lg font-semibold">Aucun chantier pour l&apos;instant.</p>
      </div>
    );
  }
  const initial = targets.find((t) => t.id === chantier) ?? targets[0]!;
  return <VoiceRecorder targets={targets} initialSiteId={initial.id} />;
}
