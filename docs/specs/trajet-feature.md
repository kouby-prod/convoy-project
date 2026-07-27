# Spec — Trajet feature

> Fiche de référence, pas une skill Claude Code. Elle documente comment la
> fonctionnalité `trajet` a été (et devrait être) implémentée, pour s'y
> reporter manuellement si elle doit être retouchée ou réimplémentée.
> Volontairement gardée hors de `.claude/skills/` pour ne pas être proposée
> automatiquement sur de futures fonctionnalités sans rapport — seuls
> `backend-feature` et `frontend-feature` (génériques) restent des skills
> actives. Utiliser ces deux générateurs en s'appuyant sur cette fiche pour
> les détails spécifiques au domaine `trajet`.

Cette fiche documente la fonctionnalité `trajet` du projet CAN-VOITURAGE, en
s'appuyant sur les conventions de `.claude/skills/backend-feature` et
`.claude/skills/frontend-feature`.

## 1. Intent
- Domaine principal : `trajet`
- Public cible : conducteur qui publie un trajet et passager qui recherche un trajet
- Points fonctionnels clés :
  - ville de départ
  - ville d'arrivée
  - date et heure de départ
  - nombre de places totales et disponibles
  - prix par place
  - optionnel : confort, bagages, note conducteur, description
- Authentification :
  - `GET /trajets` et `GET /trajets/:id` publics
  - `POST /trajets` protégé (`requireAuth`)
  - `PATCH /trajets/:id` et `DELETE /trajets/:id` protégés pour le conducteur ou l'admin

## 2. Exécuter le générateur backend

```
pnpm gen backend-feature trajet
```

Ce générateur crée la structure standard :
- `packages/schemas/src/trajet.ts`
- `apps/api/src/db/trajet.ts`
- `apps/api/src/modules/trajet/trajet.routes.ts`
- `apps/api/src/modules/trajet/index.ts`
- `apps/api/tests/trajet/trajet.test.ts`

## 3. Remplir le domaine `trajet`

### Schéma
Dans `packages/schemas/src/trajet.ts`, remplacer les placeholders par un schéma
réel. Exemple :
- `id` : `z.string()`
- `driverId` : `z.string()`
- `departureCity` : `z.string()`
- `destinationCity` : `z.string()`
- `departureDateTime` : `z.string().datetime()` ou deux champs séparés
- `seatsTotal` : `z.number().int().min(1)`
- `seatsAvailable` : `z.number().int().min(0)`
- `pricePerSeat` : `z.number().min(0)`
- `description` : `z.string().optional()`
- `comfort` : `z.enum(['standard', 'confort', 'premium']).optional()`
- `baggageAllowance` : `z.string().optional()`

Le schéma est la source de vérité des types API.

