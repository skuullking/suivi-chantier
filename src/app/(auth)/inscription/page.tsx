import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext, homePathForRole } from "@/server/auth/context";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Créer mon compte" };

export default async function SignUpPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect(homePathForRole(ctx.role));
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-3xl">
          Créer mon entreprise
        </CardTitle>
        <CardDescription>14 jours d&apos;essai gratuit, sans carte bancaire.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SignUpForm />
        <p className="text-muted-foreground text-center text-sm">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="text-ink-900 font-semibold underline">
            Se connecter
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
