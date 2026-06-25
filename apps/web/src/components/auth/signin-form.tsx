
'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignInForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';

    try {
      if (!email || !password) {
        setError('Veuillez renseigner votre e-mail et votre mot de passe.');
        return;
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
      const response = await fetch(
        `${apiBaseUrl}/api/auth/sign-in/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error ?? 'Échec de la connexion. Vérifiez vos identifiants.';
        setError(message);
        return;
      }

      await router.push('/');
    } catch (err) {
      console.error(err);
      setError('Impossible de se connecter. Réessayez ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  }

return ( <Card className="mx-auto w-full max-w-md"> <CardHeader className="items-center text-center"> <CardTitle>Connexion</CardTitle> <p className="text-sm text-muted-foreground">
Connectez-vous à votre compte. </p> </CardHeader>


  <CardContent>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="email"
        name="email"
        placeholder="Adresse e-mail"
        required
      />

      <Input
        type="password"
        name="password"
        placeholder="Mot de passe"
        required
      />

      {error ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? 'Connexion...' : 'Se connecter'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{' '}
        <Link href="/auth/signup" className="font-semibold text-primary">
          Créer un compte
        </Link>
      </p>
    </form>
  </CardContent>
</Card>


);
}
