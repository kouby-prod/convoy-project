'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Camera } from 'lucide-react';
import { fetchAvatarUrl, uploadMyAvatar } from '@/lib/avatars';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/** Avatar + upload control, meant to sit beside profile fields. */
export function ProfilePhotoForm({ userId, image }: { userId: string; image?: string | null }) {
  const t = useTranslations('Parametres.photo');
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const remoteUrl = image?.startsWith('http://') || image?.startsWith('https://') ? image : null;
  const photoQuery = useQuery({
    queryKey: ['avatar', userId],
    queryFn: () => fetchAvatarUrl(userId),
    enabled: !remoteUrl,
    staleTime: 60_000,
  });
  const src = remoteUrl ?? photoQuery.data ?? null;

  const mutation = useMutation({
    mutationFn: uploadMyAvatar,
    onSuccess: (viewUrl) => {
      queryClient.setQueryData(['avatar', userId], viewUrl);
      toast(t('success'));
    },
  });

  function pickFile() {
    fileInputRef.current?.click();
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-3 sm:w-40 sm:items-start">
      <button
        type="button"
        onClick={pickFile}
        disabled={mutation.isPending}
        aria-label={t('upload')}
        className={cn(
          'relative size-24 overflow-hidden rounded-full outline-none transition-all duration-200',
          'ring-1 ring-border hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/30',
          'disabled:opacity-60',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center bg-muted text-muted-foreground">
            <Camera className="size-8" strokeWidth={1.75} aria-hidden />
          </span>
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        id="profile-photo-input"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) mutation.mutate(file);
        }}
      />
      <p className="text-center text-xs leading-relaxed text-muted-foreground sm:text-left">{t('description')}</p>
      {mutation.error ? <FormAlert>{t('error')}</FormAlert> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={mutation.isPending}
        onClick={pickFile}
      >
        {mutation.isPending ? t('uploading') : t('upload')}
      </Button>
    </div>
  );
}
