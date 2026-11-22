import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen flex-col lg:flex-row">
      <aside className="bg-ink-900 flex flex-col justify-between text-white lg:sticky lg:top-0 lg:h-screen lg:w-[44%]">
        <div className="flex flex-col gap-8 px-6 pt-6 pb-8 lg:px-12 lg:pt-12">
          <Logo tone="light" />
          <p
            aria-hidden
            className="font-heading hidden max-w-md text-[clamp(2.5rem,4.5vw,4.25rem)] leading-[0.95] font-extrabold tracking-[-0.045em] lg:block"
          >
            Vos chantiers, suivis depuis le terrain.
          </p>
        </div>
        <div aria-hidden className="bg-signal-400 h-2 lg:h-3" />
      </aside>
      <main className="flex flex-1 items-start justify-center px-4 py-10 lg:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
