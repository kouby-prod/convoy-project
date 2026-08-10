import {
  Backpack,
  Ban,
  Bike,
  CreditCard,
  Cigarette,
  CigaretteOff,
  Dog,
  Luggage,
  ShieldCheck,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import { TRAJET_AMENITIES, type TrajetAmenity } from '@carpool/schemas';
import { cn } from '@/lib/utils';

/**
 * One icon per amenity. `struck` overlays a slash for the "not allowed"
 * variants that Lucide has no dedicated glyph for.
 */
const AMENITY_ICONS: Record<TrajetAmenity, { Icon: LucideIcon; struck?: boolean }> = {
  smoking: { Icon: Cigarette },
  nonSmoking: { Icon: CigaretteOff },
  pets: { Icon: Dog },
  noPets: { Icon: Dog, struck: true },
  skiRack: { Icon: Snowflake },
  luggage: { Icon: Luggage },
  handLuggage: { Icon: Backpack },
  insurance: { Icon: ShieldCheck },
  bikeRack: { Icon: Bike },
  cardPayment: { Icon: CreditCard },
};

/** Stable display order, so the same amenities always read the same way. */
export const AMENITY_ORDER = TRAJET_AMENITIES;

/** Narrow an untrusted string (URL param, form value) to a known amenity. */
export function isAmenity(value: string): value is TrajetAmenity {
  return (AMENITY_ORDER as readonly string[]).includes(value);
}

interface AmenityIconProps {
  amenity: TrajetAmenity;
  className?: string;
}

/** A single amenity glyph, sized by the caller via `className`. */
export function AmenityIcon({ amenity, className }: AmenityIconProps) {
  const { Icon, struck } = AMENITY_ICONS[amenity];

  if (!struck) return <Icon className={className} strokeWidth={1.75} aria-hidden />;

  return (
    <span className={cn('relative inline-flex', className)} aria-hidden>
      <Icon className="size-full" strokeWidth={1.75} />
      <Ban className="absolute inset-0 size-full text-destructive" strokeWidth={1.75} />
    </span>
  );
}

interface TrajetAmenitiesProps {
  amenities: TrajetAmenity[];
  /** Accessible name per amenity — pass `t` bound to the `Trajet.amenities` namespace. */
  label: (amenity: TrajetAmenity) => string;
  className?: string;
}

interface AmenityToggleGroupProps {
  selected: TrajetAmenity[];
  onToggle: (amenity: TrajetAmenity) => void;
  /** Accessible name per amenity — pass `t` bound to the `Trajet.amenities` namespace. */
  label: (amenity: TrajetAmenity) => string;
  /** Group name for screen readers. */
  legend: string;
}

/** The amenity picker shared by the search rail and the publish form. */
export function AmenityToggleGroup({ selected, onToggle, label, legend }: AmenityToggleGroupProps) {
  return (
    <fieldset>
      <legend className="sr-only">{legend}</legend>
      <div className="flex flex-wrap justify-center gap-2">
        {AMENITY_ORDER.map((amenity) => {
          const isSelected = selected.includes(amenity);
          return (
            <button
              key={amenity}
              type="button"
              aria-pressed={isSelected}
              title={label(amenity)}
              onClick={() => onToggle(amenity)}
              className={cn(
                'flex size-11 items-center justify-center rounded-md outline-none transition-all duration-200 ease-smooth active:translate-y-px focus-visible:ring-3 focus-visible:ring-ring/30',
                isSelected
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted',
              )}
            >
              <AmenityIcon amenity={amenity} className="size-5" />
              <span className="sr-only">{label(amenity)}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The horizontal amenity strip shown under a result row and on the detail header. */
export function TrajetAmenities({ amenities, label, className }: TrajetAmenitiesProps) {
  if (amenities.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap items-center gap-3 text-muted-foreground', className)}>
      {AMENITY_ORDER.filter((amenity) => amenities.includes(amenity)).map((amenity) => (
        <li key={amenity} title={label(amenity)}>
          <AmenityIcon amenity={amenity} className="size-5" />
          <span className="sr-only">{label(amenity)}</span>
        </li>
      ))}
    </ul>
  );
}
