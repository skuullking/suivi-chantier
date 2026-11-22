# PROMPT CLAUDE CODE : SaaS de suivi de chantier pour artisans

> À coller dans Claude Code, dans un dossier vide. Il construit tout en autonomie, phase par phase.

---

## 0. MODE DE TRAVAIL (à respecter strictement)

Tu es un développeur full-stack senior. Tu construis **de bout en bout** l'application décrite ci-dessous, **en autonomie totale**.

- **Ne me pose pas de questions.** Quand un choix est ouvert, prends la décision la plus raisonnable et note-la dans `docs/DECISIONS.md` (date, choix, raison).
- Commence par créer `docs/PLAN.md` (plan détaillé par phases) et `docs/PROGRESS.md` (checklist cochée au fur et à mesure). Mets-les à jour en continu.
- Avance **phase par phase** (section 9). À la fin de chaque phase : lint + typecheck + tests verts, app qui démarre, **commit git** avec un message clair, puis phase suivante.
- Utilise une liste de tâches interne pour suivre l'avancement.
- Si un service externe n'est pas disponible (WhatsApp, OCR, Stripe, IA), construis une **interface (adapter) + une implémentation simulée (mock)** pour que tout soit testable en local sans clé API. Les vraies implémentations se branchent via variables d'environnement.
- Ne casse jamais ce qui marche : avant de modifier un module existant, lance les tests concernés.
- Écris du code lisible, typé, avec des noms en anglais pour le code et du **français pour toute l'interface utilisateur**.
- Fournis des **données de démo** (seed) pour pouvoir tester tout de suite.
- À la fin, `README.md` complet : installation, lancement, variables d'env, tests, déploiement.

---

## 1. LE PRODUIT

**Nom de travail** : `ChantierLink` (change-le si tu trouves mieux, note-le dans DECISIONS.md).

**Pitch** : un « dossier chantier » ultra-simple pour artisans du bâtiment (charpentiers, menuisiers, piscinistes, rénovateurs, paysagistes) qui font des chantiers de plusieurs jours ou semaines.

- Le **patron / bureau** gère clients, chantiers, documents (devis, factures, bons de commande, notes de frais : **stockage uniquement**), équipes et planning.
- L'**ouvrier** voit sa journée sur téléphone, envoie photos et vocaux, marque les étapes terminées, avec de **gros boutons**.
- Le **client** suit l'avancement via un **lien magique** (sans compte, sans mot de passe) : barre de progression, photos validées, prochaines interventions.
- L'**IA** supprime la saisie : classement automatique des photos et des papiers, transcription des vocaux, résumé du jour rédigé automatiquement.

**Problèmes résolus** : les clients qui appellent sans arrêt pour savoir où en est le chantier, les photos en vrac sur WhatsApp, la paperasse dispersée.

**Cible** : TPE d'artisans (1 à 10 personnes). Utilisateurs peu techniques, souvent sur téléphone, parfois avec des gants, parfois sans réseau.

**Hors périmètre (NE PAS FAIRE)** :
- Générer des devis ou des factures, faire de la compta.
- Promettre un « archivage à valeur légale / probante ». Formule autorisée : « tous vos documents chantier au même endroit, conservés et retrouvables ».
- Planning façon Gantt complexe.
- Application native (PWA uniquement).

---

## 2. STACK TECHNIQUE

