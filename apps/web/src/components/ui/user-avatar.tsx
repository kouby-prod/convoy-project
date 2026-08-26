'use client';

import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { fetchAvatarUrl } from '@/lib/avatars';
import { cn } from '@/lib/utils';

export function UserAvatar({
  userId,
  image,
  className,
  iconClassName,
}: {
  userId?: string | null;
  image?: string | null;
  className?: string;
  iconClassName?: string;
}) {
  const remoteUrl = image?.startsWith('http://') || image?.startsWith('https://') ? image : null;
  const query = useQuery({
    queryKey: ['avatar', userId],
    queryFn: () => fetchAvatarUrl(userId!),
    enabled: !!userId && !remoteUrl,
    staleTime: 60_000,
  });
  const src = remoteUrl ?? query.data ?? null;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed S3 / Google URLs
      <img src={src} alt="" className={cn('size-9 rounded-full object-cover', className)} />
    );
  }

  return <UserRound className={cn('size-5', iconClassName)} strokeWidth={2.25} aria-hidden />;
}
