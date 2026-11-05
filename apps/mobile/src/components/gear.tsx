import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import type { ShoeWear } from '@foulee/core';

import { BrandLogo } from '@/components/brand-logo';
import { Ionicons, ProgressBar, Txt } from '@/components/ui';
import { pickPhoto, uploadPhoto, type PhotoSource } from '@/lib/media';
import { useTheme } from '@/hooks/use-theme';
import { fmtInt } from '@/lib/labels';

export function WearBar({ wear, lifeKm }: { wear: ShoeWear; lifeKm: number }) {
  const t = useTheme();
  const color = { neuve: t.ok, bonne: t.ok, surveiller: t.warn, remplacer: t.flame, usee: t.bad }[wear.state];
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.rowBetween}>
        <Txt style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {fmtInt(wear.km)} <Txt muted>/ {fmtInt(lifeKm)} km</Txt>
        </Txt>
        <Txt variant="caption" color={color} style={{ fontWeight: '600' }}>
          {wear.label}
          {wear.leftKm > 0 && wear.state !== 'neuve' ? ` · encore ~${fmtInt(wear.leftKm)} km` : ''}
        </Txt>
      </View>
      <ProgressBar value={Math.min(1, wear.ratio)} colors={[color, color]} height={6} />
    </View>
  );
}


const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});

/** Photo de la paire (prise par le coureur), ou vignette de marque en attendant. */
export function ShoePhoto({ shoe, onChange, height = 170 }: { shoe: { id: string; brand: string; model: string; photo?: string }; onChange?: (url: string | null) => void; height?: number }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (source: PhotoSource) => {
    setError(null);
    const local = await pickPhoto(source, [4, 3]).catch(() => null);
    if (local === 'denied') return setError('Autorise l’accès aux photos dans les réglages.');
    if (!local) return;
    setBusy(true);
    try {
      onChange?.(await uploadPhoto(local, `shoe-${shoe.id}`));
    } catch (e) {
      setError(`La photo n’a pas pu être enregistrée (${String((e as Error)?.message ?? e).slice(0, 80)}).`);
    } finally {
      setBusy(false);
    }
  };
  const open = () => {
    if (!onChange) return;
    if (Platform.OS === 'web') return pick('library');
    Alert.alert('Photo de ta paire', undefined, [
      { text: 'Choisir dans mes photos', onPress: () => pick('library') },
      { text: 'Prendre une photo', onPress: () => pick('camera') },
      ...(shoe.photo ? [{ text: 'Retirer la photo', style: 'destructive' as const, onPress: () => onChange(null) }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={shoe.photo ? 'Changer la photo de la paire' : 'Ajouter une photo de la paire'} onPress={open} disabled={!onChange || busy}>
      <View style={[gearStyles.photo, { height, backgroundColor: t.surfaceAlt }]}>
        {shoe.photo ? (
          <Image source={{ uri: shoe.photo }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={{ alignItems: 'center', gap: 10 }}>
            <BrandLogo brand={shoe.brand} size={56} />
            {onChange ? (
              <View style={gearStyles.addRow}>
                <Ionicons name="camera-outline" size={16} color={t.accent} />
                <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }}>
                  Ajouter une photo de ta paire
                </Txt>
              </View>
            ) : null}
          </View>
        )}
        {shoe.photo ? (
          <View style={gearStyles.logoCorner}>
            <BrandLogo brand={shoe.brand} size={36} />
          </View>
        ) : null}
        {busy ? (
          <View style={[StyleSheet.absoluteFill, gearStyles.busy]}>
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
      </View>
      {error ? (
        <Txt variant="caption" color={t.bad} style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : null}
    </Pressable>
  );
}

const gearStyles = StyleSheet.create({
  photo: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoCorner: { position: 'absolute', top: 10, left: 10 },
  busy: { backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
});
