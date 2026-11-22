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
