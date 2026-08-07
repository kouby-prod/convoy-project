import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, UploadTask, UploadType } from 'expo-file-system';
import {
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME_TYPES,
  DRIVER_DOCUMENT_TYPES,
  DocumentMimeTypeSchema,
  type DriverDocument,
  type DriverDocumentType,
} from '@carpool/schemas';
import { api } from '@/lib/api-client';
import { ScreenContainer } from '@/components/ui/ScreenContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/StateMessage';
import { colors, spacing, fontSize, radius } from '@/lib/theme';

const TYPE_LABELS: Record<DriverDocumentType, string> = {
  permis: 'Permis de conduire',
  carteIdentite: "Carte d'identité",
  carteGrise: 'Carte grise',
  assurance: 'Assurance',
};

const STATUS_LABELS: Record<DriverDocument['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};

const STATUS_COLORS: Record<DriverDocument['status'], string> = {
  pending: colors.mutedForeground,
  approved: colors.secondary,
  rejected: colors.destructive,
};

const MAX_SIZE_MB = Math.round(DOCUMENT_MAX_BYTES / (1024 * 1024));

/**
 * Driver identity document submission — mobile counterpart of the web's
 * `/mes-documents`. Same three-step handshake against the API
 * (`apps/web/src/lib/documents.ts`): sign an upload URL, PUT the bytes
 * straight to the bucket, then record the submission. Reviewing submissions
 * (approve/reject) is an admin-only surface and stays on the web backoffice.
 */
export default function DocumentsScreen() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<DriverDocumentType>('permis');
  const [expiresOn, setExpiresOn] = useState('');
  const [pickedFile, setPickedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['my-documents'],
    queryFn: async () => {
      const res = await api.documents.me.$get();
      if (!res.ok) throw new Error('Failed to load documents');
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!pickedFile) throw new Error('Veuillez choisir un fichier.');

      const mimeParsed = DocumentMimeTypeSchema.safeParse(pickedFile.mimeType);
      if (!mimeParsed.success) throw new Error('Type de fichier non pris en charge.');
      const mimeType = mimeParsed.data;

      const size = pickedFile.size ?? 0;
      if (size > DOCUMENT_MAX_BYTES) throw new Error(`Le fichier dépasse ${MAX_SIZE_MB} Mo.`);

      const signed = await api.documents['upload-url'].$post({
        json: { type, fileName: pickedFile.name, mimeType, sizeBytes: size },
      });
      if (!signed.ok) throw new Error("Échec de la préparation de l'envoi.");
      const { uploadUrl, storageKey } = await signed.json();

      // No Content-Type header on purpose: the presigned PUT is not signed
      // with one, matching apps/api/src/storage/s3.ts's `createUploadUrl`.
      const uploadTask = new UploadTask(new File(pickedFile.uri), uploadUrl, {
        httpMethod: 'PUT',
        uploadType: UploadType.BINARY_CONTENT,
      });
      const result = await uploadTask.uploadAsync();
      if (result.status < 200 || result.status >= 300) throw new Error("Échec de l'envoi du fichier.");

      const created = await api.documents.$post({
        json: {
          type,
          storageKey,
          fileName: pickedFile.name,
          mimeType,
          sizeBytes: size,
          expiresOn: expiresOn.trim() || null,
        },
      });
      if (!created.ok) throw new Error("Échec de l'enregistrement de la soumission.");
      return created.json();
    },
    onSuccess: () => {
      setError(null);
      setPickedFile(null);
      setExpiresOn('');
      queryClient.invalidateQueries({ queryKey: ['my-documents'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Échec de l'envoi."),
  });

  async function pickFile() {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: [...DOCUMENT_MIME_TYPES] });
    if (result.canceled) return;
    setPickedFile(result.assets[0] ?? null);
  }

  async function viewDocument(id: string) {
    const res = await api.documents[':id'].file.$get({ param: { id } });
    if (!res.ok) return;
    const { viewUrl } = await res.json();
    Linking.openURL(viewUrl);
  }

  return (
    <ScreenContainer>
      <Card>
        <Text style={styles.cardTitle}>Soumettre un document</Text>
        <Text style={styles.label}>Type de document</Text>
        <View style={styles.typeGrid}>
          {DRIVER_DOCUMENT_TYPES.map((value) => (
            <Button
              key={value}
              label={TYPE_LABELS[value]}
              size="sm"
              variant={type === value ? 'primary' : 'outline'}
              onPress={() => setType(value)}
            />
          ))}
        </View>

        <Button
          label={pickedFile ? pickedFile.name : 'Choisir un fichier'}
          variant="outline"
          size="sm"
          onPress={pickFile}
        />
        <Text style={styles.hint}>JPEG, PNG, WebP ou PDF — {MAX_SIZE_MB} Mo maximum.</Text>

        <TextField
          label="Date d'expiration (AAAA-MM-JJ, optionnel)"
          value={expiresOn}
          onChangeText={setExpiresOn}
          placeholder="2028-06-30"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={uploadMutation.isPending ? 'Envoi…' : 'Envoyer'}
          disabled={uploadMutation.isPending || !pickedFile}
          onPress={() => uploadMutation.mutate()}
        />
      </Card>

      {isLoading ? <LoadingState label="Chargement…" /> : null}
      {isError ? <ErrorState label="Impossible de charger vos documents." /> : null}
      {!isLoading && !isError && !data?.length ? (
        <EmptyState label="Aucun document soumis pour l'instant." />
      ) : null}

      {data?.map((doc) => (
        <Card key={doc.id} style={styles.docCard}>
          <View style={styles.docHeader}>
            <Text style={styles.docTitle}>{TYPE_LABELS[doc.type]}</Text>
            <Text style={[styles.statusBadge, { color: STATUS_COLORS[doc.status] }]}>
              {STATUS_LABELS[doc.status]}
            </Text>
          </View>
          <Text style={styles.line}>{doc.fileName}</Text>
          {doc.status === 'rejected' && doc.reviewNote ? (
            <Text style={styles.error}>Motif du refus : {doc.reviewNote}</Text>
          ) : null}
          <Button label="Voir le fichier" variant="outline" size="sm" onPress={() => viewDocument(doc.id)} />
        </Card>
      ))}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.foreground },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.mutedForeground },
  error: { fontSize: fontSize.sm, color: colors.destructive },
  docCard: { marginTop: spacing.md },
  docHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  docTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.foreground },
  statusBadge: { fontSize: fontSize.xs, fontWeight: '700', borderRadius: radius.full },
  line: { fontSize: fontSize.sm, color: colors.mutedForeground },
});
