---
name: annoncer-trajet
description: Create the "annoncer" page for publishing a new trajet (carpool ride). Uses the frontend-feature generator to scaffold a Next.js form page with i18n support, then wires it to the trajet API backend and adds navigation links.
---

# Annoncer Trajet (Create/Publish Trajet) Feature

Cette skill documente la création de la page "annoncer" permettant aux conducteurs de publier un nouveau trajet.

## 1. Intent

- **Page** : formulaire de création/publication de trajet
- **Public** : conducteur authentifié
- **Fonctionnalités clés** :
  - Formulaire avec tous les champs de trajet (villes, date/heure, places, prix, etc.)
  - Appel API `POST /trajets` pour créer le trajet
  - Redirection vers page de détail du trajet après succès
  - Gestion des erreurs et validation côté client
  - Support i18n (français/anglais)

## 2. Générer la page frontend

```
pnpm gen frontend-feature annoncer
```

Ce générateur crée la structure standard dans `apps/web/`:
- `src/app/[locale]/annoncer/page.tsx` – page racine
- `src/components/annoncer/` – composants (formulaire, etc.)
- Tests et types associés

## 3. Implémenter le formulaire

### Structure du composant
Dans `src/components/annoncer/AnnoncerForm.tsx`, créer un formulaire avec:
- **Champs obligatoires** :
  - `departureCity` (string)
  - `destinationCity` (string)
  - `departureDateTime` (date + time)
  - `seatsTotal` (number, min 1)
  - `pricePerSeat` (number, min 0)

- **Champs optionnels** :
  - `description` (string)
  - `comfort` (enum: 'standard' | 'confort' | 'premium')
  - `baggageAllowance` (string)

### Validation côté client
Utiliser Zod et React Hook Form pour valider avant envoi:
- Vérifier que `seatsTotal > 0`
- Vérifier que `departureDateTime` est dans le futur
- Vérifier que les villes ne sont pas identiques
- Messages d'erreur localisés

### Appel API
```typescript
// Utiliser le client RPC typé
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
Après la création réussie:
```typescript
const createdTrajet = await response.json();
router.push(`/${locale}/trajets/${createdTrajet.id}`);
```

## 4. Ajouter les clés i18n

### Dans `apps/web/messages/fr.json`
```json
{
  "annoncer": {
    "heading": "Annoncer un trajet",
    "description": "Publiez votre trajet et commencez à voyager avec des passagers",
    "form": {
      "departureCity": "Ville de départ",
      "departureCityPlaceholder": "ex. Paris",
      "destinationCity": "Ville d'arrivée",
      "destinationCityPlaceholder": "ex. Lyon",
      "departureDateTime": "Date et heure de départ",
      "seatsTotal": "Nombre de places",
      "seatsTotalPlaceholder": "ex. 4",
      "pricePerSeat": "Prix par place (€)",
      "pricePerSeatPlaceholder": "ex. 25",
      "description": "Description (optionnel)",
      "descriptionPlaceholder": "Musique, wifi, climatisation...",
      "comfort": "Niveau de confort",
      "comfortStandard": "Standard",
      "comfortConfort": "Confort",
      "comfortPremium": "Premium",
      "baggageAllowance": "Bagages autorisés",
      "baggageAllowancePlaceholder": "ex. 1 valise, 1 sac à dos",
      "submit": "Publier le trajet",
      "submitting": "Publication en cours...",
      "errors": {
        "required": "Ce champ est obligatoire",
        "invalidCity": "Veuillez entrer une ville valide",
        "seatsMin": "Au moins 1 place requise",
        "priceMin": "Le prix doit être positif",
        "sameCities": "Les villes de départ et d'arrivée doivent être différentes",
        "pastDate": "La date doit être dans le futur",
        "apiError": "Erreur lors de la publication. Veuillez réessayer."
      },
      "success": "Trajet publié avec succès!"
    }
  }
}
```

### Dans `apps/web/messages/en.json`
```json
{
  "annoncer": {
    "heading": "Announce a ride",
    "description": "Publish your ride and start traveling with passengers",
    "form": {
      "departureCity": "Departure city",
      "departureCityPlaceholder": "e.g. Paris",
      "destinationCity": "Destination city",
      "destinationCityPlaceholder": "e.g. Lyon",
      "departureDateTime": "Departure date and time",
      "seatsTotal": "Number of seats",
      "seatsTotalPlaceholder": "e.g. 4",
      "pricePerSeat": "Price per seat (€)",
      "pricePerSeatPlaceholder": "e.g. 25",
      "description": "Description (optional)",
      "descriptionPlaceholder": "Music, wifi, air conditioning...",
      "comfort": "Comfort level",
      "comfortStandard": "Standard",
      "comfortConfort": "Comfort",
      "comfortPremium": "Premium",
      "baggageAllowance": "Baggage allowed",
      "baggageAllowancePlaceholder": "e.g. 1 suitcase, 1 backpack",
      "submit": "Publish the ride",
      "submitting": "Publishing...",
      "errors": {
        "required": "This field is required",
        "invalidCity": "Please enter a valid city",
        "seatsMin": "At least 1 seat required",
        "priceMin": "Price must be positive",
        "sameCities": "Departure and destination cities must be different",
        "pastDate": "Date must be in the future",
        "apiError": "Error publishing ride. Please try again."
      },
      "success": "Ride published successfully!"
    }
  }
}
```

## 5. Ajouter la navigation

### Dans la page trajets (`src/app/[locale]/trajets/page.tsx`)
Ajouter un bouton vers la page annoncer:
```typescript
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function TrajetsPage() {
  const t = useTranslations();
  
  return (
    <div>
      <h1>{t('trajets.heading')}</h1>
      <Link href={`./${locale}/annoncer`}>
        {t('annoncer.heading')}
      </Link>
      {/* ... rest of the page ... */}
    </div>
  );
}
```

### Mettre à jour la navigation locale
Si nécessaire, ajouter dans `src/i18n/navigation.ts`:
```typescript
export const pathnames = {
  '/': '/',
  '/trajets': '/trajets',
  '/annoncer': '/annoncer',
  // ...
};
```

## 6. Intégration avec le composant TanStack Query

Le générateur frontend-feature crée un composant `AnnonceQueryComponent` avec TanStack Query.
Il doit appeler:
```typescript
const annoncerMutation = useMutation({
  mutationFn: (formData) => api.trajets.$post({ json: formData }),
  onSuccess: (data) => {
    router.push(`/${locale}/trajets/${data.id}`);
  },
});
```

## 7. Vérification finale

```bash
# Linter et typage
pnpm --filter @carpool/web lint
pnpm --filter @carpool/web typecheck

# Optionnel: build
pnpm --filter @carpool/web build

# Lancer en dev
pnpm docker:up
pnpm dev
```

Accédez à la page: `http://localhost:3000/fr/annoncer`

## 8. Notes spécifiques

- **Authentification** : La page annoncer doit être protégée (pas accessible sans auth)
- **Séquence de places** : `seatsAvailable` se calcule automatiquement côté backend = `seatsTotal - 0` (pas de réservation initiale)
- **Timestamp** : Convertir les dates/heures client en ISO 8601 pour l'API
- **Redirection post-création** : Vers la page de détail du trajet créé pour confirmation
- **Toast/Notifications** : Afficher un toast de succès ou d'erreur après l'opération

Cette skill guide l'ajout de la page de publication de trajet tout en respectant
les conventions du projet et l'intégration avec le backend API.
