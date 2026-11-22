# Journal des décisions

Format : date — décision — raison.

## 2026-11-22 — Cadrage initial

- **Nom du produit : ChantierLink (conservé).** Clair, explicite pour la cible, déjà utilisé dans le cahier des charges.
- **Branche de travail `feat/chantierlink`.** On ne committe pas directement sur `main` ; fusion proposée à la fin.
- **Gestionnaire de paquets : pnpm.** Rapide, installé sur la machine, lockfile strict.
- **Next.js (App Router) dernière version stable, React 19, TypeScript strict.** Conforme au cahier des charges.
- **Authentification maison (modèle « Lucia »)** plutôt qu'Auth.js : mots de passe hachés avec argon2id
  (`@node-rs/argon2`), sessions stockées en base (le cookie contient un jeton aléatoire, la base n'en garde que le
  SHA-256), cookie `httpOnly` + `SameSite=Lax` + `Secure` en HTTPS. Raison : contrôle total du multi-tenant et des rôles,
  pas de dépendance à une bibliothèque encore en bêta, code court et testable.
- **Jobs asynchrones : pg-boss** (pas de Redis à opérer). Un process `worker` séparé exécute les jobs et les tâches
  planifiées (résumés du jour, rappels de la veille, purge de rétention).
- **Fichiers : abstraction `StorageProvider`** avec un driver S3 (MinIO en local, n'importe quel S3 UE en production) et
  un driver `local` (système de fichiers). Les fichiers ne sont **jamais publics** : l'application génère des URL
  `/api/files/...` signées par HMAC avec expiration courte et diffuse le contenu elle-même. Cela fonctionne derrière
  n'importe quel reverse proxy et permet au portail client (sans session) d'afficher les photos validées.
- **MinIO** : la distribution communautaire n'est plus publiée sous forme d'images maintenues depuis fin 2025. On utilise
  la dernière image publiée pour le développement et la démo ; en production, toute solution S3 hébergée en UE convient
  (Scaleway, OVH, Garage auto-hébergé…). Voir `docs/BRANCHER_LES_SERVICES.md`.
- **E-mail de développement : Mailpit** au lieu de MailHog (abandonné). Même usage : SMTP sur 1025, interface web sur 8025.
- **PWA : service worker écrit à la main** (`public/sw.js`) plutôt que Serwist, dont l'intégration dépend de webpack alors
  que Next.js compile désormais avec Turbopack. Le besoin (cache de la journée, repli hors-ligne) reste simple.
- **Recherche plein texte : PostgreSQL** (configuration `french` + `unaccent`).
- **Limitation de débit : table PostgreSQL** (fenêtre fixe, upsert atomique) — fonctionne avec plusieurs instances sans Redis.
- **En-têtes de sécurité** : CSP avec nonce générée dans `proxy.ts`, HSTS, `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`. CSRF : les Server Actions vérifient l'origine nativement ; les
  route handlers qui modifient des données vérifient l'en-tête `Origin`.
- **IA réelle : API Anthropic** via `@anthropic-ai/sdk`, modèle `claude-opus-5-5` par défaut (surchargeable par
  `ANTHROPIC_MODEL`), sorties structurées validées par Zod. En cas de refus ou d'erreur, repli sur l'heuristique locale
  et passage par « À traiter ».
- **OCR réel : tesseract.js** (langue `fra`) ; le texte des PDF est d'abord extrait directement (`unpdf`).
- **Transcription réelle : Whisper** via une API compatible (OpenAI audio ou serveur `whisper.cpp`), URL configurable.
- **SMS : pas de passerelle SMS.** Le bouton « Envoyer par SMS » ouvre l'application SMS du téléphone avec le message et
  le lien pré-remplis (`sms:`). Les envois automatiques passent par e-mail et WhatsApp.
- **Floutage des visages / plaques : manuel.** L'utilisateur dessine des zones à flouter (et peut recadrer) ; une copie
  modifiée est générée avec `sharp`, l'original reste intact. Pas de détection automatique (modèle ML lourd à embarquer).
- **PDF de fin de chantier : pdfkit**, généré par le worker.
- **Plans d'abonnement** : Solo 29 €/mois (2 membres, 10 Go), Équipe 59 €/mois (6 membres : patron + 5 employés,
  50 Go), Pro 99 €/mois (membres illimités, 200 Go). Essai gratuit 14 jours. Facturation derrière le flag
  `BILLING_ENABLED` (désactivé = aucune limite).
