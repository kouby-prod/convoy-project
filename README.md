# Convoy — Monorepo (squelette de base)

Ce dépôt est le **squelette de base** d'une place de marché de covoiturage : un site
web, une application mobile (iOS + Android) et une API. C'est seulement la
**structure et le câblage** du projet. Il n'y a **aucune logique métier** (pas
d'utilisateurs, pas de trajets, pas de paiements). Le but est d'avoir une base
propre et typée sur laquelle une équipe de deux personnes peut construire sans
tout refaire plus tard.

## Ce que ce projet prouve

Un seul type, `PingResponse`, est défini **une seule fois** dans
`packages/schemas`. Ce type traverse toute la stack :

```
packages/schemas  ->  apps/api  ->  packages/api-client  ->  apps/web + apps/mobile
```

Si vous changez ce schéma, l'API et **les deux clients** ne compilent plus tant
que vous ne les avez pas mis à jour. C'est la « colonne vertébrale du contrat »
et c'est le cœur du projet. (Voir [Tester la colonne vertébrale](#tester-la-colonne-vertébrale-du-contrat).)

---

## Prérequis

| Outil          | Version conseillée | Note                                              |
| -------------- | ------------------ | ------------------------------------------------- |
| **Node.js**    | `>= 20.11` (LTS)   | Testé avec Node `24.11.1`.                         |
| **pnpm**       | `>= 10`            | Testé avec pnpm `10.14.0`. `corepack enable` aide. |
| **PostgreSQL** | `>= 14`            | Seulement pour lancer les migrations Drizzle.      |
| **Docker**     | optionnel          | Pour lancer Postgres + Redis + les apps en conteneurs. |

> Le endpoint `/ping` **n'utilise pas** la base de données. Vous pouvez donc
> démarrer l'API, le web et le mobile et voir la preuve fonctionner **sans
> Postgres**. Postgres n'est nécessaire que pour les migrations.

---

## Structure

