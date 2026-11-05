import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BADGE_XP, BADGES, daysBetween, formatTime, LEVEL_TITLES, LOGIN_XP, xpForLevel } from '@foulee/core';

import { Button, Card, Chip, Ionicons, LevelBadge, ProgressBar, Row, SectionTitle, Txt, type IconName } from '@/components/ui';
import { WearBar } from '@/components/gear';
import { ShoeArt } from '@/components/shoe-art';
import { GradientCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { useAthlete } from '@/lib/athlete';
import { heightError, weightError } from '@/lib/auth';
import { fmtInt, goalTitle } from '@/lib/labels';
import { REWARD_LEVELS } from '@/lib/rewards';
import { useSession } from '@/lib/session';
import { formatDateFr, todayIso, useStore } from '@/lib/store';

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function ProfileScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { profile } = useSession();
  const { plans, stats, level, loginDays, runs, shoes } = useStore();
  const mainShoe = shoes.find((x) => x.isDefault) ?? shoes.find((x) => !x.shoe.retired);
  const { athlete, save } = useAthlete();
  const today = todayIso();

  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setWeight(athlete.weightKg ? String(athlete.weightKg) : '');
    setHeight(athlete.heightCm ? String(athlete.heightCm) : '');
  }, [athlete.weightKg, athlete.heightCm]);

  // Objectifs à venir, du plus proche au plus lointain.
  const goals = plans
    .map((p) => ({ p, days: daysBetween(today, p.plan.request.goal.eventDate) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const nextGoal = goals[0];
  const unlocked = BADGES.filter((b) => b.progress(stats) >= 1);
  const nextTitle = LEVEL_TITLES.find((x) => x.from > level.level);
  const name = profile?.firstName ?? 'Coureur';

  const w = num(weight);
  const h = num(height);
  const bodyError = weightError(w) ?? heightError(h);
  const bodyChanged = (w ?? undefined) !== athlete.weightKg || (h ?? undefined) !== athlete.heightCm;
  const bmi = athlete.weightKg && athlete.heightCm ? athlete.weightKg / (athlete.heightCm / 100) ** 2 : null;

  const saveBody = async () => {
    setMsg(null);
    try {
      await save({ weightKg: w, heightCm: h });
      setMsg('Enregistré. Tes prochains plans en tiendront compte.');
    } catch {
      setMsg('Impossible d’enregistrer. Vérifie ta connexion.');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      {/* ---------- Carte joueur ---------- */}
      <GradientCard colors={Gradients.night}>
        <Row>
          <View style={[styles.avatar, { backgroundColor: t.accent }]}>
            <Txt variant="display" color="#fff">
              {name.slice(0, 1).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="display" color="#fff" numberOfLines={1}>
              {name}
            </Txt>
            <Txt color="rgba(255,255,255,0.75)">
              {level.title} · niveau {level.level}
            </Txt>
          </View>
          <LevelBadge level={level.level} />
        </Row>
        <View style={{ gap: 6 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" color="rgba(255,255,255,0.75)">
              {fmtInt(level.xp)} XP au total
            </Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.75)">
              encore {fmtInt(xpForLevel(level.level + 1) - level.xp)} XP → niveau {level.level + 1}
            </Txt>
          </Row>
          <ProgressBar value={level.progress} track="rgba(255,255,255,0.15)" />
        </View>
      </GradientCard>

      {/* ---------- Chiffres clés ---------- */}
      <View style={styles.grid}>
        <StatTile icon="checkmark-done" color={t.accent} value={fmtInt(stats.sessionsDone)} label="séances validées" />
        <StatTile icon="time" color={t.violet} value={`${String(stats.hours).replace('.', ',')} h`} label="de course" />
        <StatTile
          icon="flame"
          color={t.flame}
          value={`${stats.weekStreak}`}
          label={`semaine${stats.weekStreak > 1 ? 's' : ''} d’affilée`}
          hint={stats.bestWeekStreak > stats.weekStreak ? `record : ${stats.bestWeekStreak}` : 'au moins 1 séance / sem.'}
        />
        <StatTile
          icon="flag"
          color={t.ok}
          value={nextGoal ? `J-${nextGoal.days}` : '—'}
          label={nextGoal ? 'avant ton objectif' : 'aucun objectif'}
          hint={nextGoal ? goalTitle(nextGoal.p.plan) : undefined}
        />
      </View>

      <Row style={{ flexWrap: 'wrap' }}>
        <Chip tone="accent" icon="map" label={`${fmtInt(stats.distanceKm)} km`} />
        <Chip tone="flame" icon="flash" label={`série de ${stats.streak} séances`} />
        <Chip tone="neutral" icon="calendar" label={`${loginDays} j de connexion`} />
      </Row>

      {/* ---------- Objectifs ---------- */}
      {goals.length > 0 && (
        <>
          <SectionTitle>Mes objectifs</SectionTitle>
          {goals.map(({ p, days }) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/plan/[id]', params: { id: p.id } })}>
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.m }}>
                <View style={[styles.countdown, { backgroundColor: t.accentSoft }]}>
                  <Txt variant="title" color={t.accent}>
                    J-{days}
                  </Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '700' }}>{goalTitle(p.plan)}</Txt>
                  <Txt variant="caption" muted>
                    {formatDateFr(p.plan.request.goal.eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
              </Card>
            </Pressable>
          ))}
        </>
      )}

      {/* ---------- XP : à quoi ça sert ---------- */}
      <SectionTitle>À quoi sert l’XP ?</SectionTitle>
      <Card>
        <Txt>
          Les <Txt style={{ fontWeight: '800' }}>RunCoins</Txt> se dépensent en bons d’achat. L’<Txt style={{ fontWeight: '800' }}>XP</Txt> ne se dépense pas :
          elle mesure ta régularité et fait monter ton niveau.
        </Txt>
        <Perk icon="ribbon" title="Titres" text={`Affichés dans le Hub et les classements.${nextTitle ? ` Prochain : « ${nextTitle.title} » au niveau ${nextTitle.from}.` : ''}`} />
        <Perk
          icon="gift"
          title="Récompenses réservées"
          text={`Certaines récompenses de la boutique demandent un niveau minimum (${REWARD_LEVELS.map((r) => `${r.title} : niv. ${r.minLevel}`).join(' · ')}).`}
        />
        <Perk icon="people" title="Défis entre amis" text="Les défis du Hub rapportent de l’XP, pas des RunCoins : on ne peut pas les farmer." />
        <View style={[styles.sources, { backgroundColor: t.surfaceAlt }]}>
          <Txt variant="caption" muted style={{ fontWeight: '700' }}>
            Comment gagner de l’XP
          </Txt>
          {[
            ['Séance validée (selon la qualité)', '45 à 600 XP'],
            ['Semaine complète', '150 XP'],
            ['Badge bronze · argent · or', `${BADGE_XP.bronze} · ${BADGE_XP.argent} · ${BADGE_XP.or} XP`],
            ['Plan terminé', '1 000 XP'],
            ['Connexion du jour · coffre 7 jours', `${LOGIN_XP.perDay} · ${LOGIN_XP.chest} XP`],
          ].map(([k, v]) => (
            <Row key={k} style={{ justifyContent: 'space-between' }}>
              <Txt variant="caption" style={{ flex: 1 }}>
                {k}
              </Txt>
              <Txt variant="caption" style={{ fontWeight: '700' }}>
                {v}
              </Txt>
            </Row>
          ))}
        </View>
      </Card>

      {/* ---------- Chaussures ---------- */}
      <SectionTitle action={<Button kind="ghost" small label="Gérer" onPress={() => router.push('/shoes')} />}>Mes chaussures</SectionTitle>
      <Pressable accessibilityRole="button" onPress={() => router.push('/shoes')}>
        <Card>
          {mainShoe ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}>
                <ShoeArt brand={mainShoe.shoe.brand} model={mainShoe.shoe.model} color={mainShoe.shoe.color} width={96} />
                <View style={{ flex: 1 }}>
                  <Txt variant="caption" muted>
                    {mainShoe.isDefault ? 'Paire par défaut' : 'Paire'} · {mainShoe.shoe.brand}
                  </Txt>
                  <Txt style={{ fontWeight: '700', fontSize: 17 }}>{mainShoe.shoe.model}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
              </Row>
              <WearBar wear={mainShoe.wear} lifeKm={mainShoe.shoe.lifeKm} />
              {shoes.filter((x) => !x.shoe.retired).length > 1 && (
                <Txt variant="caption" muted>
                  + {shoes.filter((x) => !x.shoe.retired).length - 1} autre{shoes.filter((x) => !x.shoe.retired).length > 2 ? 's' : ''} paire
                  {shoes.filter((x) => !x.shoe.retired).length > 2 ? 's' : ''}
                </Txt>
              )}
            </>
          ) : (
            <Row>
              <Ionicons name="footsteps-outline" size={22} color={t.accent} />
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>Ajoute ta paire</Txt>
                <Txt variant="caption" muted>
                  Les km de chaque course s’ajoutent automatiquement, et Foulée te prévient quand elle est usée.
                </Txt>
              </View>
              <Ionicons name="add-circle" size={24} color={t.accent} />
            </Row>
          )}
        </Card>
      </Pressable>

      {/* ---------- Dernières courses ---------- */}
      <SectionTitle action={runs.length ? <Button kind="ghost" small label="Tout voir" onPress={() => router.push('/runs')} /> : undefined}>Mes dernières courses</SectionTitle>
      <Card style={{ gap: 0, paddingVertical: Spacing.s }}>
        {runs.length === 0 ? (
          <Txt variant="caption" muted style={{ paddingVertical: Spacing.s }}>
            Tes courses validées et importées (Strava, Garmin, Apple Santé) apparaîtront ici.
          </Txt>
        ) : (
          runs.slice(0, 3).map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => router.push('/runs')}
              style={[styles.link, i < Math.min(3, runs.length) - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
              <View style={{ flex: 1 }}>
                <Txt style={{ fontWeight: '600' }}>
                  {String(r.distanceKm).replace('.', ',')} km · {formatTime(r.durationSec)}
                </Txt>
                <Txt variant="caption" muted>
                  {formatDateFr(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                  {r.title ? ` · ${r.title}` : ''}
                </Txt>
              </View>
              <Ionicons name="chevron-forward" size={16} color={t.textSecondary} />
            </Pressable>
          ))
        )}
      </Card>

      {/* ---------- Badges ---------- */}
      <Pressable accessibilityRole="button" onPress={() => router.push('/rewards')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.m }}>
          <View style={[styles.countdown, { backgroundColor: t.gold }]}>
            <Ionicons name="medal" size={24} color={t.goldText} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt style={{ fontWeight: '700' }}>
              {unlocked.length}/{BADGES.length} badges
            </Txt>
            <Txt variant="caption" muted>
              {fmtInt(stats.badgeXp)} XP gagnés grâce aux badges
            </Txt>
          </View>
          <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
        </Card>
      </Pressable>

      {/* ---------- Profil sportif ---------- */}
      <SectionTitle>Profil sportif</SectionTitle>
      <Card>
        <Row>
          <Metric label="Poids" unit="kg" value={weight} onChange={setWeight} />
          <Metric label="Taille" unit="cm" value={height} onChange={setHeight} />
          <View style={[styles.metric, { borderColor: t.line, backgroundColor: t.surfaceAlt }]}>
            <Txt variant="caption" muted>
              Âge
            </Txt>
            <Txt style={styles.metricValue}>{athlete.age ?? '—'}</Txt>
          </View>
        </Row>
        {bmi && (
          <Txt variant="caption" muted>
            IMC {bmi.toFixed(1).replace('.', ',')}. Il sert uniquement à doser la charge (plus de footing, progression plus douce si besoin).
          </Txt>
        )}
        {bodyError && <Txt color={t.bad}>{bodyError}</Txt>}
        {msg && <Txt variant="caption" color={t.ok}>{msg}</Txt>}
        <Button kind="secondary" small icon="save" label="Enregistrer" disabled={!bodyChanged || !!bodyError} onPress={saveBody} />
      </Card>

      {/* ---------- Compte ---------- */}
      <Card style={{ gap: 0, paddingVertical: Spacing.s }}>
        <LinkRow icon="person-circle" label="Mon compte et confidentialité" onPress={() => router.push('/account')} />
        <LinkRow icon="watch" label="Montres et apps" onPress={() => router.push('/devices')} />
        <LinkRow icon="chatbubbles" label="Coach IA" onPress={() => router.push('/coach')} last />
      </Card>
    </ScrollView>
  );
}

