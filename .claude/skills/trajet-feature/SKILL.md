---
name: trajet-feature
description: Add the trajet domain feature to the Convoy/Carpool project. Uses the backend/frontend plop generators and fills the trajet-specific schema, routes, wiring, and verification steps from the CAN-VOITURAGE cahier des charges.
---

# Trajet feature generator

Cette skill documente la création de la fonctionnalité `trajet` pour le projet
CAN-VOITURAGE, en s'appuyant sur les conventions existantes de
`.claude/skills` et les générateurs Plop du dépôt.

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
Dans `apps/api/src/db/trajet.ts`, créer les colonnes correspondantes et
les lier au schéma. Inclure au minimum :
- `id`
- `driver_id`
- `departure_city`
- `destination_city`
- `departure_date_time`
- `seats_total`
- `seats_available`
- `price_per_seat`
- `description`
- `created_at`

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

### Service
Dans `apps/api/src/trajet/service.ts`, implémenter la logique métier :
- création du trajet
- lecture de la liste avec recherche/filtre si nécessaire
- lecture par id
- mise à jour conditionnelle
- suppression

## 4. Connecter le module

Dans `apps/api/src/app.ts`, ajouter :

```ts
import { trajetModule } from './modules/trajet'
```

Puis monter le module dans la chaîne de routes :

```ts
.route('/', trajetModule)
```

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

## 6. Test et renforcement

Améliorer le test généré dans `apps/api/tests/trajet/trajet.test.ts` :
- `GET /trajets` retourne `200`
- `POST /trajets` sans auth retourne `401`
- `POST /trajets` avec auth crée un trajet
- validation des champs obligatoires
- vérification de la propriété `driverId`

Mocker `../../src/db/client` et `../../src/auth/auth` comme dans les tests
existants.

## 7. Ajouter l'interface frontend (optionnel mais recommandé)

Si la fonctionnalité doit aussi exposer une page web :

```
pnpm gen frontend-feature trajets
```

Ensuite :
- utiliser `api['trajet'].$get()` ou `api['trajets'].$get()` selon l'endpoint
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
- conformité sur les données personnelle et sécurité
- évolutivité vers filtres prix / confort / bagages

Cette skill est conçue pour guider la mise en œuvre du module `trajet` dans
le dépôt existant tout en respectant les conventions backend/frontend du projet.
