"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Oups, un problème est survenu</h1>
      <p className="text-muted-foreground max-w-md">
        Rien n&apos;est perdu. Réessayez dans un instant ; si le problème persiste, contactez le support
        {error.digest ? ` (référence ${error.digest})` : ""}.
      </p>
      <div className="flex gap-2">
        <Button onClick={() => reset()}>Réessayer</Button>
        <Button variant="outline" asChild>
          <Link href="/">Accueil</Link>
        </Button>
      </div>
    </main>
  );
}
