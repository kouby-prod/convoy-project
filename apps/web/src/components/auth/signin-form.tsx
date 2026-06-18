
'use client';

import { useState } from 'react';
import { Link } from '@/i18n/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SignInForm() {
const [isLoading, setIsLoading] = useState(false);

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
event.preventDefault();

```
setIsLoading(true);

try {
  // TODO: brancher l'API de connexion
  console.log('Sign in');
} finally {
  setIsLoading(false);
}
```

}

return ( <Card className="mx-auto w-full max-w-md"> <CardHeader className="items-center text-center"> <CardTitle>Connexion</CardTitle> <p className="text-sm text-muted-foreground">
Connectez-vous à votre compte. </p> </CardHeader>

```
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
```

);
}
