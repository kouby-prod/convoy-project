import { useTranslations } from 'next-intl';
import { Quote, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Testimonial {
  quote: string;
  author: string;
  body: string;
}

export function TestimonialsSection() {
  const translateTestimonials = useTranslations('Testimonials');
  const testimonials = translateTestimonials.raw('items') as Testimonial[];

  return (
    <section className="py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-blue">
          {translateTestimonials('eyebrow')}
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-foreground">
          {translateTestimonials('title')}
        </h2>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <Card key={testimonial.quote} className="items-center gap-4 px-2 py-8 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-accent text-brand-blue ring-1 ring-foreground/5">
              <UserRound className="size-8" strokeWidth={1.75} />
            </div>
            <div className="space-y-1 px-6">
              <h3 className="font-display text-lg font-semibold tracking-tight">
                “{testimonial.quote}”
              </h3>
              <p className="text-sm text-muted-foreground">{testimonial.author}</p>
            </div>
            <CardContent className="pt-0 text-center">
              <Quote className="mx-auto size-5 text-brand-blue/35" strokeWidth={2.25} aria-hidden />
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{testimonial.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
