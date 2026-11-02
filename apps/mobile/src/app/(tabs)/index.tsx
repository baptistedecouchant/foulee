import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BADGES, formatDuration } from '@foulee/core';

import { Button, Card, Chip, Ionicons, LevelBadge, ProgressBar, Row, SectionTitle, StatPill, Txt } from '@/components/ui';
import { GradientCard, PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { imageForSession } from '@/lib/images';
import { BADGE_ICON, daysLeft, fmtInt, goalTitle, planProgress, SESSION_ICON } from '@/lib/labels';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

export default function HomeScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { plans, stats, level, quests, balance } = useStore();
  const today = todayIso();

  // Prochaine séance à faire, tous entraînements confondus.
  const next = plans
    .flatMap((p) => p.plan.sessions.filter((s) => s.date >= today && !p.validations[s.id]).map((s) => ({ p, s })))
    .sort((a, b) => a.s.date.localeCompare(b.s.date))[0];

  const upcomingBadges = BADGES.map((b) => ({ b, v: b.progress(stats) }))
    .filter((x) => x.v < 1)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      {/* ---------- Joueur : niveau, XP, série, points ---------- */}
      <GradientCard colors={Gradients.night}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ gap: 2 }}>
            <Txt variant="label" color="rgba(255,255,255,0.7)">
              {formatDateFr(today, { weekday: 'long', day: 'numeric', month: 'long' })}
            </Txt>
            <Txt variant="display" color="#fff">
              {next?.s.date === today ? 'Séance au programme !' : 'Prêt à courir ?'}
            </Txt>
          </View>
          <Row>
            <Pressable accessibilityRole="button" accessibilityLabel="Montres et apps" onPress={() => router.push('/devices')} style={styles.watchBtn}>
              <Ionicons name="watch" size={22} color="#fff" />
            </Pressable>
            <LevelBadge level={level.level} />
          </Row>
        </Row>
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="number" color="#fff">
              {level.title}
            </Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.75)">
              {fmtInt(level.intoLevel)} / {fmtInt(level.levelSpan)} XP
            </Txt>
          </Row>
          <ProgressBar value={level.progress} track="rgba(255,255,255,0.15)" />
        </View>
        <Row>
          <StatPill icon="flame" value={`${stats.streak} série`} color="#fff" bg="rgba(255,106,43,0.9)" />
          <StatPill icon="diamond" value={`${fmtInt(balance)} pts`} color={t.goldText} bg={t.gold} />
          <StatPill icon="flash" value={`${fmtInt(stats.xp)} XP`} color="#04281B" bg={t.xp} />
        </Row>
      </GradientCard>

      {/* ---------- Séance du jour / prochaine séance ---------- */}
      {plans.length === 0 ? (
        <PhotoCard image="road" height={300} onPress={() => router.push('/goal')}>
          <Chip tone="glass" icon="sparkles" label="Commence ici" />
          <Txt variant="display" color="#fff">
            Fixe ton premier objectif
          </Txt>
          <Txt color="rgba(255,255,255,0.85)">Un chrono à battre ou une distance à finir. Ton plan est prêt en 30 secondes.</Txt>
          <Button kind="gold" icon="add-circle" label="Choisir mon objectif" onPress={() => router.push('/goal')} />
        </PhotoCard>
      ) : next ? (
        <>
          <SectionTitle>{next.s.date === today ? 'Aujourd’hui' : 'Prochaine séance'}</SectionTitle>
          <PhotoCard image={imageForSession(next.s.type)} height={320} onPress={() => router.push({ pathname: '/session/[id]', params: { id: next.s.id, plan: next.p.id } })}>
            <Row>
              <Chip tone="glass" icon={SESSION_ICON[next.s.type]} label={formatDateFr(next.s.date, { weekday: 'long', day: 'numeric' })} />
              <Chip tone="gold" icon="diamond" label={`jusqu’à ${next.s.basePoints} pts`} />
            </Row>
            <Txt variant="display" color="#fff">
              {next.s.title}
            </Txt>
            <Txt color="rgba(255,255,255,0.85)">
              {formatDuration(next.s.durationSec)} · {(next.s.distanceM / 1000).toFixed(1).replace('.', ',')} km · {goalTitle(next.p.plan)}
            </Txt>
            <Button kind="gold" icon="play" label="Démarrer" onPress={() => router.push({ pathname: '/run/[id]', params: { id: next.s.id, plan: next.p.id } })} />
          </PhotoCard>
        </>
      ) : null}

      {/* ---------- Défis de la semaine ---------- */}
      {quests.length > 0 && (
        <>
          <SectionTitle>Défis de la semaine</SectionTitle>
          <Card>
            {quests.map((q) => (
              <View key={q.id} style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ flex: 1 }}>
                    <Ionicons name={q.done ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={q.done ? t.xp : t.textSecondary} />
                    <Txt style={{ flex: 1, fontWeight: '700' }}>{q.title}</Txt>
                  </Row>
                  <Chip tone={q.done ? 'xp' : 'accent'} icon="flash" label={`+${q.xp} XP`} />
                </Row>
                <Row>
                  <View style={{ flex: 1 }}>
                    <ProgressBar value={q.current / q.target} colors={q.done ? Gradients.xp : Gradients.energy} height={10} />
                  </View>
                  <Txt variant="number" muted>
                    {q.current}/{q.target}
                  </Txt>
                </Row>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* ---------- Mes entraînements ---------- */}
      {plans.length > 0 && (
        <>
          <SectionTitle action={<Button kind="ghost" small label="Tout voir" onPress={() => router.push('/plans')} />}>Mes entraînements</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: Spacing.m }}>
            {plans.map((p) => {
              const pr = planProgress(p);
              const left = daysLeft(p.plan, today);
              return (
                <PhotoCard key={p.id} image={p.image} height={190} style={{ width: 250 }} onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })}>
                  <Chip tone="glass" label={left > 0 ? `J-${left}` : left === 0 ? 'Jour J' : 'Terminé'} />
                  <Txt variant="title" color="#fff" numberOfLines={1}>
                    {goalTitle(p.plan)}
                  </Txt>
                  <ProgressBar value={pr.ratio} height={8} track="rgba(255,255,255,0.25)" colors={Gradients.gold} />
                  <Txt variant="caption" color="rgba(255,255,255,0.85)">
                    {pr.done}/{pr.total} séances
                  </Txt>
                </PhotoCard>
              );
            })}
            {plans.length < MAX_ACTIVE_PLANS && (
              <View style={[styles.addCard, { borderColor: t.accent, backgroundColor: t.accentSoft }]}>
                <Ionicons name="add-circle" size={40} color={t.accent} />
                <Txt style={{ fontWeight: '800', textAlign: 'center' }} color={t.accent}>
                  Nouvel objectif
                </Txt>
                <Button small label="Ajouter" onPress={() => router.push('/goal')} />
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* ---------- Prochains badges ---------- */}
      <SectionTitle action={<Button kind="ghost" small label="Collection" onPress={() => router.push('/rewards')} />}>Prochains badges</SectionTitle>
      <Card>
        {upcomingBadges.map(({ b, v }) => (
          <Row key={b.id} style={{ gap: Spacing.m }}>
            <View style={[styles.badgeIcon, { backgroundColor: t.surfaceAlt }]}>
              <Ionicons name={BADGE_ICON[b.icon]} size={22} color={t.textSecondary} />
            </View>
            <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
              <Txt style={{ fontWeight: '800' }}>{b.title}</Txt>
              <Txt variant="caption" muted numberOfLines={1}>
                {b.description}
              </Txt>
              <ProgressBar value={v} height={6} colors={Gradients.gold} />
            </View>
          </Row>
        ))}
      </Card>

      {/* ---------- Totaux ---------- */}
      <Row style={{ gap: Spacing.m }}>
        <Total icon="map" value={`${stats.distanceKm.toFixed(0)} km`} label="parcourus" />
        <Total icon="time" value={`${stats.hours.toFixed(0)} h`} label="d’effort" />
        <Total icon="checkmark-done" value={String(stats.sessionsDone)} label="séances" />
      </Row>
    </ScrollView>
  );
}

function Total({ icon, value, label }: { icon: 'map' | 'time' | 'checkmark-done'; value: string; label: string }) {
  const t = useTheme();
  return (
    <Card style={{ flex: 1, alignItems: 'center', gap: 4, padding: Spacing.m }}>
      <Ionicons name={icon} size={20} color={t.accent} />
      <Txt variant="title">{value}</Txt>
      <Txt variant="caption" muted>
        {label}
      </Txt>
    </Card>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  addCard: { width: 170, height: 190, borderRadius: Radius.l, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: Spacing.s, padding: Spacing.m },
  watchBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  badgeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
