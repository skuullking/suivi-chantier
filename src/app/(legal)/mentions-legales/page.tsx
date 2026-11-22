import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mentions légales" };

export default function LegalNoticePage() {
  return (
    <>
      <h1>Mentions légales</h1>
      <h2>Éditeur du service</h2>
      <p>
        <mark>[Raison sociale]</mark>, <mark>[forme juridique]</mark> au capital de <mark>[montant] €</mark>,
        immatriculée au RCS de <mark>[ville]</mark> sous le numéro <mark>[SIREN]</mark>, dont le siège est
        situé <mark>[adresse]</mark>. TVA intracommunautaire : <mark>[numéro]</mark>.
      </p>
      <p>
        Directeur de la publication : <mark>[nom]</mark>. Contact : <mark>[e-mail]</mark> —{" "}
        <mark>[téléphone]</mark>.
      </p>
      <h2>Hébergement</h2>
      <p>
        Le service est hébergé dans l&apos;Union européenne par <mark>[hébergeur, adresse]</mark>. Les
        fichiers sont stockés chez <mark>[fournisseur de stockage S3, pays]</mark>.
      </p>
      <h2>Propriété intellectuelle</h2>
      <p>
        Les éléments du service (marque, logiciels, textes, visuels) sont protégés. Les contenus déposés par
        les utilisateurs (photos, documents) restent leur propriété.
      </p>
    </>
  );
}
