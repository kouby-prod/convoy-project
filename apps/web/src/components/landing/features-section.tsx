import { useTranslations } from 'next-intl';
import { ArrowRight, Car, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeatureCard {
  title: string;
  description: string;
  steps: string[];
  ctaHref: string;
  ctaLabel: string;
}

const CARD_ICONS = [Users, Car] as const;

export function FeaturesSection() {
  const translateFeatures = useTranslations('Features');
  const cards = translateFeatures.raw('cards') as FeatureCard[];

  return (
    <section className="py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
          {translateFeatures('eyebrow')}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {translateFeatures('title')}
        </h2>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {cards.map((card, index) => {
          const Icon = CARD_ICONS[index] ?? Users;
          return (
            <Card key={card.title} className="gap-5 px-2 py-8">
              <div className="flex flex-col items-center gap-3 px-6 text-center">
                <div className="flex size-12 items-center justify-center rounded-md bg-brand-green/10 text-brand-green">
                  <Icon className="size-6" strokeWidth={2} />
                </div>
                <h3 className="font-display text-2xl font-semibold tracking-tight text-foreground">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{card.description}</p>
              </div>

              <ol className="mx-6 flex flex-col gap-3 rounded-md bg-muted/80 p-5 text-left ring-1 ring-foreground/5">
                {card.steps.map((step, stepIndex) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-semibold text-primary-foreground">
                      {stepIndex + 1}
                    </span>
                    <span className="pt-1">{step}</span>
                  </li>
                ))}
              </ol>

              <div className="flex justify-center px-6">
                <Link
                  href={card.ctaHref}
                  className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'gap-1.5 font-semibold')}
                >
                  {card.ctaLabel}
                  <ArrowRight className="size-4" strokeWidth={2.25} />
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
