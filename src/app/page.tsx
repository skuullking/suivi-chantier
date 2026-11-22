import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/server/services/plan-limits";

const FEATURES = [
  {
    title: "Le terrain parle, ça se range",
    text: "Photos, vocaux et « j'arrive » partent de l'appli ou de WhatsApp, même sans réseau. ChantierLink trouve le bon chantier et la bonne étape.",
  },
  {
    title: "Le client suit sans appeler",
    text: "Un lien privé, sans compte ni mot de passe : avancement, photos validées, prochaines interventions.",
  },
  {
    title: "La paperasse se classe",
    text: "Transférez devis et factures à votre adresse dédiée : ils sont lus, rangés et retrouvables. Le dossier de fin de chantier se fait tout seul.",
  },
  {
    title: "Le point du jour s'écrit seul",
    text: "Chaque soir, un court message pour le client est préparé. Vous relisez, vous envoyez.",
  },
  {
    title: "Pensé pour les gants",
    text: "Gros boutons, gros contrastes, utilisable en plein soleil sur le chantier.",
  },
  {
    title: "Toute l'équipe, simplement",
    text: "Planning de la semaine, consignes d'accès, tâches du jour : chacun voit ce qui le concerne.",
  },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ compte?: string }> }) {
  const { compte } = await searchParams;
  return (
    <div className="bg-background flex min-h-screen flex-col">
      {compte === "supprime" ? (
        <p className="bg-emerald-100 px-4 py-3 text-center text-sm text-emerald-900" role="status">
          Votre compte a été supprimé, ainsi que toutes ses données. Merci d&apos;avoir utilisé ChantierLink.
        </p>
      ) : null}
      <header className="mx-auto flex w-full max-w-[1240px] flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <Logo />
        <nav aria-label="Compte" className="flex items-center gap-2">
          <Button asChild variant="ghost">
            <Link href="/connexion">Se connecter</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/inscription">Essai gratuit</Link>
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-12 px-4 pt-10 pb-20 sm:px-8 lg:pt-16">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-6">
            <p className="label-mono bg-signal-400 self-start rounded-lg px-2.5 py-1.5 text-xs">
              Charpentiers · menuisiers · rénovateurs · paysagistes
            </p>
            <h1 className="text-ink-900 text-[clamp(2.75rem,6vw,5.25rem)] leading-[0.95] font-extrabold tracking-[-0.045em]">
              Le dossier chantier qui fait taire le téléphone.
            </h1>
            <p className="text-ink-700 max-w-xl text-lg leading-relaxed">
              Vos gars envoient une photo, le chantier se tient à jour. Vos clients suivent l&apos;avancement
              sans appeler, et la paperasse se range toute seule.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-14 border-2 px-6 text-base">
                <Link href="/inscription">Essayer 14 jours gratuitement</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-ink-900 h-14 border-2 px-6 text-base"
              >
                <Link href="/connexion">J&apos;ai déjà un compte</Link>
              </Button>
            </div>
            <p className="text-ink-600 text-sm">Sans carte bancaire. Prêt en 10 minutes.</p>
          </div>

          <div
            aria-label="Exemple d'échange WhatsApp avec ChantierLink"
            role="img"
            className="bg-ink-900 flex w-full max-w-[460px] flex-[1_1_360px] flex-col gap-3.5 rounded-3xl p-6 text-white"
          >
            <span className="label-mono text-ink-400">WhatsApp · Jean, ouvrier</span>
            <div className="bg-ink-800 ml-auto flex w-[78%] flex-col gap-2 rounded-2xl rounded-br-sm p-2">
              <div className="h-36 rounded-xl bg-[#4e5a63]" />
              <span className="px-1 pb-0.5 text-[15px]">Fermes posées côté sud</span>
            </div>
            <div className="bg-signal-400 text-ink-900 mr-auto max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-3">
              <p className="font-bold">Reçu ✅</p>
              <p className="text-sm">Chantier Dupont, étape Pose charpente.</p>
            </div>
            <div className="bg-ink-800 ml-auto max-w-[82%] rounded-2xl rounded-br-sm px-4 py-2.5 text-[15px]">
              Problème : une panne est fendue sur 40 cm
            </div>
            <div className="bg-signal-400 text-ink-900 mr-auto max-w-[82%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm">
              Noté, le bureau est prévenu. Le client ne le verra pas.
            </div>
          </div>
        </section>

        <section className="bg-ink-900 text-ink-200" aria-labelledby="features-title">
          <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-8">
            <h2 id="features-title" className="sr-only">
              Ce que fait ChantierLink
            </h2>
            <div className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f, i) => (
                <div key={f.title} className="flex flex-col gap-3">
                  <span className="text-signal-400 font-mono text-sm font-bold">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-[1.75rem] leading-tight font-extrabold text-white">{f.title}</h3>
                  <p className="leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-6 px-4 py-16 sm:px-8">
          <h2 className="flex-[1_1_480px] text-[2.75rem] leading-none font-extrabold tracking-[-0.04em]">
            Dès {PLANS.SOLO.priceEurosPerMonth} € HT par mois.
            <br />
            <span className="text-ink-600">14 jours pour essayer.</span>
          </h2>
          <ul className="flex flex-wrap gap-2.5">
            {Object.values(PLANS).map((p) => (
              <li
                key={p.id}
                className={
                  p.id === "TEAM"
                    ? "bg-signal-400 border-ink-900 label-mono rounded-[10px] border px-3.5 py-2.5 text-[13px]"
                    : "border-ink-900 label-mono rounded-[10px] border px-3.5 py-2.5 text-[13px]"
                }
              >
                {p.name} {p.priceEurosPerMonth} €
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-ink-200 border-t">
        <div className="text-ink-600 mx-auto flex max-w-[1240px] flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:justify-between sm:px-8">
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
