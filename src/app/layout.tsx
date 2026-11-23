import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/app/navigation-feedback";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const ui = Geist({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const code = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-code",
  display: "swap",
});

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
  themeColor: "#121212",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers makes every page dynamic, which the CSP nonce requires.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" className={`h-full antialiased ${display.variable} ${ui.variable} ${code.variable}`}>
      <body className="flex min-h-full flex-col" data-nonce-ready={nonce ? "1" : "0"}>
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
