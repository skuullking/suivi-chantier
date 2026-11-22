import { Camera, FileStack, Link2, Mic, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Link2,
    title: "Vos clients suivent leur chantier",
    text: "Un lien magique, sans compte ni mot de passe : avancement, photos validées, prochaines interventions.",
  },
  {
    icon: Camera,
    title: "Photos et vocaux classés tout seuls",
    text: "Vos ouvriers envoient depuis le chantier ou par WhatsApp. Tout arrive au bon endroit, à la bonne étape.",
  },
  {
    icon: FileStack,
    title: "La paperasse au même endroit",
    text: "Devis, factures, bons de commande, notes de frais : tous vos documents chantier conservés et retrouvables.",
  },
  {
    icon: Sparkles,
    title: "Le résumé du jour s'écrit seul",
    text: "Chaque soir, un court message pour le client est préparé. Vous validez en un clic.",
  },
  {
    icon: Mic,
    title: "Pensé pour le terrain",
    text: "Gros boutons, utilisable avec des gants, et ça marche même sans réseau.",
  },
  {
    icon: Users,
    title: "Toute l'équipe, simplement",
    text: "Planning de la semaine, consignes, tâches du jour : chacun voit ce qui le concerne.",
  },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ compte?: string }> }) {
  const { compte } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      {compte === "supprime" ? (
        <p className="bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900" role="status">
          Votre compte a été supprimé, ainsi que toutes ses données. Merci d&apos;avoir utilisé ChantierLink.
        </p>
      ) : null}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/connexion">Se connecter</Link>
          </Button>
          <Button asChild>
            <Link href="/inscription">Essai gratuit</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <p className="mb-4 inline-block rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-800">
            Pour charpentiers, menuisiers, piscinistes, rénovateurs, paysagistes
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl">
            Le dossier chantier qui fait taire le téléphone.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-600">
            Fini les clients qui appellent pour savoir où en est le chantier, les photos en vrac sur WhatsApp
            et la paperasse dispersée. ChantierLink range tout, et vos clients suivent l&apos;avancement en
            direct.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/inscription">Créer mon compte — 14 jours gratuits</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <Link href="/connexion">J&apos;ai déjà un compte</Link>
            </Button>
          </div>
          <p className="mt-3 text-sm text-stone-500">Sans carte bancaire. Prêt en 10 minutes.</p>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border bg-white p-6 shadow-sm">
              <f.icon className="mb-3 size-6 text-orange-700" aria-hidden />
              <h2 className="font-semibold text-stone-900">{f.title}</h2>
              <p className="mt-2 text-sm text-stone-600">{f.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:justify-between">
          <span>© {new Date().getFullYear()} ChantierLink — hébergé dans l&apos;Union européenne</span>
          <span className="flex gap-4">
            <Link href="/mentions-legales" className="hover:underline">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:underline">
              Confidentialité
            </Link>
            <Link href="/cgu" className="hover:underline">
              CGU
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
