import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Headset, Check, type LucideProps } from 'lucide-react';

interface GuaranteeColumn {
  title: string;
  points: string[];
}

/* One icon per column, in mockup order. */
const COLUMN_ICONS: ComponentType<LucideProps>[] = [ShieldCheck, Headset];

/* Guarantees: two reassurance columns, each an icon + heading + checklist. */
export function GuaranteesSection() {
  const translateGuarantees = useTranslations('Guarantees');
  const columns = translateGuarantees.raw('columns') as GuaranteeColumn[];

  return (
    <section className="py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight text-primary">
        {translateGuarantees('title')}
      </h2>

      <div className="mx-auto mt-12 grid max-w-4xl gap-12 md:grid-cols-2">
        {columns.map((column, columnIndex) => {
          const Icon = COLUMN_ICONS[columnIndex] ?? ShieldCheck;
          return (
            <div key={column.title} className="flex flex-col items-center text-center">
              <div className="flex size-16 items-center justify-center rounded-3xl bg-accent text-primary ring-1 ring-foreground/5 dark:ring-foreground/10">
                <Icon className="size-8" strokeWidth={2} />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight text-primary">
                {column.title}
              </h3>
              <ul className="mt-6 flex flex-col gap-4 text-left">
                {column.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-foreground">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
