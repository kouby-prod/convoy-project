import { TRAJET_AMENITIES, type TrajetAmenity } from '@carpool/schemas';
import type { MessageKey } from './i18n';

/** Stable display order, shared by the search filters, the publish form and the detail screen. */
export const AMENITY_ORDER = TRAJET_AMENITIES;

/** Message-catalog keys, not literal labels — pass through `t()` at the call site so amenity names follow the selected locale. */
export const AMENITY_LABEL_KEYS: Record<TrajetAmenity, MessageKey> = {
  smoking: 'amenities.smoking',
  nonSmoking: 'amenities.nonSmoking',
  pets: 'amenities.pets',
  noPets: 'amenities.noPets',
  skiRack: 'amenities.skiRack',
  luggage: 'amenities.luggage',
  handLuggage: 'amenities.handLuggage',
  insurance: 'amenities.insurance',
  bikeRack: 'amenities.bikeRack',
  cardPayment: 'amenities.cardPayment',
  cashOrInterac: 'amenities.cashOrInterac',
};

export function isAmenity(value: string): value is TrajetAmenity {
  return (AMENITY_ORDER as readonly string[]).includes(value);
}
