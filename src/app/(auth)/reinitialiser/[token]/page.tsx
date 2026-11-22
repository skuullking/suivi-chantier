import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isResetTokenValid } from "@/server/services/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nouveau mot de passe", robots: { index: false } };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await isResetTokenValid(token);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Nouveau mot de passe
        </CardTitle>
        {valid ? (
          <CardDescription>Choisissez un mot de passe d&apos;au moins 10 caractères.</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        {valid ? (
          <ResetPasswordForm token={token} />
        ) : (
          <>
            <p className="text-muted-foreground text-sm">Ce lien a expiré ou a déjà été utilisé.</p>
            <Button asChild>
              <Link href="/mot-de-passe-oublie">Refaire une demande</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
