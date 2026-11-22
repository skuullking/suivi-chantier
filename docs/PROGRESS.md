# Avancement

Légende : `[x]` fait · `[ ]` à faire

## Phase 0 — Préparation

- [x] Plan (`docs/PLAN.md`), suivi (`docs/PROGRESS.md`), décisions (`docs/DECISIONS.md`)

## Phase 1 — Fondations

- [x] Projet Next.js + TypeScript strict + Tailwind + shadcn/ui
- [x] ESLint, Prettier, Husky + lint-staged
- [x] Vitest + Playwright
- [x] docker-compose.dev.yml (Postgres, MinIO, Mailpit)
- [x] Variables d'env (Zod) + `.env.example`
- [x] Schéma Prisma complet + migration initiale
- [x] Auth : inscription, connexion, déconnexion, mot de passe oublié, invitation
- [x] Module `can()` + tests de la matrice
- [x] Layout `/app`, page Équipe, `/api/health`
- [x] Seed minimal
- [x] Mode local sans Docker (`pnpm db:local`, stockage disque, boîte mail `/dev/mails`)
- [x] CI GitHub Actions

## Phase 2 — Cœur métier

- [x] Clients (liste, recherche plein texte, étiquettes, fiche, archivage, historique)
- [x] Chantiers : liste cartes / tableau + filtres, assistant 3 étapes, fiche à onglets (Résumé, Étapes, Planning, Documents, Journal)
- [x] Modèles d'étapes (éditeur), étapes (glisser-déposer, statut, poids, visibilité client), progression pondérée + retards
- [x] Documents : envoi multiple glisser-déposer, type MIME réel vérifié, aperçu, téléchargement signé, visible client, recherche plein texte
- [x] Planning semaine / mois, par personne / par chantier, glisser-déposer, conflits ; tâches
- [x] Tableau de bord (alertes, chantiers, activité, prise en main), recherche Ctrl/Cmd+K, notifications, journal d'audit
- [x] Seed complet (4 clients, 3 chantiers, photos générées, PDF, planning de la semaine)
- [x] E2E n°1 + tests d'intégration multi-tenant

## Phase 3 — Ouvrier + Client

- [ ] Espace ouvrier `/w`
- [ ] Traitement médias + validation photos
- [ ] Portail client `/s/[token]` + onglet Espace client
- [ ] E2E n°2, n°5, n°6

## Phase 4 — IA et WhatsApp

- [ ] Adapters messagerie / transcription / LLM
- [ ] Webhook WhatsApp + rattachement + « À traiter »
- [ ] Commandes texte, transcription
- [ ] Résumé du jour
- [ ] Simulateur `/dev/whatsapp`
- [ ] E2E n°3

## Phase 5 — Paperasse automatique

- [ ] E-mail entrant + simulateur
- [ ] OCR + classement automatique
- [ ] PDF de fin de chantier
- [ ] Import / export CSV, ZIP
- [ ] E2E n°4

## Phase 6 — Hors-ligne et terrain

- [ ] Service worker + cache
- [ ] File IndexedDB + synchronisation
- [ ] Notifications e-mail + push, rappels
- [ ] E2E hors-ligne

## Phase 7 — Monétisation, RGPD, déploiement

- [ ] Billing + limites + onboarding
- [ ] RGPD (export, suppression, rétention) + pages légales
- [ ] Dockerfile, docker-compose prod, Caddy, sauvegardes
- [ ] README, BRANCHER_LES_SERVICES.md