- **Image Docker unique** (`node:24-bookworm-slim`) pour l'app, le worker et la migration ; glibc pour éviter les
  soucis de binaires natifs (argon2, sharp, Prisma).
- **Pages `/dev/*`** actives hors production, ou si `ENABLE_DEV_TOOLS=true` (activé dans le compose de démonstration
  pour tout essayer sans clé ; à désactiver en vraie production).

## 2026-11-22 — Phase 1

- **Mode local sans Docker** (demande de l'utilisateur) : `pnpm db:local` lance un vrai PostgreSQL embarqué
  (`embedded-postgres`, binaires distribués via npm, données dans `.local/pgdata`). Fichiers sur disque
  (`STORAGE_DRIVER=local`), e-mails consultables sur `/dev/mails` (`MAIL_DRIVER=dev`). Docker reste supporté.
- **Port PostgreSQL 5433** (local embarqué, docker-compose de dev et CI) : un PostgreSQL 17 est déjà installé en
  service Windows sur 5432 sur la machine de développement ; on ne le touche pas.
- **Prisma 7.10.1 épinglé** : le tag npm `latest` de `prisma` pointe vers une 8.0.0-rc ; on reste sur la dernière
  version stable, alignée avec `@prisma/client`.
- **Recherche plein texte : configuration `simple` + `unaccent`** (plutôt que `french`) pour que la recherche par préfixe
  fonctionne pendant la frappe ; colonnes `tsvector` maintenues par triggers SQL, index GIN déclarés dans le schéma
  Prisma (aucune dérive détectée par `prisma migrate diff`).
- **`cacheComponents` désactivé** (activé par défaut dans le gabarit Next 16.4) : toutes les pages sont rendues
  dynamiquement, ce qu'impose de toute façon la CSP à nonce.
- **CSP** : `style-src 'unsafe-inline'` conservé car Radix UI positionne ses menus via des attributs `style` ;
  les scripts restent protégés par nonce + `strict-dynamic`.
- **Polices système** au lieu de `next/font/google` : pas de téléchargement au build (build hors-ligne possible) et
  aucune requête vers Google (RGPD).
- **Limitation de débit** : multiplicateur `RATE_LIMIT_MULTIPLIER` (1 par défaut) pour les tests E2E.
- **shadcn/ui (style radix-nova)** : il utilise le paquet `cn` (dépôt officiel shadcn-ui) ; `CardTitle` rend un vrai
  titre (`h2` par défaut, `h1` sur les pages d'authentification) pour l'accessibilité.

## 2026-11-22 — Phase 2

- **Équipe d'un chantier : table `SiteMember`** (ajoutée au schéma). Le planning est daté ; l'équipe définit qui voit le
  chantier. Planifier quelqu'un sur un chantier l'ajoute automatiquement à l'équipe. Les permissions ouvrier
  (`assignedUserIds`) reposent sur cette table.
- **Ressource d'une autre organisation = « introuvable »** (jamais « interdit ») pour ne pas révéler son existence ;
  un ouvrier non affecté reçoit aussi « introuvable ».
- **Code court de chantier** : 3 lettres du nom du client + compteur de l'organisation (`DUP-1`), utilisable dans
  WhatsApp.
- **Progression** : seules les étapes « Terminée » comptent (pondérées) ; une étape en retard = date de fin prévue
  dépassée et non terminée ; un chantier terminé ou archivé n'est jamais en retard.
- **Fichiers** : type réel détecté par le contenu (`file-type`) ; HTML / SVG / XML toujours refusés ; texte et CSV
  acceptés seulement si le contenu est du texte UTF-8 sans balise active ; noms nettoyés ; clé de stockage aléatoire
  (jamais dérivée du nom).
- **Adresses** : une par ligne (elles contiennent des virgules) ; l'assistant découpe « rue, CP ville ».
- **Recherche globale** : route `GET /api/search` (session + limitation de débit) appelée par la palette `cmdk`
  sans filtrage côté client.
- **Onglets « Photos » et « Espace client »** masqués jusqu'à la phase 3.

## 2026-11-22 — Phase 3

- **Lien client : SHA-256 pour la recherche + copie chiffrée (AES-256-GCM, clé dérivée de `APP_SECRET`)** afin que le
  bureau puisse recopier / renvoyer le lien à tout moment. Une fuite de la base seule ne révèle aucun lien.
  « Régénérer » révoque les liens actifs et en crée un nouveau.
- **Photos : l'original n'est jamais servi au client.** Le traitement crée une version d'affichage (rotation EXIF
  appliquée, 2000 px max, métadonnées EXIF/GPS supprimées) et une miniature ; recadrage / floutage produisent une
  troisième copie. HEIC : non décodable par le libvips fourni avec sharp → conservé et téléchargeable, sans aperçu.
- **Floutage manuel** : rectangles tracés à la souris / au doigt, flou gaussien appliqué par sharp.
- **Envoi des médias par une route `POST /api/w/media`** (et non une Server Action) : utilisable par la file hors-ligne
  et le service worker (phase 6), idempotente via `clientUploadId`, contrôle d'origine (CSRF).
- **Tâches de fond : `JOBS_MODE=inline`** (exécution juste après la réponse via `after()`, aucun process en plus)
  ou `queue` (pg-boss + process `worker`). Le mode local et les tests utilisent `inline`.
- **Horloge** : une date de prise de vue dans le futur (téléphone mal réglé) est ignorée ; la date de réception serveur
  fait foi.
- **404 dans l'espace bureau** : les pages `/app` sont diffusées en streaming (état de chargement) ; un chantier
  introuvable affiche la page « Page introuvable » dans un statut HTTP 200 (idem pour `/w` depuis l'ajout de son état de chargement en phase 6 ; l'API renvoie 404).

## 2026-11-22 — Phase 4

- **Rattachement d'un message WhatsApp** : (a) seul chantier prévu aujourd'hui pour l'expéditeur (et pas d'autre
  chantier cité) → 0,95 ; (b) chantier cité (code court `DUP-1`, nom du client ou du chantier) → 0,9 ; (c) sinon IA
  (Claude) ou heuristique locale (GPS de la photo, planning de la semaine, mots du message). Seuil
  `AUTO_CLASSIFY_THRESHOLD` (0,75) : au-dessus classé, en dessous « À traiter » avec la proposition et sa raison.
