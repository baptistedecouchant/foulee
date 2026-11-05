import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BADGES, currentPace10k, daysBetween, ECONOMY, formatDuration, formatTime, LOGIN_XP, riegel } from '@foulee/core';

import { Button, Card, Chip, Ionicons, LevelBadge, ProgressBar, Row, SectionTitle, StatPill, Txt } from '@/components/ui';
import { HomePager, type PagerPage } from '@/components/home-pager';
import { GradientCard, PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { imageForSession } from '@/lib/images';
import { BADGE_ICON, daysLeft, fmtInt, goalTitle, planProgress, SESSION_ICON } from '@/lib/labels';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

const PHASE_TITLE = { base: '🧱 Fondations', dev: '📈 Développement', spe: '🎯 Spécifique', taper: '🪶 Affûtage' } as const;

/** 850 · 1,2k · 12k */
const compact = (n: number) => (n < 1000 ? String(n) : `${String(Math.round(n / 100) / 10).replace('.', ',').replace(/,0$/, '')}k`);

export default function HomeScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { plans, stats, level, quests, balance, steps, health, sponsored, claimSponsored, loginDays, tip, tipRead, readTip } = useStore();
  const today = todayIso();

  // Prochaine séance à faire, tous entraînements confondus.
  const next = plans
    .flatMap((p) => p.plan.sessions.filter((s) => s.date >= today && !p.validations[s.id]).map((s) => ({ p, s })))
    .sort((a, b) => a.s.date.localeCompare(b.s.date))[0];

  const raceSoon = plans
    .map((p) => ({ p, days: daysLeft(p.plan, today) }))
    .filter((x) => x.days >= 0 && x.days <= 7)
    .sort((a, b) => a.days - b.days)[0];

  // Objectif le plus proche : avancement en séances et temps estimé.
  const goalBar = (() => {
    const g = plans
      .map((p) => ({ p, days: daysLeft(p.plan, today) }))
      .filter((x) => x.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
    if (!g) return null;
    const plan = g.p.plan;
    const total = plan.sessions.length;
    const done = plan.sessions.filter((x) => ['validee', 'partielle'].includes(g.p.validations[x.id]?.status ?? '')).length;
    const ratio = total ? done / total : 0;
    const goal = plan.request.goal;
    let estimate: string | null = null;
    if (goal.mode === 'chrono' && goal.targetTimeSec) {
      const from = riegel(currentPace10k(plan.request.level) * 10, 10, goal.distanceKm);
      const now = from - (from - goal.targetTimeSec) * ratio;
      if (from > goal.targetTimeSec) estimate = formatTime(Math.round(now));
    }
    return { id: g.p.id, days: g.days, title: goalTitle(plan), total, done, ratio, estimate, target: goal.targetTimeSec ? formatTime(goal.targetTimeSec) : '' };
  })();

  const upcomingBadges = BADGES.map((b) => ({ b, v: b.progress(stats) }))
    .filter((x) => x.v < 1)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);

  const goalPlan = goalBar ? plans.find((p) => p.id === goalBar.id) : undefined;
  const phase = (() => {
    if (!goalPlan) return null;
    const pl = goalPlan.plan;
    const n = pl.weeks.length;
    const w = Math.min(n, Math.max(1, Math.floor(daysBetween(pl.request.startDate, today) / 7) + 1));
    const vols = pl.weeks.map((wk) => pl.sessions.filter((x) => x.week === wk.n).reduce((acc, x) => acc + x.durationSec, 0));
    const week = pl.sessions.filter((x) => x.week === w);
    return { w, n, phase: pl.weeks[w - 1].phase, vols, max: Math.max(...vols), count: week.length, sec: week.reduce((acc, x) => acc + x.durationSec, 0) };
  })();
  const W = '#FFFFFF';
  const M = 'rgba(255,255,255,0.75)';
  const pages: PagerPage[] = [
    goalBar
      ? {
          key: 'goal',
          onPress: () => router.push({ pathname: '/plan/[id]', params: { id: goalBar.id } }),
          content: (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <Txt variant="label" color={M}>
                  🎯 Prochain objectif
                </Txt>
                <Txt variant="number" color={W}>
                  {goalBar.days > 0 ? `J-${goalBar.days}` : 'Jour J'}
                </Txt>
              </Row>
              <Txt style={styles.pageTitle} color={W} numberOfLines={1}>
                {goalBar.title}
              </Txt>
              <ProgressBar value={goalBar.ratio} height={8} track="rgba(255,255,255,0.2)" colors={Gradients.gold} />
              <Txt variant="caption" color={M}>
                {Math.round(goalBar.ratio * 100)} % du chemin · {goalBar.done}/{goalBar.total} séances{goalBar.estimate ? ` · estimé ${goalBar.estimate}` : ''}
              </Txt>
            </>
          ),
        }
      : {
          key: 'goal',
          onPress: () => router.push('/goal'),
          content: (
            <>
              <Txt variant="label" color={M}>
                🎯 Ton objectif
              </Txt>
              <Txt style={styles.pageTitle} color={W}>
                Fixe ton premier objectif
              </Txt>
              <Txt variant="caption" color={M}>
                Un chrono à battre ou une course à finir : ton plan est prêt en 1 minute.
              </Txt>
            </>
          ),
        },
    ...(phase
      ? [
          {
            key: 'phase',
            onPress: () => router.push({ pathname: '/plan/[id]', params: { id: goalBar!.id } }),
            content: (
              <>
                <Txt variant="label" color={M}>
                  Semaine {phase.w}/{phase.n}
                </Txt>
                <Txt style={styles.pageTitle} color={W}>
                  {PHASE_TITLE[phase.phase]}
                </Txt>
                <View style={styles.bars}>
                  {phase.vols.map((v, i) => (
                    <View key={i} style={{ flex: 1, height: 6 + (v / phase.max) * 26, borderRadius: 3, backgroundColor: i + 1 === phase.w ? '#FFD65C' : i + 1 < phase.w ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }} />
                  ))}
                </View>
                <Txt variant="caption" color={M}>
                  Cette semaine : {phase.count} séance{phase.count > 1 ? 's' : ''} · {formatDuration(phase.sec)}
                </Txt>
              </>
            ),
          },
        ]
      : []),
    {
      key: 'player',
      onPress: () => router.push('/profile'),
      content: (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" color={M}>
              ⭐ Niveau {level.level} · {level.title}
            </Txt>
            <Txt variant="caption" color={M}>
              {fmtInt(level.intoLevel)} / {fmtInt(level.levelSpan)} XP
            </Txt>
          </Row>
          <ProgressBar value={level.progress} height={8} track="rgba(255,255,255,0.2)" />
          <Row style={{ flexWrap: 'wrap', gap: 6 }}>
            <StatPill icon="flame" value={`${stats.streak} série`} color="#fff" bg="rgba(255,106,43,0.9)" />
            <StatPill icon="cash" value={`${fmtInt(balance)} RC`} color={t.goldText} bg={t.gold} />
            <StatPill icon="flash" value={`${fmtInt(level.xp)} XP`} color="#04281B" bg={t.xp} />
          </Row>
        </>
      ),
    },
    {
      key: 'steps',
      onPress: () => health !== 'connected' && router.push('/devices'),
      content: (
        <>
          <Txt variant="label" color={M}>
            👟 Pas du jour
          </Txt>
          <Txt style={styles.pageTitle} color={W}>
            {health === 'connected' ? (steps == null ? '…' : `${compact(steps)} pas`) : 'Connecte Apple Santé'}
          </Txt>
          {health === 'connected' && steps != null ? (
            <ProgressBar value={steps / 10000} height={8} track="rgba(255,255,255,0.2)" colors={Gradients.xp} />
          ) : null}
          <Txt variant="caption" color={M}>
            {health === 'connected' ? `Objectif 10k · ${Math.round(((steps ?? 0) / 10000) * 100)} %` : health === 'available' ? 'Touche pour connecter Apple Santé' : 'Disponible dans l’app installée (Apple Santé)'}
          </Txt>
        </>
      ),
    },
    {
      key: 'streak',
      content: (
        <>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" color={M}>
              🔥 {loginDays} jour{loginDays > 1 ? 's' : ''} d’affilée
            </Txt>
            <Txt variant="caption" color={M}>
              {loginDays > 0 && loginDays % 7 === 0 ? '🎁 Coffre ouvert !' : `🎁 Coffre dans ${7 - (loginDays % 7)} j`}
            </Txt>
          </Row>
          <Row style={{ gap: 6 }}>
            {Array.from({ length: 7 }).map((_, i) => (
              <View key={i} style={[styles.day, { backgroundColor: i < (loginDays % 7 || (loginDays > 0 ? 7 : 0)) ? t.flame : 'rgba(255,255,255,0.2)' }]} />
            ))}
          </Row>
          <Txt variant="caption" color={M}>
            +{LOGIN_XP.perDay} XP par jour, {ECONOMY.streakChest} RC tous les 7 jours.
          </Txt>
        </>
      ),
    },
  ];
  const shortcuts = [
    ...(goalBar ? [{ label: '📋 Mon plan', onPress: () => router.push({ pathname: '/plan/[id]', params: { id: goalBar.id } }) }] : []),
    { label: '➕ Objectif', onPress: () => router.push('/goal') },
    ...(goalBar ? [{ label: '⚡ Test VMA', onPress: () => router.push({ pathname: '/plan/[id]', params: { id: goalBar.id, tab: 'vma' } }) }] : []),
    { label: '👟 Chaussures', onPress: () => router.push('/shoes') },
    { label: '🏃 Mes courses', onPress: () => router.push('/runs') },
    { label: '⌚ Montres', onPress: () => router.push('/devices') },
  ];

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      {/* ---------- En-tête ---------- */}
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ gap: 2, flex: 1 }}>
          <Txt variant="label" muted>
            {formatDateFr(today, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Txt>
          <Txt variant="display">{next?.s.date === today ? 'Séance au programme ! 🏃' : 'Prêt à courir ? 👋'}</Txt>
        </View>
        <LevelBadge level={level.level} size={48} />
      </Row>

      {/* ---------- Raccourcis ---------- */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -Spacing.l }} contentContainerStyle={{ gap: Spacing.s, paddingHorizontal: Spacing.l }}>
        {shortcuts.map((c) => (
          <Pressable
            key={c.label}
            accessibilityRole="button"
            onPress={c.onPress}
            style={({ pressed }) => [styles.shortcut, { backgroundColor: t.surface, borderColor: t.line, opacity: pressed ? 0.7 : 1 }]}>
            <Txt style={{ fontWeight: '600' }}>{c.label}</Txt>
          </Pressable>
        ))}
      </ScrollView>

      {/* ---------- Modules qui défilent (Liquid Glass) ---------- */}
      <HomePager image={goalPlan?.image ?? 'road'} pages={pages} />

      {/* ---------- Astuce du jour ---------- */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Chip tone="accent" icon="bulb" label={`💡 Astuce du jour · ${tip.category}`} />
          {tipRead ? <Chip tone="ok" icon="checkmark" label={`+${LOGIN_XP.tip} XP`} /> : null}
        </Row>
        <Txt style={{ fontWeight: '800' }}>{tip.title}</Txt>
        <Txt muted>{tip.text}</Txt>
        {!tipRead && <Button kind="secondary" small icon="checkmark" label={`J’ai lu (+${LOGIN_XP.tip} XP)`} onPress={readTip} />}
      </Card>

      {/* ---------- Semaine de course ---------- */}
      {raceSoon && (
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/plan/[id]', params: { id: raceSoon.p.id } })}>
          <GradientCard colors={Gradients.flame} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="flag" size={26} color="#fff" />
            <View style={{ flex: 1 }}>
              <Txt variant="title" color="#fff">
                {raceSoon.days > 0 ? `J-${raceSoon.days} : c’est la semaine de course` : 'C’est le jour J !'}
              </Txt>
              <Txt variant="caption" color="rgba(255,255,255,0.9)">
                Affûtage, repas, petit-déjeuner et ravitaillement : ton guide est prêt.
              </Txt>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </GradientCard>
        </Pressable>
      )}

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
          <SectionTitle>{next.s.date === today ? '📅 Aujourd’hui' : '📅 Prochaine séance'}</SectionTitle>
          <PhotoCard image={imageForSession(next.s.type)} height={320} onPress={() => router.push({ pathname: '/session/[id]', params: { id: next.s.id, plan: next.p.id } })}>
            <Row>
              <Chip tone="glass" icon={SESSION_ICON[next.s.type]} label={formatDateFr(next.s.date, { weekday: 'long', day: 'numeric' })} />
              <Chip tone="gold" icon="cash" label={`+${ECONOMY.sessionValidated} RC`} />
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

      {/* ---------- Challenge sponsorisé de la semaine ---------- */}
      <SectionTitle>🏆 Challenge de la semaine</SectionTitle>
      <GradientCard colors={Gradients.flame}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Chip tone="glass" icon="megaphone" label={`Proposé par ${sponsored.challenge.sponsor}`} />
          <Chip tone="gold" icon="cash" label={`+${ECONOMY.sponsoredChallenge} RC`} />
        </Row>
        <Txt variant="display" color="#fff">
          {sponsored.challenge.title}
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">{sponsored.challenge.description}</Txt>
        <ProgressBar value={sponsored.progress / sponsored.challenge.target} colors={Gradients.gold} track="rgba(255,255,255,0.25)" />
        <Txt variant="caption" color="#fff">
          {String(sponsored.progress).replace('.', ',')} / {sponsored.challenge.target} {sponsored.challenge.metric === 'sessions' ? 'sorties' : 'km'}
        </Txt>
        {sponsored.claimed ? (
          <Chip tone="xp" icon="checkmark-circle" label="Récompense obtenue" />
        ) : sponsored.progress >= sponsored.challenge.target ? (
          <Button kind="gold" icon="gift" label="Récupérer mes RC" onPress={claimSponsored} />
        ) : null}
      </GradientCard>

      {/* ---------- Défis de la semaine ---------- */}
      {quests.length > 0 && (
        <>
          <SectionTitle>⚡ Défis de la semaine</SectionTitle>
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
          <SectionTitle action={<Button kind="ghost" small label="Tout voir" onPress={() => router.push('/plans')} />}>🏃 Mes entraînements</SectionTitle>
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
      <SectionTitle action={<Button kind="ghost" small label="Collection" onPress={() => router.push('/rewards')} />}>🏅 Prochains badges</SectionTitle>
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

function ProgressBarMini({ value }: { value: number }) {
  const t = useTheme();
  return (
    <View style={{ width: 60, alignItems: 'flex-end', gap: 4 }}>
      <Txt variant="caption" muted>
        {Math.min(100, Math.round(value * 100))} %
      </Txt>
      <View style={{ width: 60 }}>
        <ProgressBar value={value} height={6} />
      </View>
      <Txt variant="caption" muted>
        10 000
      </Txt>
    </View>
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
  day: { flex: 1, height: 10, borderRadius: 5 },
  watchBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  shortcut: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 9 },
  pageTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 32 },
  stepsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: Spacing.m, paddingVertical: 8 },
  badgeIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
});
