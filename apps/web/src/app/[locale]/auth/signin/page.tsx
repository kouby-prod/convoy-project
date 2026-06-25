import { Image as ImageIcon } from 'lucide-react';
import { SignInForm } from '@/components/auth/signin-form';

export default function SignInPage() {
return ( <section className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
{/* Illustration placeholder */} <div className="hidden aspect-4/3 flex-col items-center justify-center gap-3 rounded-4xl bg-accent text-accent-foreground ring-1 ring-foreground/5 lg:flex dark:ring-foreground/10"> <ImageIcon className="size-10" strokeWidth={1.75} /> <span className="text-sm font-medium">Connexion</span> </div>


  {/* Content */}
  <div className="flex flex-col gap-8">
    <div className="space-y-3">
      <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">
        Bon retour parmi nous
      </h1>

      <p className="max-w-md text-muted-foreground">
        Connectez-vous pour rechercher un trajet, publier une annonce ou
        gérer vos réservations.
      </p>
    </div>

    <SignInForm />
  </div>
</section>


);
}
