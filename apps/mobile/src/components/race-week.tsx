import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { distanceLabel, formatPace, formatTime, raceWeekGuide, type Plan } from '@foulee/core';

import { Ionicons, Txt, type IconName } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateFr } from '@/lib/store';

const EMOJI: Record<string, string> = { bed: '😴', restaurant: '🍝', walk: '🎒', cafe: '☕', flash: '⚡', nutrition: '🍌', water: '💧', flag: '🏁' };

/** « 09:30 » → « 9 h 30 » */
const clock = (hhmm: string) => `${Number(hhmm.slice(0, 2))} h ${hhmm.slice(3, 5)}`;

const ICON: Record<string, IconName> = {
  bed: 'bed-outline',
  restaurant: 'restaurant-outline',
  walk: 'walk-outline',
  cafe: 'cafe-outline',
  flash: 'flash-outline',
  nutrition: 'nutrition-outline',
  water: 'water-outline',
  time: 'time-outline',
  flag: 'flag-outline',
};

/**
 * Semaine de la course : compte à rebours, allure cible et guide jour par jour
 * (affûtage, charge en glucides, petit-déjeuner calé sur l'heure de départ, gels, récupération).
 */
export function RaceWeek({ plan, daysLeft, weightKg }: { plan: Plan; daysLeft: number; weightKg?: number }) {
  const t = useTheme();
  const g = plan.request.goal;
  const expected = g.targetTimeSec ?? plan.predictedTimeSec;
  const steps = raceWeekGuide({ distanceKm: g.distanceKm, expectedSec: expected, startTime: g.race?.startTime, weightKg });
  const [open, setOpen] = useState<number>(daysLeft <= 1 ? 3 : daysLeft <= 3 ? 1 : 0);

  return (
    <View style={{ gap: Spacing.m }}>
      <GradientCard colors={Gradients.flame}>
        <Txt style={styles.kicker} color="rgba(255,255,255,0.85)">
          Semaine de course
        </Txt>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Txt style={styles.big} color="#fff">
              {daysLeft > 0 ? `J-${daysLeft}` : 'Jour J'}
            </Txt>
            <Txt color="rgba(255,255,255,0.9)">
              {g.race?.name ?? distanceLabel(g.distanceKm)} · {formatDateFr(g.eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}
              {g.race?.startTime ? ` · départ ${clock(g.race.startTime)}` : ''}
            </Txt>
          </View>
          <Ionicons name="flag" size={34} color="rgba(255,255,255,0.9)" />
        </View>
        <View style={styles.stats}>
          <Stat value={formatTime(expected)} label={g.targetTimeSec ? 'objectif' : 'temps estimé'} />
          <Stat value={`${formatPace(expected / g.distanceKm)} /km`} label="allure" />
          <Stat value={distanceLabel(g.distanceKm)} label="distance" />
        </View>
      </GradientCard>

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        {steps.map((s, i) => {
          const isOpen = open === i;
          return (
            <View key={s.when} style={[i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => setOpen(isOpen ? -1 : i)} style={styles.head}>
                <View style={[styles.icon, { backgroundColor: isOpen ? t.flame : t.flameSoft }]}>
                  <Ionicons name={ICON[s.icon] ?? 'ellipse-outline'} size={16} color={isOpen ? '#fff' : t.flame} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" muted>
                    {s.when}
                  </Txt>
                  <Txt style={{ fontWeight: '600' }}>
                    {EMOJI[s.icon] ?? ''} {s.title}
                  </Txt>
                </View>
                <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={t.textSecondary} />
              </Pressable>
              {isOpen && (
                <View style={styles.items}>
                  {s.items.map((it) => (
                    <View key={it} style={styles.item}>
                      <View style={[styles.dot, { backgroundColor: t.flame }]} />
                      <Txt style={{ flex: 1 }}>{it}</Txt>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
      <Txt variant="caption" muted>
        Repères généraux pour sportifs en bonne santé. En cas de pathologie ou de régime particulier, demande l’avis d’un professionnel.
      </Txt>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Txt style={{ fontWeight: '700', fontSize: 16, fontVariant: ['tabular-nums'] }} color="#fff" numberOfLines={1}>
        {value}
      </Txt>
      <Txt variant="caption" color="rgba(255,255,255,0.8)">
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  big: { fontSize: 40, lineHeight: 46, fontWeight: '800', letterSpacing: -1 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  stats: { flexDirection: 'row', gap: Spacing.s, backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 14, padding: Spacing.m },
  card: { borderRadius: 22, paddingHorizontal: Spacing.l, paddingVertical: Spacing.xs, boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.m },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  items: { gap: Spacing.s, paddingBottom: Spacing.m, paddingLeft: 44 },
  item: { flexDirection: 'row', gap: Spacing.s, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
});
