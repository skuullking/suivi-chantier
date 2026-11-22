import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getAuthContext, homePathForRole } from "@/server/auth/context";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Connexion" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; reinitialise?: string }>;
}) {
  const ctx = await getAuthContext();
  if (ctx) redirect(homePathForRole(ctx.role));
  const params = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h1" className="text-xl">
          Connexion
        </CardTitle>
        <CardDescription>Accédez à vos chantiers.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <SignInForm next={params.suite} resetDone={params.reinitialise === "1"} />
        <div className="flex flex-col gap-2 text-center text-sm">
          <Link href="/mot-de-passe-oublie" className="text-muted-foreground hover:underline">
            Mot de passe oublié ?
          </Link>
          <span className="text-muted-foreground">
            Pas encore de compte ?{" "}
            <Link href="/inscription" className="text-primary font-medium hover:underline">
              Créer mon entreprise
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
