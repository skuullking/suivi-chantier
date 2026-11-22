import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ChantierLink", template: "%s · ChantierLink" },
  description:
    "Le dossier chantier ultra-simple des artisans du bâtiment : photos, documents, planning et suivi client au même endroit.",
  applicationName: "ChantierLink",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "ChantierLink", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#c2410c",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page dynamic, which the CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col" data-nonce-ready={nonce ? "1" : "0"}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
