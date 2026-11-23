# Brancher les vrais services

Par défaut tout est **simulé** : l'application fonctionne entièrement sans clé. Chaque service se branche avec
quelques variables d'environnement (`.env` en local, `.env` à côté de `docker-compose.yml` en production), puis un
redémarrage (`docker compose up -d`). Si une configuration est incomplète, l'application revient au mode simulé et le
signale dans les journaux.

## WhatsApp (Meta WhatsApp Cloud API)

1. Sur https://developers.facebook.com : créer une application « Business », ajouter le produit **WhatsApp**, associer
   un numéro professionnel (le numéro unique sur lequel vos ouvriers écrivent).
2. Récupérer le **Phone number ID**, générer un **jeton d'accès permanent** (utilisateur système) et noter le
   **secret de l'application** (Paramètres › Général).
3. Webhook : URL `https://<votre-domaine>/api/webhooks/whatsapp`, jeton de vérification = `WHATSAPP_VERIFY_TOKEN`,
   abonnement au champ **messages**.

```dotenv
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCESS_TOKEN=EAAG...
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_APP_SECRET=<secret de l'application>     # vérifie la signature X-Hub-Signature-256
WHATSAPP_VERIFY_TOKEN=<chaîne au choix>
WHATSAPP_BUSINESS_NUMBER=+33612345678
```

4. Dans ChantierLink : Équipe › « Associer un numéro WhatsApp » pour chaque ouvrier. Un numéro inconnu reçoit une
   réponse polie et son message est ignoré.

> Hors fenêtre de 24 h après le dernier message de l'ouvrier, Meta impose des modèles de messages approuvés pour
> écrire en premier ; les réponses « Reçu ✅ » partent toujours dans cette fenêtre.

## Transcription des vocaux (Whisper)

API compatible OpenAI (OpenAI, Groq, ou un serveur auto-hébergé `whisper.cpp` / `faster-whisper` dans l'UE) :

```dotenv
TRANSCRIPTION_PROVIDER=whisper
WHISPER_API_URL=https://api.openai.com/v1/audio/transcriptions   # ou http://whisper:9000/v1/audio/transcriptions
WHISPER_API_KEY=sk-...                                            # vide pour un serveur local sans clé
WHISPER_MODEL=whisper-1
```

Gratuit (avec quotas) via Groq, même clé que pour l'IA ci-dessous :

```dotenv
TRANSCRIPTION_PROVIDER=whisper
WHISPER_API_URL=https://api.groq.com/openai/v1/audio/transcriptions
WHISPER_API_KEY=gsk_...                                           # https://console.groq.com/keys
WHISPER_MODEL=whisper-large-v3-turbo
```

## Intelligence artificielle

Utilisée pour rattacher un message WhatsApp ambigu au bon chantier, classer les documents et rédiger le résumé du
jour. Sorties structurées validées ; en cas d'erreur, de refus ou de quota atteint, l'heuristique locale prend le
relais.

**Claude (API Anthropic, payant)** — sorties structurées natives :

```dotenv
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...            # https://console.anthropic.com
ANTHROPIC_MODEL=claude-opus-5-5          # modèle par défaut
AUTO_CLASSIFY_THRESHOLD=0.75            # en dessous : « À traiter »
```

**API compatible OpenAI** — Groq (offre gratuite avec quotas, serveurs hors UE), OpenAI, Mistral, ou Ollama en
local (gratuit, sans clé, aucune donnée ne sort du serveur). Mode JSON + validation Zod :

```dotenv
LLM_PROVIDER=openai
LLM_API_URL=https://api.groq.com/openai/v1   # Ollama : http://localhost:11434/v1
LLM_API_KEY=gsk_...                          # vide pour Ollama
LLM_MODEL=llama-3.3-70b-versatile            # liste : GET <LLM_API_URL>/models
```

## OCR (factures photographiées, scans)

Les PDF avec texte sont lus directement. Pour les photos de factures :

```dotenv
OCR_PROVIDER=tesseract    # OCR local en français (tesseract.js), aucun service externe
```

Le premier usage télécharge le modèle de langue français (~15 Mo). Les PDF scannés sans couche texte passent par
« À traiter ».

## E-mails sortants (SMTP)

Tout prestataire SMTP (Brevo, Mailjet, Scaleway TEM, OVH…). Configurez SPF / DKIM / DMARC sur votre domaine.

```dotenv
MAIL_DRIVER=smtp
MAIL_FROM=Mon Entreprise <suivi@mon-entreprise.fr>
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false          # true pour le port 465
SMTP_USER=...
SMTP_PASSWORD=...
```

## E-mail entrant (« Transférez vos factures »)

Chaque entreprise a une adresse `docs-<identifiant>@INBOUND_MAIL_DOMAIN` (visible dans Documents et Paramètres).

1. Choisir un sous-domaine (ex. `docs.mon-saas.fr`) et le configurer chez un fournisseur d'e-mail entrant
   (Postmark Inbound, Mailgun Routes, Brevo Inbound Parsing…) ou un serveur SMTP maison.
2. Configurer le transfert du **message brut (MIME)** en POST vers
   `https://<votre-domaine>/api/webhooks/inbound-mail?secret=<INBOUND_MAIL_SECRET>` (ou en-tête
   `X-Inbound-Secret`). Si le fournisseur n'envoie que du JSON, un petit relais doit reconstituer le MIME.

```dotenv
INBOUND_MAIL_DOMAIN=docs.mon-saas.fr
INBOUND_MAIL_SECRET=<chaîne longue et aléatoire>
```

## Stockage des fichiers (S3)

Toute offre compatible S3 en UE (Scaleway Object Storage, OVHcloud, Garage ou MinIO auto-hébergé) :

```dotenv
STORAGE_DRIVER=s3
S3_ENDPOINT=https://s3.fr-par.scw.cloud
S3_REGION=fr-par
S3_BUCKET=chantierlink-prod
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false
```

Le bucket reste **privé** : l'application diffuse les fichiers via des URL signées.

## Paiement (Stripe)

1. Dans Stripe : créer 3 produits avec un prix mensuel récurrent (Solo 29 €, Équipe 59 €, Pro 99 €) et activer le
   portail client.
2. Webhook : `https://<votre-domaine>/api/webhooks/stripe`, événements `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`.

```dotenv
BILLING_ENABLED=true            # active les limites (membres, stockage) et la fin d'essai
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SOLO=price_...
STRIPE_PRICE_TEAM=price_...
STRIPE_PRICE_PRO=price_...
```

Avec `BILLING_PROVIDER=mock`, une page de paiement simulée permet de tester les formules sans carte.

## Notifications push (Web Push)

```bash
pnpm vapid      # génère une paire de clés
```

```dotenv
VAPID_PUBLIC_KEY=B...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@mon-entreprise.fr
```

Un bouton « Activer les notifications » apparaît alors sur la page « Moi » des ouvriers. HTTPS obligatoire (sauf
`localhost`).
