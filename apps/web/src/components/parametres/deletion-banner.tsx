'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { cancelAccountDeletion, fetchAccountDeletion } from '@/lib/account-deletion';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

const DELETION_KEY = ['account-deletion'] as const;

export function DeletionBanner() {
  const t = useTranslations('Parametres.deleteAccount');
  const format = useFormatter();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const userId = session?.user?.id;
  const query = useQuery({
    queryKey: [...DELETION_KEY, userId],
    queryFn: fetchAccountDeletion,
    enabled: Boolean(userId) && !isPending,
    staleTime: 30_000,
  });
  const cancel = useMutation({
    mutationFn: cancelAccountDeletion,
    onSuccess: (data) => {
      queryClient.setQueryData([...DELETION_KEY, userId], data);
      toast(t('cancelled'));
    },
  });

  if (!userId || !query.data?.scheduled || !query.data.purgeAt) return null;
  const date = format.dateTime(new Date(query.data.purgeAt), { dateStyle: 'long' });

  return (
    <div
      role="status"
      className="border-b border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <p>{t('banner', { date })}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          {cancel.isPending ? t('cancelling') : t('bannerCancel')}
        </Button>
      </div>
    </div>
  );
}
