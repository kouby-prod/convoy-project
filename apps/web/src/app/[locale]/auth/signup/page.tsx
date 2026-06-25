import { SignUpForm } from '@/components/auth/signup-form';

export default function SignUpPage() {
  return (
    <section className="flex flex-col items-center gap-8 py-12 lg:py-20">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Rejoignez Carpool
        </h1>

        <p className="text-sm text-muted-foreground">
          Créez votre compte en quelques secondes et commencez à partager vos
          trajets avec la communauté.
        </p>
      </div>

      <SignUpForm />
    </section>
  );
}
