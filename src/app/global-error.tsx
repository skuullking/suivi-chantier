"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32, textAlign: "center" }}>
        <h1>Une erreur est survenue</h1>
        <p>
          L&apos;application a rencontré un problème inattendu
          {error.digest ? ` (référence ${error.digest})` : ""}.
        </p>
        <button type="button" onClick={() => reset()} style={{ padding: "10px 16px", marginTop: 16 }}>
          Réessayer
        </button>
      </body>
    </html>
  );
}
