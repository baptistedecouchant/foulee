import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatPace } from '@foulee/core';

import { Button, Chip, ProgressBar, Row, Txt } from '@/components/ui';
import { PhotoCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { daysLeft, goalTitle, planProgress } from '@/lib/labels';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

export default function PlansScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { plans } = useStore();
  const today = todayIso();

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      <View style={{ gap: 4 }}>
        <Txt variant="hero">Entraînements</Txt>
        <Txt muted>
          Jusqu’à {MAX_ACTIVE_PLANS} objectifs en parallèle. Les séances de la montre sont rattachées automatiquement au bon plan.
        </Txt>
      </View>

      {plans.map((p) => {
        const pr = planProgress(p);
        const left = daysLeft(p.plan, today);
        return (
          <PhotoCard key={p.id} image={p.image} height={230} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })}>
            <Row>
              <Chip tone="glass" icon="calendar" label={formatDateFr(p.plan.request.goal.eventDate, { day: 'numeric', month: 'long' })} />
              <Chip tone="flame" icon="hourglass" label={left > 0 ? `J-${left}` : left === 0 ? 'Jour J' : 'Terminé'} />
            </Row>
            <Txt variant="display" color="#fff">
              {goalTitle(p.plan)}
            </Txt>
            <Txt color="rgba(255,255,255,0.85)">
              {p.plan.weeks.length} semaines · {p.plan.request.sessionsPerWeek} séances par semaine · allure {formatPace(p.plan.racePaceSecPerKm)} /km
            </Txt>
            <ProgressBar value={pr.ratio} height={10} track="rgba(255,255,255,0.25)" colors={Gradients.gold} />
            <Txt variant="caption" color="rgba(255,255,255,0.85)">
              {pr.done} séances validées sur {pr.total}
            </Txt>
          </PhotoCard>
        );
      })}

      {plans.length < MAX_ACTIVE_PLANS ? (
        <Button icon="add-circle" label={plans.length ? 'Ajouter un objectif' : 'Créer mon premier objectif'} onPress={() => router.push('/goal')} />
      ) : (
        <Txt muted style={{ textAlign: 'center' }}>
          Tu suis déjà {MAX_ACTIVE_PLANS} objectifs. Termine-en un ou supprime-le pour en ajouter un autre.
        </Txt>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
});
