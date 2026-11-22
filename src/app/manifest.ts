import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChantierLink",
    short_name: "ChantierLink",
    description: "Le dossier chantier des artisans : photos, vocaux, étapes et suivi client.",
    start_url: "/w",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f0efea",
    theme_color: "#121212",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