- **IA réelle optionnelle et jamais bloquante** : en cas de refus (`stop_reason: "refusal"`), d'erreur réseau ou de
  sortie invalide, l'heuristique locale prend le relais. Effort `low` pour le classement, `medium` pour le résumé.
- **Numéro inconnu** : une réponse polie au plus une fois par 24 h et par numéro ; le message est ignoré (journalisé).
- **Commandes** reconnues sans accents ni casse, avec ou sans emoji : « J'arrive », « Terminé » (départ),
  « Étape terminée », « Problème : … » (note interne + notification, jamais visible du client) ; tout autre texte
  devient une note interne du chantier.
- **Vocaux** : transcription en tâche de fond → note « vocal » interne. Un vocal commençant par « Problème » devient
  un problème. Le résumé du jour n'utilise que les faits visibles par le client (photos, étapes visibles terminées,
  vocaux et notes non internes hors problèmes).
- **Résumé du jour** : unique par chantier et par jour ; régénérable tant qu'il est en brouillon ; jamais réécrit une
  fois envoyé. L'e-mail n'est envoyé que si le client a donné son accord et a une adresse ; il est publié sur le
  portail dans tous les cas.
- **Pipeline documents (OCR + classement)** avancé en phase 4 car les documents arrivent aussi par WhatsApp. Les PDF
  avec couche texte sont lus directement (unpdf) ; les PDF scannés sans texte ne sont pas rastérisés (pas de
  dépendance native supplémentaire) : ils passent par « À traiter ». Un type choisi à la main n'est jamais écrasé.
