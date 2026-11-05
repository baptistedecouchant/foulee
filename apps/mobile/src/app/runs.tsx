import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { formatPace, formatTime } from '@foulee/core';

import { Button, Ionicons, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateFr, useStore } from '@/lib/store';

const SOURCE: Record<string, string> = {
  app_gps: 'GPS Foulée',
  apple_health: 'Apple Santé',
  health_connect: 'Health Connect',
  strava: 'Strava',
  garmin: 'Garmin',
  coros: 'Coros',
  polar: 'Polar',
  suunto: 'Suunto',
  app: 'Foulée',
};

export default function RunsScreen() {
  const t = useTheme();
  const { runs, shoes, gear, assignRun, health, importHealthRuns } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const active = shoes.filter((s) => !s.shoe.retired);
  const nameOf = (id?: string) => {
    const s = shoes.find((x) => x.shoe.id === id)?.shoe;
    return s ? `${s.brand} ${s.model}` : null;
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      {health === 'connected' && (
        <Button
          kind="secondary"
          small
          icon="refresh"
          label={importing ? 'Import en cours…' : 'Importer depuis Apple Santé'}
          disabled={importing}
          onPress={async () => {
            setImporting(true);
            await importHealthRuns().catch(() => 0);
            setImporting(false);
          }}
        />
      )}

      {runs.length === 0 ? (
        <View style={[styles.card, styles.shadow, { backgroundColor: t.surface, alignItems: 'center' }]}>
          <Ionicons name="footsteps-outline" size={30} color={t.textSecondary} />
          <Txt style={{ fontWeight: '600' }}>Aucune course pour l’instant</Txt>
          <Txt variant="caption" muted style={{ textAlign: 'center' }}>
            Connecte Strava, Garmin ou Apple Santé, ou lance une séance guidée : tes courses apparaîtront ici.
          </Txt>
          <Button kind="secondary" small icon="watch" label="Montres et apps" onPress={() => router.push('/devices')} />
        </View>
      ) : (
        runs.slice(0, 60).map((r) => {
          const shoeName = nameOf(gear.assignments[r.id]);
          const isOpen = open === r.id;
          return (
            <View key={r.id} style={[styles.card, styles.shadow, { backgroundColor: t.surface }]}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? null : r.id)} style={{ gap: 6 }}>
                <View style={styles.rowBetween}>
                  <Txt variant="caption" muted>
                    {formatDateFr(r.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {SOURCE[r.source] ?? r.source}
                  </Txt>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={t.textSecondary} />
                </View>
                {r.title ? <Txt style={{ fontWeight: '600' }}>{r.title}</Txt> : null}
                <View style={styles.stats}>
                  <Stat value={`${String(r.distanceKm).replace('.', ',')} km`} label="distance" />
                  <Stat value={formatTime(r.durationSec)} label="durée" />
                  <Stat value={r.distanceKm > 0 ? formatPace(r.durationSec / r.distanceKm) : '—'} label="min/km" />
                </View>
                <View style={styles.row}>
                  <Ionicons name="footsteps" size={13} color={shoeName ? t.accent : t.textSecondary} />
                  <Txt variant="caption" color={shoeName ? t.accent : t.textSecondary}>
                    {shoeName ?? 'Aucune paire'}
                  </Txt>
                </View>
              </Pressable>
              {isOpen && (
                <View style={{ gap: Spacing.s }}>
                  <Txt variant="caption" muted>
                    Paire utilisée
                  </Txt>
                  <View style={styles.wrap}>
                    {active.map(({ shoe }) => {
                      const on = gear.assignments[r.id] === shoe.id;
                      return (
                        <Pressable
                          key={shoe.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => assignRun(r.id, shoe.id)}
                          style={[styles.pill, { backgroundColor: on ? t.accent : t.surfaceAlt }]}>
                          <Txt variant="caption" color={on ? t.accentText : t.text} style={{ fontWeight: '600' }}>
                            {shoe.model}
                          </Txt>
                        </Pressable>
                      );
                    })}
                    <Pressable
                      accessibilityRole="radio"
                      onPress={() => assignRun(r.id, null)}
                      style={[styles.pill, { backgroundColor: !shoeName ? t.accent : t.surfaceAlt }]}>
                      <Txt variant="caption" color={!shoeName ? t.accentText : t.text} style={{ fontWeight: '600' }}>
                        Aucune
                      </Txt>
                    </Pressable>
                  </View>
                  {active.length === 0 && <Button kind="ghost" small icon="add" label="Ajouter une paire" onPress={() => router.push('/shoes')} />}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt style={{ fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Txt>
      <Txt variant="caption" muted>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.m, paddingBottom: 80 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  stats: { flexDirection: 'row', gap: Spacing.s },
  card: { borderRadius: 20, padding: Spacing.l, gap: Spacing.m },
  shadow: { boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)' },
  pill: { borderRadius: 999, paddingHorizontal: 12, minHeight: 32, justifyContent: 'center' },
});
