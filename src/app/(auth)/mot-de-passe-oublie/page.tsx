import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-3xl">
          Mot de passe oublié
        </CardTitle>
        <CardDescription>Recevez un lien pour choisir un nouveau mot de passe.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ForgotPasswordForm />
        <Link href="/connexion" className="text-muted-foreground text-center text-sm hover:underline">
          Retour à la connexion
        </Link>
      </CardContent>
    </Card>
  );
}
