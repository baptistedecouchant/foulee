import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { daysBetween, ECONOMY, formatDuration, formatPace, type Phase, type PlannedSession } from '@foulee/core';

import { Button, Card, Chip, Ionicons, IntensityProfile, ProgressBar, Row, Txt } from '@/components/ui';
import { GradientCard, PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { goalTitle, planProgress, SESSION_ICON } from '@/lib/labels';
import { formatDateFr, todayIso, useStore, type Enrichment, type PlanEntry } from '@/lib/store';
import { AI_COACH_ENABLED } from '@/lib/features';
import { callFunction, isDemo } from '@/lib/supabase';
import { RaceWeek } from '@/components/race-week';
import { useAthlete } from '@/lib/athlete';

const PHASE_LABEL: Record<Phase, string> = { base: 'Fondations', dev: 'Développement', spe: 'Spécifique', taper: 'Affûtage' };

export default function PlanScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPlan, removePlan, setEnrichment } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // La confirmation s'ouvre en bas de l'écran : on fait défiler pour qu'elle soit entièrement visible.
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (confirmDelete) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [confirmDelete]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [showRaceWeek, setShowRaceWeek] = useState(false);
  const { athlete } = useAthlete();
  const [enrichError, setEnrichError] = useState<string | null>(null);

  const enrich = async () => {
    setEnriching(true);
    setEnrichError(null);
    try {
      setEnrichment(id, await callFunction<Enrichment>('coach', { action: 'enrich', planId: id }));
    } catch {
      setEnrichError('La personnalisation a échoué. Réessaie dans un instant.');
    } finally {
      setEnriching(false);
    }
  };
  const entry = getPlan(id);
  const today = todayIso();

  if (!entry) {
    return (
      <View style={{ flex: 1, padding: Spacing.l, backgroundColor: t.background }}>
        <Txt>Cet entraînement n’existe plus.</Txt>
      </View>
    );
  }

  const { plan } = entry;
  const g = plan.request.goal;
  const n = plan.weeks.length;
  const currentWeek = Math.min(n, Math.max(1, Math.floor(daysBetween(plan.request.startDate, today) / 7) + 1));
  const daysLeft = daysBetween(today, g.eventDate);
  const weekVolumes = plan.weeks.map((w) => plan.sessions.filter((s) => s.week === w.n).reduce((a, s) => a + s.durationSec, 0));
  const maxVol = Math.max(...weekVolumes);
  const pr = planProgress(entry);

  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: goalTitle(plan) }} />

      <PhotoCard image={entry.image} height={300}>
        <Row>
          <Chip tone="flame" icon="hourglass" label={daysLeft > 0 ? `J-${daysLeft}` : daysLeft === 0 ? 'Jour J' : 'Terminé'} />
          <Chip tone="glass" label={`Semaine ${currentWeek}/${n} · ${PHASE_LABEL[plan.weeks[currentWeek - 1].phase]}`} />
        </Row>
        <Txt variant="hero" color="#fff">
          {goalTitle(plan)}
        </Txt>
        <Txt color="rgba(255,255,255,0.85)">
          {g.mode === 'chrono' ? 'Allure' : 'Allure estimée'} {formatPace(plan.racePaceSecPerKm)} /km ·{' '}
          {formatDateFr(g.eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Txt>
        {/* Volume hebdomadaire : la périodisation du plan en un coup d'œil */}
        <View style={styles.chart}>
          {weekVolumes.map((v, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 8 + (v / maxVol) * 48,
                borderRadius: 4,
                backgroundColor: i + 1 === currentWeek ? t.gold : i + 1 < currentWeek ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
              }}
            />
          ))}
        </View>
        <ProgressBar value={pr.ratio} height={8} track="rgba(255,255,255,0.25)" colors={Gradients.gold} />
      </PhotoCard>

      {daysLeft >= 0 && daysLeft <= 7 ? (
        <RaceWeek plan={plan} daysLeft={daysLeft} weightKg={athlete.weightKg} />
      ) : daysLeft > 7 ? (
        showRaceWeek ? (
          <>
            <RaceWeek plan={plan} daysLeft={daysLeft} weightKg={athlete.weightKg} />
            <Button kind="ghost" small label="Masquer" onPress={() => setShowRaceWeek(false)} />
          </>
        ) : (
          <Button kind="secondary" small icon="flag" label="Aperçu de ta semaine de course" onPress={() => setShowRaceWeek(true)} />
        )
      ) : null}

      {!AI_COACH_ENABLED ? null : entry.enrichment ? (
        <GradientCard colors={Gradients.energy}>
          <Row>
            <Ionicons name="sparkles" size={18} color="#fff" />
            <Txt variant="label" color="#fff">
              Le mot du coach
            </Txt>
          </Row>
          <Txt color="#fff">{entry.enrichment.resume}</Txt>
          {!isDemo && <Button kind="secondary" small icon="chatbubbles" label="Poser une question au coach" onPress={() => router.push('/coach')} />}
        </GradientCard>
      ) : (
        <Card>
          <Row>
            <Ionicons name="sparkles" size={20} color={t.violet} />
            <Txt variant="title">Coach IA</Txt>
          </Row>
          <Txt muted>
            Les allures et volumes sont calculés pour toi. Le coach relit ton profil (âge, corpulence, chrono récent, jours dispo) et ajoute un conseil et un
            repère nutrition à chaque séance.
          </Txt>
          {isDemo ? (
            <Txt variant="caption" muted>
              Disponible quand l’app est reliée au serveur.
            </Txt>
          ) : (
            <>
              <Button icon="sparkles" label={enriching ? 'Le coach prépare ton plan… (30 à 60 s)' : 'Personnaliser avec le coach'} disabled={enriching} onPress={enrich} />
              <Button kind="ghost" small icon="chatbubbles" label="Poser une question au coach" onPress={() => router.push('/coach')} />
            </>
          )}
          {enrichError && <Txt color={t.bad}>{enrichError}</Txt>}
        </Card>
      )}

      {plan.weeks.map((w) => (
        <WeekBlock key={w.n} entry={entry} n={w.n} phase={w.phase} initiallyOpen={w.n === currentWeek} />
      ))}

      {confirmDelete ? (
        <Card>
          <Txt style={{ fontWeight: '700' }}>Supprimer cet entraînement ?</Txt>
          <Txt muted>Les points déjà gagnés restent acquis.</Txt>
          {deleteError && <Txt color={t.bad}>{deleteError}</Txt>}
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Annuler" onPress={() => setConfirmDelete(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                kind="flame"
                label={deleting ? 'Suppression…' : 'Supprimer'}
                disabled={deleting}
                onPress={async () => {
                  setDeleting(true);
                  setDeleteError(null);
                  const ok = await removePlan(entry.id);
                  setDeleting(false);
                  if (!ok) {
                    setDeleteError('La suppression a échoué. Vérifie ta connexion et réessaie.');
                    return;
                  }
                  if (router.canGoBack()) router.back();
                  else router.replace('/plans');
                }}
              />
            </View>
          </Row>
        </Card>
      ) : (
        <Button kind="ghost" icon="trash-outline" label="Supprimer cet entraînement" onPress={() => setConfirmDelete(true)} />
      )}
    </ScrollView>
  );
}

