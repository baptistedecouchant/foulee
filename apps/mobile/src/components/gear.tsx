import { StyleSheet, View } from 'react-native';
import type { ShoeWear } from '@foulee/core';

import { ProgressBar, Txt } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { fmtInt } from '@/lib/labels';

export function WearBar({ wear, lifeKm }: { wear: ShoeWear; lifeKm: number }) {
  const t = useTheme();
  const color = { neuve: t.ok, bonne: t.ok, surveiller: t.warn, remplacer: t.flame, usee: t.bad }[wear.state];
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.rowBetween}>
        <Txt style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          {fmtInt(wear.km)} <Txt muted>/ {fmtInt(lifeKm)} km</Txt>
        </Txt>
        <Txt variant="caption" color={color} style={{ fontWeight: '600' }}>
          {wear.label}
          {wear.leftKm > 0 && wear.state !== 'neuve' ? ` · encore ~${fmtInt(wear.leftKm)} km` : ''}
        </Txt>
      </View>
      <ProgressBar value={Math.min(1, wear.ratio)} colors={[color, color]} height={6} />
    </View>
  );
}


const styles = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
