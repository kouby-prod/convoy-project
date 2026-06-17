import { useTranslations } from 'next-intl';
import { Image as ImageIcon } from 'lucide-react';
import { TripSearchForm } from '@/components/landing/trip-search-form';

/* Hero: brand headline + a trip-search form. The left illustration is a
   labelled placeholder until real artwork is supplied. */
export function HeroSection() {
  const translateHero = useTranslations('Hero');

  return (
    <section className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
      {/* Illustration placeholder */}
      <div className="order-last hidden aspect-4/3 flex-col items-center justify-center gap-3 rounded-4xl bg-accent text-accent-foreground ring-1 ring-foreground/5 lg:order-first lg:flex dark:ring-foreground/10">
        <ImageIcon className="size-10" strokeWidth={1.75} />
        <span className="text-sm font-medium">{translateHero('illustrationPlaceholder')}</span>
      </div>

      {/* Headline + search */}
      <div className="flex flex-col gap-8">
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-primary sm:text-5xl">
          {translateHero('title')}
        </h1>

        <TripSearchForm />
      </div>
    </section>
  );
}
