export interface LegalSection {
  heading: string;
  body: string;
}

/**
 * Shared layout for /terms and /privacy — both are the same shape (title +
 * disclaimer + a list of heading/body sections), so this avoids duplicating
 * that structure. Plain server component: no hooks/state, just already-
 * translated strings passed down from each page.
 */
export function LegalPage({
  title,
  disclaimer,
  lastUpdated,
  sections,
}: {
  title: string;
  disclaimer?: string;
  lastUpdated: string;
  sections: LegalSection[];
}) {
  return (
    <section className="flex flex-col gap-8 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{lastUpdated}</p>
      </div>

      {disclaimer ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {disclaimer}
        </div>
      ) : null}

      <div className="grid max-w-3xl gap-6">
        {sections.map((section) => (
          <div key={section.heading} className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{section.heading}</h2>
            {section.body.split('\n\n').map((paragraph) => (
              <p
                key={paragraph}
                className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
