import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/labels";
import { requireOwner } from "@/server/auth/context";
import { listTeam } from "@/server/services/team";
import { InviteForm } from "./invite-form";
import { MemberRow, PendingInvitationRow } from "./member-rows";

export const metadata: Metadata = { title: "Équipe" };

export default async function TeamPage() {
  const ctx = await requireOwner();
  const { members, invitations } = await listTeam(ctx);
  return (
    <>
      <PageHeader
        title="Équipe"
        description="Membres, rôles et invitations. Chaque membre se connecte avec son e-mail."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Membres ({members.length})</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  membershipId={m.id}
                  name={m.user.name}
                  email={m.user.email}
                  phone={m.user.phone}
                  role={m.role}
                  whatsapp={m.user.whatsappContacts[0]?.phoneE164 ?? null}
                  lastLogin={m.user.lastLoginAt ? formatDate(m.user.lastLoginAt) : null}
                  isSelf={m.userId === ctx.userId}
                />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Invitations en attente</CardTitle>
              <CardDescription>Les liens d&apos;invitation sont valables 7 jours.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {invitations.length === 0 ? (
                <p className="text-muted-foreground px-6 pb-6 text-sm">Aucune invitation en attente.</p>
              ) : (
                invitations.map((inv) => (
                  <PendingInvitationRow
                    key={inv.id}
                    invitationId={inv.id}
                    email={inv.email}
                    roleLabel={ROLE_LABELS[inv.role]}
                    expires={formatDate(inv.expiresAt)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Inviter un membre</CardTitle>
            <CardDescription>
              Un e-mail avec un lien est envoyé. Vous pouvez aussi copier le lien et l&apos;envoyer par SMS.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InviteForm />
            <div className="mt-4 flex flex-wrap gap-1">
              {(["OWNER", "OFFICE", "WORKER"] as const).map((r) => (
                <Badge key={r} variant="secondary">
                  {ROLE_LABELS[r]}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
