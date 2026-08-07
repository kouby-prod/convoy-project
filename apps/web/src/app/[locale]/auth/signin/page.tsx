import { SignInForm } from '@/components/auth/signin-form';

export default function SignInPage() {
  return (
    <section className="relative flex flex-col items-center justify-center py-10 lg:py-16">
      <div className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-72 rounded-lg bg-canvas-glow" />
      <SignInForm />
    </section>
  );
}