```
carpool/
├─ apps/
│  ├─ api/         # Backend Hono (zod-openapi, Swagger, Drizzle)
│  ├─ web/         # Next.js (App Router)
│  └─ mobile/      # Expo (expo-router)
├─ packages/
│  ├─ schemas/     # Schémas Zod partagés (les contrats)
│  ├─ api-client/  # Client RPC Hono typé (hc)
│  ├─ core/        # Logique TypeScript pure (ni React, ni DB, ni HTTP)
│  └─ config/      # tsconfig, ESLint et Prettier partagés
├─ infra/
│  ├─ Dockerfile.api / Dockerfile.web / Dockerfile.mobile
│  └─ docker-compose.infra.yml   # infra seule : Postgres + Redis
├─ docker-compose.yml            # stack appli (api, web, mobile) ; inclut l'infra
├─ .env.example                  # SEUL fichier d'env (racine) — source unique
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

---

## Versions exactes choisies

Les versions ci-dessous ont été vérifiées au moment de la création (et non prises
de mémoire). Le **piège connu** est résolu : `@hono/zod-openapi@1.4.0` déclare
`peerDependencies: { zod: "^4.0.0" }`, donc **Zod et zod-openapi sont alignés sur
Zod 4**. Utiliser Zod 3 casserait l'ensemble.

### Outils communs

| Paquet              | Version   |
| ------------------- | --------- |
| typescript          | `6.0.3`   |
| turbo               | `2.9.18`  |
| prettier            | `3.8.4`   |
| eslint              | `10.5.0`  |
| typescript-eslint   | `8.61.1`  |
| vitest              | `4.1.9`   |
| tsx                 | `4.22.4`  |
| tsup                | `8.5.1`   |

### Backend (`apps/api`)

| Paquet              | Version   |
| ------------------- | --------- |
| hono                | `4.12.25` |
| @hono/zod-openapi   | `1.4.0`   |
| @hono/swagger-ui    | `0.6.1`   |
| @hono/node-server   | `2.0.5`   |
| zod                 | `4.4.3`   |
| drizzle-orm         | `0.45.2`  |
| drizzle-kit         | `0.31.10` |
| pg                  | `8.21.0`  |
| dotenv              | `17.4.2`  |
| better-auth         | `1.6.19`  |
| @better-auth/cli    | `1.4.21`  |

> **Piège BetterAuth (résolu).** L'adaptateur Drizzle est importé depuis
> l'export interne `better-auth/adapters/drizzle` (présent dans `better-auth`
> `1.6.19`), donc aucune dépendance séparée. Les plugins utilisés sont
> `admin`, `phoneNumber` et `bearer` (importés de `better-auth/plugins`). Le
> schéma Drizzle d'auth est **généré par la CLI BetterAuth**, jamais écrit à la
> main.

### Web (`apps/web`)

| Paquet                | Version   |
| --------------------- | --------- |
| next                  | `16.2.9`  |
| react / react-dom     | `19.2.3`  |
| @tanstack/react-query | `5.101.0` |
| zod                   | `4.4.3`   |

### Mobile (`apps/mobile`) — Expo SDK 56

| Paquet                       | Version    |
| ---------------------------- | ---------- |
| expo                         | `~56.0.12` |
| expo-router                  | `~56.2.11` |
| react / react-dom            | `19.2.3`   |
| react-native                 | `0.85.3`   |
| react-native-web             | `~0.21.0`  |
| react-native-safe-area-context | `~5.7.0` |
| react-native-screens         | `~4.25.2`  |
| @tanstack/react-query        | `5.101.0`  |

> Les versions « natives » du mobile (react, react-native, expo-\*) suivent
> exactement ce qu'attend **Expo SDK 56** (`bundledNativeModules.json`). Ne les
> changez pas à la main : utilisez `npx expo install <paquet>`.

---

## Installation

À la racine du dépôt :

```bash
pnpm install
```

Cette commande installe toutes les apps et tous les paquets du workspace.

### Variables d'environnement — un seul `.env` à la racine

Il n'y a **qu'un seul fichier d'environnement**, à la **racine** du dépôt. Il
sert à la fois aux apps (dev local) et à Docker. Il n'y a **aucun** `.env` dans
`apps/*`.

```bash
cp .env.example .env
# puis éditez BETTER_AUTH_SECRET (openssl rand -base64 32)
```

Comment chaque app lit ce `.env` racine en dev local :

- **api** : chargé en code par `apps/api/src/load-env.ts` (importé en premier par
  `env.ts`), donc `dev`, `db:migrate`, `auth:generate` et `seed:admin` le voient.
- **web** : chargé dans `apps/web/next.config.ts` avant le build (les valeurs
  `NEXT_PUBLIC_*` sont alors injectées par Next).
- **mobile** : chargé dans `apps/mobile/metro.config.js` avant le bundling (les
  valeurs `EXPO_PUBLIC_*` sont alors injectées par Expo).

Côté API, les variables sont **validées par Zod au démarrage** : si une variable
manque ou est invalide, l'app s'arrête tout de suite avec un message clair.
Principales variables (voir `.env.example` pour la liste complète et les
valeurs Docker comme `DOCKER_DATABASE_URL` et les ports) :

- `DATABASE_URL` (tooling côté hôte) ; `PORT` / `API_PORT` (défaut `3001`)
- `BETTER_AUTH_SECRET` **(obligatoire, ≥ 32 caractères)** —
  `openssl rand -base64 32`
- `BETTER_AUTH_URL` (défaut `http://localhost:3001`)
- `TRUSTED_ORIGINS` (liste séparée par des virgules)
- `EMAIL_FROM`, `SMS_FROM` (placeholders ; stubs console)
- `NEXT_PUBLIC_API_URL` (web) · `EXPO_PUBLIC_API_URL` (mobile)

> **Sur téléphone physique**, `localhost` désigne le téléphone, pas votre
> ordinateur. Mettez l'IP locale de votre machine dans `EXPO_PUBLIC_API_URL`,
> par exemple `http://192.168.1.20:3001`.

---

## Lancer en développement

Vous pouvez tout lancer en même temps depuis la racine :

```bash
pnpm dev
```

Ou lancer chaque app séparément (recommandé pour le mobile) :

```bash
# API  -> http://localhost:3001  (Swagger : http://localhost:3001/docs)
pnpm --filter @carpool/api dev

# Web  -> http://localhost:3000
pnpm --filter @carpool/web dev

# Mobile -> ouvre Expo (scannez le QR code avec Expo Go, ou appuyez sur « w » pour le web)
pnpm --filter @carpool/mobile dev
```

### Points d'entrée de l'API

| Route                    | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `GET /health`            | `{ "status": "ok" }`                               |
| `GET /ping`              | renvoie `PingResponse` (validé par Zod)            |
| `ALL /api/auth/*`        | endpoints **BetterAuth** (sign-up, sign-in, OTP…)  |
| `GET /me`                | **(preuve)** utilisateur courant — exige une auth  |
| `GET /admin/health`      | **(preuve)** exige le rôle `admin`                 |
| `GET /openapi.json`      | document OpenAPI généré                            |
| `GET /docs`              | interface **Swagger UI**                           |

---

## Authentification (BetterAuth)

L'authentification est gérée **entièrement par BetterAuth** (hachage des mots de
passe, signature des jetons, sessions, CSRF, limitation de débit). On ne
réimplémente **aucune** de ces briques de sécurité.

### Modèle de session / jetons

- **Web (futur)** : sessions par **cookie httpOnly** (défaut BetterAuth).
- **Mobile / clients API** : plugin **bearer** activé. Après un sign-in, lisez
  l'en-tête de réponse `set-auth-token` et renvoyez-le ensuite via
  `Authorization: Bearer <token>`.
- **Expiry + rotation** : la session dure 7 jours (`expiresIn`) et son expiration
  est repoussée à chaque jour d'utilisation (`updateAge`). C'est le mécanisme
  natif « access + refresh » de BetterAuth — **pas** de code JWT maison.

### Fonctionnalités câblées

- Email + mot de passe, avec **vérification d'email obligatoire**
  (`requireEmailVerification: true`) et **réinitialisation de mot de passe**.
  Un utilisateur **non vérifié ne peut pas se connecter** tant qu'il n'a pas
  cliqué le lien de vérification.
- **Téléphone + OTP** (plugin `phoneNumber`) : code à 6 chiffres. L'OTP part
  via une **passerelle SMS auto-hébergée** si configurée, sinon il est **affiché
  dans la console** (cherchez `DEV SMS`). Voir [Envoi de SMS](#envoi-de-sms--passerelle-auto-hébergée-ou-console-bascule-par-env).
- **Google** (flux web par redirection), activé si `GOOGLE_CLIENT_ID/SECRET`
  sont définis. Voir [Connexion Google](#connexion-google-flux-web-par-redirection).
- **Rôles** `user` (défaut) et `admin` (plugin `admin`). Deux rôles, pas de
  moteur de permissions.

#### Envoi d'email : SMTP ou console (bascule par env)

L'expéditeur email est **pluggable** (`src/auth/email.ts`) et choisi au
démarrage selon l'environnement :

- **`SMTP_HOST` non défini** → **stub console** : le lien de vérification /
  réinitialisation est **imprimé dans les logs** de l'API (dev sans fournisseur).
- **`SMTP_HOST` défini** → **envoi réel via SMTP** (nodemailer). Marche avec
  n'importe quel serveur SMTP, y compris **Mailpit/MailHog** en local.

Variables (voir `.env.example`) : `SMTP_HOST`, `SMTP_PORT` (défaut `587`),
`SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`true` pour le port 465), `EMAIL_FROM`.
Le log au boot indique le mode actif : `[auth] email sender: …`.

> Boîte mail locale pour tester en vrai :
> `docker run -p 1025:1025 -p 8025:8025 axllent/mailpit`, puis
> `SMTP_HOST=localhost`, `SMTP_PORT=1025`, et ouvrez `http://localhost:8025`.

#### Envoi de SMS : passerelle auto-hébergée ou console (bascule par env)

L'expéditeur SMS est **pluggable** (`src/auth/sms.ts`), comme l'email :

- **`SMS_GATEWAY_URL` non défini** → **stub console** (l'OTP est imprimé dans les
  logs ; `DEV SMS`).
- **`SMS_GATEWAY_URL` défini** → **envoi réel via une passerelle auto-hébergée**
  — l'app Android **SMSGate** en **mode Local** (le téléphone fait tourner un
  serveur HTTP, **sans Firebase, sans cloud**). L'API fait un `POST` direct au
  téléphone sur le LAN.

**Mise en place (gratuit, sans Firebase) :**

1. Installez l'app **SMSGate** ([sms-gate.app](https://sms-gate.app/)) sur un
   téléphone Android avec une carte SIM (forfait SMS).
2. Activez **Local Server** ; l'app affiche `http://<ip-tel>:8080` et un
   **identifiant / mot de passe** (Basic auth).
3. Renseignez le `.env` racine :
   ```
   SMS_GATEWAY_URL=http://192.168.1.50:8080
   SMS_GATEWAY_USER=…
   SMS_GATEWAY_PASSWORD=…
   ```
4. Le téléphone doit être sur le **même réseau** que l'API. Le log au boot
   indique le mode : `[auth] sms sender: …`.

> **Sécurité** : Basic auth sur HTTP en clair = OK sur un LAN de confiance ;
> **n'exposez pas** le port `:8080` du téléphone sur Internet. L'envoi d'OTP est
> déjà limité en débit par BetterAuth (`/phone-number/send-otp`).

#### Connexion Google (flux web par redirection)

Le provider Google est **natif à BetterAuth** (pas de plugin) et activé
**uniquement** si `GOOGLE_CLIENT_ID` **et** `GOOGLE_CLIENT_SECRET` sont définis.
Aucune migration : la table `account` (déjà générée) stocke les comptes OAuth.

**Mise en place (Google Cloud Console, ~10 min) :**

1. Créez un projet → écran de consentement OAuth (External ; ajoutez votre email
   comme utilisateur de test).
2. **Credentials → OAuth 2.0 Client ID → Web application**.
3. **Authorized redirect URI** (exactement) :
   `http://localhost:3001/api/auth/callback/google`
4. Copiez l'ID et le secret dans le `.env` racine :
   ```
   GOOGLE_CLIENT_ID=…
   GOOGLE_CLIENT_SECRET=…
   ```
5. Redémarrez l'API (`pnpm --filter @carpool/api dev`).

**Tester (navigateur, le flux OAuth exige une vraie page de consentement) :**

- Ouvrez **`http://localhost:3001/google-demo`** (page de preuve dev), cliquez
  « Continue with Google », validez le consentement → vous atterrissez sur
  `/me` qui affiche l'utilisateur (session par cookie). Un `user` + une ligne
  `account` (provider `google`) sont créés.
- Équivalent sans la page : `POST /api/auth/sign-in/social`
  `{ "provider": "google", "callbackURL": "http://localhost:3001/me" }` renvoie
  `{ "url": … }` ; ouvrez cette URL dans le navigateur.

> **Liaison de comptes** : une connexion Google se **relie** à un compte
> email/mot de passe existant ayant le même email (`accountLinking` +
> `trustedProviders: ['google']`). C'est sûr car Google **certifie** l'email ;
> n'ajoutez **pas** de provider qui ne vérifie pas l'email (risque de prise de
> contrôle de compte). Comme Google fournit un email vérifié, ces connexions
> passent sans friction malgré `requireEmailVerification: true`.

> ⚠️ On ne peut **pas** tester Google entièrement en `curl` : l'écran de
> consentement nécessite un navigateur.

### Migrations (tables d'auth)

Le schéma Drizzle d'auth est **généré par la CLI BetterAuth**, puis transformé
en migration SQL par drizzle-kit. La migration initiale crée les tables
`user`, `session`, `account`, `verification` (elle remplace l'ancienne migration
vide du squelette).

```bash
# 1. (re)générer le schéma Drizzle depuis la config BetterAuth, si elle change
pnpm --filter @carpool/api auth:generate

# 2. (re)générer la migration SQL depuis le schéma
pnpm db:generate

# 3. appliquer les migrations
pnpm db:migrate
```

> Sur un dépôt fraîchement cloné, les fichiers générés (`src/db/auth-schema.ts`
> et `apps/api/drizzle/*`) sont **déjà commités** : il suffit donc de lancer
> Postgres puis `pnpm db:migrate`.

### Comptes de démo (dev uniquement)

Trois comptes déjà vérifiés, mot de passe commun `DevPass123!`. Le script
refuse de tourner si `NODE_ENV=production` ou si Postgres / BetterAuth ne
sont pas en localhost :

```bash
pnpm seed:dev-users
```

| Rôle        | Email                     | Mot de passe   |
| ----------- | ------------------------- | -------------- |
| Admin       | `admin@kouby.local`       | `DevPass123!`  |
| Conducteur  | `driver@kouby.local`      | `DevPass123!`  |
| Passager    | `passenger@kouby.local`   | `DevPass123!`  |

Le conducteur a aussi deux trajets d'exemple (Montréal ↔ Québec) pour tester
une réservation. Idempotent : relancer remet le mot de passe documenté.

### Créer le premier admin

Un système de rôles sans admin est inutilisable, et l'API d'admin de BetterAuth
exige déjà un admin (problème de l'œuf et la poule). En local, `pnpm seed:dev-users`
crée déjà `admin@kouby.local`. Sinon, promeuvez un utilisateur **existant** :

```bash
# 1. inscrivez-vous normalement (voir « Tester l'auth » ci-dessous)
# 2. promouvez ce compte
pnpm --filter @carpool/api seed:admin alice@example.com
```

### Tester l'auth en local

Avec Postgres lancé, les migrations appliquées et l'API démarrée
(`pnpm --filter @carpool/api dev`) :

```bash
BASE=http://localhost:3001

# Inscription (email + mot de passe) — un email de vérification est envoyé
# (dans les logs de l'API en mode console : cherchez « DEV EMAIL » et son lien).
curl -X POST "$BASE/api/auth/sign-up/email" -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"supersecret123","name":"Alice"}'

# Vérifiez l'email en ouvrant le lien des logs (ou via SMTP/Mailpit). La
# vérification est OBLIGATOIRE : sans elle, la connexion renvoie 403.
curl "<LIEN_DE_VERIFICATION_DES_LOGS>"

# Connexion (après vérification) — jeton bearer dans l'en-tête `set-auth-token`
curl -i -X POST "$BASE/api/auth/sign-in/email" -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"supersecret123"}'

# /me sans auth -> 401 ; avec le bearer -> 200
curl "$BASE/me" -H "Authorization: Bearer <TOKEN>"

# /admin/health : 403 pour un user ; 200 après `seed:admin`
curl "$BASE/admin/health" -H "Authorization: Bearer <TOKEN>"

# Téléphone + OTP : l'OTP s'affiche dans les logs de l'API (cherchez « DEV SMS »)
curl -X POST "$BASE/api/auth/phone-number/send-otp" -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+33612345678"}'
curl -X POST "$BASE/api/auth/phone-number/verify" -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+33612345678","code":"<OTP_DES_LOGS>"}'
```

---

## Migrations de base de données

Les migrations Drizzle créent désormais les **tables d'authentification**
BetterAuth (voir [Authentification](#authentification-betterauth)). Il n'y a
toujours **aucune table métier** (rides, bookings, …).

1. Démarrez Postgres (par exemple `pnpm docker:infra`) et vérifiez que
   `DATABASE_URL` dans le `.env` **racine** est correct.
2. Lancez la migration :

```bash
pnpm db:migrate
# (équivaut à : pnpm --filter @carpool/api db:migrate)
```

`pnpm docker:up` fait cette étape tout seul via `api-migrate`. En production,
lancez le même binaire **avant** de basculer le trafic : `node dist/migrate.js`
(script `db:migrate:prod` sur `@carpool/api`). Ne l'appelez pas depuis le
processus HTTP de l'API.

Plus tard, quand vous ajouterez des tables métier dans
`apps/api/src/db/schema.ts`, générez une nouvelle migration avec
`pnpm db:generate`.

---

## Scripts utiles (à la racine)

| Commande         | Effet                                                   |
| ---------------- | ------------------------------------------------------- |
| `pnpm dev`       | Lance toutes les apps en dev (via Turborepo).           |
| `pnpm build`     | Build toutes les apps et tous les paquets.              |
| `pnpm typecheck` | Vérifie les types partout (`tsc --noEmit`).             |
| `pnpm lint`      | ESLint sur tout le workspace.                           |
| `pnpm test`      | Lance les tests (Vitest) — le paquet `core` a un test.  |
| `pnpm format`    | Formate tout le code avec Prettier.                     |

---

## Docker

Le Docker est réparti en **deux fichiers compose** :

- `docker-compose.yml` (**à la racine**) — la stack applicative : **api**,
  **web** (et **mobile** via un profil). Il **inclut** automatiquement l'infra.
- `infra/docker-compose.infra.yml` — l'infra seule : **Postgres** + **Redis** +
  **MinIO** (stockage objet des documents conducteurs).

Grâce au `include:`, lancer la stack racine démarre aussi l'infra ; on peut
aussi lancer l'infra seule (utile si les apps tournent sur la machine hôte).

### Configuration : un seul `.env` à la racine

Toute la configuration vient d'**un seul fichier `.env` à la racine** du dépôt.
Les deux fichiers compose ne contiennent **aucune valeur en dur** : chaque
valeur est une référence `${VAR}` résolue depuis ce `.env`.

```bash
# 1. créez le .env racine et mettez un secret fort
cp .env.example .env
#    puis éditez BETTER_AUTH_SECRET (openssl rand -base64 32)

# 2a. tout démarrer (infra + apps) — le script pointe vers le .env racine
pnpm docker:up
#     équivaut à :  docker compose --env-file .env up --build

# 2b. (option) démarrer SEULEMENT l'infra (Postgres + Redis + MinIO), apps sur l'hôte
pnpm docker:infra
#     équivaut à :  docker compose --env-file .env -f infra/docker-compose.infra.yml up -d

# arrêter :
pnpm docker:down
```

> Comme le `docker-compose.yml` est à la racine, `docker compose` le trouve tout
> seul (pas besoin de `-f`). Si `BETTER_AUTH_SECRET` manque, **compose s'arrête
> tout de suite** avec un message clair (au lieu de laisser l'API planter au
> démarrage). Le `.env` racine est gitignoré.

- **postgres** : exposé sur `localhost:${POSTGRES_PORT}` (défaut `5433`, pour ne
  pas entrer en conflit avec un Postgres déjà installé sur le poste).
- **redis** : exposé sur `localhost:${REDIS_PORT}` (défaut `6379`). **Pas encore
  utilisé** par l'app — infra prête pour plus tard (cache, files d'attente).
- **minio** : API S3 sur `localhost:${S3_PORT}` (défaut `9000`), console web sur
  `localhost:${S3_CONSOLE_PORT}` (défaut `9001`). Contient les documents
  d'identité des conducteurs. Le bucket `${S3_BUCKET}` est **créé automatiquement
  au démarrage de l'API** — aucune étape manuelle.
- **api** : `localhost:${API_PORT}` (défaut `3001`). Dans le conteneur, l'API
  parle à Postgres via `DOCKER_DATABASE_URL` (hôte = le service `postgres`) et à
  MinIO via `DOCKER_S3_ENDPOINT` (hôte = le service `minio`). Un service
  `api-migrate` (même image) applique les migrations Drizzle au démarrage, puis
  s'arrête.
- **web** : `localhost:${WEB_PORT}` (défaut `3000`).
- **mobile** : fourni mais optionnel (`pnpm docker:up --profile mobile`). Le dev
  mobile se fait normalement sur la machine hôte, pas dans un conteneur. Voir
  `infra/Dockerfile.mobile`.

> **Migrations** : `pnpm docker:up` runs a one-shot `api-migrate` container
> (same image as the API, `node dist/migrate.js`) **before** the API starts.
> It only needs `DOCKER_DATABASE_URL`. If migrate fails, Compose does not
> start `api`. Host-side `pnpm db:migrate` is still the command when you run
> the API on the machine against `pnpm docker:infra`.

---

## Tester la colonne vertébrale du contrat

C'est le test d'acceptation le plus important. Modifiez le schéma
`PingResponse` dans `packages/schemas/src/ping.ts` (par exemple renommez
`message` en `headline`), puis lancez :

```bash
pnpm typecheck
```

Vous devez voir des **erreurs de type** dans `apps/api`, `apps/web` **et**
`apps/mobile`. C'est la preuve que le contrat est partagé et typé de bout en
bout. Remettez le schéma comme avant : tout recompile.

> Vérifié pendant la création : renommer `message` casse bien le handler de
> l'API **et** les deux écrans (`web/src/app/page.tsx`,
> `mobile/app/index.tsx`).

---

## Hypothèses faites

- **Node `>= 20.11`** est supposé disponible (testé sur `24.11.1`). Les
  Dockerfiles utilisent `node:22-alpine`.
- **pnpm `>= 10`** est le gestionnaire de paquets (déclaré dans
  `packageManager`). `corepack enable` est conseillé.
- `.npmrc` utilise `node-linker=hoisted`. C'est le réglage le plus fiable pour
  faire fonctionner **Expo / React Native** dans un monorepo pnpm.
- Les paquets partagés (`schemas`, `core`, `api-client`) exportent du **code
  TypeScript source** (pas de build séparé). Next les transpile via
  `transpilePackages`, Metro via `watchFolders`, et l'API les bundle avec
  **tsup** pour la production.
- **Redis** est présent dans `docker-compose` à titre d'infra, mais n'est
  **branché à rien** dans le code (hors périmètre).
- **Auth** : `requireEmailVerification` est à **`true`** — un compte non vérifié
  ne peut pas se connecter. En dev sans SMTP, le lien de vérification est dans
  les logs (stub console) ; sinon il est envoyé par SMTP. La **limitation de
  débit** est en mémoire (dev) ; un `// TODO` indique de la passer sur Redis via
  `secondaryStorage` en prod. Les fichiers générés (`src/db/auth-schema.ts`,
  `apps/api/drizzle/*`) sont **commités**.
- **Environnement** : un **seul** `.env` à la racine sert les apps (dev) et
  Docker. Il n'est pas commité ; copiez `.env.example`. Il n'y a aucun `.env`
  dans `apps/*`.

---

## Hors périmètre (volontairement absent)

Côté **auth, déjà fait** : email + mot de passe, téléphone + OTP, **Google
(flux web)**, rôles `user`/`admin`, sessions cookie + bearer (voir
[Authentification](#authentification-betterauth)).

**Toujours hors périmètre** : intégration auth côté **web/mobile** (l'UI ; le
back est prêt), **autres providers OAuth** (seul Google est câblé) et le flux
Google par **jeton d'ID natif** (mobile), **dépendance dure à Redis**
(`secondaryStorage` brançhable plus tard), modèles/tables métier, paiements,
cartes/géospatial, et tout RBAC au-delà de `user`/`admin`. (L'email a un
transport **SMTP** et le SMS une **passerelle auto-hébergée**, tous deux
activables par env.) Là où les briques restantes arriveront, un `// TODO:` ou un
dossier vide marque l'emplacement (par exemple `apps/api/src/modules/`).

---

## Confirmation

Après `pnpm install` et la configuration des `.env` décrite ci-dessus, les
commandes de dev lancent bien **l'API, le web et le mobile**, et la preuve
`/ping` s'affiche **sur le web et sur le mobile** (message + timestamp). Pendant
la création, ont été vérifiés avec succès : `pnpm install`, `pnpm typecheck`
(7/7), `pnpm lint`, le test Vitest de `core`, le build `tsup` de l'API (avec
appels réels à `/health`, `/ping`, `/openapi.json` et `/docs`), le build
`next build` du web, et le test de rupture du contrat décrit plus haut.

### Auth — tests d'acceptation vérifiés (contre un vrai Postgres)

- Inscription **et** connexion email + mot de passe via `/api/auth/*` : OK.
- `/me` sans auth → **401** ; avec bearer → **200** + utilisateur : OK.
- `/admin/health` en tant que `user` → **403** ; en tant qu'`admin` (après
  `seed:admin`) → **200** : OK.
- Téléphone + OTP de bout en bout avec le stub SMS console (l'OTP apparaît dans
  les logs) : OK.
- Les migrations créent proprement les tables BetterAuth (`user`, `session`,
  `account`, `verification`) depuis zéro : OK.
- **Tests automatisés** de `requireAuth` / `requireRole` (401 / 200 / 403, plus
  rôles multiples) : **6/6** via `pnpm --filter @carpool/api test`.

> Email : la bascule d'expéditeur a été vérifiée au boot — `SMTP_HOST` vide →
> `email sender: console stub`, `SMTP_HOST` défini → `email sender: SMTP (…)` —
> et le build `tsup` (avec nodemailer) passe. `requireEmailVerification` est
> maintenant à `true` ; le flux complet « inscription → connexion bloquée →
> vérification → connexion OK » se teste avec Postgres lancé (voir
> [Tester l'auth en local](#tester-lauth-en-local)).
