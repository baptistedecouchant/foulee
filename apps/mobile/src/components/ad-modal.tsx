import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { Button, Ionicons, ProgressBar, Txt } from '@/components/ui';
import { Gradients, Radius, Spacing } from '@/constants/theme';

const DURATION = 30;

/**
 * Pub de démonstration (Expo Go / mode démo) : simule une vidéo de 30 s.
 * Dans l'app installée, c'est la vraie pub AdMob qui s'affiche à la place.
 */
export function DemoAdModal({ visible, onDone }: { visible: boolean; onDone: (watched: boolean) => void }) {
  const [left, setLeft] = useState(DURATION);
  useEffect(() => {
    if (!visible) return;
    setLeft(DURATION);
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onDone(false)}>
      <LinearGradient colors={Gradients.night} style={styles.page}>
        <Txt variant="label" color="rgba(255,255,255,0.6)">
          Publicité de démonstration
        </Txt>
        <View style={styles.video}>
          <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.8)" />
          <Text style={styles.brand}>Ta marque partenaire ici</Text>
          <Txt color="rgba(255,255,255,0.7)" style={{ textAlign: 'center' }}>
            Dans l’app installée, une vraie vidéo de 30 s (Google AdMob) s’affiche ici.
          </Txt>
        </View>
        <ProgressBar value={1 - left / DURATION} colors={Gradients.gold} track="rgba(255,255,255,0.15)" />
        {left > 0 ? (
          <>
            <Txt color="#fff" style={{ textAlign: 'center' }}>
              Récompense dans {left} s
            </Txt>
            <Button kind="ghost" label="Fermer sans récompense" onPress={() => onDone(false)} />
          </>
        ) : (
          <Button kind="gold" icon="checkmark-circle" label="Récupérer ma récompense" onPress={() => onDone(true)} />
        )}
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, padding: Spacing.xl, paddingTop: 80, gap: Spacing.l, justifyContent: 'center' },
  video: { aspectRatio: 9 / 12, borderRadius: Radius.l, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', gap: Spacing.m, padding: Spacing.l },
  brand: { color: '#fff', fontSize: 26, fontWeight: '900', textAlign: 'center' },
});
