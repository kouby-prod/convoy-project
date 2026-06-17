import { useTranslations } from 'next-intl';
import { Quote, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Testimonial {
  quote: string;
  author: string;
  body: string;
}

/* Testimonials: three quote cards. Avatars are icon placeholders until real
   member photos are wired in. */
export function TestimonialsSection() {
  const translateTestimonials = useTranslations('Testimonials');
  const testimonials = translateTestimonials.raw('items') as Testimonial[];

  return (
    <section className="py-16">
      <h2 className="text-center text-3xl font-bold tracking-tight text-primary">
        {translateTestimonials('title')}
      </h2>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {testimonials.map((testimonial) => (
          <Card key={testimonial.quote} className="flex flex-col items-center p-8 text-center">
            {/* Avatar placeholder */}
            <div className="flex size-24 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/5 dark:ring-foreground/10">
              <UserRound className="size-10" strokeWidth={1.75} />
            </div>
            <h3 className="mt-5 text-lg font-semibold tracking-tight">“{testimonial.quote}”</h3>
            <p className="text-sm text-muted-foreground">{testimonial.author}</p>
            <CardContent className="p-0">
              <Quote className="mx-auto mt-4 size-5 text-primary/40" strokeWidth={2.25} />
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {testimonial.body}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-12 flex justify-center">
        <Button variant="primary" size="lg">
          {translateTestimonials('seeMore')}
        </Button>
      </div>
    </section>
  );
}
