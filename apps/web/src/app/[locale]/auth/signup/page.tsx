import { Image as ImageIcon } from 'lucide-react';
import { SignUpForm } from '@/components/auth/signup-form';

export default function SignUpPage() {
return ( <section className="grid items-center gap-10 py-12 lg:grid-cols-2 lg:gap-16 lg:py-20">
{/* Form first on desktop */} <div className="flex flex-col gap-8"> <div className="space-y-3"> <h1 className="text-4xl font-bold tracking-tight text-primary sm:text-5xl">
Rejoignez Carpool </h1>


      <p className="max-w-md text-muted-foreground">
        Créez votre compte en quelques secondes et commencez à partager vos
        trajets avec la communauté.
      </p>
    </div>

    <SignUpForm />
  </div>

  {/* Illustration placeholder */}
  <div className="hidden aspect-4/3 flex-col items-center justify-center gap-3 rounded-4xl bg-accent text-accent-foreground ring-1 ring-foreground/5 lg:flex dark:ring-foreground/10">
    <ImageIcon className="size-10" strokeWidth={1.75} />
    <span className="text-sm font-medium">Inscription</span>
  </div>
</section>


);
}
