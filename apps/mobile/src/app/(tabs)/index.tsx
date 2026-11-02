import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { daysBetween, distanceLabel, formatDuration, formatPace, formatTime, type Phase, type PlannedSession } from '@foulee/core';

import { Button, Card, Chip, IntensityProfile, Row, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateFr, todayIso, useStore } from '@/lib/store';

const PHASE_LABEL: Record<Phase, string> = { base: 'Fondations', dev: 'Développement', spe: 'Spécifique', taper: 'Affûtage' };

export default function PlanScreen() {
  const t = useTheme();
  const { plan, enrichment, validations } = useStore();
  const today = todayIso();

  if (!plan) {
    return (
      <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
        <Card>
          <Txt variant="display">Quel est ton prochain objectif ?</Txt>
          <Txt muted>
            Un chrono à battre ou une distance à finir. Foulée calcule ton plan, l’envoie sur ta montre, vérifie chaque séance et te
            récompense quand tu la suis.
          </Txt>
          <Button label="Choisir mon objectif" onPress={() => router.push('/goal')} />
        </Card>
      </ScrollView>
    );
  }

  const g = plan.request.goal;
  const n = plan.weeks.length;
  const currentWeek = Math.min(n, Math.max(1, Math.floor(daysBetween(plan.request.startDate, today) / 7) + 1));
  const daysLeft = daysBetween(today, g.eventDate);
  const weekVolumes = plan.weeks.map((w) => plan.sessions.filter((s) => s.week === w.n).reduce((a, s) => a + s.durationSec, 0));
  const maxVol = Math.max(...weekVolumes);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label" muted>
            Objectif · {daysLeft > 0 ? `J-${daysLeft}` : daysLeft === 0 ? 'Jour J' : 'Terminé'}
          </Txt>
          <Link href="/goal" style={{ color: t.accent, fontWeight: '600' }}>
            Changer
          </Link>
        </Row>
        <Txt variant="display">
          {g.mode === 'chrono' && g.targetTimeSec ? `${distanceLabel(g.distanceKm)} en ${formatTime(g.targetTimeSec)}` : `Finir : ${distanceLabel(g.distanceKm)}`}
        </Txt>
        <Txt muted>
          {g.mode === 'chrono' ? 'Allure' : 'Allure estimée'} {formatPace(plan.racePaceSecPerKm)} /km · {formatDateFr(g.eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Txt>

        {/* Volume hebdomadaire : la périodisation du plan en un coup d'œil */}
        <View style={styles.chart} accessibilityLabel={`Semaine ${currentWeek} sur ${n}`}>
          {weekVolumes.map((v, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 8 + (v / maxVol) * 56,
                borderRadius: 3,
                backgroundColor: i + 1 === currentWeek ? t.accent : i + 1 < currentWeek ? t.accentSoft : t.line,
              }}
            />
          ))}
        </View>
        <Txt variant="caption" muted>
          Semaine {currentWeek} sur {n} · {PHASE_LABEL[plan.weeks[currentWeek - 1].phase]}
        </Txt>
      </Card>

      <CoachCard />

      {plan.weeks.map((w) => (
        <WeekBlock
          key={w.n}
          n={w.n}
          title={`Semaine ${w.n} · ${PHASE_LABEL[w.phase]}`}
          focus={enrichment?.weeks[w.n] ?? w.focus}
          sessions={plan.sessions.filter((s) => s.week === w.n)}
          initiallyOpen={w.n === currentWeek}
          validations={validations}
        />
      ))}
    </ScrollView>
  );
}

function CoachCard() {
  const t = useTheme();
  const { enrichment } = useStore();
  if (enrichment) {
    return (
      <Card style={{ backgroundColor: t.accentSoft, borderColor: t.accentSoft }}>
        <Txt variant="label" color={t.accent}>
          Le mot du coach
        </Txt>
        <Txt>{enrichment.resume}</Txt>
      </Card>
    );
  }
  return (
    <Card>
      <Txt variant="title">Personnalise ton plan avec le coach IA</Txt>
      <Txt muted>Les allures et volumes sont calculés. Le coach ajoute des conseils et des repères nutrition pour chaque séance.</Txt>
      <Button kind="secondary" label="Ouvrir le coach" onPress={() => router.push('/coach')} />
    </Card>
  );
}

function WeekBlock(props: {
  n: number;
  title: string;
  focus: string;
  sessions: PlannedSession[];
  initiallyOpen: boolean;
  validations: ReturnType<typeof useStore>['validations'];
}) {
  const t = useTheme();
  const [open, setOpen] = useState(props.initiallyOpen);
  const total = props.sessions.reduce((a, s) => a + s.durationSec, 0);
  const done = props.sessions.filter((s) => ['validee', 'partielle'].includes(props.validations[s.id]?.status ?? '')).length;

  return (
    <View style={{ gap: Spacing.s }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="title">{props.title}</Txt>
          <Txt variant="number" muted>
            {done}/{props.sessions.length} · {formatDuration(total)}
          </Txt>
        </Row>
        {open && (
          <Txt variant="caption" muted>
            {props.focus}
          </Txt>
        )}
      </Pressable>
      {open && props.sessions.map((s) => <SessionRow key={s.id} session={s} />)}
    </View>
  );
}

function SessionRow({ session }: { session: PlannedSession }) {
  const t = useTheme();
  const { validations, sent } = useStore();
  const v = validations[session.id];
  const past = session.date < todayIso();

  let chip = <Chip label="À faire" />;
  if (v?.status === 'validee') chip = <Chip tone="ok" label={`Validée · +${v.points} pts`} />;
  else if (v?.status === 'partielle') chip = <Chip tone="warn" label={`Partielle · +${v.points} pts`} />;
  else if (v?.status === 'refusee') chip = <Chip tone="bad" label="Refusée" />;
  else if (v?.status === 'non_validee') chip = <Chip tone="bad" label="Non validée" />;
  else if (v?.status === 'en_revue') chip = <Chip tone="warn" label="En vérification" />;
  else if (past) chip = <Chip tone="bad" label="Manquée" />;
  else if (sent[session.id]) chip = <Chip tone="accent" label="Sur ta montre" />;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/session/${session.id}`)}
      style={({ pressed }) => [styles.session, { backgroundColor: t.surface, borderColor: t.line, opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.date}>
        <Txt variant="label" muted>
          {formatDateFr(session.date, { weekday: 'short' })}
        </Txt>
        <Txt variant="title">{formatDateFr(session.date, { day: 'numeric' })}</Txt>
      </View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <Txt style={{ fontWeight: '700' }} numberOfLines={1}>
          {session.title}
        </Txt>
        <Txt variant="caption" muted>
          {formatDuration(session.durationSec)} · {(session.distanceM / 1000).toFixed(1).replace('.', ',')} km
        </Txt>
        <IntensityProfile steps={session.steps} height={22} />
        {chip}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: Spacing.xxl },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 64, marginTop: Spacing.s },
  session: { flexDirection: 'row', gap: Spacing.m, padding: Spacing.m, borderRadius: Radius.m, borderWidth: StyleSheet.hairlineWidth },
  date: { width: 44, alignItems: 'center' },
});
