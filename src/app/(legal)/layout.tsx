import Link from "next/link";
import { Logo } from "@/components/brand/logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Logo />
          <nav className="flex gap-4 text-sm text-stone-600">
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
        <article className="grid gap-4 text-stone-800 [&_h1]:text-3xl [&_h1]:font-bold [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_mark]:rounded [&_mark]:bg-amber-100 [&_mark]:px-1">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Page modèle : les passages <mark>surlignés</mark> sont à compléter avec les informations de votre
            entreprise et à faire relire par un professionnel.
          </p>
          {children}
        </article>
      </main>
    </div>
  );
}
