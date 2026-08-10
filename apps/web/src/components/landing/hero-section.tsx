import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { TripSearchForm } from '@/components/landing/trip-search-form';

/* Figma Accueil: image left, brand + headline + search right — no overlays on media. */
export function HeroSection() {
  const translateHero = useTranslations('Hero');

  return (
    <section className="relative rounded-lg bg-canvas-glow ring-1 ring-foreground/5">
      <div className="grid items-stretch lg:grid-cols-2">
        <div className="relative min-h-64 overflow-hidden rounded-t-lg sm:min-h-80 lg:min-h-[32rem] lg:rounded-l-lg lg:rounded-tr-none">
          <Image
            src="/images/hero.jpg"
            alt={translateHero('imageAlt')}
            fill
            priority
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-background/50 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-background/30"
            aria-hidden
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center gap-7 px-6 py-10 sm:px-10 lg:gap-8 lg:py-14">
          <div className="space-y-3">
            <p className="font-display text-4xl font-semibold tracking-tight text-brand-blue sm:text-5xl">
              {translateHero('brand')}
            </p>
            <h1 className="max-w-md font-display text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl">
              {translateHero('title')}
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {translateHero('subtitle')}
            </p>
          </div>

          <TripSearchForm />
        </div>
      </div>
    </section>
  );
}
