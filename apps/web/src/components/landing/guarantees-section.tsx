import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, Headset, Check, type LucideProps } from 'lucide-react';

interface GuaranteeColumn {
  title: string;
  points: string[];
}

const COLUMN_ICONS: ComponentType<LucideProps>[] = [ShieldCheck, Headset];

export function GuaranteesSection() {
  const translateGuarantees = useTranslations('Guarantees');
  const columns = translateGuarantees.raw('columns') as GuaranteeColumn[];

  return (
    <section className="rounded-lg bg-accent/70 px-6 py-16 ring-1 ring-foreground/5 sm:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
          {translateGuarantees('eyebrow')}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {translateGuarantees('title')}
        </h2>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-12 md:grid-cols-2 md:gap-16">
        {columns.map((column, columnIndex) => {
          const Icon = COLUMN_ICONS[columnIndex] ?? ShieldCheck;
          return (
            <div
              key={column.title}
              className="flex flex-col items-center text-center md:items-start md:text-left"
            >
              <div className="flex size-16 items-center justify-center rounded-md bg-card text-brand-green shadow-md ring-1 ring-foreground/5">
                <Icon className="size-8" strokeWidth={2} />
              </div>
              <h3 className="mt-5 font-display text-xl font-semibold tracking-tight text-foreground">
                {column.title}
              </h3>
              <ul className="mt-6 flex w-full flex-col gap-3.5">
                {column.points.map((point) => (
                  <li key={point} className="flex gap-3 text-sm leading-relaxed text-foreground/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-green" strokeWidth={2.5} />
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
