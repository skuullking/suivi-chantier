import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="bg-ink-50 flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark className="size-12" />
      <h1 className="text-2xl font-bold">Page introuvable</h1>
      <p className="text-muted-foreground max-w-md">
        Cette page n&apos;existe pas ou vous n&apos;y avez pas accès.
      </p>
      <Button asChild>
        <Link href="/">Retour à l&apos;accueil</Link>
      </Button>
    </main>
  );
}
