import { HeroSection } from '@/components/landing/hero-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { GuaranteesSection } from '@/components/landing/guarantees-section';
import { FeaturesSection } from '@/components/landing/features-section';

export default function HomePage() {
  return (
    <div className="flex flex-col gap-4 pb-4 sm:gap-6">
      <HeroSection />
      <TestimonialsSection />
      <GuaranteesSection />
      <FeaturesSection />
    </div>
  );
}
