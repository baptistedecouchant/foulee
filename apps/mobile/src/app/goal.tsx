import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  addDays,
  assessGoal,
  DAY_SETS,
  distanceLabel,
  formatPace,
  formatTime,
  objectiveLevel,
  parseGoalTime,
  suggestedStartDate,
  type Athlete,
  type CurrentLevel,
  type Feasibility,
  type GoalMode,
  type ObjectiveLevel,
  type PlanRequest,
  type SessionsPerWeek,
} from '@foulee/core';

import { Button, Ionicons, ProgressBar, Txt, type IconName } from '@/components/ui';
import { PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAthlete } from '@/lib/athlete';
import { heightError, weightError } from '@/lib/auth';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

const DISTANCES = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Semi' },
  { km: 42.195, label: 'Marathon' },
];

const LEVELS: Array<{ id: Extract<CurrentLevel, { kind: 'estimate' }>['level']; label: string; hint: string; icon: IconName }> = [
  { id: 'debutant', label: 'Je débute', hint: '20 à 30 min sans m’arrêter', icon: 'walk' },
  { id: 'occasionnel', label: 'Un peu', hint: '1 à 2 sorties par semaine', icon: 'footsteps' },
  { id: 'regulier', label: 'Régulier', hint: '3 sorties ou plus', icon: 'speedometer' },
  { id: 'confirme', label: 'Confirmé', hint: 'Je fais du fractionné', icon: 'flash' },
];

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

const LEVEL_STYLE: Record<ObjectiveLevel, { colors: readonly [string, string]; bars: number }> = {
  débutant: { colors: Gradients.xp, bars: 1 },
  intermédiaire: { colors: Gradients.energy, bars: 2 },
  expert: { colors: Gradients.flame, bars: 3 },
};

const MAX_WEEKS = 30;
const stepFor = (sec: number) => (sec < 1800 ? 15 : sec < 5400 ? 30 : 60);
const roundTo = (s: number, step: number) => Math.round(s / step) * step;
const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() && Number.isFinite(n) ? n : null;
};

