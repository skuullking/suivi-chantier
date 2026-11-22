import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-stone-50 px-4 py-10">
      <Logo className="mb-8" />
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