function StatTile({ icon, color, value, label, hint }: { icon: IconName; color: string; value: string; label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: t.surface, borderColor: t.line }]}>
      <View style={[styles.tileIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={16} color="#fff" />
      </View>
      <Txt variant="hero" style={{ fontSize: 32, lineHeight: 36 }} numberOfLines={1}>
        {value}
      </Txt>
      <Txt style={{ fontWeight: '700' }} numberOfLines={1}>
        {label}
      </Txt>
      {hint ? (
        <Txt variant="caption" muted numberOfLines={1}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

function Perk({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  const t = useTheme();
  return (
    <Row style={{ alignItems: 'flex-start' }}>
      <View style={[styles.perkIcon, { backgroundColor: t.xpSoft }]}>
        <Ionicons name={icon} size={16} color={t.ok} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt style={{ fontWeight: '700' }}>{title}</Txt>
        <Txt variant="caption" muted>
          {text}
        </Txt>
      </View>
    </Row>
  );
}

function Metric({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  return (
    <View style={[styles.metric, { borderColor: t.line, backgroundColor: t.surface }]}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <Row style={{ gap: 4 }}>
        <TextInput
          accessibilityLabel={`${label} en ${unit}`}
          value={value}
          onChangeText={onChange}
          placeholder="—"
          placeholderTextColor={t.textSecondary}
          keyboardType="decimal-pad"
          maxLength={5}
          style={[styles.metricValue, { flex: 1, minWidth: 0, color: t.text, paddingVertical: 0 }]}
        />
        <Txt variant="caption" muted>
          {unit}
        </Txt>
      </Row>
    </View>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.link, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line }]}>
      <Ionicons name={icon} size={20} color={t.accent} />
      <Txt style={{ flex: 1, fontWeight: '600' }}>{label}</Txt>
      <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.m },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1, borderRadius: Radius.l, padding: Spacing.l, gap: 2 },
  tileIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.s },
  countdown: { width: 64, height: 52, borderRadius: Radius.s, alignItems: 'center', justifyContent: 'center' },
  perkIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  sources: { borderRadius: Radius.m, padding: Spacing.m, gap: 6 },
  metric: { flex: 1, borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, gap: 2 },
  metricValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.m },
});
