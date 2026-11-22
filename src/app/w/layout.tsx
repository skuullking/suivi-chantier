import type { Metadata } from "next";
import { requireAuth } from "@/server/auth/context";

export const metadata: Metadata = { title: { default: "Terrain", template: "%s · ChantierLink" } };

export default async function WorkerLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <div className="flex min-h-screen flex-col bg-stone-100">{children}</div>;
}
