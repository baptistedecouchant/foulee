import * as Haptics from 'expo-haptics';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { Glass, PhotoCard } from '@/components/visuals';
import { Spacing } from '@/constants/theme';
import type { ImageKey } from '@/lib/images';

export interface PagerPage {
  key: string;
  content: ReactNode;
  onPress?: () => void;
}

const PAGE_H = 150;

/**
 * Bloc d'accueil qui défile verticalement (façon widgets iOS) : chaque page est un panneau
 * Liquid Glass posé sur une photo, avec les points de navigation à droite.
 */
export function HomePager({ pages, image }: { pages: PagerPage[]; image: ImageKey }) {
  const [index, setIndex] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);

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
    <PhotoCard image={image} height={PAGE_H + Spacing.m * 2} contentStyle={styles.content}>
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
              <Glass dark style={styles.panel}>
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
    </PhotoCard>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, padding: Spacing.m, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  panel: { flex: 1, padding: Spacing.m, gap: 6, borderRadius: 20, justifyContent: 'center' },
  dots: { gap: 6, alignItems: 'center', paddingHorizontal: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotOn: { height: 18, backgroundColor: '#fff' },
});
