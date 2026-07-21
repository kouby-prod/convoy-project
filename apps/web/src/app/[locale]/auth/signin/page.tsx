import { SignInForm } from '@/components/auth/signin-form';

export default function SignInPage() {
  return (
    <section className="flex flex-col items-center gap-8 py-12 lg:py-20">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Bon retour parmi nous
        </h1>

        <p className="text-sm text-muted-foreground">
          Connectez-vous pour rechercher un trajet, publier une annonce ou
          gérer vos réservations.
        </p>
      </div>

      <SignInForm />
    </section>
  );
}
