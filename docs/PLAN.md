# Plan de réalisation — ChantierLink

Application SaaS de « dossier chantier » pour artisans du bâtiment (TPE 1 à 10 personnes).
Trois publics : le **patron / bureau** (espace `/app`, desktop d'abord), l'**ouvrier** (PWA `/w`, mobile d'abord, hors-ligne),
le **client** (portail `/s/[token]` par lien magique, sans compte).

Chaque phase se termine par : lint + typecheck + tests unitaires / intégration + E2E de la phase au vert, `pnpm build` OK,
mise à jour de `docs/PROGRESS.md`, puis **un commit**.

## Architecture

```
src/
  app/                 Routes Next.js (App Router)
    (public)/          Accueil, connexion, inscription, mot de passe, invitation, pages légales
    app/               Espace patron / bureau (sidebar)
    w/                 Espace ouvrier (PWA, barre du bas)
    s/[token]/         Portail client (lien magique)
    dev/               Simulateurs (WhatsApp, e-mail entrant) — désactivés en production
    api/               health, files (URL signées), search, sync, webhooks
  components/          ui (shadcn), app, worker, portal
  server/
    env.ts             Variables d'environnement validées par Zod
    db.ts              Client Prisma (adapter pg)
    auth/              Mots de passe (argon2), sessions, jetons, contexte d'auth
    permissions/       Module central can(actor, action, resource)
    services/          Logique métier, toujours filtrée par organizationId
    domain/            Fonctions pures testées (progression, commandes WhatsApp, rattachement, heuristiques…)
    adapters/          Interfaces + mocks + vraies implémentations (messagerie, IA, OCR, mail, stockage, paiement…)
    jobs/              File pg-boss + handlers
    security/          Limitation de débit, validation des fichiers, contrôle d'origine
  worker/              Process worker (pg-boss)
prisma/                Schéma, migrations, seed
tests/unit, tests/integration, e2e/
```

## Phases

### Phase 1 — Fondations

- Next.js + TypeScript strict, Tailwind v4, shadcn/ui, lucide.
- ESLint, Prettier, Husky + lint-staged, Vitest, Playwright, CI GitHub Actions.
- `docker-compose.dev.yml` : Postgres 17, MinIO, Mailpit.
- Variables d'env validées (Zod), `.env.example` complet.
- Schéma Prisma complet (toutes les tables, index) + migration initiale.
- Auth : inscription (crée organisation + OWNER + modèles d'étapes), connexion, déconnexion, mot de passe oublié, invitation par lien.
- Module `can()` + matrice de permissions testée.
- Layout `/app`, page Équipe (membres, invitations), `/api/health`, seed de démo minimal.
- **Critère** : je peux m'inscrire, inviter un utilisateur, et les permissions sont testées.

### Phase 2 — Cœur métier

- Clients (CRUD, fiche, tags, notes, archivage).
- Chantiers : liste (cartes / tableau, filtres, recherche), assistant de création en 3 étapes, fiche à onglets.
- Modèles d'étapes (éditeur), étapes (glisser-déposer, statut, poids, visibilité client), progression pondérée, retard.
- Documents : upload multiple, validation des fichiers, type, aperçu, téléchargement signé, recherche plein texte.
- Planning (semaine / mois, par personne et par chantier, glisser-déposer, conflits), tâches du jour.
- Tableau de bord, recherche globale Ctrl/Cmd+K, notifications in-app, journal d'audit.
- Seed complet « Charpentes Martin ».
- **Critère** : je gère un chantier complet côté patron (E2E n°1).

### Phase 3 — Ouvrier + Client

- Espace `/w` : Aujourd'hui, détail chantier, photo plein écran, vocal, Moi ; gros boutons.
- Traitement des médias (EXIF, GPS, miniatures), validation des photos (lot, clavier, recadrage, floutage manuel).
- Portail client `/s/[token]` : jeton haché, révocable, rate-limité, noindex ; onglet « Espace client ».
- **Critère** : parcours photo → validation → vue client (E2E n°2, n°5, n°6).

### Phase 4 — IA et WhatsApp

- Adapters messagerie / transcription / LLM (mock + réel), webhook WhatsApp signé et idempotent.
- Rattachement automatique avec score de confiance, boîte « À traiter », commandes texte.
- Transcription des vocaux, résumé du jour (brouillon → approbation → envoi), simulateur `/dev/whatsapp`.
- **Critère** : E2E n°3.

### Phase 5 — Paperasse automatique et dossier de fin de chantier

- E-mail entrant (`docs-<slug>@…`), simulateur `/dev/inbound-mail`, pipeline OCR → classement → « À traiter ».
- PDF de fin de chantier, import CSV clients, exports CSV et ZIP.
- **Critère** : E2E n°4.

### Phase 6 — Hors-ligne et finitions terrain

- Service worker, cache de la journée, file IndexedDB, synchronisation automatique, état visible.
- Notifications e-mail + push web, rappels de la veille, boutons Maps / Waze, polissage UX.
- **Critère** : couper le réseau, envoyer 3 photos, rétablir : tout est synchronisé (E2E hors-ligne).

### Phase 7 — Monétisation, RGPD, déploiement

- Plans + limites, `BillingProvider` (mock / Stripe), onboarding finalisé, pages légales.
- Export / suppression RGPD, rétention, sauvegardes, Dockerfile prod, Caddy, README Proxmox, durcissement.
- **Critère** : `docker compose up` en prod-like fonctionne de bout en bout.
