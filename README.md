# ChantierLink

Le « dossier chantier » ultra-simple des artisans du bâtiment (charpentiers, menuisiers, piscinistes, rénovation,
paysagistes — TPE de 1 à 10 personnes) :

- **Patron et bureau** (`/app`) : clients, chantiers et étapes, planning, documents classés automatiquement, photos à
  valider, résumé du jour rédigé par l'IA, dossier de fin de chantier en PDF.
- **Ouvriers** (`/w`, application web installable, fonctionne hors connexion) : la journée, « J'arrive », photo et
  vocal en un geste, étape terminée — ou directement **par WhatsApp**.
- **Client final** (`/s/<lien>`) : avancement, photos validées, résumé du jour et documents, sans compte ni mot de passe.

Tout fonctionne en local **sans aucune clé** : WhatsApp, IA, transcription, OCR, e-mails et paiement sont simulés,
et des simulateurs permettent de tout essayer.

---

## Sommaire

1. [Démarrage rapide sans Docker](#1-démarrage-rapide-sans-docker)
2. [Démarrage avec Docker (une seule commande)](#2-démarrage-avec-docker-une-seule-commande)
3. [Comptes et parcours de démonstration](#3-comptes-et-parcours-de-démonstration)
4. [Commandes utiles](#4-commandes-utiles)
5. [Tests](#5-tests)
6. [Architecture](#6-architecture)
7. [Mise en production (Proxmox, VPS)](#7-mise-en-production-proxmox-vps)
8. [Sauvegardes et restauration](#8-sauvegardes-et-restauration)
9. [Brancher les vrais services](#9-brancher-les-vrais-services)
10. [Documentation](#10-documentation)

---

## 1. Démarrage rapide sans Docker

Prérequis : **Node.js 22+** et **pnpm** (`corepack enable`). Aucune base de données à installer : un PostgreSQL embarqué
(paquet npm `embedded-postgres`) démarre sur le port **5433**.

```bash
pnpm install
cp .env.example .env          # PowerShell : Copy-Item .env.example .env
pnpm dev:local                # PostgreSQL embarqué + migrations + application + worker
```

Dans un **second terminal**, chargez les données de démonstration (« Charpentes Martin ») :

```bash
pnpm db:seed
```

Puis ouvrez **http://localhost:3000**.

| Adresse                                                                                                                                                | Contenu                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| http://localhost:3000                                                                                                                                  | Application                                       |
| http://localhost:3000/dev/mails                                                                                                                        | Boîte e-mail de développement                     |
| http://localhost:3000/dev/whatsapp                                                                                                                     | Simulateur WhatsApp (envoyer comme un ouvrier)    |
| http://localhost:3000/dev/inbound-mail                                                                                                                 | Simuler une facture reçue par e-mail              |
| [http://localhost:3000/s/demo-dupont-suivi-chantier-0123456789abcdefABCDEF](http://localhost:3000/s/demo-dupont-suivi-chantier-0123456789abcdefABCDEF) | Portail client de démonstration (chantier Dupont) |

Variante en plusieurs terminaux : `pnpm db:local` (base), puis `pnpm run setup` (migrations + démo), puis `pnpm dev:all`
(application + worker) ou `pnpm dev` (application seule).

Les données locales (base, fichiers) sont dans le dossier `.local/` (ignoré par git). Pour repartir de zéro : arrêter
puis supprimer ce dossier.

> **Windows** : si un PostgreSQL est déjà installé en service sur le port 5432, aucun conflit : la base embarquée
> utilise le port 5433 (`LOCAL_PG_PORT` pour en changer).

## 2. Démarrage avec Docker (une seule commande)

Pile complète « comme en production » : PostgreSQL, MinIO (stockage S3), Mailpit (e-mails), migrations + démo,
application, worker et Caddy (reverse proxy) :

```bash
docker compose up -d --build
```

- Application : **http://localhost** (port 80 servi par Caddy)
- E-mails envoyés : **http://localhost:8025** (Mailpit)
- Simulateurs : http://localhost/dev/whatsapp et http://localhost/dev/inbound-mail (activés par défaut dans cette
  pile de démonstration, `ENABLE_DEV_TOOLS=false` en vraie production)

Les valeurs par défaut (fichier `docker/app.env`) conviennent pour une démonstration. Pour les modifier, créez un
fichier `.env.production` à la racine (mêmes variables) : il est prioritaire et ignoré par git. Le fichier `.env` de
développement n'est pas utilisé par les conteneurs : les deux modes cohabitent dans le même dossier.

Docker peut aussi ne servir que pour les services de développement : `docker compose -f docker-compose.dev.yml up -d`
(PostgreSQL :5433, MinIO :9000/:9001, Mailpit :8025), puis `pnpm run setup && pnpm dev:all` avec
`STORAGE_DRIVER=s3` / `MAIL_DRIVER=smtp` dans `.env`.

## 3. Comptes et parcours de démonstration

Mot de passe de tous les comptes : **`chantier-demo`**

| Rôle    | E-mail                      | Accès                                          |
| ------- | --------------------------- | ---------------------------------------------- |
| Patron  | patron@demo.chantierlink.fr | Tout, dont équipe, paramètres, abonnement      |
| Bureau  | bureau@demo.chantierlink.fr | Clients, chantiers, documents, planning        |
| Ouvrier | jean@demo.chantierlink.fr   | Ses chantiers du jour (Dupont), photos, vocaux |
| Ouvrier | lucas@demo.chantierlink.fr  | Ses chantiers (Dupont, SCI Les Tilleuls)       |

Parcours conseillés :

1. **Patron** : tableau de bord → « À traiter » (2 photos à valider) → chantier « Charpente maison Dupont » (étapes,
   planning, photos, documents, journal, espace client).
2. **Ouvrier** (sur mobile ou en mode responsive) : connexion `jean@…` → « J'arrive » → Photo → Vocal.
3. **WhatsApp** : `/dev/whatsapp` → Jean Lefèvre → envoyer une photo ou « Problème : … » → la réponse « Reçu ✅ »
   arrive, la photo est rangée dans le bon chantier.
4. **Résumé du jour** : onglet Journal du chantier → « Générer le résumé du jour » → « À traiter » → approuver → le
   client le voit sur son portail.
5. **Paperasse** : `/dev/inbound-mail` → envoyer → la facture est classée (type, montant, chantier) et retrouvable
   par la recherche (Ctrl/Cmd + K).
6. **Hors connexion** : sur `/w/photo`, couper le réseau, prendre des photos (⏳), rétablir le réseau (✔).

## 4. Commandes utiles

| Commande                                       | Rôle                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev:local`                               | Base embarquée + migrations + application + worker (sans Docker) |
| `pnpm db:local`                                | Démarre seulement la base PostgreSQL embarquée (port 5433)       |
| `pnpm run setup`                               | Attend la base, applique les migrations, charge la démo          |
| `pnpm dev` / `pnpm dev:all`                    | Application seule / application + worker                         |
| `pnpm worker`                                  | Tâches de fond et tâches planifiées (résumés, rappels, purge…)   |
| `pnpm db:seed`                                 | Recrée l'entreprise de démonstration                             |
| `pnpm db:migrate`                              | Applique les migrations                                          |
| `pnpm backup` / `pnpm restore <archive> --yes` | Sauvegarde / restauration (base + fichiers)                      |
| `pnpm vapid`                                   | Génère les clés des notifications push                           |
| `pnpm build && pnpm start`                     | Build et serveur de production                                   |

## 5. Tests

```bash
pnpm lint && pnpm typecheck
pnpm test                 # tests unitaires (permissions, progression, WhatsApp, heuristiques, CSV…)
pnpm test:integration     # tests d'intégration sur la base chantierlink_test (multi-tenant / IDOR…)
pnpm build && pnpm test:e2e   # parcours Playwright sur la base chantierlink_e2e
```

Les bases `chantierlink_test` et `chantierlink_e2e` sont créées automatiquement par `pnpm db:local` (ou par le
script d'initialisation de `docker-compose.dev.yml`). La CI GitHub Actions exécute toute la chaîne.

## 6. Architecture

- **Next.js 16** (App Router, Server Actions, `proxy.ts` avec CSP à nonce), **React 19**, **TypeScript strict**.
- **Tailwind CSS 4** + **shadcn/ui**, icônes lucide, glisser-déposer `@dnd-kit`, palette `cmdk`.
- **PostgreSQL 17** + **Prisma 7** ; recherche plein texte PostgreSQL ; limitation de débit en base.
- **pg-boss** (file de tâches dans PostgreSQL) + process `worker`.
- **Stockage** S3 (MinIO, Scaleway, OVH…) ou disque ; fichiers jamais publics (URL signées à durée limitée).
- **Adapters** avec version simulée et réelle : messagerie (WhatsApp Cloud API), transcription (Whisper), IA
  (Claude, API Anthropic), OCR (tesseract.js), e-mail (SMTP), paiement (Stripe).

```
src/app/        Routes : app/ (bureau), w/ (ouvrier, PWA), s/[token] (client), dev/ (simulateurs), api/
src/server/     env, db, auth/, permissions/can.ts, services/, domain/ (fonctions pures), adapters/, jobs/
src/worker/     Process de tâches de fond
prisma/         Schéma, migrations, données de démonstration
tests/          Unitaires et intégration (Vitest) — e2e/ : Playwright
docs/           PLAN, PROGRESS, DECISIONS, RGPD, BRANCHER_LES_SERVICES
```

Toutes les règles d'accès passent par le module central `can(actor, action, ressource)` et chaque requête est filtrée
par organisation (une entreprise ne voit jamais les données d'une autre : testé).

## 7. Mise en production (Proxmox, VPS)

Exemple sur **Proxmox** : une VM Debian 12 (2 vCPU, 4 Go de RAM, 40 Go de disque + stockage des fichiers) ou un
conteneur LXC avec l'option « nesting » pour Docker.

1. **Préparer la machine**

   ```bash
   apt update && apt install -y ca-certificates curl git
   curl -fsSL https://get.docker.com | sh
   git clone <votre-dépôt> /opt/chantierlink && cd /opt/chantierlink
   ```

2. **Configurer** : créer `/opt/chantierlink/.env.production` (il surcharge `docker/app.env`), au minimum :

   ```dotenv
   APP_URL=https://chantier.mon-entreprise.fr
   SITE_ADDRESS=chantier.mon-entreprise.fr        # Caddy obtient le certificat HTTPS automatiquement
   APP_SECRET=<openssl rand -base64 48>
   POSTGRES_PASSWORD=<mot de passe fort>
   DATABASE_URL=postgresql://chantierlink:<même mot de passe>@postgres:5432/chantierlink
   MINIO_ROOT_PASSWORD=<mot de passe fort>
   S3_SECRET_ACCESS_KEY=<même mot de passe que MINIO_ROOT_PASSWORD>
   ENABLE_DEV_TOOLS=false
   SEED_DEMO=false
   MAIL_DRIVER=smtp                                # + SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD
   ```

   Le nom de domaine doit pointer vers l'adresse IP publique de la machine (ports 80 et 443 ouverts / redirigés).
   Pour un stockage S3 externe (Scaleway, OVH…), renseignez `S3_ENDPOINT`, `S3_BUCKET`, clés et région.

3. **Démarrer** : `docker compose up -d --build` puis `docker compose ps` (tous les services « healthy »).
   Créez votre compte sur `https://<domaine>/inscription`.

4. **Mettre à jour** : `git pull && docker compose up -d --build` (les migrations s'appliquent automatiquement).

5. **Durcissement** : `ENABLE_DEV_TOOLS=false`, secrets forts et uniques, pare-feu (seuls 80/443 et SSH ouverts),
   mises à jour système automatiques, sauvegardes quotidiennes copiées hors de la machine (voir ci-dessous).
   Les en-têtes de sécurité (CSP, HSTS, X-Frame-Options, nosniff…) sont envoyés par l'application.

## 8. Sauvegardes et restauration

Une archive `.tar.gz` contient toute la base (une table = un fichier JSON lignes, indépendant de la version de
PostgreSQL) et tous les fichiers (disque ou S3). Rotation : seules les `BACKUP_KEEP` (14) dernières sont gardées.

| Situation   | Sauvegarder           | Restaurer                                            |
| ----------- | --------------------- | ---------------------------------------------------- |
| Sans Docker | `pnpm backup`         | `pnpm restore backups/chantierlink-….tar.gz --yes`   |
| Pile Docker | `./scripts/backup.sh` | `./scripts/restore.sh backups/chantierlink-….tar.gz` |

Planification (cron sur l'hôte) : `30 2 * * * cd /opt/chantierlink && ./scripts/backup.sh >> backups/backup.log 2>&1`.
Copiez ensuite le dossier `backups/` hors de la machine (rclone vers un stockage S3, NAS, sauvegarde Proxmox…).

Procédure testée : sauvegarde → suppression de données et d'un fichier → restauration → données, index de recherche et
fichiers retrouvés. Pensez à tester régulièrement une restauration sur une machine de test.

## 9. Brancher les vrais services

Voir **[docs/BRANCHER_LES_SERVICES.md](docs/BRANCHER_LES_SERVICES.md)** : WhatsApp (Meta Cloud API), Whisper, Claude
(Anthropic), OCR, SMTP, e-mail entrant, Stripe, notifications push.

## 10. Documentation

- [docs/PLAN.md](docs/PLAN.md) — plan et architecture
- [docs/PROGRESS.md](docs/PROGRESS.md) — avancement par phase
- [docs/DECISIONS.md](docs/DECISIONS.md) — journal des choix techniques
- [docs/RGPD.md](docs/RGPD.md) — registre des traitements et fonctionnement RGPD
- [docs/BRANCHER_LES_SERVICES.md](docs/BRANCHER_LES_SERVICES.md) — services réels
