import { requireAuth } from "@/server/auth/context";
import { signOutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

export default async function WorkerTodayPage() {
  const ctx = await requireAuth();
  return (
    <main className="mx-auto w-full max-w-lg flex-1 p-4">
      <h1 className="text-2xl font-bold">Bonjour {ctx.user.name.split(" ")[0]}</h1>
      <p className="mt-2 text-stone-600">Vos chantiers du jour s&apos;afficheront ici.</p>
      <form action={signOutAction} className="mt-8">
        <Button type="submit" variant="outline" className="h-14 w-full text-base">
          Se déconnecter
        </Button>
      </form>
    </main>
  );
}
