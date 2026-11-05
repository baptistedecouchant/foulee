import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Ionicons, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';

const COLORS = ['#FFD65C', '#FF8A3D', '#FF3D6E', '#FFFFFF', '#7BE0FF', '#1ED69A'];
const PIECES = 40;
const STARS = 26;

/**
 * Plein écran de félicitations à la création d'un objectif : fond coloré, étoiles, fusée qui décolle
 * avec sa traînée de flammes, confettis, puis le résumé du plan et « On commence ? ».
 */
export function GoalCelebration({
  title,
  subtitle,
  stats,
  onStart,
  onPlan,
}: {
  title: string;
  subtitle: string;
  stats: Array<{ icon: 'calendar' | 'repeat' | 'flag' | 'speedometer'; label: string }>;
  /** « On commence ! » : ouvre la première séance. */
  onStart: () => void;
  onPlan: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = Dimensions.get('window');

  const fade = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current; // décollage
  const shake = useRef(new Animated.Value(0)).current; // vibration au sol
  const flame = useRef(new Animated.Value(0)).current; // flamme qui palpite
  const text = useRef(new Animated.Value(0)).current;
  const rows = useRef(stats.map(() => new Animated.Value(0))).current;
  const cta = useRef(new Animated.Value(0)).current;

  const stars = useMemo(
    () => Array.from({ length: STARS }, () => ({ x: Math.random() * width, y: Math.random() * height * 0.7, s: 1.5 + Math.random() * 2.5, v: new Animated.Value(0), d: Math.random() * 1200 })),
    [width, height],
  );
  const confetti = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        x: Math.random() * width,
        drift: (Math.random() - 0.5) * 140,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        round: Math.random() > 0.6,
        delay: 900 + Math.random() * 500,
        duration: 2000 + Math.random() * 1200,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
        v: new Animated.Value(0),
      })),
    [width],
  );

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const timers = [
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}), 350),
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 700),
      setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 1000),
    ];

    Animated.timing(fade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    Animated.loop(Animated.timing(flame, { toValue: 1, duration: 260, easing: Easing.inOut(Easing.quad), useNativeDriver: true })).start();
    // La fusée tremble, puis décolle et se pose en haut de l'écran.
    Animated.sequence([
      Animated.loop(
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
        ]),
        { iterations: 7 },
      ),
      Animated.timing(shake, { toValue: 0, duration: 30, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.stagger(
      40,
      stars.map((st) => Animated.loop(Animated.sequence([Animated.delay(st.d), Animated.timing(st.v, { toValue: 1, duration: 900, useNativeDriver: true }), Animated.timing(st.v, { toValue: 0, duration: 900, useNativeDriver: true })]))),
    ).start();
    Animated.sequence([
      Animated.delay(1050),
      Animated.timing(text, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.stagger(110, rows.map((r) => Animated.spring(r, { toValue: 1, friction: 6, useNativeDriver: true }))),
      Animated.spring(cta, { toValue: 1, friction: 6, useNativeDriver: true }),
    ]).start();
    Animated.parallel(confetti.map((c) => Animated.timing(c.v, { toValue: 1, duration: c.duration, delay: c.delay, easing: Easing.in(Easing.quad), useNativeDriver: true }))).start();
    return () => timers.forEach(clearTimeout);
  }, [fade, lift, shake, flame, text, rows, cta, stars, confetti]);

  const rise = (v: Animated.Value, by = 18) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [by, 0] }) }] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade, zIndex: 50 }]} accessibilityViewIsModal>
      <LinearGradient colors={['#2B3BFF', '#7B3FF2', '#FF3D6E']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} />

      {stars.map((st, i) => (
        <Animated.View key={`s${i}`} pointerEvents="none" style={{ position: 'absolute', left: st.x, top: st.y, width: st.s, height: st.s, borderRadius: st.s, backgroundColor: '#fff', opacity: st.v.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.9] }) }} />
      ))}

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

      <View style={[styles.content, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.l }]}>
        <View style={styles.center}>
          {/* Fusée */}
          <Animated.View
            style={[
              styles.rocketWrap,
              {
                transform: [
                  { translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-3, 3] }) },
                  { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [height * 0.32, 0] }) },
                  { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) },
                ],
              },
            ]}>
            <View style={styles.rocketCircle}>
              <Txt style={styles.rocket}>🚀</Txt>
            </View>
            {/* Flamme à l'arrière de la fusée (en bas à gauche de l'émoji), qui palpite */}
            <Animated.View
              pointerEvents="none"
              style={[
                styles.flame,
                {
                  opacity: flame.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1] }),
                  transform: [{ rotate: '225deg' }, { scale: flame.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }],
                },
              ]}>
              <Txt style={{ fontSize: 30, lineHeight: 36 }}>🔥</Txt>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[{ alignItems: 'center', gap: 8 }, rise(text)]}>
            <Txt style={styles.kicker} color="#FFE48A">
              Félicitations !
            </Txt>
            <Txt style={styles.title} color="#fff">
              {title}
            </Txt>
            <Txt color="rgba(255,255,255,0.9)" style={{ textAlign: 'center' }}>
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

        <Animated.View style={[{ width: '100%', gap: Spacing.s }, rise(cta, 24)]}>
          <Txt color="#fff" style={{ textAlign: 'center', fontWeight: '700', fontSize: 17 }}>
            Hâte de lancer ton premier entraînement. On commence ?
          </Txt>
          <Button kind="gold" icon="rocket" label="On commence !" onPress={onStart} />
          <Pressable accessibilityRole="button" onPress={onPlan} hitSlop={10} style={{ alignSelf: 'center', paddingVertical: Spacing.s }}>
            <Txt color="#fff" style={{ fontWeight: '700', textDecorationLine: 'underline' }}>
              Voir mon plan d’abord
            </Txt>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: Spacing.xl, justifyContent: 'space-between', alignItems: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.l, width: '100%' },
  rocketWrap: { width: 140, height: 160, alignItems: 'center' },
  rocketCircle: { width: 124, height: 124, borderRadius: 62, backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  rocket: { fontSize: 66, lineHeight: 80 },
  flame: { position: 'absolute', top: 84, left: 14, zIndex: 3 },
  kicker: { fontSize: 14, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase' },
  title: { fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' },
  rows: { width: '100%', gap: Spacing.s },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: Spacing.m },
  rowIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
});
