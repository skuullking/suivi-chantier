import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-ink-50 min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo />
          <nav className="text-ink-600 flex gap-4 text-sm">
            <Link href="/mentions-legales" className="hover:underline">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="hover:underline">
              Confidentialité
            </Link>
            <Link href="/cgu" className="hover:underline">
              CGU
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="text-ink-800 [&_mark]:bg-signal-100 grid gap-4 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_mark]:rounded [&_mark]:px-1">
          <p className="border-signal-200 bg-signal-50 text-ink-900 rounded-lg border p-3 text-sm">
            Page modèle : les passages <mark>surlignés</mark> sont à compléter avec les informations de votre
            entreprise et à faire relire par un professionnel.
          </p>
          {children}
        </article>
      </main>
    </div>
  );
}