- **Worker** (`pnpm worker`) : consomme les files pg-boss (`JOBS_MODE=queue`) et lance les tâches planifiées
  (résumés toutes les 15 min selon l'heure de chaque entreprise, maintenance quotidienne) quel que soit le mode.
- **Simulateur WhatsApp** : construit un payload au format Meta, le signe avec `WHATSAPP_APP_SECRET` et l'envoie au
  vrai webhook ; les médias simulés sont stockés sous `dev/` et lus par l'adapter mock.

## 2026-11-22 — Phase 5

- **E-mail entrant** : le fournisseur d'e-mails (Postmark, Mailgun, Brevo… en mode « MIME brut ») poste le message
  sur `/api/webhooks/inbound-mail` avec le secret `INBOUND_MAIL_SECRET`. L'organisation est retrouvée par
  l'adresse `docs-<slug>@INBOUND_MAIL_DOMAIN` ; idempotence par Message-ID ; un e-mail sans pièce jointe est
  conservé comme document texte.
- **Recherche plein texte** : la ponctuation des références (`F-2026-990`, `16/11/2026`) est remplacée par des
  espaces avant indexation (migration `fts_separators`), sinon PostgreSQL produit des nombres signés (« -2026 »).
- **Dossier de fin de chantier** : généré en tâche de fond (pdfkit, polices standard), photos validées redimensionnées
  par sharp, stocké comme document « généré » du chantier, notification à la personne qui l'a demandé.
- **CSV** : séparateur « ; » + BOM UTF-8 (Excel français), protection contre l'injection de formules ; import lu dans
  le navigateur (papaparse), 2 000 lignes maximum, doublons détectés par e-mail ou nom + téléphone.
- **ZIP** : construits en flux (archiver) sans charger les fichiers en mémoire ; export chantier = documents
  originaux, photos par étape, `etapes.csv`, `photos.csv`, `journal.txt`.

## 2026-11-22 — Phase 6

- **File hors-ligne côté page (IndexedDB via `idb`)** : chaque photo / vocal est d'abord écrit localement, puis envoyé
  dans l'ordre ; erreurs réseau → nouvel essai avec délai croissant (5 s → 10 min), erreurs définitives (fichier
  refusé…) → visibles et supprimables dans « Moi ». L'idempotence côté serveur (`clientUploadId`) empêche les
  doublons en cas de renvoi. Les actions (J'arrive, étape terminée, tâche) sont rejouées via `/api/w/actions`.
- **Synchronisation** au retour du réseau (`online`), à la réouverture de l'app, toutes les 20 s si des éléments
  attendent, et via Background Sync quand le navigateur le permet (Chrome / Android).
- **Service worker** enregistré uniquement en production (ou `NEXT_PUBLIC_ENABLE_SW=true`) pour ne pas gêner le
  développement. Les réponses des API ne sont jamais mises en cache.
- **Notifications** : créées dans les transactions métier, envoyées (e-mail pour les types importants, Web Push pour
  tous) juste après la réponse HTTP et chaque minute par le worker, une seule fois (colonne `deliveredAt`).
  Web Push désactivé tant que `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` ne sont pas renseignées.
- **E2E hors-ligne** : Playwright n'applique pas `setOffline` aux requêtes du service worker ; le test vérifie
  donc la file et la synchronisation (critère de la phase), le cache des pages étant vérifié manuellement.

## 2026-11-22 — Phase 7

- **Sauvegardes portables** : une table = un fichier JSON lignes + tous les fichiers via l'adapter de stockage, dans
  une archive tar.gz (`pnpm backup` / `pnpm restore`). Raison : le PostgreSQL embarqué ne fournit pas `pg_dump`
  et ce format marche en local comme sous Docker. Cycle sauvegarde → perte → restauration testé.
- **Configuration Docker** dans `docker/app.env` + `.env.production` (via `env_file`), jamais le `.env` de
  développement, pour que les deux modes cohabitent dans le même dossier.
- **Facturation** : derrière `BILLING_ENABLED` ; fin d'essai sans abonnement = création de chantiers bloquée
  (les données restent accessibles). Fournisseur simulé avec page de paiement factice.
- **RGPD** : anonymisation (conserve chantiers et pièces comptables) ou suppression complète ; durées de conservation
  ≥ 10 ans pour les documents ; purge automatique désactivée par défaut.
- **Docker non testé en exécution** : le démon Docker de la machine de développement ne démarre pas ; les fichiers
  sont validés par `docker compose config` (aussi en CI).
