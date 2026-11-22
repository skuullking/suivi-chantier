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

- [x] Espace ouvrier `/w` : Aujourd'hui (Y aller Maps/Waze, consignes, tâches, J'arrive, Photo, Vocal, Étape terminée), photo plein écran (getUserMedia + repli), vocal (MediaRecorder), Moi
- [x] Traitement des médias (EXIF date/GPS, version d'affichage sans métadonnées, miniature) en tâche de fond
- [x] Validation des photos (grille, lot, raccourcis clavier, recadrage, floutage manuel), onglet Photos & médias
- [x] Portail client `/s/[token]` (jeton haché + chiffré, révocable, expirable, limité, noindex) + onglet Espace client
- [x] E2E n°2, n°5, n°6 + tests d'intégration (IDOR médias / portail)

## Phase 4 — IA et WhatsApp

- [x] Adapters messagerie (mock / Meta Cloud API), transcription (mock / Whisper), LLM (mock / Claude), OCR (unpdf + mock / tesseract)
- [x] Webhook WhatsApp (vérification, signature, idempotence) + rattachement avec confiance + « À traiter » (OK / Changer / Ignorer)
- [x] Commandes texte (J'arrive, Terminé, Étape terminée, Problème : …), transcription des vocaux → journal
- [x] Résumé du jour (tâche planifiée + bouton), brouillon → approbation éditable → e-mail + portail ; envoi auto en option
- [x] Simulateur `/dev/whatsapp` (payload Meta signé vers le vrai webhook), numéros WhatsApp dans Équipe
- [x] Process `worker` (pg-boss : files + tâches planifiées)
- [x] E2E n°3 + tests d'intégration WhatsApp

## Phase 5 — Paperasse automatique

- [x] E-mail entrant `docs-<slug>@…` (webhook MIME brut + secret, idempotence Message-ID) + simulateur `/dev/inbound-mail`
- [x] OCR + classement automatique (pipeline commun upload / e-mail / WhatsApp, « À traiter » si confiance faible)
- [x] Dossier de fin de chantier (PDF : garde, étapes, photos horodatées par étape, documents, signatures, mention)
- [x] Import clients CSV (mapping guidé, doublons, erreurs par ligne), exports CSV (clients, chantiers, documents), ZIP chantier et ZIP documents
- [x] E2E n°4 + tests d'intégration (e-mail entrant, dossier PDF, import / export)

## Phase 6 — Hors-ligne et terrain

- [x] Service worker écrit à la main (pages `/w` en network-first + cache de la journée, statiques en cache-first, page hors-ligne, Background Sync, push)
- [x] File IndexedDB (photos, vocaux, actions J'arrive / étape / tâches) avec `clientUploadId`, backoff, file visible (badge + page Moi, réessayer / supprimer)
- [x] Notifications e-mail + Web Push (VAPID, `pnpm vapid`), livraison après validation de la transaction et chaque minute par le worker
- [x] Rappel de la veille pour les ouvriers (heure réglable), badges réseau, états de chargement / erreur côté terrain
- [x] E2E hors-ligne (3 photos sans réseau → synchronisées) + tests d'intégration (rappels, envoi des notifications)

## Phase 7 — Monétisation, RGPD, déploiement

- [ ] Billing + limites + onboarding
- [ ] RGPD (export, suppression, rétention) + pages légales
- [ ] Dockerfile, docker-compose prod, Caddy, sauvegardes
- [ ] README, BRANCHER_LES_SERVICES.md
