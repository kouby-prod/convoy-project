
'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignUpForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError('');
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const firstName = formData.get('firstname')?.toString().trim() ?? '';
    const lastName = formData.get('lastname')?.toString().trim() ?? '';
    const email = formData.get('email')?.toString().trim() ?? '';
    const password = formData.get('password')?.toString() ?? '';
    const confirmPassword = formData.get('confirmPassword')?.toString() ?? '';

    try {
      if (!firstName || !lastName || !email || !password || !confirmPassword) {
        setError('Veuillez remplir tous les champs.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Les mots de passe ne correspondent pas.');
        return;
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? '';
      const response = await fetch(
        `${apiBaseUrl}/api/auth/sign-up/email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            name: `${firstName} ${lastName}`,
            email,
            password,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = body?.error ?? 'Échec de l’inscription. Réessayez.';
        setError(message);
        return;
      }

      await router.push('/');
    } catch (err) {
      console.error(err);
      setError('Impossible de créer le compte. Réessayez plus tard.');
    } finally {
      setIsLoading(false);
    }
  }

return ( <Card className="mx-auto w-full max-w-md"> <CardHeader className="items-center text-center"> <CardTitle>Créer un compte</CardTitle> <p className="text-sm text-muted-foreground">
Rejoignez la communauté Carpool. </p> </CardHeader>


  <CardContent>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="text"
        name="firstname"
        placeholder="Prénom"
        required
      />

      <Input
        type="text"
        name="lastname"
        placeholder="Nom"
        required
      />

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

      <Input
        type="password"
        name="confirmPassword"
        placeholder="Confirmer le mot de passe"
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
        {isLoading ? 'Création...' : "S'inscrire"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{' '}
        <Link href="/auth/signin" className="font-semibold text-primary">
          Se connecter
        </Link>
      </p>
    </form>
  </CardContent>
</Card>


);
}
