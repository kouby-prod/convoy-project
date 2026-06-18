
'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignUpForm() {
const [isLoading, setIsLoading] = useState(false);

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
event.preventDefault();

```
setIsLoading(true);

try {
  // TODO: brancher l'API d'inscription
  console.log('Sign up');
} finally {
  setIsLoading(false);
}
```

}

return ( <Card className="mx-auto w-full max-w-md"> <CardHeader className="items-center text-center"> <CardTitle>Créer un compte</CardTitle> <p className="text-sm text-muted-foreground">
Rejoignez la communauté Carpool. </p> </CardHeader>

```
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
```

);
}
