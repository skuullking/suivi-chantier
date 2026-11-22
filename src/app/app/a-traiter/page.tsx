import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/app/page-header";
import { requireManager } from "@/server/auth/context";

export const metadata: Metadata = { title: "À traiter" };

export default async function InboxPage() {
  await requireManager();
  return (
    <>
      <PageHeader
        title="À traiter"
        description="Photos à valider, éléments reçus à classer et résumés du jour à approuver."
      />
      <EmptyState icon={Inbox} title="Rien à traiter" description="Tout est à jour." />
    </>
  );
}
