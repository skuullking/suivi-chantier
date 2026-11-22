import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/labels";
import { findPendingInvitation } from "@/server/services/team";
import { AcceptInvitationForm } from "./accept-invitation-form";

export const metadata: Metadata = { title: "Invitation", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await findPendingInvitation(token);
  if (!found) {
    return (
      <Card>
        <CardHeader>
          <CardTitle as="h1" className="text-xl">
            Invitation expirée
          </CardTitle>
          <CardDescription>
            Ce lien n&apos;est plus valable. Demandez à votre entreprise de vous renvoyer une invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/connexion">Aller à la connexion</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  const { invitation, existingUser } = found;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Rejoindre {invitation.organization.name}
        </CardTitle>
        <CardDescription>
          Vous êtes invité en tant que <strong>{ROLE_LABELS[invitation.role].toLowerCase()}</strong> avec
          l&apos;adresse {invitation.email}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AcceptInvitationForm token={token} defaultName={invitation.name ?? ""} existingUser={existingUser} />
      </CardContent>
    </Card>
  );
}
