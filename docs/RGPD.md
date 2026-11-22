# RGPD — registre des traitements et fonctionnement

Ce document décrit les données personnelles traitées par ChantierLink et les mécanismes prévus pour respecter le
RGPD. Il sert de base au registre des traitements de l'éditeur et à l'accord de sous-traitance (DPA) proposé aux
entreprises clientes. Les passages entre crochets sont à compléter.

## 1. Rôles

| Données                                                        | Responsable de traitement | ChantierLink            |
| -------------------------------------------------------------- | ------------------------- | ----------------------- |
| Comptes utilisateurs (patron, bureau, ouvriers), facturation   | Éditeur de ChantierLink   | Responsable             |
| Clients finaux, chantiers, photos, vocaux, documents, messages | L'entreprise artisanale   | Sous-traitant (art. 28) |

## 2. Registre des traitements

| #   | Traitement                  | Personnes                      | Données                                                                                                           | Finalité                        | Base légale                           | Durée de conservation                                                           |
| --- | --------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Comptes et authentification | Utilisateurs                   | nom, e-mail, téléphone, mot de passe haché (argon2id), sessions (empreinte SHA-256), IP de connexion              | Fournir le service, sécurité    | Contrat                               | Durée du compte ; sessions 30 jours                                             |
| 2   | Gestion des clients         | Clients finaux                 | nom, société, e-mails, téléphones, adresses, notes, consentement aux communications                               | Suivi commercial et de chantier | Contrat (entreprise ↔ client)         | Réglable, 10 ans par défaut ; anonymisation possible                            |
| 3   | Suivi de chantier           | Clients, ouvriers              | adresses, planning, étapes, notes, photos (EXIF/GPS conservés sur l'original seulement), vocaux et transcriptions | Exécution et preuve des travaux | Contrat, intérêt légitime             | 10 ans par défaut (garantie décennale), réglable, purge automatique optionnelle |
| 4   | Documents                   | Clients, fournisseurs          | devis, factures, bons de commande, notes de frais, texte extrait (OCR)                                            | Gestion administrative          | Obligation légale (comptabilité)      | 10 ans minimum (factures)                                                       |
| 5   | Portail client              | Clients finaux                 | accès via lien (empreinte du jeton, dernier accès, nombre de visites)                                             | Information sur l'avancement    | Contrat                               | Jusqu'à révocation / expiration du lien                                         |
| 6   | Messagerie WhatsApp         | Ouvriers (et numéros inconnus) | numéro, contenu des messages, médias                                                                              | Remontées terrain               | Intérêt légitime / contrat de travail | Journal technique 12 mois [à confirmer] ; médias selon #3                       |
| 7   | E-mails entrants            | Expéditeurs                    | adresse, objet, corps, pièces jointes                                                                             | Classement des documents        | Intérêt légitime                      | Selon #4                                                                        |
| 8   | Notifications               | Utilisateurs                   | type, contenu, abonnements push (endpoint)                                                                        | Information                     | Contrat                               | 2 ans [à confirmer]                                                             |
| 9   | Journal d'audit             | Utilisateurs                   | action, date, IP, éléments modifiés                                                                               | Sécurité, preuve                | Intérêt légitime                      | Durée du compte [à confirmer]                                                   |
| 10  | Abonnement                  | Entreprises                    | formule, statut, identifiants client Stripe                                                                       | Facturation                     | Contrat, obligation légale            | 10 ans (pièces comptables)                                                      |

## 3. Sous-traitants ultérieurs (à adapter au déploiement)

| Service                                           | Usage                      | Localisation                             | Optionnel                  |
| ------------------------------------------------- | -------------------------- | ---------------------------------------- | -------------------------- |
| Hébergeur [nom]                                   | Serveurs, base de données  | UE                                       | Non                        |
| Stockage S3 [Scaleway / OVH / MinIO auto-hébergé] | Fichiers                   | UE                                       | Non                        |
| Prestataire SMTP [nom]                            | E-mails sortants           | UE                                       | Non                        |
| Meta (WhatsApp Cloud API)                         | Réception / envoi WhatsApp | Monde (clauses contractuelles types)     | Oui                        |
| Anthropic (Claude)                                | Classement, résumés        | États-Unis (DPA, CCT)                    | Oui — désactivé par défaut |
| OpenAI ou serveur Whisper                         | Transcription              | Selon choix (auto-hébergeable dans l'UE) | Oui                        |
| Stripe                                            | Paiement                   | UE / États-Unis (CCT)                    | Oui                        |

Sans configuration, aucune donnée n'est envoyée à ces services : tout est simulé localement.

## 4. Mesures de sécurité

- Contrôle d'accès côté serveur sur chaque action (module `can`), isolation stricte par entreprise, tests dédiés
  (accès inter-entreprises, ouvrier non affecté).
- Mots de passe hachés argon2id ; jetons (session, invitation, réinitialisation, lien client) aléatoires et stockés
  sous forme d'empreinte ; liens clients révocables et expirables ; limitation de débit (connexion, liens clients,
  webhooks).
- Fichiers jamais publics : URL signées à durée limitée ; le client ne reçoit que des versions d'affichage dont les
  métadonnées (EXIF, GPS) sont supprimées ; contrôle du type réel des fichiers.
- En-têtes de sécurité (CSP à nonce, HSTS, X-Frame-Options, nosniff, Referrer-Policy), protection CSRF.
- Journal d'audit des actions sensibles ; sauvegardes chiffrables et restauration testée.

## 5. Droits des personnes — comment faire dans l'application

| Droit                              | Où                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Accès / portabilité (client final) | Fiche client › Données personnelles › « Exporter ses données (ZIP) »                                                  |
| Effacement (client final)          | Fiche client › « Anonymiser » (conserve les pièces comptables) ou « Supprimer toutes ses données »                    |
| Rectification                      | Fiche client › Modifier la fiche                                                                                      |
| Opposition aux communications      | Fiche client : case « accepte de recevoir des nouvelles du chantier » ; sans elle, aucun e-mail de suivi n'est envoyé |
| Portabilité (entreprise)           | Paramètres › Données et RGPD › « Télécharger l'export complet » (JSON + fichiers)                                     |
| Effacement (entreprise)            | Paramètres › Données et RGPD › « Supprimer le compte » (nom + mot de passe)                                           |
| Limitation de la conservation      | Paramètres › Données et RGPD › durées de conservation + purge automatique                                             |

Chaque export, anonymisation et suppression est tracé dans le journal d'audit.

## 6. Durées de conservation

- Documents comptables : **10 ans minimum** (l'application refuse une durée inférieure).
- Photos et documents de chantier : **10 ans par défaut** (garantie décennale), réglable de 1 à 30 ans.
- Purge automatique **désactivée par défaut** ; une fois activée, le worker supprime chaque nuit les médias et
  documents plus anciens que la durée choisie (journalisé).
- Liens client : jusqu'à révocation ou date d'expiration choisie.

## 7. Cookies

Un seul cookie, strictement nécessaire (session `cl_session`, httpOnly, SameSite=Lax, Secure en HTTPS). Pas de
mesure d'audience ni de publicité : aucun bandeau de consentement n'est requis.

## 8. Violation de données

Procédure : [contact sécurité], évaluation sous 24 h, notification à la CNIL sous 72 h si risque, information des
entreprises clientes (responsables de traitement) sans délai injustifié. Le journal d'audit et les journaux
applicatifs (pino, JSON) aident à l'analyse.
