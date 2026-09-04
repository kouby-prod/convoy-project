'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function LegalBackButton({ label }: { label: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        '-ml-2 w-fit gap-1.5 text-muted-foreground hover:text-foreground',
      )}
    >
      <ArrowLeft className="size-4" strokeWidth={2.25} />
      {label}
    </button>
  );
}