export default function GoalScreen() {
  const t = useTheme();
  const { createPlan, plans } = useStore();
  const { athlete: saved, save: saveAthlete } = useAthlete();
  const start = suggestedStartDate(todayIso());

  const [mode, setMode] = useState<GoalMode>('chrono');
  const [distance, setDistance] = useState<number | 'autre'>(10);
  const [otherKm, setOtherKm] = useState('15');
  const [weeks, setWeeks] = useState(10);
  const [raceDow, setRaceDow] = useState(6);
  const [hasRef, setHasRef] = useState(true);
  const [refKm, setRefKm] = useState(10);
  const [refTime, setRefTime] = useState('52:30');
  const [level, setLevel] = useState<(typeof LEVELS)[number]['id']>('occasionnel');
  const [sessions, setSessions] = useState<SessionsPerWeek>(3);
  const [days, setDays] = useState<number[]>(DAY_SETS[3]);
  const [targetText, setTargetText] = useState('');
  const [targetTouched, setTargetTouched] = useState(false);
  const [weight, setWeight] = useState(saved.weightKg ? String(saved.weightKg) : '');
  const [height, setHeight] = useState(saved.heightCm ? String(saved.heightCm) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le profil peut arriver après l'ouverture de l'écran.
  useEffect(() => {
    if (saved.weightKg) setWeight((w) => w || String(saved.weightKg));
    if (saved.heightCm) setHeight((h) => h || String(saved.heightCm));
  }, [saved.weightKg, saved.heightCm]);

  const eventDate = addDays(start, (weeks - 1) * 7 + raceDow);
  const km = distance === 'autre' ? (num(otherKm) ?? 0) : distance;
  const refSec = parseGoalTime(refTime, refKm);
  const weightKg = num(weight);
  const heightCm = num(height);
  const athlete: Athlete = {
    age: saved.age,
    weightKg: weightKg != null && !weightError(weightKg) ? weightKg : undefined,
    heightCm: heightCm != null && !heightError(heightCm) ? heightCm : undefined,
  };

  // Erreurs qui empêchent toute estimation.
  const baseProblem = useMemo(() => {
    if (!(km >= 1 && km <= 100)) return 'Indique une distance entre 1 et 100 km.';
    if (hasRef && !refSec) return 'Indique ton chrono récent, par exemple 52:30.';
    if (hasRef && refSec && (refSec / refKm < 150 || refSec / refKm > 720)) return 'Ce chrono récent semble impossible : vérifie-le.';
    if (eventDate <= todayIso()) return 'Le jour J doit être dans le futur.';
    return weightError(weightKg) ?? heightError(heightCm);
  }, [km, hasRef, refSec, refKm, eventDate, weightKg, heightCm]);

  const currentLevel: CurrentLevel = hasRef && refSec ? { kind: 'race', distanceKm: refKm, timeSec: refSec } : { kind: 'estimate', level };
  const opts = { sessionsPerWeek: sessions, athlete };

  // 1) Ce qui est atteignable : sert à proposer des chronos et à borner la saisie.
  const base = baseProblem ? null : assessGoal({ mode: 'distance', sport: 'running', distanceKm: km, eventDate }, currentLevel, start, opts);
  const step = base ? stepFor(base.predictedNowSec) : 30;
  const bounds = base ? { min: roundTo(base.achievable.bestSec * 0.95, step), max: roundTo(base.predictedNowSec * 1.3, step) } : null;

  // Tant que l'utilisateur n'a rien saisi, on pré-remplit avec le chrono réaliste.
  const likely = base?.achievable.likelySec;
  useEffect(() => {
    if (!targetTouched && likely) setTargetText(formatTime(likely));
  }, [likely, targetTouched]);

  const targetSec = mode === 'chrono' ? parseGoalTime(targetText, km) : null;
  const targetProblem = useMemo(() => {
    if (mode !== 'chrono' || !bounds) return null;
    if (!targetText.trim()) return 'Indique le temps que tu vises.';
    if (!targetSec) return 'Format attendu : 45:00, 1:45:00 ou 1h45.';
    if (targetSec < bounds.min) return `Trop rapide pour ton niveau actuel en ${weeks} semaine${weeks > 1 ? 's' : ''}. Le plus rapide envisageable : ${formatTime(bounds.min)}.`;
    if (targetSec > bounds.max) return `C’est bien plus lent que ton niveau actuel (${formatTime(base!.predictedNowSec)}). Vise ${formatTime(bounds.max)} ou plus vite.`;
    return null;
  }, [mode, bounds, targetText, targetSec, weeks, base]);
  const fixTarget = targetSec && bounds ? (targetSec < bounds.min ? bounds.min : targetSec > bounds.max ? bounds.max : null) : null;

  // 2) L'objectif choisi.
  const problem = baseProblem ?? targetProblem;
  const request: PlanRequest | null =
    problem || !base
      ? null
      : {
          goal: { mode, sport: 'running', distanceKm: km, targetTimeSec: mode === 'chrono' ? targetSec! : undefined, eventDate },
          level: currentLevel,
          sessionsPerWeek: sessions,
          startDate: start,
          trainingDays: [...days].sort((a, b) => a - b),
          athlete,
        };
  const assessment = request ? assessGoal(request.goal, request.level, start, opts) : null;
  const objLevel = objectiveLevel({ mode, distanceKm: km || 10, targetTimeSec: targetSec ?? undefined });
  const suggestionConf = (sec: number) =>
    assessGoal({ mode: 'chrono', sport: 'running', distanceKm: km, targetTimeSec: sec, eventDate }, currentLevel, start, opts).confidence;

  const pickSessions = (n: SessionsPerWeek) => {
    setSessions(n);
    setDays(DAY_SETS[n]);
  };
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].slice(-sessions)));
  const pickDistance = (d: number | 'autre') => {
    setDistance(d);
    setTargetTouched(false); // nouvelle distance : nouveau chrono proposé
  };
  const setTarget = (sec: number) => {
    Haptics.selectionAsync().catch(() => {});
    setTargetTouched(true);
    setTargetText(formatTime(sec));
  };

  // Leviers : ce que changerait une séance de plus, ou quatre semaines de plus.
  const levers: Array<{ label: string; confidence: number; apply: () => void }> = [];
  if (request && assessment) {
    if (sessions < 5) {
      const n = (sessions + 1) as SessionsPerWeek;
      const c = assessGoal(request.goal, request.level, start, { sessionsPerWeek: n, athlete }).confidence;
      if (c >= assessment.confidence + 3) levers.push({ label: `${n} séances / sem.`, confidence: c, apply: () => pickSessions(n) });
    }
    if (weeks + 4 <= MAX_WEEKS) {
      const c = assessGoal({ ...request.goal, eventDate: addDays(eventDate, 28) }, request.level, start, opts).confidence;
      if (c >= assessment.confidence + 3) levers.push({ label: '4 semaines de plus', confidence: c, apply: () => setWeeks((w) => Math.min(MAX_WEEKS, w + 4)) });
    }
  }

  const daysOk = days.length === sessions;
  const full = plans.length >= MAX_ACTIVE_PLANS;

  const submit = async () => {
    if (!request || saving) return;
    if (!daysOk) {
      setError(`Choisis ${sessions} jour${sessions > 1 ? 's' : ''} d’entraînement.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if ((weightKg ?? undefined) !== saved.weightKg || (heightCm ?? undefined) !== saved.heightCm) {
        await saveAthlete({ weightKg, heightCm }).catch(() => {});
      }
      const id = await createPlan(request);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.dismiss();
      router.push({ pathname: '/plan/[id]', params: { id } });
    } catch (e) {
      const code = String((e as { message?: string })?.message ?? '');
      setError(
        code.includes('too_many_active_plans')
          ? `Tu as déjà ${MAX_ACTIVE_PLANS} objectifs en cours.`
          : 'Le plan n’a pas pu être créé. Vérifie ta connexion et réessaie.',
      );
    } finally {
      setSaving(false);
    }
  };

  const tone = feasibilityTone(assessment?.feasibility, t);
  const ls = LEVEL_STYLE[objLevel];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* ---------- Héros ---------- */}
        <PhotoCard image={km >= 40 ? 'cityRace' : km >= 20 ? 'marathon' : mode === 'chrono' ? 'trackSunset' : 'road'} height={292} contentStyle={styles.heroContent}>
          <View style={styles.heroTop}>
            <View style={styles.glassChip}>
              <Txt style={styles.glassChipText} color="#fff">
                Objectif {Math.min(plans.length + 1, MAX_ACTIVE_PLANS)}/{MAX_ACTIVE_PLANS}
              </Txt>
            </View>
            <LinearGradient colors={ls.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelPill}>
              <View style={styles.bars}>
                {[1, 2, 3].map((b) => (
                  <View key={b} style={[styles.bar, { height: 4 + b * 3, opacity: b <= ls.bars ? 1 : 0.35 }]} />
                ))}
              </View>
              <Txt style={styles.glassChipText} color="#fff">
                Niveau {objLevel}
              </Txt>
            </LinearGradient>
          </View>

          <View style={{ gap: 2 }}>
            <Txt style={styles.heroKicker} color="rgba(255,255,255,0.72)">
              {mode === 'chrono' ? 'Objectif chrono' : 'Objectif distance'}
            </Txt>
            <Txt style={styles.heroTitle} color="#fff" numberOfLines={1}>
              {km > 0 ? distanceLabel(km) : '…'}
            </Txt>
            <Txt style={styles.heroSub} color="rgba(255,255,255,0.92)" numberOfLines={1}>
              {mode === 'chrono' ? (targetSec && !targetProblem ? `en ${formatTime(targetSec)}` : 'temps à définir') : 'jusqu’à la ligne d’arrivée'}
            </Txt>
          </View>

          <View style={styles.heroStats}>
            <HeroStat value={formatDateFr(eventDate, { day: 'numeric', month: 'short' })} label={DAY_NAMES[raceDow]} />
            <View style={styles.heroDivider} />
            <HeroStat value={`${weeks} sem.`} label="de prépa" />
            <View style={styles.heroDivider} />
            <HeroStat value={`${sessions}×`} label="par semaine" />
            {mode === 'chrono' && targetSec && !targetProblem && km ? (
              <>
                <View style={styles.heroDivider} />
                <HeroStat value={formatPace(targetSec / km)} label="min/km" />
              </>
            ) : null}
          </View>
        </PhotoCard>

        {/* ---------- Objectif ---------- */}
        <Section title="Ton objectif">
          <Segment
            options={[
              { value: 'chrono', label: 'Un chrono', icon: 'stopwatch-outline' },
              { value: 'distance', label: 'Finir une distance', icon: 'flag-outline' },
            ]}
            value={mode}
            onChange={(v) => setMode(v as GoalMode)}
          />
          <View style={styles.wrap}>
            {DISTANCES.map((d) => (
              <Pill key={d.km} label={d.label} active={distance === d.km} onPress={() => pickDistance(d.km)} />
            ))}
            <Pill label="Autre" active={distance === 'autre'} onPress={() => pickDistance('autre')} />
          </View>
          {distance === 'autre' && (
            <Field label="Distance" unit="km" value={otherKm} onChange={(v) => {
                setOtherKm(v);
                setTargetTouched(false);
              }} keyboardType="decimal-pad" />
          )}

          {mode === 'chrono' && (
            <View style={{ gap: Spacing.m }}>
              <View style={[styles.timeBox, { backgroundColor: t.surfaceAlt, borderColor: targetProblem && targetTouched ? t.bad : 'transparent' }]}>
                <Txt variant="caption" muted>
                  Temps visé
                </Txt>
                <TextInput
                  accessibilityLabel="Temps visé"
                  value={targetText}
                  onChangeText={(v) => {
                    setTargetTouched(true);
                    setTargetText(v);
                  }}
                  placeholder="45:00"
                  placeholderTextColor={t.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  maxLength={8}
                  selectTextOnFocus
                  style={[styles.timeInput, { color: t.text }]}
                />
                <Txt variant="caption" muted>
                  {targetSec && km ? `${formatPace(targetSec / km)} /km` : 'ex. 45:00 · 1:45:00 · 1h45'}
                  {base ? ` · niveau actuel ≈ ${formatTime(base.predictedNowSec)}` : ''}
                </Txt>
              </View>

              {targetProblem && (targetTouched || !targetText) ? (
                <View style={[styles.notice, { backgroundColor: t.flameSoft }]}>
                  <Ionicons name="alert-circle" size={16} color={t.bad} />
                  <Txt variant="caption" color={t.bad} style={{ flex: 1 }}>
                    {targetProblem}
                  </Txt>
                  {fixTarget ? (
                    <Pressable accessibilityRole="button" onPress={() => setTarget(fixTarget)} hitSlop={8}>
                      <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
                        Viser {formatTime(fixTarget)}
                      </Txt>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {base && (
                <View style={{ gap: Spacing.s }}>
                  <Txt variant="caption" muted>
                    Suggestions pour toi
                  </Txt>
                  <View style={styles.suggestRow}>
                    {base.suggestions.map((s) => {
                      const active = targetSec === s.timeSec;
                      const conf = suggestionConf(s.timeSec);
                      return (
                        <Pressable
                          key={s.label}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={`${s.label} : ${formatTime(s.timeSec)}, ${conf} % de chances`}
                          onPress={() => setTarget(s.timeSec)}
                          style={({ pressed }) => [
                            styles.suggest,
                            { backgroundColor: active ? t.accentSoft : t.surfaceAlt, borderColor: active ? t.accent : 'transparent', opacity: pressed ? 0.8 : 1 },
                          ]}>
                          <Txt variant="caption" color={active ? t.accent : t.textSecondary} style={{ fontWeight: '600' }}>
                            {s.label}
                          </Txt>
                          <Txt style={styles.suggestTime}>{formatTime(s.timeSec)}</Txt>
                          <View style={styles.confRow}>
                            <View style={[styles.confDot, { backgroundColor: confColor(conf, t) }]} />
                            <Txt variant="caption" muted>
                              {conf} %
                            </Txt>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          )}
        </Section>

        {/* ---------- Niveau actuel ---------- */}
        <Section title="Où tu en es">
          <Segment
            options={[
              { value: 'ref', label: 'Chrono récent', icon: 'trophy-outline' },
              { value: 'estimate', label: 'Pas de chrono', icon: 'help-circle-outline' },
            ]}
            value={hasRef ? 'ref' : 'estimate'}
            onChange={(v) => setHasRef(v === 'ref')}
          />
          {hasRef ? (
            <>
              <View style={styles.wrap}>
                {[5, 10, 21.0975].map((d) => (
                  <Pill key={d} label={d === 21.0975 ? 'Semi' : `${d} km`} active={refKm === d} onPress={() => setRefKm(d)} />
                ))}
              </View>
              <Field
                label="Ton chrono"
                unit={refSec ? `${formatPace(refSec / refKm)} /km` : ''}
                value={refTime}
                onChange={setRefTime}
                keyboardType="numbers-and-punctuation"
                placeholder="52:30"
              />
              <Txt variant="caption" muted>
                Une course ou un test de moins de 3 mois : c’est ce qui sert à calculer tes allures.
              </Txt>
            </>
          ) : (
            <View style={styles.grid}>
              {LEVELS.map((l) => {
                const active = level === l.id;
                return (
                  <Pressable
                    key={l.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setLevel(l.id)}
                    style={[styles.tile, { backgroundColor: active ? t.accentSoft : t.surfaceAlt, borderColor: active ? t.accent : 'transparent' }]}>
                    <Ionicons name={l.icon} size={18} color={active ? t.accent : t.textSecondary} />
                    <Txt style={{ fontWeight: '600' }} color={active ? t.accent : t.text}>
                      {l.label}
                    </Txt>
                    <Txt variant="caption" muted numberOfLines={2}>
                      {l.hint}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={[styles.divider, { backgroundColor: t.line }]} />
          <View style={styles.rowBetween}>
            <Txt style={{ fontWeight: '600' }}>Profil sportif</Txt>
            <Txt variant="caption" muted>
              {saved.age ? `${saved.age} ans · facultatif` : 'facultatif'}
            </Txt>
          </View>
          <View style={styles.row}>
            <Field label="Poids" unit="kg" value={weight} onChange={setWeight} keyboardType="decimal-pad" placeholder="—" flex />
            <Field label="Taille" unit="cm" value={height} onChange={setHeight} keyboardType="number-pad" placeholder="—" flex />
          </View>
          <Txt variant="caption" muted>
            L’âge et la corpulence ajustent la charge et l’estimation de progression.
          </Txt>
        </Section>

        {/* ---------- Calendrier ---------- */}
        <Section title="Le jour J" right={formatDateFr(eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}>
          <View style={[styles.stepper, { backgroundColor: t.surfaceAlt }]}>
            <RoundBtn icon="remove" label="Une semaine plus tôt" disabled={weeks <= 1} onPress={() => setWeeks((w) => Math.max(1, w - 1))} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Txt style={styles.stepValue}>{weeks}</Txt>
              <Txt variant="caption" muted>
                semaine{weeks > 1 ? 's' : ''} de préparation
              </Txt>
            </View>
            <RoundBtn icon="add" label="Une semaine plus tard" disabled={weeks >= MAX_WEEKS} onPress={() => setWeeks((w) => Math.min(MAX_WEEKS, w + 1))} />
          </View>
          <Txt variant="caption" muted>
            Jour de la course
          </Txt>
          <DayPicker selected={[raceDow]} onToggle={setRaceDow} />
        </Section>

        {/* ---------- Rythme ---------- */}
        <Section title="Ton rythme" right={`${sessions} séance${sessions > 1 ? 's' : ''} par semaine`}>
          <Segment
            options={([1, 2, 3, 4, 5] as SessionsPerWeek[]).map((n) => ({ value: String(n), label: String(n), a11y: `${n} séance${n > 1 ? 's' : ''} par semaine` }))}
            value={String(sessions)}
            onChange={(v) => pickSessions(Number(v) as SessionsPerWeek)}
          />
          <View style={styles.rowBetween}>
            <Txt variant="caption" muted>
              Tes jours d’entraînement
            </Txt>
            <Txt variant="caption" color={daysOk ? t.ok : t.warn} style={{ fontWeight: '600' }}>
              {days.length}/{sessions}
            </Txt>
          </View>
          <DayPicker selected={days} onToggle={toggleDay} />
          {!daysOk && (
            <Txt variant="caption" color={t.warn}>
              Choisis encore {sessions - days.length} jour{sessions - days.length > 1 ? 's' : ''}.
            </Txt>
          )}
        </Section>

        {/* ---------- Verdict ---------- */}
        {baseProblem ? (
          <View style={[styles.notice, { backgroundColor: t.flameSoft }]}>
            <Ionicons name="alert-circle" size={16} color={t.bad} />
            <Txt variant="caption" color={t.bad} style={{ flex: 1 }}>
              {baseProblem}
            </Txt>
          </View>
        ) : targetProblem ? (
          <View style={[styles.notice, { backgroundColor: t.flameSoft }]}>
            <Ionicons name="alert-circle" size={16} color={t.bad} />
            <Txt variant="caption" color={t.bad} style={{ flex: 1 }}>
              Temps visé : {targetProblem}
            </Txt>
            {fixTarget ? (
              <Pressable accessibilityRole="button" onPress={() => setTarget(fixTarget)} hitSlop={8}>
                <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
                  Viser {formatTime(fixTarget)}
                </Txt>
              </Pressable>
            ) : null}
          </View>
        ) : assessment ? (
          <View style={[styles.card, styles.shadow, { backgroundColor: t.surface }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="caption" muted>
                  Tes chances
                </Txt>
                <Txt style={styles.verdictTitle} color={tone}>
                  {assessment.title}
                </Txt>
              </View>
              <Txt style={styles.verdictPct} color={tone}>
                {assessment.confidence}
                <Txt style={styles.verdictPctUnit} color={tone}>
                  %
                </Txt>
              </Txt>
            </View>
            <ProgressBar value={assessment.confidence / 100} colors={[tone, tone]} height={6} />
            <Txt muted>{assessment.message}</Txt>
            {levers.length > 0 && (
              <View style={styles.wrap}>
                {levers.map((l) => (
                  <Pressable key={l.label} accessibilityRole="button" onPress={l.apply} style={({ pressed }) => [styles.lever, { backgroundColor: t.accentSoft, opacity: pressed ? 0.7 : 1 }]}>
                    <Ionicons name="trending-up" size={14} color={t.accent} />
                    <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }}>
                      {l.label} · {l.confidence} %
                    </Txt>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {error && (
          <Txt color={t.bad} style={{ textAlign: 'center' }}>
            {error}
          </Txt>
        )}
        <Button
          icon={full ? 'lock-closed' : 'rocket'}
          label={
            saving
              ? 'Création du plan…'
              : full
                ? `Maximum ${MAX_ACTIVE_PLANS} objectifs en parallèle`
                : assessment && ['tres_ambitieux', 'peu_probable'].includes(assessment.feasibility)
                  ? 'Relever le défi quand même'
                  : 'Créer mon plan'
          }
          onPress={submit}
          disabled={!request || !daysOk || saving || full}
        />
        <Txt variant="caption" muted style={{ textAlign: 'center' }}>
          Début du plan : {formatDateFr(start, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------- Couleurs ----------

type Theme = ReturnType<typeof useTheme>;

function feasibilityTone(f: Feasibility | undefined, t: Theme): string {
  if (!f) return t.line;
  if (f === 'facile' || f === 'tres_probable' || f === 'realiste') return t.ok;
  if (f === 'exigeant') return t.warn;
  if (f === 'tres_ambitieux') return t.flame;
  return t.bad;
}

const confColor = (c: number, t: Theme) => (c >= 70 ? t.ok : c >= 45 ? t.warn : c >= 25 ? t.flame : t.bad);

// ---------- Composants ----------

function Section({ title, right, children }: { title: string; right?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: Spacing.s }}>
      <View style={[styles.rowBetween, { paddingHorizontal: 4 }]}>
        <Txt style={styles.sectionTitle} color={t.textSecondary}>
          {title}
        </Txt>
        {right ? (
          <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }} numberOfLines={1}>
            {right}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.card, styles.shadow, { backgroundColor: t.surface }]}>{children}</View>
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Txt style={styles.heroStatValue} color="#fff" numberOfLines={1}>
        {value}
      </Txt>
      <Txt style={styles.heroStatLabel} color="rgba(255,255,255,0.7)" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

/** Contrôle segmenté façon iOS : la sélection est une pastille claire qui « flotte » sur la piste. */
function Segment({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string; icon?: IconName; a11y?: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: t.surfaceAlt }]} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityLabel={o.a11y ?? o.label}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(o.value);
            }}
            style={[styles.seg, active && [styles.segActive, { backgroundColor: t.surface }]]}>
            {o.icon ? <Ionicons name={o.icon} size={16} color={active ? t.accent : t.textSecondary} /> : null}
            <Txt style={styles.segLabel} color={active ? t.text : t.textSecondary} numberOfLines={1}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.pill, { backgroundColor: active ? t.accent : t.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}>
      <Txt style={styles.pillLabel} color={active ? t.accentText : t.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

function DayPicker({ selected, onToggle }: { selected: number[]; onToggle: (d: number) => void }) {
  const t = useTheme();
  return (
    <View style={styles.days}>
      {DAYS.map((d, i) => {
        const on = selected.includes(i);
        return (
          <Pressable
            key={i}
            accessibilityRole="checkbox"
            accessibilityLabel={DAY_NAMES[i]}
            accessibilityState={{ checked: on }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onToggle(i);
            }}
            style={[styles.day, { backgroundColor: on ? t.accent : t.surfaceAlt }]}>
            <Txt style={styles.dayLabel} color={on ? t.accentText : t.textSecondary}>
              {d}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function RoundBtn({ icon, label, onPress, disabled }: { icon: 'add' | 'remove'; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.round, styles.shadow, { backgroundColor: t.surface, opacity: disabled ? 0.35 : pressed ? 0.7 : 1 }]}>
      <Ionicons name={icon} size={20} color={t.accent} />
    </Pressable>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  keyboardType,
  placeholder,
  flex,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (v: string) => void;
  keyboardType: 'decimal-pad' | 'number-pad' | 'numbers-and-punctuation';
  placeholder?: string;
  flex?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[styles.field, { backgroundColor: t.surfaceAlt }, flex && { flex: 1 }]}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={t.textSecondary}
          keyboardType={keyboardType}
          returnKeyType="done"
          maxLength={8}
          style={[styles.fieldInput, { color: t.text }]}
        />
        {unit ? (
          <Txt variant="caption" muted>
            {unit}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.xl, paddingBottom: Spacing.xxl * 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.s },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  card: { borderRadius: 22, padding: Spacing.l, gap: Spacing.m },
  shadow: { boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.xs },
  sectionTitle: { fontSize: 13, fontWeight: '600', letterSpacing: 0.2 },

  heroContent: { flex: 1, justifyContent: 'flex-end', gap: Spacing.m },
  heroTop: { position: 'absolute', top: Spacing.l, left: Spacing.l, right: Spacing.l, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  glassChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  glassChipText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.2 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 3, borderRadius: 2, backgroundColor: '#fff' },
  heroKicker: { fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { fontSize: 44, lineHeight: 50, fontWeight: '800', letterSpacing: -1.2 },
  heroSub: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  heroStats: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: Radius.m, paddingVertical: 10, paddingHorizontal: 6 },
  heroStat: { flex: 1, alignItems: 'center', minWidth: 0 },
  heroStatValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroStatLabel: { fontSize: 11 },
  heroDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.3)' },

  segTrack: { flexDirection: 'row', borderRadius: 14, padding: 3, gap: 2 },
  seg: { flex: 1, minHeight: 38, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6 },
  segActive: { boxShadow: '0 1px 3px rgba(11,16,32,0.12)' },
  segLabel: { fontSize: 14, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: 16, minHeight: 36, justifyContent: 'center' },
  pillLabel: { fontSize: 14, fontWeight: '600' },

  timeBox: { borderRadius: 16, borderWidth: 1, paddingVertical: Spacing.m, paddingHorizontal: Spacing.l, alignItems: 'center', gap: 2 },
  timeInput: { fontSize: 40, fontWeight: '700', letterSpacing: -1, textAlign: 'center', minWidth: 180, paddingVertical: 2, fontVariant: ['tabular-nums'] },
  suggestRow: { flexDirection: 'row', gap: Spacing.s },
  suggest: { flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: Spacing.m, alignItems: 'center', gap: 2 },
  suggestTime: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  confRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, borderRadius: 12, padding: Spacing.m },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: 14, borderWidth: 1, padding: Spacing.m, gap: 2 },
  field: { borderRadius: 12, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s, gap: 0 },
  fieldInput: { flex: 1, minWidth: 0, fontSize: 18, fontWeight: '600', paddingVertical: 4, fontVariant: ['tabular-nums'] },

  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: Spacing.s },
  stepValue: { fontSize: 32, lineHeight: 38, fontWeight: '700', fontVariant: ['tabular-nums'] },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  day: { flex: 1, maxWidth: 42, aspectRatio: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 13, fontWeight: '600' },

  verdictTitle: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  verdictPct: { fontSize: 38, lineHeight: 42, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  verdictPctUnit: { fontSize: 20, fontWeight: '600' },
  lever: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