function WeekBlock({ entry, n, phase, initiallyOpen }: { entry: PlanEntry; n: number; phase: Phase; initiallyOpen: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const sessions = entry.plan.sessions.filter((s) => s.week === n);
  const total = sessions.reduce((a, s) => a + s.durationSec, 0);
  const done = sessions.filter((s) => ['validee', 'partielle'].includes(entry.validations[s.id]?.status ?? '')).length;
  const complete = done === sessions.length;
  const focus = entry.enrichment?.weeks[n] ?? entry.plan.weeks[n - 1].focus;

  return (
    <View style={{ gap: Spacing.s }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(!open)} style={{ gap: 6 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Row>
            <View style={[styles.weekDot, { backgroundColor: complete ? t.xp : initiallyOpen ? t.accent : t.surfaceAlt }]}>
              {complete ? <Ionicons name="checkmark" size={16} color="#fff" /> : <Txt variant="number" color={initiallyOpen ? '#fff' : t.textSecondary}>{n}</Txt>}
            </View>
            <Txt variant="title">{PHASE_LABEL[phase]}</Txt>
          </Row>
          <Row>
            <Txt variant="number" muted>
              {done}/{sessions.length} · {formatDuration(total)}
            </Txt>
            <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.textSecondary} />
          </Row>
        </Row>
        {open && (
          <Txt variant="caption" muted>
            {focus}
          </Txt>
        )}
      </Pressable>
      {open && sessions.map((s) => <SessionRow key={s.id} entry={entry} session={s} />)}
    </View>
  );
}

function SessionRow({ entry, session }: { entry: PlanEntry; session: PlannedSession }) {
  const t = useTheme();
  const v = entry.validations[session.id];
  const past = session.date < todayIso();
  const isToday = session.date === todayIso();

  let chip = <Chip icon="cash" label={`+${ECONOMY.sessionValidated} RC`} />;
  if (v?.status === 'validee') chip = <Chip tone="ok" icon="checkmark-circle" label={`+${v.points} RC`} />;
  else if (v?.status === 'partielle') chip = <Chip tone="warn" icon="contrast" label={`+${v.points} RC`} />;
  else if (v?.status === 'refusee') chip = <Chip tone="bad" icon="ban" label="Refusée" />;
  else if (v?.status === 'non_validee') chip = <Chip tone="bad" icon="close-circle" label="Non validée" />;
  else if (v?.status === 'en_revue') chip = <Chip tone="warn" icon="hourglass" label="En vérification" />;
  else if (past) chip = <Chip tone="bad" icon="alert-circle" label="Manquée" />;
  else if (entry.sent[session.id]) chip = <Chip tone="accent" icon="watch" label="Sur ta montre" />;

  const done = v?.status === 'validee' || v?.status === 'partielle';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/session/[id]', params: { id: session.id, plan: entry.id } })}
      style={({ pressed }) => [
        styles.session,
        {
          backgroundColor: t.surface,
          borderColor: isToday ? t.accent : t.line,
          borderWidth: isToday ? 2 : StyleSheet.hairlineWidth,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}>
      <View style={[styles.icon, { backgroundColor: done ? t.xpSoft : t.accentSoft }]}>
        <Ionicons name={done ? 'checkmark' : SESSION_ICON[session.type]} size={22} color={done ? t.ok : t.accent} />
      </View>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label" color={isToday ? t.accent : t.textSecondary}>
            {isToday ? 'Aujourd’hui' : formatDateFr(session.date)}
          </Txt>
          {chip}
        </Row>
        <Txt style={{ fontWeight: '800' }} numberOfLines={1}>
          {session.title}
        </Txt>
        <Txt variant="caption" muted>
          {formatDuration(session.durationSec)} · {(session.distanceM / 1000).toFixed(1).replace('.', ',')} km
        </Txt>
        <IntensityProfile steps={session.steps} height={20} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 110 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56 },
  session: { flexDirection: 'row', gap: Spacing.m, padding: Spacing.m, borderRadius: Radius.m },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  weekDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
