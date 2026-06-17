import { useTranslations } from 'next-intl';
import { Play, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FeatureCard {
  title: string;
  description: string;
}

/* Features: two side-by-side cards, each with a video placeholder until the
   real walkthroughs are embedded. */
export function FeaturesSection() {
  const translateFeatures = useTranslations('Features');
  const cards = translateFeatures.raw('cards') as FeatureCard[];

  return (
    <section className="py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight text-primary">
        {translateFeatures('title')}
      </h2>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {cards.map((card) => (
          <Card key={card.title} className="flex flex-col items-center gap-4 p-8 text-center">
            <h3 className="text-2xl font-semibold tracking-tight text-primary">{card.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{card.description}</p>

            <Link
              href="/how-it-works"
              className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'gap-1')}
            >
              {translateFeatures('howItWorks')}
              <ArrowRight className="size-4" strokeWidth={2.25} />
            </Link>

            {/* Video placeholder */}
            <div className="mt-2 flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10">
              <Play className="size-10" strokeWidth={1.75} />
              <span className="text-sm font-medium">{translateFeatures('videoPlaceholder')}</span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
