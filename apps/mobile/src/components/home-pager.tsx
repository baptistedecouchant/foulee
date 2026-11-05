import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { Glass } from '@/components/visuals';
import { Radius, Spacing } from '@/constants/theme';

export interface PagerPage {
  key: string;
  content: ReactNode;
  onPress?: () => void;
  /** Dégradé de fond du bloc quand cette page est affichée. */
  colors: readonly [string, string];
}

const PAGE_H = 150;

/**
 * Bloc d'accueil qui défile verticalement (façon widgets iOS) : chaque page est un panneau
 * Liquid Glass posé sur un fond de couleur (qui change avec le module), avec les points de navigation à droite.
 */
export function HomePager({ pages }: { pages: PagerPage[] }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);
  const fadesRef = useRef<Animated.Value[]>([]);
  while (fadesRef.current.length < pages.length) fadesRef.current.push(new Animated.Value(fadesRef.current.length === 0 ? 1 : 0));
  const fades = fadesRef.current;
  useEffect(() => {
    fades.forEach((f, i) => Animated.timing(f, { toValue: i === index ? 1 : 0, duration: 350, useNativeDriver: true }).start());
  }, [index, fades]);

  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.y / PAGE_H);
    if (i !== index) {
      Haptics.selectionAsync().catch(() => {});
      setIndex(i);
    }
  };
  const go = (i: number) => {
    ref.current?.scrollTo({ y: i * PAGE_H, animated: true });
    setIndex(i);
  };

  return (
    <View style={styles.card}>
      {/* Fond de couleur propre à chaque module, en fondu */}
      {pages.map((p, i) => (
        <Animated.View key={p.key} pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fades[i] ?? 0 }]}>
          <LinearGradient colors={p.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}
      <View style={styles.glow} pointerEvents="none" />
      <View style={styles.row}>
        <ScrollView
          ref={ref}
          style={{ height: PAGE_H, flex: 1 }}
          pagingEnabled
          snapToInterval={PAGE_H}
          decelerationRate="fast"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={onEnd}
          onScrollEndDrag={onEnd}
          scrollEventThrottle={16}>
          {pages.map((p) => (
            <Pressable key={p.key} accessibilityRole={p.onPress ? 'button' : undefined} onPress={p.onPress} style={{ height: PAGE_H, paddingVertical: 2 }}>
              <Glass clear style={styles.panel}>
                {p.content}
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.dots} accessibilityRole="adjustable" accessibilityLabel={`Module ${index + 1} sur ${pages.length}`}>
          {pages.map((p, i) => (
            <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`Afficher le module ${i + 1}`} onPress={() => go(i)} hitSlop={6}>
              <View style={[styles.dot, i === index && styles.dotOn]} />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.l, overflow: 'hidden', padding: Spacing.m, height: PAGE_H + Spacing.m * 2, justifyContent: 'center' },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -60, top: -90, backgroundColor: 'rgba(255,255,255,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  panel: { flex: 1, padding: Spacing.m, gap: 6, borderRadius: 20, justifyContent: 'center' },
  dots: { gap: 6, alignItems: 'center', paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { height: 18, backgroundColor: '#fff' },
});
