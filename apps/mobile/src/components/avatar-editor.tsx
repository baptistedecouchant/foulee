import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/social';
import { Ionicons, Txt } from '@/components/ui';
import { useMyAvatar } from '@/lib/avatar';

/** Ma photo de profil, modifiable d'un appui (galerie, appareil photo, retirer). */
export function AvatarEditor({ name, size = 64 }: { name: string; size?: number }) {
  const { uri, change, remove, busy, error } = useMyAvatar();

  const open = () => {
    if (Platform.OS === 'web') return change('library');
    Alert.alert('Photo de profil', undefined, [
      { text: 'Choisir dans mes photos', onPress: () => change('library') },
      { text: 'Prendre une photo', onPress: () => change('camera') },
      ...(uri ? [{ text: 'Retirer la photo', style: 'destructive' as const, onPress: () => remove() }] : []),
      { text: 'Annuler', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Changer ma photo de profil" onPress={open} disabled={busy}>
        <Avatar name={name} color="#FFFFFF" size={size} uri={uri} />
        <View style={[styles.badge, { right: -2, bottom: -2 }]}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="camera" size={13} color="#fff" />}
        </View>
      </Pressable>
      {error ? (
        <Txt variant="caption" color="#FF9C7A" style={{ maxWidth: 140, textAlign: 'center' }}>
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', width: 26, height: 26, borderRadius: 13, backgroundColor: '#3A4BFF', borderWidth: 2, borderColor: '#0B1230', alignItems: 'center', justifyContent: 'center' },
});
