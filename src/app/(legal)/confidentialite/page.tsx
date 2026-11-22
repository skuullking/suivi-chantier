import type { Metadata } from "next";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Politique de confidentialité</h1>
      <p>
        ChantierLink est édité par <mark>[raison sociale]</mark> (« nous »). Cette politique explique quelles
        données personnelles sont traitées, pourquoi, combien de temps, et comment exercer vos droits (RGPD).
      </p>
      <h2>Rôles</h2>
      <ul>
        <li>
          Pour les comptes des entreprises clientes (patron, bureau, ouvriers) : nous sommes{" "}
          <strong>responsable de traitement</strong>.
        </li>
        <li>
          Pour les données des clients finaux des entreprises (particuliers dont on suit le chantier) :
          l&apos;entreprise artisanale est responsable de traitement, nous agissons en{" "}
          <strong>sous-traitant</strong> (article 28 RGPD).
        </li>
      </ul>
      <h2>Données traitées et finalités</h2>
      <ul>
        <li>Compte : nom, e-mail, téléphone, mot de passe (haché) — fournir le service, sécurité.</li>
        <li>
          Chantiers : adresses, planning, étapes, photos, vocaux et leurs transcriptions, documents — suivi de
          chantier.
        </li>
        <li>
          Clients finaux : nom, coordonnées, adresse du chantier — information sur l&apos;avancement des
          travaux.
        </li>
        <li>Journaux techniques et d&apos;audit (adresse IP, actions sensibles) — sécurité, preuve.</li>
        <li>Facturation : formule, statut d&apos;abonnement (le paiement est traité par Stripe).</li>
      </ul>
      <h2>Bases légales</h2>
      <p>
        Exécution du contrat (service), intérêt légitime (sécurité, amélioration), obligation légale
        (conservation des factures), consentement du client final pour l&apos;envoi de nouvelles de son
        chantier.
      </p>
      <h2>Durées de conservation</h2>
      <ul>
        <li>
          Documents comptables : 10 ans. Photos et documents de chantier : 10 ans par défaut (garantie
          décennale), réglable.
        </li>
        <li>
          Comptes : durée de l&apos;abonnement, puis suppression sur demande ou après <mark>[durée]</mark>{" "}
          d&apos;inactivité.
        </li>
        <li>
          Journaux de sécurité : <mark>[12 mois]</mark>.
        </li>
      </ul>
      <h2>Destinataires et sous-traitants</h2>
      <p>
        Hébergement et stockage dans l&apos;Union européenne : <mark>[hébergeur]</mark>,{" "}
        <mark>[stockage]</mark>. Envoi d&apos;e-mails : <mark>[prestataire]</mark>. Messagerie WhatsApp (Meta)
        si l&apos;entreprise l&apos;active. Transcription et intelligence artificielle :{" "}
        <mark>[prestataires, localisation, garanties]</mark> — désactivables. Paiement : Stripe.
      </p>
      <h2>Vos droits</h2>
      <p>
        Accès, rectification, effacement, limitation, opposition, portabilité : écrivez à{" "}
        <mark>[e-mail DPO]</mark>. Les entreprises peuvent exporter et supprimer leurs données depuis
        Paramètres › Données et RGPD. Vous pouvez saisir la CNIL (cnil.fr).
      </p>
      <h2>Cookies</h2>
      <p>
        Un seul cookie, strictement nécessaire : la session de connexion. Aucun cookie publicitaire ni de
        mesure d&apos;audience tiers.
      </p>
    </>
  );
}
