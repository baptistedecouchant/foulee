import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { flattenSteps, ZONE_INTENSITY, type Step } from '@foulee/core';

import { Fonts, Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export { Ionicons };

type TextVariant = 'hero' | 'display' | 'title' | 'body' | 'label' | 'caption' | 'number';

export function Txt({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[styles[variant], { color: color ?? (muted ? t.textSecondary : t.text) }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

/** Bouton « arcade » : épais, avec une ombre basse qui s'écrase à l'appui. */
export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'gold' | 'flame' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
}) {
  const t = useTheme();
  const palette = {
    primary: { bg: t.accent, edge: t.accentDark, fg: t.accentText },
    gold: { bg: t.gold, edge: t.goldDark, fg: t.goldText },
    flame: { bg: t.flame, edge: '#C2410C', fg: '#FFFFFF' },
    secondary: { bg: t.surface, edge: t.line, fg: t.accent },
    ghost: { bg: 'transparent', edge: 'transparent', fg: t.accent },
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        small && { minHeight: 40, paddingHorizontal: Spacing.m },
        {
          backgroundColor: palette.bg,
          borderColor: kind === 'secondary' ? t.line : palette.bg,
          borderBottomColor: palette.edge,
          borderBottomWidth: kind === 'ghost' ? 0 : pressed ? 1 : 3,
          transform: [{ translateY: pressed && kind !== 'ghost' ? 2 : 0 }],
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      {icon && <Ionicons name={icon} size={small ? 16 : 19} color={palette.fg} />}
      <Text style={[styles.buttonLabel, small && { fontSize: 14 }, { color: palette.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surfaceAlt, borderColor: t.line }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.segment, active && { backgroundColor: t.accent }]}>
            <Text style={[styles.segmentLabel, { color: active ? t.accentText : t.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'gold' | 'flame' | 'xp' | 'glass';
  icon?: IconName;
}) {
  const t = useTheme();
  const map = {
    neutral: [t.surfaceAlt, t.textSecondary],
    ok: [t.xpSoft, t.ok],
    warn: [t.flameSoft, t.warn],
    bad: [t.flameSoft, t.bad],
    accent: [t.accentSoft, t.accent],
    gold: [t.gold, t.goldText],
    flame: [t.flame, '#FFFFFF'],
    xp: [t.xp, '#04281B'],
    glass: ['rgba(255,255,255,0.22)', '#FFFFFF'],
  }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: map[0] }]}>
      {icon && <Ionicons name={icon} size={13} color={map[1]} />}
      <Text style={[styles.chipLabel, { color: map[1] }]}>{label}</Text>
    </View>
  );
}

/** Barre de progression animée. */
export function ProgressBar({
  value,
  colors = Gradients.xp,
  height = 12,
  track,
}: {
  value: number;
  colors?: readonly [string, string];
  height?: number;
  track?: string;
}) {
  const t = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: Math.max(0, Math.min(1, value)), useNativeDriver: false, friction: 7 }).start();
  }, [value, anim]);
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track ?? t.surfaceAlt, overflow: 'hidden' }}>
      <Animated.View style={{ height, width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: height }} />
      </Animated.View>
    </View>
  );
}

/** Pastille de niveau. */
export function LevelBadge({ level, size = 56 }: { level: number; size?: number }) {
  return (
    <LinearGradient colors={Gradients.energy} style={[styles.levelBadge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ color: '#fff', fontSize: size * 0.18, fontWeight: '800', letterSpacing: 1 }}>NIV.</Text>
      <Text style={{ color: '#fff', fontSize: size * 0.42, fontWeight: '900', fontFamily: Fonts.rounded, marginTop: -2 }}>{level}</Text>
    </LinearGradient>
  );
}

/** Compteur avec icône (série, points, XP). */
export function StatPill({ icon, value, color, bg }: { icon: IconName; value: string; color: string; bg: string }) {
  return (
    <View style={[styles.statPill, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={{ color, fontWeight: '800', fontSize: 15, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

/** Profil d'intensité d'une séance, comme sur l'écran d'une montre. */
export function IntensityProfile({ steps, height = 44, color }: { steps: Step[]; height?: number; color?: string }) {
  const t = useTheme();
  const blocks = flattenSteps(steps);
  return (
    <View style={[styles.profile, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {blocks.map((b, i) => (
        <View
          key={i}
          style={{
            flex: b.expectedSec,
            height: Math.max(4, ZONE_INTENSITY[b.zone] * height),
            backgroundColor: color ?? t.accent,
            opacity: 0.35 + ZONE_INTENSITY[b.zone] * 0.65,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3,
          }}
        />
      ))}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Spacing.s }, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: Spacing.s }}>
      <Txt variant="title">{children}</Txt>
      {action}
    </Row>
  );
}

const styles = StyleSheet.create({
  hero: { fontSize: 38, fontWeight: '800', letterSpacing: -1.2, fontFamily: Fonts.rounded, fontVariant: ['tabular-nums'] },
  display: { fontSize: 28, fontWeight: '800', letterSpacing: -0.7, fontFamily: Fonts.rounded },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3, fontFamily: Fonts.rounded },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 13, lineHeight: 18 },
  number: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.l, gap: Spacing.m, boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.05)' },
  button: {
    minHeight: 52,
    borderRadius: Radius.m,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.s,
    paddingHorizontal: Spacing.l,
  },
  buttonLabel: { fontSize: 16, fontWeight: '700', letterSpacing: 0.1 },
  segmented: { flexDirection: 'row', borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, padding: 4, gap: 4 },
  segment: { flex: 1, minHeight: 42, borderRadius: Radius.s, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  chipLabel: { fontSize: 12, fontWeight: '700' },
  profile: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5 },
  levelBadge: { alignItems: 'center', justifyContent: 'center' },
  statPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
});
