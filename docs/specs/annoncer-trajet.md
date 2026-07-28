# Spec — Annoncer trajet (page de publication)

> Fiche de référence, pas une skill Claude Code. Elle documente comment la
> page "annoncer" a été (et devrait être) implémentée, pour s'y reporter
> manuellement si elle doit être retouchée ou réimplémentée. Volontairement
> gardée hors de `.claude/skills/` — seuls `backend-feature` et
> `frontend-feature` (génériques) restent des skills actives. Utiliser
> `frontend-feature` en s'appuyant sur cette fiche pour les détails
> spécifiques à cette page.

Cette fiche documente la page "annoncer", qui permet à un conducteur
authentifié de publier un nouveau trajet. Elle s'appuie sur
[`trajet-feature.md`](./trajet-feature.md) pour le contrat API.

## 1. Intent

- **Page** : formulaire de création/publication de trajet
- **Public** : conducteur authentifié
- **Fonctionnalités clés** :
  - Formulaire avec tous les champs de trajet (villes, date/heure, places, prix, etc.)
  - Appel API `POST /trajets` pour créer le trajet
  - Redirection vers la page de détail du trajet après succès
  - Gestion des erreurs et validation côté client
  - Support i18n (français/anglais)

## 2. Générer la page frontend

```
pnpm gen frontend-feature annoncer
```

Ce générateur crée la structure standard dans `apps/web/` :
- `src/app/[locale]/annoncer/page.tsx` — page racine
- `src/components/annoncer/` — composants (formulaire, etc.)
- Tests et types associés

## 3. Implémenter le formulaire

### Champs
- **Obligatoires** :
  - `departureCity` (string)
  - `destinationCity` (string)
  - `departureDateTime` (date + heure)
  - `seatsTotal` (number, min 1)
  - `pricePerSeat` (number, min 0)
- **Optionnels** :
  - `description` (string)
  - `comfort` (enum : `'standard' | 'confort' | 'premium'`)
  - `baggageAllowance` (string)

### Validation côté client
Utiliser Zod et React Hook Form pour valider avant envoi :
- `seatsTotal > 0`
- `departureDateTime` dans le futur
- villes de départ et d'arrivée différentes
- messages d'erreur localisés (clé `form.errors.*`, résolue via next-intl)

### Appel API
Utiliser le client RPC typé (`@carpool/api-client`), jamais un `fetch` brut
sur une URL en dur :

```typescript
const response = await api.trajets.$post({
  json: {
    departureCity: formData.departureCity,
    destinationCity: formData.destinationCity,
    departureDateTime: new Date(formData.departureDateTime).toISOString(),
    seatsTotal: formData.seatsTotal,
    pricePerSeat: formData.pricePerSeat,
    description: formData.description,
    comfort: formData.comfort,
    baggageAllowance: formData.baggageAllowance,
  },
});
```

### Gestion du succès
```typescript
const createdTrajet = await response.json();
router.push(`/trajets/${createdTrajet.id}`); // via @/i18n/navigation, la locale est gérée automatiquement
```

## 4. Ajouter les clés i18n

Dans `apps/web/messages/fr.json` et `apps/web/messages/en.json`, sous un
namespace `Annoncer` (mêmes clés dans les deux fichiers) :
- `title`, `form.departureCity`, `form.destinationCity`, `form.departureDateTime`,
  `form.seatsTotal`, `form.pricePerSeat`, `form.comfort` (+ variantes), `form.baggageAllowance`,
  `form.description`, `form.submit`, `form.submitting`, `form.success`
- `form.errors.*` : `required`, `seatsMin`, `priceMin`, `sameCities`, `pastDate`, `apiError`

Ne jamais coder une chaîne visible en dur dans le composant — tout passe par
next-intl.

## 5. Ajouter la navigation

Ajouter un lien vers `/annoncer` depuis la page `trajets` (liste), via
`Link` de `@/i18n/navigation` (pas `next/link` brut, pour garder le préfixe
de locale automatique).

## 6. Intégration avec TanStack Query

Le composant client (`AnnoncerList` ou équivalent) doit :
- rediriger vers `/sign-in` si l'utilisateur n'est pas authentifié
  (vérifier la session via `authClient.useSession()`)
- utiliser `useMutation` pour l'appel `POST /trajets`
- désactiver le bouton de soumission pendant l'envoi (`mutation.isPending`)
- afficher un message de succès/erreur après la réponse

## 7. Vérification finale

```bash
pnpm --filter @carpool/web lint
pnpm --filter @carpool/web typecheck
pnpm docker:up
```

Accéder à la page : `http://localhost:3000/fr/annoncer` (et `/en/annoncer`).

## 8. Notes spécifiques

- **Authentification** : la page `annoncer` doit être protégée (redirection
  si pas de session), pas seulement l'API.
- **`seatsAvailable`** : calculé côté backend comme `seatsTotal` à la
  création (pas de réservation initiale) — ne pas l'envoyer depuis le
  formulaire.
- **Timestamp** : convertir la date/heure du champ `datetime-local` en ISO
  8601 avant l'envoi à l'API.
- **Redirection post-création** : vers la page de détail du trajet créé, pour
  confirmation visuelle immédiate.
