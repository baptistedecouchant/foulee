import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { flattenSteps, ZONE_INTENSITY, type Step } from '@foulee/core';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type TextVariant = 'display' | 'title' | 'body' | 'label' | 'caption' | 'number';

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
    <Text
      numberOfLines={numberOfLines}
      style={[styles[variant], { color: color ?? (muted ? t.textSecondary : t.text) }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.line }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'gold';
  disabled?: boolean;
  accessibilityHint?: string;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'gold' ? t.gold : t.accentSoft;
  const fg = kind === 'primary' ? t.accentText : kind === 'gold' ? t.goldText : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}>
      <Text style={[styles.buttonLabel, { color: fg }]}>{label}</Text>
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
    <View style={[styles.segmented, { backgroundColor: t.background, borderColor: t.line }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: t.surface, borderColor: t.accent }]}>
            <Text style={[styles.segmentLabel, { color: active ? t.accent : t.textSecondary }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'accent' | 'gold' }) {
  const t = useTheme();
  const color = { neutral: t.textSecondary, ok: t.ok, warn: t.warn, bad: t.bad, accent: t.accent, gold: t.goldText }[tone];
  const bg = tone === 'gold' ? t.gold : tone === 'accent' ? t.accentSoft : 'transparent';
  return (
    <View style={[styles.chip, { borderColor: tone === 'gold' ? t.gold : color, backgroundColor: bg }]}>
      <Text style={[styles.chipLabel, { color }]}>{label}</Text>
    </View>
  );
}

/** Profil d'intensité d'une séance, comme sur l'écran d'une montre. */
export function IntensityProfile({ steps, height = 44 }: { steps: Step[]; height?: number }) {
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
            backgroundColor: t.accent,
            opacity: 0.3 + ZONE_INTENSITY[b.zone] * 0.7,
            borderTopLeftRadius: 2,
            borderTopRightRadius: 2,
          }}
        />
      ))}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Spacing.s }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  display: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  title: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 13, lineHeight: 18 },
  number: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  card: { borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth, padding: Spacing.l, gap: Spacing.m },
  button: { minHeight: 48, borderRadius: Radius.s, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.l },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderRadius: Radius.s, borderWidth: StyleSheet.hairlineWidth, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 40, borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  segmentLabel: { fontSize: 14, fontWeight: '600' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  chipLabel: { fontSize: 12, fontWeight: '600' },
  profile: { flexDirection: 'row', alignItems: 'flex-end', gap: 1 },
});