- **Next.js (App Router) + TypeScript strict**, React Server Components quand pertinent.
- **Tailwind CSS + shadcn/ui** ; icônes lucide.
- **PostgreSQL + Prisma** (migrations versionnées).
- **Auth** : e-mail + mot de passe pour patron / bureau / ouvrier (Auth.js ou équivalent, mots de passe hachés argon2/bcrypt, sessions sécurisées). Invitation par lien pour ajouter des membres. **Client = lien magique uniquement.**
- **Stockage fichiers** : abstraction S3-compatible (MinIO en local via docker-compose). URLs signées à durée limitée, jamais de fichiers publics.
- **Jobs asynchrones** : `pg-boss` (ou BullMQ + Redis) pour transcription, OCR, résumés, envois.
- **PWA** : Serwist ou équivalent ; manifest, icônes, installable ; cache offline ; IndexedDB pour file d'attente d'envoi.
- **Validation** : Zod partout (entrées API, formulaires, variables d'env).
- **Tests** : Vitest (unitaires), Playwright (E2E sur parcours clés).
- **Qualité** : ESLint, Prettier, Husky + lint-staged, CI GitHub Actions (lint, typecheck, tests, build).
- **Déploiement** : Dockerfile multi-stage, `docker-compose.yml` (app, worker, postgres, minio, reverse proxy Caddy), healthchecks, script de sauvegarde Postgres + fichiers. Cible : VM/LXC Proxmox auto-hébergée, hébergement **UE**.

### Adapters (interfaces + mocks + vraies implémentations)

| Domaine | Interface | Mock (dev/test) | Réel (via env) |
|---|---|---|---|
| Messagerie | `MessagingProvider` | Simulateur WhatsApp local (page `/dev/whatsapp`) | WhatsApp Business Cloud API (Meta) |
| Transcription | `TranscriptionProvider` | Texte fictif | Whisper (API ou whisper.cpp) |
| LLM (résumés, classement) | `LlmProvider` | Réponses déterministes | API Anthropic (Claude) |
| OCR documents | `OcrProvider` | Texte fictif | Tesseract ou API OCR |
| E-mail sortant | `MailProvider` | Console / MailHog | SMTP |
| E-mail entrant | `InboundMailProvider` | Dépôt via page `/dev/inbound-mail` | Webhook ou IMAP |
| Paiement | `BillingProvider` | Faux plans | Stripe (feature flag) |
| Stockage | `StorageProvider` | MinIO local | S3 UE |

---

## 3. MODÈLE DE DONNÉES (minimum)

Toutes les tables métier portent `organizationId` (**multi-tenant strict** : toute requête est filtrée par organisation côté serveur, jamais seulement côté client).

- `Organization` (nom, métier principal, logo, fuseau, plan, statut d'abonnement)
- `User` (e-mail, nom, téléphone, mot de passe haché)
- `Membership` (user, organization, rôle : `OWNER` | `OFFICE` | `WORKER`)
- `Invitation` (e-mail, rôle, jeton haché, expiration)
- `Client` (nom, type particulier/pro, e-mails, téléphones, adresses, notes, tags, archivé)
- `Site` = chantier (client, titre, adresse, coordonnées GPS, statut : `DRAFT` | `PLANNED` | `IN_PROGRESS` | `PAUSED` | `COMPLETED` | `ARCHIVED`, dates prévues/réelles, description, progression calculée)
- `StepTemplate` / `StepTemplateItem` (modèles d'étapes par métier ; fournir des modèles pré-remplis, voir section 6.4)
- `SiteStep` (chantier, titre, ordre, statut `TODO|IN_PROGRESS|DONE`, dates, poids pour la progression, visible_client bool)
- `Assignment` (chantier, étape optionnelle, utilisateur, date, créneau, consignes)
- `Task` (tâche du jour liée à un chantier/étape, assignée, statut, notes)
- `Media` (photo / vocal / vidéo courte ; chantier, étape, auteur, source `APP|WHATSAPP|EMAIL`, horodatage fiable côté serveur, GPS optionnel, statut de validation : `PENDING|APPROVED|REJECTED`, légende, transcription pour vocaux)
- `InboxItem` (élément reçu non classé ou classé avec faible confiance : média, message, document ; proposition de rattachement + score de confiance)
- `Document` (chantier et/ou client, type : `QUOTE|INVOICE|PURCHASE_ORDER|EXPENSE|CONTRACT|PLAN|OTHER`, nom, fichier, date du document, montant optionnel, fournisseur optionnel, texte OCR, tags, visible_client bool)
- `DailySummary` (chantier, date, texte généré, texte édité, statut `DRAFT|APPROVED|SENT`, médias associés)
- `ClientPortalLink` (chantier, jeton **haché**, expiration optionnelle, révocable, dernier accès)
- `WhatsAppContact` (numéro E.164 → utilisateur, ou client)
- `Notification` (destinataire, type, contenu, lu)
- `AuditLog` (acteur, action, entité, avant/après, IP, date)
- `Subscription` (plan, statut, fournisseur)

Index sur : organizationId, siteId, clientId, dates, statuts. Recherche plein texte Postgres sur clients, chantiers, documents (nom + texte OCR).

---

## 4. RÔLES ET PERMISSIONS

| Action | OWNER | OFFICE | WORKER | CLIENT (lien) |
|---|---|---|---|---|
| Paramètres entreprise, abonnement, membres | ✅ | ❌ | ❌ | ❌ |
| Clients : créer / modifier / voir | ✅ | ✅ | lecture limitée (nom, adresse du chantier) | ❌ |
| Chantiers : créer / modifier | ✅ | ✅ | ❌ | ❌ |
| Chantiers : voir | tous | tous | **seulement les siens** (assignés) | **le sien** |
| Documents : ajouter / voir | ✅ | ✅ | ajouter notes de frais / bons ; voir plans et consignes | seulement ceux marqués visibles |
| Planning : modifier | ✅ | ✅ | ❌ (voit le sien) | ❌ (voit les prochaines interventions) |
| Photos : envoyer | ✅ | ✅ | ✅ | ❌ |
| Photos : valider / refuser | ✅ | ✅ (selon réglage) | ❌ | ❌ |
| Résumé du jour : approuver / envoyer | ✅ | ✅ | ❌ | ❌ |
| Journal d'audit | ✅ | ❌ | ❌ | ❌ |

Implémentation : un module central `can(user, action, resource)` utilisé **côté serveur** dans chaque route / action serveur. Tests unitaires de la matrice complète.

---

## 5. NAVIGATION ET ÉCRANS

### 5.1 Public
- `/` page de présentation courte + CTA
- `/connexion`, `/inscription` (crée l'organisation + OWNER), `/mot-de-passe-oublie`
- `/invitation/[token]` : accepter une invitation, définir son mot de passe

### 5.2 Espace patron / bureau (desktop d'abord, responsive) : préfixe `/app`
Barre latérale : **Tableau de bord · Chantiers · Clients · Planning · À traiter · Documents · Équipe · Paramètres**.

- `/app` **Tableau de bord** : chantiers en cours (cartes avec barre de progression), alertes (retards, photos à valider, éléments à classer, résumés à approuver), activité récente, raccourcis « Nouveau chantier / Nouveau client ».
- `/app/chantiers` : liste avec filtres (statut, client, équipe, dates), recherche, vue cartes / tableau.
- `/app/chantiers/nouveau` : assistant en 3 étapes (client → infos + adresse → modèle d'étapes + équipe).
- `/app/chantiers/[id]` avec onglets :
  1. **Résumé** : infos clés, progression, prochaine étape, équipe, accès rapide Maps, bouton « Partager le lien de suivi au client ».
  2. **Étapes** : liste ordonnable (glisser-déposer), statut, dates, visibilité client.
  3. **Planning** : affectations de ce chantier (calendrier semaine).
  4. **Photos & médias** : galerie par étape et par date, filtres par statut de validation, validation en lot.
  5. **Documents** : upload multiple (glisser-déposer), type, recherche, aperçu PDF/image, téléchargement, case « visible par le client ».
  6. **Journal** : résumés du jour, notes, historique des changements.
  7. **Espace client** : gérer le lien magique (copier, envoyer par e-mail/SMS/WhatsApp, révoquer, régénérer), aperçu « tel que le voit le client », choix de ce qui est visible.
- `/app/clients` et `/app/clients/[id]` : fiche complète, chantiers liés, documents, notes, historique.
- `/app/planning` : calendrier semaine / mois par personne et par chantier, glisser-déposer pour affecter, détection de conflits.
- `/app/a-traiter` (**boîte de tri**) : photos à valider, éléments reçus par WhatsApp / e-mail à classer (avec la proposition de l'IA et un bouton « OK » ou « Changer »), résumés à approuver.
- `/app/documents` : tous les documents, filtres (type, client, chantier, période), recherche plein texte, import par lot, export ZIP.
- `/app/equipe` : membres, rôles, invitations, numéros WhatsApp associés.
- `/app/parametres` : entreprise, modèles d'étapes (éditeur), WhatsApp, e-mail d'envoi des documents, réglages de validation (photos auto-approuvées ou non, résumé auto-envoyé ou non), abonnement, export des données (CSV/ZIP), suppression de compte.

### 5.3 Espace ouvrier (mobile d'abord, PWA) : préfixe `/w`
Barre du bas à 4 onglets : **Aujourd'hui · Photo · Vocal · Moi**.
- `/w` **Aujourd'hui** : mes chantiers du jour, pour chacun adresse + bouton **Y aller** (Maps/Waze), consignes, tâches à cocher, boutons XXL : **J'arrive**, **Photo**, **Vocal**, **Étape terminée**.
- `/w/chantier/[id]` : détail (étapes, plans, consignes, historique de mes envois).
- `/w/photo` : appareil photo plein écran, un tap = envoi automatique au chantier actif et à l'étape en cours (modifiable en un tap), légende optionnelle.
- `/w/vocal` : un gros bouton enregistrer / arrêter, envoi automatique.
- `/w/moi` : mes infos, état de synchronisation, déconnexion.
- Contraintes UX : cibles tactiles ≥ 56 px, forts contrastes, peu de texte, retours visuels clairs (✔ envoyé, ⏳ en attente de réseau).

### 5.4 Portail client : `/s/[token]`
- En-tête : nom de l'entreprise, titre du chantier, adresse (sans données sensibles inutiles).
- **Barre de progression** globale + liste des étapes (faites / en cours / à venir).
- **Fil d'actualité** : résumés du jour approuvés et photos validées, en ordre chronologique inverse.
- **Prochaines interventions** (dates, créneaux, équipe prévue).
- **Documents partagés** (seulement ceux marqués visibles).
- Bouton « Contacter l'entreprise » (appel / WhatsApp / e-mail).
- Aucun compte, aucun mot de passe. Jeton long et aléatoire (≥ 32 octets), **stocké haché**, révocable, avec limitation de débit. Page `noindex`. Mobile d'abord.

### 5.5 Dev uniquement (désactivées en production)
- `/dev/whatsapp` : simulateur de conversation WhatsApp (envoyer photo / vocal / texte comme un ouvrier).
- `/dev/inbound-mail` : simuler un e-mail entrant avec pièce jointe.

---

## 6. FONCTIONNALITÉS DÉTAILLÉES

### 6.1 Socle
Auth + organisations + rôles + invitations ; CRUD clients ; CRUD chantiers ; étapes ; documents ; planning ; tâches du jour ; recherche globale (Ctrl/Cmd+K) ; notifications in-app ; journal d'audit.

### 6.2 Progression
Progression d'un chantier = somme pondérée des étapes terminées (poids par défaut égal, modifiable). Mise à jour automatique à chaque changement d'étape. Statut « en retard » si la date prévue d'une étape est dépassée.

### 6.3 Entrée WhatsApp (le cœur du produit)
1. Un numéro WhatsApp Business unique reçoit les messages (webhook `/api/webhooks/whatsapp`, vérification de signature, idempotence par `message_id`).
2. L'expéditeur est identifié via `WhatsAppContact` (numéro → ouvrier). Inconnu → réponse polie et message ignoré.
3. **Rattachement au chantier** : (a) chantier du jour de l'ouvrier si un seul ; (b) sinon celui indiqué dans le message (nom ou code court) ; (c) sinon l'IA propose selon contexte (planning, GPS de l'image, texte) avec un **score de confiance**.
4. Confiance élevée → classé automatiquement dans le bon chantier et la bonne étape. Confiance faible → `InboxItem` dans « À traiter » pour validation d'un clic. Une réponse WhatsApp confirme à l'ouvrier : « Reçu ✅ Chantier Dupont, étape Pose charpente ».
5. Photos : stockées en `PENDING` (ou `APPROVED` si le réglage l'autorise). Vocaux : transcrits en tâche de fond, la transcription est ajoutée au journal et peut créer une note.
6. Commandes simples par texte : `J'arrive`, `Terminé`, `Étape terminée`, `Problème : …` (le problème notifie le patron et n'est **jamais** visible du client).

### 6.4 Modèles d'étapes pré-remplis (seed, éditables)
- **Charpentier** : Prise de côtes → Plans / commande des bois → Taille en atelier → Livraison → Pose charpente → Couverture → Finitions → Nettoyage et réception.
- **Menuisier** : Relevé de mesures → Validation des plans → Fabrication → Livraison → Pose → Finitions → Réception.
- **Pisciniste** : Terrassement → Coque / structure → Plomberie et électricité → Finitions → Mise en eau → Réception.
- **Rénovation intérieure** : Diagnostic → Démolition → Gros œuvre → Réseaux → Isolation et cloisons → Finitions → Réception.
- **Paysagiste** : Relevé → Terrassement → Réseaux d'arrosage → Plantations → Finitions → Réception.

### 6.5 Résumé du jour par IA
- Tâche planifiée en fin de journée (heure réglable) : pour chaque chantier actif ce jour-là, le `LlmProvider` rédige un court résumé client (2 à 4 phrases, ton chaleureux et professionnel, **sans jargon et sans détails internes**) à partir des photos du jour, transcriptions, étapes terminées, prochaines étapes.
- Statut `DRAFT` → notification au patron → **approbation en 1 clic** (éditable) → envoi au client (e-mail et / ou SMS / WhatsApp avec le lien magique) et publication dans le fil du portail.
- Réglage : mode « toujours valider » (défaut) ou « envoi automatique ».
- Les problèmes internes (`Problème : …`) ne sont **jamais** inclus.

### 6.6 Validation des photos
File de validation avec grille, approbation / refus en lot, raccourcis clavier, recadrage simple, floutage de visages ou plaques en option (si faisable, sinon note dans DECISIONS.md). Seules les photos `APPROVED` apparaissent côté client.

### 6.7 Classement automatique des papiers
- Adresse e-mail dédiée par organisation (`docs-<slug>@…`) : on y transfère un mail ou une photo de facture.
- Pipeline : réception → stockage → OCR → l'IA détecte **type** (devis / facture / bon de commande / note de frais), **fournisseur ou client**, **date**, **montant**, et propose le **chantier et le client**. Confiance haute → classé ; sinon → « À traiter ».
- Téléversement manuel (glisser-déposer, plusieurs fichiers) passe par le même pipeline.
- Toujours conserver le fichier original, immuable.

### 6.8 Dossier de fin de chantier (PDF)
Bouton « Générer le dossier de fin de chantier » : PDF propre avec page de garde (entreprise, client, adresse, dates), liste des étapes avec dates, photos validées horodatées par étape, liste des documents, signatures optionnelles. Stocké dans les documents du chantier. Mention de bas de page : « Document récapitulatif généré par ChantierLink » (sans prétention de valeur légale).

### 6.9 Mode hors-ligne (ouvrier)
- Cache de la journée (chantiers, tâches, consignes) à l'ouverture.
- Photos / vocaux / actions enregistrés en local (IndexedDB) et **synchronisés automatiquement** au retour du réseau, avec file d'attente visible et reprise sur erreur.
- Horodatage de capture conservé ; l'horodatage serveur fait foi pour la fiabilité.

### 6.10 Notifications
In-app + e-mail (+ push web si possible) : photos à valider, élément à classer, résumé prêt, problème signalé, chantier démarré / terminé, rappel de la veille pour les ouvriers (« Demain : chantier Dupont, 8 h »).

### 6.11 Import / export / cohabitation
Import clients en CSV (mapping de colonnes guidé), export CSV (clients, chantiers, documents), export ZIP complet d'un chantier (documents + photos + dossier PDF), export complet de l'organisation (RGPD).

### 6.12 Onboarding (10 minutes)
Après l'inscription : choisir le métier → modèle d'étapes chargé → inviter un ouvrier → créer un premier chantier avec un client fictif ou réel → afficher le lien client de démonstration. Barre de progression d'onboarding sur le tableau de bord.

### 6.13 Abonnement (derrière un feature flag)
Plans : **Solo 29 €/mois**, **Équipe 59 €/mois (jusqu'à 5 employés)**, **Pro 99 €/mois (au-delà)**, essai gratuit de 14 jours. `BillingProvider` + page abonnement + limites de plan (nombre de membres, stockage) appliquées côté serveur. Stripe réel branchable par variables d'env ; sinon mock.

---

## 7. SÉCURITÉ, RGPD, LÉGAL

- Contrôle d'accès **côté serveur** partout ; tests dédiés contre les fuites inter-organisations (IDOR).
- En-têtes de sécurité (CSP, HSTS, X-Frame-Options…), CSRF, limitation de débit (connexion, jetons client, webhooks), validation stricte des fichiers (type MIME réel, taille max, noms nettoyés), antivirus optionnel (ClamAV via docker si simple, sinon note).
- Secrets uniquement par variables d'env ; `.env.example` complet ; aucun secret dans le dépôt.
- Jetons (portail, invitations, réinitialisation) : aléatoires, **hachés en base**, expirants ou révocables.
- RGPD : hébergement UE, registre des données traitées dans `docs/RGPD.md`, export et suppression des données d'un client / d'une organisation, durées de conservation paramétrables (rappel : factures 10 ans ; garantie décennale 10 ans), politique de confidentialité et mentions légales (pages modèles à compléter), consentement pour les communications aux clients.
- Sauvegardes automatiques (script + doc de restauration testée).
- Journal d'audit sur les actions sensibles.
- Accessibilité de base (labels, contrastes, navigation clavier, `aria`).

---

## 8. QUALITÉ, TESTS, OBSERVABILITÉ

- **Unitaires** : permissions (matrice complète), calcul de progression, rattachement WhatsApp, parsing des commandes, génération de liens, validations Zod.
- **E2E (Playwright)** parcours clés :
  1. Inscription → onboarding → création client + chantier depuis un modèle.
  2. Invitation d'un ouvrier → l'ouvrier voit sa journée → envoie une photo (via UI) → le patron la valide → le client la voit sur `/s/[token]`.
  3. Simulation d'un message WhatsApp (photo + vocal) → classement auto → transcription → résumé du jour → approbation → visible au client.
  4. Upload d'une facture → classement auto (mock OCR/IA) → retrouvée dans la recherche.
  5. Révocation d'un lien client → l'ancien lien renvoie une page « lien expiré ».
  6. Un ouvrier ne peut pas ouvrir un chantier qui ne lui est pas assigné ; une organisation ne voit jamais les données d'une autre.
- Logs structurés (pino), page `/api/health`, gestion d'erreurs propre (pages d'erreur en français), états vides / chargement / erreur soignés partout.
- Seed de démo : 1 organisation « Charpentes Martin », 1 patron, 1 bureau, 2 ouvriers, 4 clients, 3 chantiers à des stades différents avec photos de démonstration, documents d'exemple, planning de la semaine.

---

## 9. PHASES ET CRITÈRES D'ACCEPTATION

**Phase 1 : Fondations.** Repo, stack, CI, Docker compose, Prisma, auth, multi-tenant, rôles + module `can`, layout `/app`, seed. *Critère : je peux m'inscrire, inviter un utilisateur, et les permissions sont testées.*

**Phase 2 : Cœur métier.** Clients, chantiers, modèles d'étapes, étapes, progression, documents (upload, type, recherche, aperçu), planning + tâches, tableau de bord, recherche globale. *Critère : je gère un chantier complet côté patron.*

**Phase 3 : Ouvrier + Client.** Espace `/w` mobile PWA (journée, photo rapide, vocal, étape terminée), validation des photos, portail client `/s/[token]` avec lien magique. *Critère : parcours photo → validation → vue client OK.*

**Phase 4 : IA et WhatsApp.** Adapters + mocks + simulateur, webhook WhatsApp, rattachement automatique + confiance + « À traiter », transcription, résumé du jour + approbation + envoi. *Critère : parcours E2E n°3 vert.*

**Phase 5 : Paperasse automatique et dossier de fin de chantier.** E-mail entrant, OCR, classement auto, PDF de fin de chantier, import / export CSV et ZIP. *Critère : parcours E2E n°4 vert.*

**Phase 6 : Hors-ligne et finitions terrain.** File IndexedDB, synchro, notifications, rappels de la veille, boutons Waze / Maps, polissage UX. *Critère : couper le réseau, envoyer 3 photos, rétablir : tout est synchronisé.*

**Phase 7 : Monétisation, RGPD, déploiement.** Plans + limites, `BillingProvider`, onboarding finalisé, pages légales, export / suppression RGPD, sauvegardes, Dockerfile prod, Caddy, README de déploiement Proxmox, durcissement sécurité. *Critère : `docker compose up` en prod-like fonctionne de bout en bout.*

---

## 10. DÉFINITION DE « TERMINÉ »

- Toutes les phases livrées, tests unitaires + E2E verts, build de production OK, lint et typecheck sans erreur.
- `README.md`, `docs/PLAN.md`, `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/RGPD.md`, `.env.example` à jour.
- L'app démarre avec une seule commande (`docker compose up`) et le seed de démo permet de tout essayer sans clé API.
- Un court `docs/BRANCHER_LES_SERVICES.md` explique comment brancher les vrais services (WhatsApp Meta, Whisper, Claude, OCR, SMTP, Stripe).

**Commence maintenant par créer `docs/PLAN.md`, puis attaque la Phase 1.**
