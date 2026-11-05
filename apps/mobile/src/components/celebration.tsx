import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { Button, Ionicons } from '@/components/ui';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useStore } from '@/lib/store';

const CONFETTI_COLORS = ['#FFC233', '#3A4BFF', '#FF6A2B', '#16C784', '#7B3FF2', '#FF3D6E'];

/** Écran de récompense après une séance : points, XP, passage de niveau, confettis. */
export function CelebrationOverlay() {
  const { celebration, dismissCelebration } = useStore();
  const scale = useRef(new Animated.Value(0.6)).current;
  const fall = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!celebration) return;
    scale.setValue(0.6);
    fall.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }),
      Animated.timing(fall, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [celebration, scale, fall]);

  if (!celebration) return null;
  const success = celebration.status === 'validee' || celebration.status === 'partielle';
  const title = celebration.levelUp
    ? `Niveau ${celebration.levelUp.level} !`
    : celebration.status === 'validee'
      ? 'Séance validée !'
      : celebration.status === 'partielle'
        ? 'Validée en partie'
        : celebration.status === 'refusee'
          ? 'Activité refusée'
          : 'Pas validée cette fois';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={dismissCelebration}>
      <View style={styles.backdrop}>
        {success &&
          Array.from({ length: 28 }).map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.confetti,
                {
                  left: `${(i * 37) % 100}%`,
                  backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  transform: [
                    { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-40 - (i % 5) * 30, 700 + (i % 7) * 20] }) },
                    { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`] }) },
                  ],
                },
              ]}
            />
          ))}
        <Animated.View style={{ transform: [{ scale }], width: '100%', maxWidth: 380 }}>
          <LinearGradient colors={success ? (celebration.levelUp ? Gradients.gold : Gradients.energy) : Gradients.night} style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name={celebration.levelUp ? 'trophy' : success ? 'checkmark-circle' : 'close-circle'} size={64} color="#fff" />
            </View>
            <Text style={styles.title}>{title}</Text>
            {celebration.levelUp && celebration.newTitle && <Text style={styles.subtitle}>Tu deviens « {celebration.levelUp.title} »</Text>}
            {success ? (
              <View style={styles.rewards}>
                {celebration.points > 0 && (
                  <View style={styles.reward}>
                    <Ionicons name="cash" size={22} color="#FFC233" />
                    <Text style={styles.rewardValue}>+{celebration.points}</Text>
                    <Text style={styles.rewardLabel}>RunCoins</Text>
                  </View>
                )}
                {celebration.xp > 0 && (
                  <View style={styles.reward}>
                    <Ionicons name="flash" size={22} color="#3BE0A0" />
                    <Text style={styles.rewardValue}>+{celebration.xp}</Text>
                    <Text style={styles.rewardLabel}>XP</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.subtitle}>Regarde le détail de la séance pour comprendre pourquoi.</Text>
            )}
            <Button kind={celebration.levelUp ? 'primary' : 'gold'} label="Continuer" onPress={dismissCelebration} />
          </LinearGradient>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(4,6,16,0.7)', alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, overflow: 'hidden' },
  confetti: { position: 'absolute', top: 0, width: 10, height: 16, borderRadius: 3 },
  card: { borderRadius: Radius.l, padding: Spacing.xl, gap: Spacing.l, alignItems: 'stretch' },
  iconWrap: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 30, lineHeight: 36, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 16, textAlign: 'center' },
  rewards: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.xl },
  reward: { alignItems: 'center', gap: 2 },
  rewardValue: { color: '#fff', fontSize: 34, lineHeight: 42, fontWeight: '900', fontVariant: ['tabular-nums'] },
  rewardLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
});