### Table
Dans `apps/api/src/db/trajet.ts` (ou `trajet-schema.ts` selon la convention
en place au moment de l'implémentation), créer les colonnes correspondantes
et les lier au schéma. Inclure au minimum :
- `id`
- `driver_id`
- `departure_city`
- `destination_city` (ou `arrival_city` si ce nom est déjà utilisé côté DB —
  garder un mapping unique et explicite dans le `serialize`, sans logique de
  repli sur plusieurs noms de colonnes)
- `departure_date_time`
- `seats_total`
- `seats_available`
- `price_per_seat`
- `comfort`
- `baggage_allowance`
- `description`
- `created_at`

**Piège vécu** : `comfort` et `baggageAllowance` sont acceptés par le contrat
Zod et soumis par le formulaire frontend — s'assurer qu'ils existent bien
comme colonnes et qu'ils sont inclus dans l'insert, sinon ces données sont
silencieusement perdues.

### Routes
Dans le module `apps/api/src/modules/trajet/trajet.routes.ts` :
- `GET /trajets` → liste des trajets
- `GET /trajets/:id` → détail d'un trajet
- `POST /trajets` → création d'un trajet (auth requise)
- `PATCH /trajets/:id` → mise à jour d'un trajet (auth requise)
- `DELETE /trajets/:id` → suppression d'un trajet (auth requise)

Pour `POST`, `PATCH` et `DELETE`, appliquer `requireAuth()` et vérifier que le
conducteur est bien propriétaire du trajet si la route est censée être
restreinte.

### Service / logique métier
Implémenter directement dans le module (`apps/api/src/modules/trajet/index.ts`),
via Drizzle ORM (`db.select/insert/update`, jamais de SQL brut à la main) :
- création du trajet
- lecture de la liste avec recherche/filtre si nécessaire
- lecture par id
- mise à jour conditionnelle
- suppression

Ne pas dupliquer cette logique dans un second dossier parallèle
(ex. `apps/api/src/trajet/`) — une seule implémentation, montée une seule
fois dans `app.ts`.

### Réservation (booking), si le périmètre l'inclut
Si le cahier des charges couvre la réservation de places par un passager :
- ajouter une route dédiée dans le même module, ex. `POST /trajets/:id/book`
  (path OpenAPI en `{id}`, pas en `:id`)
- décrémenter `seats_available` de façon atomique : `db.transaction(...)`
  avec un verrou de ligne (`.for('update')`) sur le trajet ciblé, insertion de
  la réservation, puis mise à jour du nombre de places — le tout dans la
  même transaction.
- ne pas câbler cette route à la main dans `app.ts` : elle doit faire partie
  du module `trajetModule`, monté via `.route('/', trajetModule)`.

## 4. Connecter le module

Dans `apps/api/src/app.ts`, ajouter :

```ts
import { trajetModule } from './modules/trajet';
```

Puis monter le module dans la chaîne de routes :

```ts
.route('/', trajetModule)
```

C'est le **seul** endroit où `app.ts` doit connaître `trajet`. Toute logique
métier (y compris la réservation) doit vivre dans le module, pas dans `app.ts`.

Vérifier que le module apparaît dans la doc Swagger `/docs`.

## 5. Migration de la base

Démarrer l'infrastructure si nécessaire :

```
pnpm docker:infra
```

Générer et appliquer la migration :

```
pnpm --filter @carpool/api db:generate
pnpm --filter @carpool/api db:migrate
```

**Ne jamais écrire un fichier de migration `.sql` à la main.** Un fichier de
migration non généré par `drizzle-kit generate` n'est pas enregistré dans
`apps/api/drizzle/meta/_journal.json` — le migrateur (`drizzle-orm/node-postgres/migrator`)
ne lit que ce journal, donc un tel fichier ne sera **jamais appliqué** par
`pnpm db:migrate`, même s'il est présent dans le dossier `drizzle/`. Toujours
passer par `db:generate` après une modification du schéma.

## 6. Test et renforcement

Couvrir dans `apps/api/tests/trajet/trajet.test.ts` :
- `GET /trajets` retourne `200`
- `GET /trajets/:id` retourne `404` si absent, `200` sinon
- `POST /trajets` sans auth retourne `401`
- `POST /trajets` avec auth crée un trajet
- validation des champs obligatoires
- vérification de la propriété `driverId`
- si booking : succès, `400` places insuffisantes, `404` trajet inexistant, `401` sans auth

Mocker `../../src/db/client` (le client Drizzle `db`, pas un `pool.query` brut)
et `../../src/auth/auth` comme dans les tests existants. Pour mocker le query
builder Drizzle, une chaîne factice "thenable" (`from/where/for/values/set`
renvoyant `this`, `then` résolvant une valeur configurée) suffit et évite de
dépendre d'une vraie base de données.

## 7. Ajouter l'interface frontend (optionnel mais recommandé)

Si la fonctionnalité doit aussi exposer une page web, voir
[`annoncer-trajet.md`](./annoncer-trajet.md) pour la page de publication, et :

```
pnpm gen frontend-feature trajets
```

Ensuite :
- utiliser `api.trajets.$get()` / `api.trajets[':id'].$get()` selon l'endpoint
- afficher la liste des trajets
- proposer un formulaire de publication pour conducteurs
- ajouter un lien de navigation locale via `@/i18n/navigation`
- ajouter les clés i18n dans `apps/web/messages/fr.json` et `apps/web/messages/en.json`

## 8. Vérification finale

Lancer :

```
pnpm --filter @carpool/api lint
pnpm --filter @carpool/api typecheck
pnpm --filter @carpool/api test
```

Puis, si possible :

```
pnpm docker:up
```

Et tester les endpoints dans `/docs`.

## Notes spécifiques CAN-VOITURAGE

La fonctionnalité `trajet` doit clairement refléter le cahier des charges :
- publication de trajet conducteur
- recherche de trajet passager
- informations principales : villes, date/heure, places, prix
- conformité sur les données personnelles et sécurité
- évolutivité vers filtres prix / confort / bagages
