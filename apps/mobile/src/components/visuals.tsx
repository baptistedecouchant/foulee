import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { IMAGE_FALLBACK, imageUri, type ImageKey } from '@/lib/images';

/** Carte photo plein cadre avec dégradé sombre pour la lisibilité du texte. */
export function PhotoCard({
  image,
  children,
  height = 200,
  onPress,
  style,
  contentStyle,
}: {
  image: ImageKey;
  children: ReactNode;
  height?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Style du contenu (ex. `{ flex: 1 }` pour placer des éléments en haut de l'image). */
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.photo, { height }, style]}>
      <LinearGradient colors={IMAGE_FALLBACK[image]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
      <Image source={{ uri: imageUri(image) }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} cachePolicy="disk" accessibilityIgnoresInvertColors />
      <LinearGradient colors={Gradients.shade} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0.15 }} end={{ x: 0, y: 1 }} />
      <View style={[styles.photoContent, contentStyle]}>{children}</View>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

/**
 * Panneau « verre » : Liquid Glass natif sur iOS 26+, flou classique ailleurs.
 */
export function Glass({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  const scheme = useColorScheme();
  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <GlassView glassEffectStyle="regular" tintColor={tint} isInteractive style={[styles.glass, style]}>
        {children}
      </GlassView>
    );
  }
  return (
    <BlurView intensity={40} tint={scheme === 'dark' ? 'dark' : 'light'} style={[styles.glass, styles.blurFallback, style]}>
      {children}
    </BlurView>
  );
}

/** Fond dégradé simple (cartes héros sans photo). */
export function GradientCard({ colors, children, style }: { colors: readonly [string, string]; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.gradientCard, style]}>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  photo: { borderRadius: Radius.l, overflow: 'hidden', justifyContent: 'flex-end' },
  photoContent: { padding: Spacing.l, gap: Spacing.s },
  glass: { borderRadius: Radius.l, overflow: 'hidden', padding: Spacing.l, gap: Spacing.m },
  blurFallback: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)' },
  gradientCard: { borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m, overflow: 'hidden' },
});
