import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';

const COLORS = ['#FFD65C', '#FF8A3D', '#FF3D6E', '#7B3FF2', '#3A4BFF', '#1ED69A', '#FFFFFF'];
const PIECES = 46;

/**
 * Écran de félicitations à la création d'un objectif : pluie de confettis, médaille qui rebondit,
 * halo qui pulse, puis le résumé du plan qui apparaît ligne par ligne.
 */
export function GoalCelebration({
  title,
  subtitle,
  stats,
  onDone,
}: {
  title: string;
  subtitle: string;
  stats: Array<{ icon: 'calendar' | 'repeat' | 'flag' | 'speedometer'; label: string }>;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');

  const fade = useRef(new Animated.Value(0)).current;
  const medal = useRef(new Animated.Value(0)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const rows = useRef(stats.map(() => new Animated.Value(0))).current;
  const cta = useRef(new Animated.Value(0)).current;

  const confetti = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 120,
        size: 6 + Math.random() * 8,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.6,
        delay: Math.random() * 500,
        duration: 1900 + Math.random() * 1300,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        v: new Animated.Value(0),
      })),
    [width],
  );

  useEffect(() => {
    // Trois petites vibrations, comme un « ta-da ».
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const t1 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 380);
    const t2 = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 620);

    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
    Animated.spring(medal, { toValue: 1, friction: 4, tension: 70, delay: 150, useNativeDriver: true }).start();
    Animated.loop(Animated.timing(halo, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true })).start();
    Animated.sequence([
      Animated.delay(450),
      Animated.timing(text, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(
        120,
        rows.map((r) => Animated.spring(r, { toValue: 1, friction: 6, useNativeDriver: true })),
      ),
      Animated.spring(cta, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
    Animated.parallel(
      confetti.map((c) =>
        Animated.timing(c.v, { toValue: 1, duration: c.duration, delay: c.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ),
    ).start();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [fade, medal, halo, text, rows, cta, confetti]);

  const rise = (v: Animated.Value, by = 18) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 50 }]} accessibilityViewIsModal>
      <LinearGradient colors={['#0B1230', '#2A1252', '#3A1E5E']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />

      {/* Confettis */}
      {confetti.map((c, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: c.x,
            top: -20,
            width: c.size,
            height: c.round ? c.size : c.size * 0.45,
            borderRadius: c.round ? c.size / 2 : 2,
            backgroundColor: c.color,
            opacity: c.v.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: c.v.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
              { translateX: c.v.interpolate({ inputRange: [0, 1], outputRange: [0, c.drift] }) },
              { rotate: c.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${c.spin}deg`] }) },
            ],
          }}
        />
      ))}

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.l }]}>
        <View style={styles.center}>
          {/* Médaille et halo */}
          <View style={styles.medalWrap}>
            <Animated.View
              style={[
                styles.halo,
                {
                  opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                  transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
                },
              ]}
            />
            <Animated.View
              style={{
                transform: [
                  { scale: medal.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                  { rotate: medal.interpolate({ inputRange: [0, 1], outputRange: ['-25deg', '0deg'] }) },
                ],
              }}>
              <LinearGradient colors={['#FFD65C', '#FF9F1C']} style={styles.medal}>
                <Ionicons name="trophy" size={58} color="#3A2A00" />
              </LinearGradient>
            </Animated.View>
          </View>

          <Animated.View style={[{ alignItems: 'center', gap: 8 }, rise(text)]}>
            <Txt style={styles.kicker} color="#FFD65C">
              Félicitations !
            </Txt>
            <Txt style={styles.title} color="#fff">
              {title}
            </Txt>
            <Txt color="rgba(255,255,255,0.8)" style={{ textAlign: 'center' }}>
              {subtitle}
            </Txt>
          </Animated.View>

          <View style={styles.rows}>
            {stats.map((s, i) => (
              <Animated.View key={s.label} style={[styles.row, rise(rows[i], 14)]}>
                <View style={styles.rowIcon}>
                  <Ionicons name={s.icon} size={16} color="#fff" />
                </View>
                <Txt color="#fff" style={{ fontWeight: '600', flex: 1 }}>
                  {s.label}
                </Txt>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View style={[{ width: '100%' }, rise(cta, 24)]}>
          <Button kind="gold" icon="arrow-forward" label="Découvrir mon plan" onPress={onDone} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: Spacing.xl, justifyContent: 'space-between', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.xl, width: '100%' },
  medalWrap: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 130, height: 130, borderRadius: 65, backgroundColor: '#FFD65C' },
  medal: { width: 124, height: 124, borderRadius: 62, alignItems: 'center', justifyContent: 'center', borderWidth: 4, borderColor: 'rgba(255,255,255,0.6)' },
  kicker: { fontSize: 14, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  rows: { width: '100%', gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: Spacing.m },
  rowIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
});
