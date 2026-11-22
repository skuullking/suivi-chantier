# ChantierLink

Le « dossier chantier » ultra-simple des artisans du bâtiment : clients, chantiers, étapes, photos, documents,
planning, et un portail de suivi pour le client final (lien magique, sans compte).

> Le README complet (déploiement, services réels) est finalisé en phase 7. Voir `docs/PLAN.md` et `docs/PROGRESS.md`.

## Démarrage rapide (sans Docker)

```bash
pnpm install
cp .env.example .env          # valeurs par défaut : tout est simulé, aucune clé requise
pnpm dev:local                # PostgreSQL embarqué (port 5433) + migrations + Next.js
pnpm db:seed                  # (dans un autre terminal) données de démo « Charpentes Martin »
```

Ou en deux temps : `pnpm db:local` dans un terminal, puis `pnpm setup && pnpm dev` dans un autre.

Ouvrez http://localhost:3000. Comptes de démo (mot de passe `chantier-demo`) :

| Rôle    | E-mail                      |
| ------- | --------------------------- |
| Patron  | patron@demo.chantierlink.fr |
| Bureau  | bureau@demo.chantierlink.fr |
| Ouvrier | jean@demo.chantierlink.fr   |
| Ouvrier | lucas@demo.chantierlink.fr  |

Les e-mails (invitations, mot de passe oublié…) sont visibles sur http://localhost:3000/dev/mails.

## Avec Docker (optionnel)

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL :5433, MinIO :9000/:9001, Mailpit :8025
pnpm setup && pnpm dev
```

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test               # unitaires
pnpm test:integration   # intégration (base chantierlink_test)
pnpm build && pnpm test:e2e   # E2E Playwright (base chantierlink_e2e)
```
