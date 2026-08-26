'use client';

import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { Camera, UploadCloud } from 'lucide-react';
import { fetchAvatarUrl, uploadMyAvatar } from '@/lib/avatars';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FormAlert } from '@/components/ui/form-alert';
import { toast } from '@/components/ui/toast';

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{t('description')}</p>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-24 rounded-full object-cover ring-1 ring-border" />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-foreground/5">
            <Camera className="size-8" strokeWidth={1.75} aria-hidden />
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id="profile-photo-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) mutation.mutate(file);
          }}
        />
        {mutation.error ? <FormAlert>{t('error')}</FormAlert> : null}
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={mutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="size-4" strokeWidth={2.5} aria-hidden />
          {mutation.isPending ? t('uploading') : t('upload')}
        </Button>
      </CardContent>
    </Card>
  );
}
