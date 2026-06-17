import { HeroSection } from '@/components/landing/hero-section';
import { TestimonialsSection } from '@/components/landing/testimonials-section';
import { GuaranteesSection } from '@/components/landing/guarantees-section';
import { FeaturesSection } from '@/components/landing/features-section';

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <TestimonialsSection />
      <GuaranteesSection />
      <FeaturesSection />
    </>
  );
}
