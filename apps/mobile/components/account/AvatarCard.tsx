import { Image, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { fetchAvatarUrl, uploadMyAvatar } from '@/lib/avatar';
import { colors, spacing, fontSize, radius } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';

/** Profile photo — same upload handshake as a driver document, attached to the account instead of a review queue. */
export function AvatarCard({ userId }: { userId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: avatarUrl, isLoading } = useQuery({
    queryKey: ['my-avatar', userId],
    queryFn: () => fetchAvatarUrl(userId),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'image/webp'],
      });
      if (result.canceled) return null;
      const asset = result.assets[0];
      if (!asset) return null;
      return uploadMyAvatar({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType ?? 'image/jpeg',
        size: asset.size ?? 0,
      });
    },
    onSuccess: (viewUrl) => {
      if (viewUrl) queryClient.setQueryData(['my-avatar', userId], viewUrl);
    },
  });

  return (
    <Card>
      <Text style={styles.cardTitle}>{t('avatar.title')}</Text>
      <View style={styles.row}>
        {isLoading ? null : avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
        <Button
          label={mutation.isPending ? t('avatar.sending') : t('avatar.changePhoto')}
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onPress={() => mutation.mutate()}
        />
      </View>
      {mutation.isError ? <Text style={styles.error}>{t('avatar.uploadFailed')}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.full },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.muted },
  error: { fontSize: fontSize.sm, color: colors.destructive },
});
