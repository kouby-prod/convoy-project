import { TRAJET_AMENITIES, type TrajetAmenity } from '@carpool/schemas';

/** Stable display order, shared by the search filters, the publish form and the detail screen. */
export const AMENITY_ORDER = TRAJET_AMENITIES;

export const AMENITY_LABELS: Record<TrajetAmenity, string> = {
  smoking: 'Fumeur accepté',
  nonSmoking: 'Non-fumeur',
  pets: 'Animaux acceptés',
  noPets: 'Animaux non acceptés',
  skiRack: 'Porte-skis',
  luggage: 'Grande valise',
  handLuggage: 'Bagage à main',
  insurance: 'Trajet assuré',
  bikeRack: 'Porte-vélos',
  cardPayment: 'Paiement par carte',
  cashOrInterac: 'Cash / Interac',
};

export function isAmenity(value: string): value is TrajetAmenity {
  return (AMENITY_ORDER as readonly string[]).includes(value);
}
