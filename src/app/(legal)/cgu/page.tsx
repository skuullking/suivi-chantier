import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conditions générales d'utilisation" };

export default function TermsPage() {
  return (
    <>
      <h1>Conditions générales d&apos;utilisation et de vente</h1>
      <h2>1. Objet</h2>
      <p>
        ChantierLink est un logiciel en ligne de suivi de chantier destiné aux professionnels du bâtiment. Les
        présentes conditions régissent son utilisation et l&apos;abonnement.
      </p>
      <h2>2. Compte et accès</h2>
      <p>
        Le titulaire du compte (« patron ») est responsable des accès qu&apos;il accorde à son équipe et des
        contenus déposés. Les identifiants sont personnels et confidentiels.
      </p>
      <h2>3. Formules et prix</h2>
      <p>
        Solo 29 € HT / mois, Équipe 59 € HT / mois (jusqu&apos;à 5 employés), Pro 99 € HT / mois (au-delà).
        Essai gratuit de 14 jours sans engagement. Paiement mensuel par carte, résiliable à tout moment depuis
        l&apos;espace abonnement ; la résiliation prend effet à la fin de la période en cours.{" "}
        <mark>[Conditions de remboursement, révision des prix]</mark>
      </p>
      <h2>4. Données</h2>
      <p>
        Les données restent la propriété du client ; elles sont exportables à tout moment (CSV, ZIP). Nous
        traitons les données des clients finaux en qualité de sous-traitant, conformément à la politique de
        confidentialité et à l&apos;accord de traitement des données <mark>[annexe DPA]</mark>.
      </p>
      <h2>5. Documents générés</h2>
      <p>
        Les résumés et dossiers de fin de chantier sont des documents récapitulatifs, sans valeur juridique de
        procès-verbal de réception. Les propositions de l&apos;intelligence artificielle (classement, résumés)
        sont relues par l&apos;utilisateur.
      </p>
      <h2>6. Disponibilité et responsabilité</h2>
      <p>
        Le service est fourni avec une obligation de moyens.{" "}
        <mark>[Engagement de disponibilité, sauvegardes, limites de responsabilité]</mark>
      </p>
      <h2>7. Droit applicable</h2>
      <p>
        Droit français. Tribunal compétent : <mark>[ville]</mark>.
      </p>
    </>
  );
}
