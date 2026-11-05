import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addDays,
  assessGoal,
  currentPace10k,
  DAY_SETS,
  daysBetween,
  distanceLabel,
  formatPace,
  formatTime,
  objectiveLevel,
  RACE_CALENDAR,
  riegel,
  searchRaces,
  suggestedStartDate,
  weeksUntil,
  type Athlete,
  type CurrentLevel,
  type Feasibility,
  type GoalMode,
  type ObjectiveLevel,
  type PlanRequest,
  type RaceEvent,
  type SessionsPerWeek,
} from '@foulee/core';

import { GoalCelebration } from '@/components/goal-celebration';
import { CalendarPicker, ClockPicker, DurationPicker, NumberPicker } from '@/components/pickers';
import { Button, Ionicons, ProgressBar, Txt, type IconName } from '@/components/ui';
import { PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAthlete } from '@/lib/athlete';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

// ---------- Données ----------

const LEVELS: Array<{ id: Extract<CurrentLevel, { kind: 'estimate' }>['level']; label: string; hint: string; icon: IconName }> = [
  { id: 'debutant', label: 'Je débute', hint: '20 à 30 min sans m’arrêter', icon: 'walk' },
  { id: 'occasionnel', label: 'Un peu', hint: '1 à 2 sorties par semaine', icon: 'footsteps' },
  { id: 'regulier', label: 'Régulier', hint: '3 sorties ou plus', icon: 'speedometer' },
  { id: 'confirme', label: 'Confirmé', hint: 'Je fais du fractionné', icon: 'flash' },
];

const DISTANCES = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Semi-marathon' },
  { km: 42.195, label: 'Marathon' },
];

/** Objectifs proposés, rangés par distance (sans chrono = « finir »). */
const PRESETS: Record<number, Array<{ id: string; sec?: number; sub: string }>> = {
  5: [
    { id: '5-35', sec: 2100, sub: 'en 35 min' },
    { id: '5-30', sec: 1800, sub: 'en 30 min' },
    { id: '5-25', sec: 1500, sub: 'en 25 min' },
    { id: '5-fin', sub: 'le finir' },
  ],
  10: [
    { id: '10-60', sec: 3600, sub: 'en 1 h' },
    { id: '10-55', sec: 3300, sub: 'en 55 min' },
    { id: '10-50', sec: 3000, sub: 'en 50 min' },
    { id: '10-45', sec: 2700, sub: 'en 45 min' },
  ],
  21.0975: [
    { id: 'semi-215', sec: 8100, sub: 'en 2 h 15' },
    { id: 'semi-200', sec: 7200, sub: 'en 2 h' },
    { id: 'semi-145', sec: 6300, sub: 'en 1 h 45' },
    { id: 'semi-fin', sub: 'le finir' },
  ],
  42.195: [
    { id: 'mara-430', sec: 16200, sub: 'en 4 h 30' },
    { id: 'mara-400', sec: 14400, sub: 'en 4 h' },
    { id: 'mara-345', sec: 13500, sub: 'en 3 h 45' },
    { id: 'mara-fin', sub: 'le finir' },
  ],
};

const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const LEVEL_STYLE: Record<ObjectiveLevel, { colors: readonly [string, string]; bars: number }> = {
  débutant: { colors: Gradients.xp, bars: 1 },
  intermédiaire: { colors: Gradients.energy, bars: 2 },
  expert: { colors: Gradients.flame, bars: 3 },
};

const MAX_WEEKS = 30;
const stepFor = (sec: number) => (sec < 1800 ? 15 : sec < 5400 ? 30 : 60);
const roundTo = (s: number, step: number) => Math.round(s / step) * step;
const sameKm = (a: number, b: number) => Math.abs(a - b) < 0.3;
const kmLabel = (km: number) => `${String(Math.round(km * 10) / 10).replace('.', ',')} km`;
/** « 09:30 » → « 9 h 30 » */
const clock = (hhmm: string) => `${Number(hhmm.slice(0, 2))} h ${hhmm.slice(3, 5)}`;
const dowOf = (iso: string) => (new Date(iso + 'T12:00:00').getDay() + 6) % 7;

type RefSource = 'run' | 'manual' | 'estimate';
type When = 'race' | 'date';
type Step = 'toi' | 'perf' | 'course' | 'rythme' | 'objectif' | 'recap';
const STEPS: Step[] = ['toi', 'perf', 'course', 'rythme', 'objectif', 'recap'];

export default function GoalScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { createPlan, plans, runs } = useStore();
  const { athlete: saved, save: saveAthlete } = useAthlete();
  const today = todayIso();
  const start = suggestedStartDate(today);
  const scroll = useRef<ScrollViewInstance>(null);
  const recent = useMemo(() => runs.filter((r) => r.distanceKm >= 3 && r.durationSec > 600).slice(0, 5), [runs]);

  // Poids et taille déjà connus : on ne les redemande pas (on peut toujours revenir les modifier).
  const [step, setStep] = useState<number>(saved.weightKg && saved.heightCm ? 1 : 0);
  // 1. Toi
  const [weightKg, setWeightKg] = useState<number | null>(saved.weightKg ?? null);
  const [heightCm, setHeightCm] = useState<number | null>(saved.heightCm ?? null);
  // 2. Dernière performance
  const [refSource, setRefSource] = useState<RefSource>(recent.length ? 'run' : 'manual');
  const [runId, setRunId] = useState<string | null>(recent[0]?.id ?? null);
  const [refKm, setRefKm] = useState(10);
  const [refSec, setRefSec] = useState<number | null>(null);
  const [level, setLevel] = useState<(typeof LEVELS)[number]['id']>('occasionnel');
  // 3. Course
  const [when, setWhen] = useState<When>('race');
  const [query, setQuery] = useState('');
  const [raceId, setRaceId] = useState<string | null>(null);
  const [raceKm, setRaceKm] = useState<number | null>(null);
  const [freeDate, setFreeDate] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string | null>(null);
  // 4. Rythme
  const [sessions, setSessions] = useState<SessionsPerWeek>(3);
  const [days, setDays] = useState<number[]>(DAY_SETS[3]);
  // 5. Objectif
  const [preset, setPreset] = useState<string | null>(null);
  const [mode, setMode] = useState<GoalMode>('chrono');
  const [customKm, setCustomKm] = useState(10);
  const [targetSec, setTargetSec] = useState<number | null>(null);
  // Envoi
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // Le profil peut arriver juste après l'ouverture : on reprend les valeurs et on saute l'étape « Toi ».
  const touched = useRef(false);
  useEffect(() => {
    if (saved.weightKg) setWeightKg((w) => w ?? saved.weightKg!);
    if (saved.heightCm) setHeightCm((h) => h ?? saved.heightCm!);
    if (saved.weightKg && saved.heightCm && !touched.current) setStep((x) => (x === 0 ? 1 : x));
  }, [saved.weightKg, saved.heightCm]);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
    setTried(false);
  }, [step]);

  // ---------- Valeurs dérivées ----------
  const athlete: Athlete = { age: saved.age, weightKg: weightKg ?? undefined, heightCm: heightCm ?? undefined };
  const run = recent.find((r) => r.id === runId);
  const currentLevel: CurrentLevel | null =
    refSource === 'estimate'
      ? { kind: 'estimate', level }
      : refSource === 'run'
        ? run
          ? { kind: 'race', distanceKm: run.distanceKm, timeSec: run.durationSec }
          : null
        : refSec && refSec / refKm >= 150 && refSec / refKm <= 720
          ? { kind: 'race', distanceKm: refKm, timeSec: refSec }
          : null;
  const p10 = currentLevel ? currentPace10k(currentLevel) : null;

  const race: RaceEvent | undefined = RACE_CALENDAR.find((r) => r.id === raceId);
  const minDate = addDays(start, 6);
  const maxDate = addDays(start, MAX_WEEKS * 7 - 1);
  const races = useMemo(
    () => searchRaces(RACE_CALENDAR, { query, fromIso: addDays(minDate, -1) }).filter((r) => r.date <= maxDate),
    [query, minDate, maxDate],
  );
  const eventDate = when === 'race' ? (race?.date ?? null) : freeDate;
  const planWeeks = eventDate ? Math.max(1, weeksUntil(start, eventDate)) : 12;
  const opts = { sessionsPerWeek: sessions, athlete };

  // Distance de l'objectif : imposée par la course choisie, sinon par le préréglage ou le sur-mesure.
  const presetKm = preset && preset !== 'custom' ? Number(Object.keys(PRESETS).find((k) => PRESETS[Number(k)].some((p) => p.id === preset))) : null;
  const km = when === 'race' && raceKm ? raceKm : (presetKm ?? customKm);
  const allowedKms = when === 'race' && race ? (raceKm ? [raceKm] : race.distances) : DISTANCES.map((d) => d.km);

  const assessAt = (k: number, sec: number | undefined, n: SessionsPerWeek = sessions) =>
    currentLevel && eventDate
      ? assessGoal({ mode: sec ? 'chrono' : 'distance', sport: 'running', distanceKm: k, targetTimeSec: sec, eventDate }, currentLevel, start, { sessionsPerWeek: n, athlete })
      : null;
  const boundsFor = (k: number) => {
    const b = assessAt(k, undefined);
    if (!b) return null;
    const st = stepFor(b.predictedNowSec);
    return { min: roundTo(b.achievable.bestSec * 0.95, st), max: roundTo(b.predictedNowSec * 1.3, st), now: b.predictedNowSec, likely: b.achievable.likelySec, suggestions: b.suggestions };
  };
  const bounds = boundsFor(km);

  const targetProblem = (() => {
    if (mode !== 'chrono' || !preset || !bounds) return null;
    if (!targetSec) return 'Choisis le temps que tu vises.';
    if (targetSec < bounds.min) return `Ce chrono demande un peu plus de ${planWeeks} semaines de préparation. Pour cette course, vise ${formatTime(bounds.min)} : tu iras chercher plus vite au prochain objectif !`;
    if (targetSec > bounds.max) return `Tu vaux déjà mieux que ça ! Vise au moins ${formatTime(bounds.max)}.`;
    return null;
  })();
  const fixTarget = targetSec && bounds ? (targetSec < bounds.min ? bounds.min : targetSec > bounds.max ? bounds.max : null) : null;
  const daysOk = days.length === sessions;

  const raceInfo = when === 'race' && race ? { name: race.name, city: race.city, startTime: startTime ?? race.startTime } : startTime ? { name: `${distanceLabel(km)} du ${eventDate ? formatDateFr(eventDate, { day: 'numeric', month: 'long' }) : ''}`, startTime } : undefined;

  const request: PlanRequest | null =
    currentLevel && eventDate && preset && !targetProblem && daysOk
      ? {
          goal: { mode, sport: 'running', distanceKm: km, targetTimeSec: mode === 'chrono' ? targetSec! : undefined, eventDate, race: raceInfo },
          level: currentLevel,
          sessionsPerWeek: sessions,
          startDate: start,
          trainingDays: [...days].sort((a, b) => a - b),
          athlete,
        }
      : null;
  const assessment = request ? assessGoal(request.goal, request.level, start, opts) : null;
  const objLevel = objectiveLevel({ mode, distanceKm: km, targetTimeSec: targetSec ?? undefined });
  const perfLabel = refSource === 'estimate' ? 'Ton niveau' : 'Ta dernière performance';

  // ---------- Validation ----------
  const problemOf = (s: Step): string | null => {
    if (s === 'perf') {
      if (refSource === 'run' && !run) return 'Choisis une de tes courses, ou indique un chrono.';
      if (refSource === 'manual' && !refSec) return 'Choisis ton chrono.';
      if (refSource === 'manual' && !currentLevel) return 'Ce chrono semble impossible : vérifie-le.';
    }
    if (s === 'course') {
      if (when === 'race' && !race) return 'Choisis ta course, ou passe sur « Je choisis la date ».';
      if (when === 'race' && !raceKm) return 'Choisis ta distance.';
      if (when === 'date' && !freeDate) return 'Choisis la date de ton objectif dans le calendrier.';
    }
    if (s === 'rythme' && !daysOk) return `Choisis ${sessions} jour${sessions > 1 ? 's' : ''} d’entraînement.`;
    if (s === 'objectif') {
      if (!preset) return 'Choisis ton objectif.';
      return targetProblem;
    }
    if (s === 'recap' && !request) return targetProblem ?? 'Vérifie les étapes précédentes.';
    return null;
  };
  const problem = problemOf(STEPS[step]);

  const next = () => {
    setTried(true);
    if (problem) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      return;
    }
    Haptics.selectionAsync().catch(() => {});
    touched.current = true;
    if (STEPS[step] === 'toi' && ((weightKg ?? undefined) !== saved.weightKg || (heightCm ?? undefined) !== saved.heightCm)) {
      saveAthlete({ weightKg, heightCm }).catch(() => {});
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const pickRace = (r: RaceEvent) => {
    setRaceId(r.id);
    setRaceKm(r.distances.length === 1 ? r.distances[0] : null);
    if (r.startTime) setStartTime(r.startTime);
    setPreset(null);
  };
  const pickPreset = (k: number, p: { id: string; sec?: number }) => {
    Haptics.selectionAsync().catch(() => {});
    setPreset(p.id);
    setMode(p.sec ? 'chrono' : 'distance');
    setTargetSec(p.sec ?? null);
    setCustomKm(k);
  };
  const toggleCustom = () => {
    if (preset === 'custom') return setPreset(null);
    setPreset('custom');
    setCustomKm(allowedKms[0]);
    const b = boundsFor(allowedKms[0]);
    setMode('chrono');
    setTargetSec(b ? b.likely : null);
  };
  const pickSessions = (n: SessionsPerWeek) => {
    setSessions(n);
    setDays(DAY_SETS[n]);
  };
  const toggleDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].slice(-sessions)));

  const submit = async () => {
    setTried(true);
    if (!request || saving) return;
    setSaving(true);
    setError(null);
    try {
      setCreated(await createPlan(request));
    } catch (e) {
      const code = String((e as { message?: string })?.message ?? '');
      setError(code.includes('too_many_active_plans') ? `Tu as déjà ${MAX_ACTIVE_PLANS} objectifs en cours.` : 'Le plan n’a pas pu être créé. Vérifie ta connexion et réessaie.');
    } finally {
      setSaving(false);
    }
  };

  const full = plans.length >= MAX_ACTIVE_PLANS;
  const isLast = step === STEPS.length - 1;
  const labels: Record<Step, string> = { toi: 'Toi', perf: refSource === 'estimate' ? 'Ton niveau' : 'Dernière perf', course: 'Ta course', rythme: 'Ton rythme', objectif: 'Ton objectif', recap: 'Récap' };

  // ---------- Félicitations ----------
  if (created) {
    const n = request?.sessionsPerWeek ?? sessions;
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <GoalCelebration
          title={raceInfo?.name && when === 'race' ? `Cap sur ${raceInfo.name} !` : 'Ton plan est prêt !'}
          subtitle={
            mode === 'chrono' && targetSec
              ? `${distanceLabel(km)} en ${formatTime(targetSec)} : chaque séance te rapproche de ton chrono.`
              : `Objectif : finir ${distanceLabel(km)}. Une séance après l’autre, tu vas y arriver.`
          }
          stats={[
            ...(eventDate ? [{ icon: 'calendar' as const, label: `Jour J : ${formatDateFr(eventDate, { weekday: 'long', day: 'numeric', month: 'long' })} (J-${daysBetween(today, eventDate)})` }] : []),
            { icon: 'repeat', label: `${planWeeks} semaine${planWeeks > 1 ? 's' : ''} · ${n} séance${n > 1 ? 's' : ''} par semaine` },
            ...(assessment ? [{ icon: 'speedometer' as const, label: assessment.title }] : []),
            { icon: 'flag', label: `Début du plan : ${formatDateFr(start, { weekday: 'long', day: 'numeric', month: 'long' })}` },
          ]}
          onDone={() => {
            const id = created;
            router.dismiss();
            setTimeout(() => router.push({ pathname: '/plan/[id]', params: { id } }), 50);
          }}
        />
      </>
    );
  }

  // ---------- Rendu ----------
  const s = STEPS[step];
  return (
    <View style={{ flex: 1, backgroundColor: t.background }}>
      <View style={[styles.progressWrap, { backgroundColor: t.background }]}>
        <View style={styles.progress}>
          {STEPS.map((st, i) => (
            <Pressable
              key={st}
              accessibilityRole="button"
              accessibilityLabel={`Étape ${i + 1} : ${labels[st]}`}
              disabled={i > step}
              onPress={() => {
                touched.current = true;
                setStep(i);
              }}
              hitSlop={6}
              style={[styles.seg, { backgroundColor: i <= step ? t.accent : t.line }]}
            />
          ))}
        </View>
        <Txt variant="caption" muted>
          Étape {step + 1} sur {STEPS.length} · {labels[s]}
        </Txt>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {s === 'toi' && (
          <>
            <Heading title="Parlons de toi" sub="Ton âge et ta corpulence ajustent la charge d’entraînement et l’estimation de ta progression. C’est facultatif." />
            <Card>
              <View style={styles.row}>
                <NumberPicker label="Poids" unit="kg" value={weightKg} onChange={setWeightKg} min={35} max={160} initial={70} flex />
                <NumberPicker label="Taille" unit="cm" value={heightCm} onChange={setHeightCm} min={130} max={215} initial={175} flex />
              </View>
              <View style={[styles.infoRow, { backgroundColor: t.surfaceAlt }]}>
                <Ionicons name="person-outline" size={16} color={t.textSecondary} />
                <Txt variant="caption" muted style={{ flex: 1 }}>
                  {saved.age ? `${saved.age} ans, d’après ta date de naissance.` : 'Ton âge vient de ta date de naissance (compte Foulée).'}
                </Txt>
              </View>
            </Card>
            <Txt variant="caption" muted style={{ textAlign: 'center' }}>
              Ces données restent privées et servent uniquement à doser ton plan.
            </Txt>
          </>
        )}

        {s === 'perf' && (
          <>
            <Heading title="Ta dernière performance" sub="Le point de départ de tout le plan : tes allures sont calculées à partir de là." />
            <Segment
              options={[...(recent.length ? [{ value: 'run', label: 'Mes courses' }] : []), { value: 'manual', label: 'Un chrono' }, { value: 'estimate', label: 'Pas de chrono' }]}
              value={refSource}
              onChange={(v) => {
                setRefSource(v as RefSource);
                if (v === 'run' && !runId) setRunId(recent[0]?.id ?? null);
              }}
            />

            {refSource === 'run' && (
              <Card>
                <Txt variant="caption" muted>
                  Tes dernières courses
                </Txt>
                {recent.map((r) => {
                  const on = r.id === runId;
                  return (
                    <Pressable
                      key={r.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setRunId(r.id)}
                      style={[styles.option, { backgroundColor: on ? t.accentSoft : t.surfaceAlt, borderColor: on ? t.accent : 'transparent' }]}>
                      <View style={{ flex: 1 }}>
                        <Txt style={{ fontWeight: '600' }} color={on ? t.accent : t.text}>
                          {kmLabel(r.distanceKm)} en {formatTime(r.durationSec)}
                        </Txt>
                        <Txt variant="caption" muted>
                          {formatDateFr(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {formatPace(r.durationSec / r.distanceKm)} /km
                        </Txt>
                      </View>
                      <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? t.accent : t.textSecondary} />
                    </Pressable>
                  );
                })}
              </Card>
            )}

            {refSource === 'manual' && (
              <Card>
                <Txt variant="caption" muted>
                  Distance
                </Txt>
                <View style={styles.wrap}>
                  {DISTANCES.map((d) => (
                    <Pill key={d.km} label={d.km === 21.0975 ? 'Semi' : d.label} active={refKm === d.km} onPress={() => setRefKm(d.km)} />
                  ))}
                </View>
                <DurationPicker
                  label="Ton chrono"
                  value={refSec}
                  onChange={setRefSec}
                  initial={refKm === 5 ? 1680 : refKm === 10 ? 3300 : refKm < 30 ? 7500 : 15600}
                  withHours={refKm > 15}
                  hint={refSec ? `${formatPace(refSec / refKm)} /km · une course ou un test de moins de 3 mois` : 'Une course ou un test de moins de 3 mois.'}
                />
              </Card>
            )}

            {refSource === 'estimate' && (
              <View style={styles.grid}>
                {LEVELS.map((l) => {
                  const on = level === l.id;
                  return (
                    <Pressable
                      key={l.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => setLevel(l.id)}
                      style={[styles.tile, styles.shadow, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : 'transparent' }]}>
                      <Ionicons name={l.icon} size={20} color={on ? t.accent : t.textSecondary} />
                      <Txt style={{ fontWeight: '600' }} color={on ? t.accent : t.text}>
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

            {p10 && (
              <View style={[styles.infoRow, { backgroundColor: t.accentSoft }]}>
                <Ionicons name="speedometer-outline" size={16} color={t.accent} />
                <Txt variant="caption" color={t.accent} style={{ flex: 1, fontWeight: '600' }}>
                  Ton niveau aujourd’hui ≈ 10 km en {formatTime(p10 * 10)} · semi en {formatTime(riegel(p10 * 10, 10, 21.0975))}
                </Txt>
              </View>
            )}
          </>
        )}

        {s === 'course' && (
          <>
            <Heading title="Quand est ta course ?" sub="Choisis une course officielle, ou la date de ton défi dans le calendrier." />
            <Segment
              options={[
                { value: 'race', label: 'Une course officielle', icon: 'trophy-outline' },
                { value: 'date', label: 'Je choisis la date', icon: 'calendar-outline' },
              ]}
              value={when}
              onChange={(v) => {
                setWhen(v as When);
                setPreset(null);
              }}
            />

            {when === 'race' ? (
              <>
                <View style={[styles.search, styles.shadow, { backgroundColor: t.surface }]}>
                  <Ionicons name="search" size={18} color={t.textSecondary} />
                  <TextInput
                    accessibilityLabel="Rechercher une course"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Nom ou ville (ex. Tour Eiffel, Paris)"
                    placeholderTextColor={t.textSecondary}
                    style={[styles.searchInput, { color: t.text }]}
                    returnKeyType="search"
                  />
                </View>
                {races.length === 0 ? (
                  <Card>
                    <Txt style={{ fontWeight: '600' }}>Aucune course trouvée</Txt>
                    <Txt variant="caption" muted>
                      Le calendrier s’enrichit régulièrement. En attendant, choisis simplement la date de ta course.
                    </Txt>
                    <Button kind="secondary" small icon="calendar-outline" label="Je choisis la date" onPress={() => setWhen('date')} />
                  </Card>
                ) : (
                  races.map((r) => {
                    const on = r.id === raceId;
                    return (
                      <Pressable
                        key={r.id}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => pickRace(r)}
                        style={[styles.raceRow, styles.shadow, { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : 'transparent' }]}>
                        <View style={[styles.dateBadge, { backgroundColor: on ? t.accent : t.surfaceAlt }]}>
                          <Txt style={styles.dateDay} color={on ? t.accentText : t.text}>
                            {Number(r.date.slice(8, 10))}
                          </Txt>
                          <Txt variant="caption" color={on ? t.accentText : t.textSecondary}>
                            {formatDateFr(r.date, { month: 'short' }).replace('.', '')}
                          </Txt>
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Txt style={{ fontWeight: '600' }} color={on ? t.accent : t.text}>
                            {r.name}
                          </Txt>
                          <Txt variant="caption" muted>
                            {r.city} · {r.distances.map((d) => distanceLabel(d)).join(', ')} · {weeksUntil(start, r.date)} sem.
                          </Txt>
                          {!r.confirmed && (
                            <Txt variant="caption" color={t.warn}>
                              Date à confirmer sur le site de l’organisateur
                            </Txt>
                          )}
                        </View>
                        <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? t.accent : t.textSecondary} />
                      </Pressable>
                    );
                  })
                )}
                {race && race.distances.length > 1 && (
                  <Card>
                    <Txt variant="caption" muted>
                      Ta distance
                    </Txt>
                    <View style={styles.wrap}>
                      {race.distances.map((d) => (
                        <Pill key={d} label={distanceLabel(d)} active={raceKm != null && sameKm(raceKm, d)} onPress={() => setRaceKm(d)} />
                      ))}
                    </View>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CalendarPicker value={freeDate} onChange={setFreeDate} min={minDate} max={maxDate} />
              </Card>
            )}

            {eventDate && (
              <Card>
                <View style={styles.rowBetween}>
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" muted>
                      Jour J
                    </Txt>
                    <Txt style={{ fontWeight: '700', fontSize: 17 }}>{formatDateFr(eventDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
                      J-{daysBetween(today, eventDate)}
                    </Txt>
                    <Txt variant="caption" muted>
                      {planWeeks} semaine{planWeeks > 1 ? 's' : ''} de prépa
                    </Txt>
                  </View>
                </View>
                <ClockPicker label="Heure de départ (facultatif)" value={startTime} onChange={setStartTime} />
                <Txt variant="caption" muted>
                  Elle sert à caler ton petit-déjeuner et ton échauffement la semaine de course.
                </Txt>
              </Card>
            )}
          </>
        )}

        {s === 'rythme' && (
          <>
            <Heading title="Ton rythme" sub="Combien de séances peux-tu vraiment faire par semaine ? Mieux vaut 3 séances tenues que 5 abandonnées." />
            <Card>
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
              <DayPicker selected={days} onToggle={toggleDay} race={eventDate ? dowOf(eventDate) : undefined} />
              {eventDate && (
                <Txt variant="caption" muted>
                  Le drapeau marque le jour de ta course ({DAY_NAMES[dowOf(eventDate)]}).
                </Txt>
              )}
            </Card>
          </>
        )}

        {s === 'objectif' && (
          <>
            <Heading
              title="Quel est ton objectif ?"
              sub={eventDate ? `Pour ta course du ${formatDateFr(eventDate, { day: 'numeric', month: 'long' })}, avec ${sessions} séance${sessions > 1 ? 's' : ''} par semaine.` : ''}
            />
            {DISTANCES.filter((d) => allowedKms.some((k) => sameKm(k, d.km))).map((d) => (
              <View key={d.km} style={{ gap: Spacing.s }}>
                <Txt style={styles.catTitle} color={t.textSecondary}>
                  {d.label}
                </Txt>
                <View style={styles.grid}>
                  {PRESETS[d.km].map((p) => {
                    const on = preset === p.id;
                    const b = boundsFor(d.km);
                    const later = !!(p.sec && b && p.sec < b.min);
                    const done = !!(p.sec && b && p.sec > b.max);
                    const a = assessAt(d.km, p.sec);
                    const lvl = objectiveLevel({ mode: p.sec ? 'chrono' : 'distance', distanceKm: d.km, targetTimeSec: p.sec });
                    const off = later || done;
                    return (
                      <Pressable
                        key={p.id}
                        accessibilityRole="radio"
                        accessibilityLabel={`${d.label} ${p.sub}`}
                        accessibilityState={{ selected: on, disabled: off }}
                        disabled={off}
                        onPress={() => pickPreset(d.km, p)}
                        style={({ pressed }) => [
                          styles.preset,
                          styles.shadow,
                          { backgroundColor: on ? t.accentSoft : t.surface, borderColor: on ? t.accent : 'transparent', opacity: off ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
                        ]}>
                        <LevelBars level={lvl} />
                        <Txt style={styles.presetTitle} color={on ? t.accent : t.text}>
                          {p.sub}
                        </Txt>
                        <Txt variant="caption" color={off ? t.textSecondary : a ? toneOf(a.feasibility, t) : t.textSecondary} style={{ fontWeight: '600' }}>
                          {later ? 'Pour un prochain objectif' : done ? 'Déjà dans tes jambes' : a ? a.title : ''}
                        </Txt>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}

            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: preset === 'custom' }}
              onPress={toggleCustom}
              style={[styles.option, styles.shadow, { backgroundColor: preset === 'custom' ? t.accentSoft : t.surface, borderColor: preset === 'custom' ? t.accent : 'transparent' }]}>
              <Ionicons name="options-outline" size={20} color={t.accent} />
              <Txt style={{ fontWeight: '600', flex: 1 }} color={t.accent}>
                Objectif sur mesure
              </Txt>
              <Ionicons name={preset === 'custom' ? 'chevron-up' : 'chevron-down'} size={16} color={t.accent} />
            </Pressable>

            {preset === 'custom' && (
              <Card>
                <Segment
                  options={[
                    { value: 'chrono', label: 'Un chrono', icon: 'stopwatch-outline' },
                    { value: 'distance', label: 'Finir', icon: 'flag-outline' },
                  ]}
                  value={mode}
                  onChange={(v) => {
                    setMode(v as GoalMode);
                    if (v === 'chrono' && !targetSec && bounds) setTargetSec(bounds.likely);
                  }}
                />
                {allowedKms.length > 1 && (
                  <View style={styles.wrap}>
                    {DISTANCES.filter((d) => allowedKms.some((k) => sameKm(k, d.km))).map((d) => (
                      <Pill
                        key={d.km}
                        label={d.km === 21.0975 ? 'Semi' : d.label}
                        active={sameKm(customKm, d.km)}
                        onPress={() => {
                          setCustomKm(d.km);
                          const b = boundsFor(d.km);
                          if (b) setTargetSec(b.likely);
                        }}
                      />
                    ))}
                  </View>
                )}
                {mode === 'chrono' && (
                  <>
                    <DurationPicker
                      label="Temps visé"
                      value={targetSec}
                      onChange={setTargetSec}
                      initial={bounds?.likely ?? 3000}
                      withHours={km > 15}
                      hint={targetSec ? `${formatPace(targetSec / km)} /km${bounds ? ` · niveau actuel ≈ ${formatTime(bounds.now)}` : ''}` : undefined}
                      error={tried && !!targetProblem}
                    />
                    {bounds && (
                      <View style={styles.suggestRow}>
                        {bounds.suggestions.map((sg) => {
                          const on = targetSec === sg.timeSec;
                          return (
                            <Pressable
                              key={sg.label}
                              accessibilityRole="button"
                              accessibilityLabel={`${sg.label} : ${formatTime(sg.timeSec)}`}
                              onPress={() => setTargetSec(sg.timeSec)}
                              style={[styles.suggest, { backgroundColor: on ? t.accentSoft : t.surfaceAlt, borderColor: on ? t.accent : 'transparent' }]}>
                              <Txt variant="caption" color={on ? t.accent : t.textSecondary} style={{ fontWeight: '600' }}>
                                {sg.label}
                              </Txt>
                              <Txt style={styles.suggestTime}>{formatTime(sg.timeSec)}</Txt>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </>
                )}
              </Card>
            )}

            {targetProblem && preset ? <Notice text={targetProblem} fix={fixTarget} onFix={(v) => setTargetSec(v)} /> : null}
          </>
        )}

        {s === 'recap' && (
          <Recap
            km={km}
            mode={mode}
            targetSec={targetSec}
            eventDate={eventDate ?? today}
            weeks={planWeeks}
            sessions={sessions}
            days={days}
            objLevel={objLevel}
            race={raceInfo}
            plansCount={plans.length}
            assessment={assessment}
            problem={request ? null : problemOf('objectif') ?? problemOf('course') ?? problemOf('perf') ?? problemOf('rythme')}
            fix={fixTarget}
            onFix={(v) => setTargetSec(v)}
            goTo={(name) => setStep(STEPS.indexOf(name))}
            perfLabel={perfLabel}
            levelText={
              refSource === 'run' && run
                ? `${kmLabel(run.distanceKm)} en ${formatTime(run.durationSec)}`
                : refSource === 'manual' && refSec
                  ? `${distanceLabel(refKm)} en ${formatTime(refSec)}`
                  : (LEVELS.find((l) => l.id === level)?.label ?? '')
            }
            athleteText={[saved.age ? `${saved.age} ans` : null, weightKg ? `${weightKg} kg` : null, heightCm ? `${heightCm} cm` : null].filter(Boolean).join(' · ') || 'Non renseigné'}
            onLever={(kind) => (kind === 'sessions' ? pickSessions(Math.min(5, sessions + 1) as SessionsPerWeek) : null)}
            request={request}
            athlete={athlete}
            start={start}
          />
        )}

        {tried && problem && s !== 'objectif' && s !== 'recap' ? <Notice text={problem} /> : null}
        {error && <Notice text={error} />}
      </ScrollView>

      <View style={[styles.actionBar, { backgroundColor: t.background, borderTopColor: t.line, paddingBottom: Math.max(insets.bottom, Spacing.m) }]}>
        {step > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Étape précédente" onPress={() => setStep((x) => Math.max(0, x - 1))} style={[styles.back, { backgroundColor: t.surfaceAlt }]}>
            <Ionicons name="chevron-back" size={22} color={t.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          {isLast ? (
            <Button
              icon={full ? 'lock-closed' : 'rocket'}
              label={
                saving
                  ? 'Création du plan…'
                  : full
                    ? `Maximum ${MAX_ACTIVE_PLANS} objectifs en parallèle`
                    : assessment && ['tres_ambitieux', 'peu_probable'].includes(assessment.feasibility)
                      ? 'Relever le défi'
                      : 'Créer mon plan'
              }
              onPress={submit}
              disabled={!request || saving || full}
            />
          ) : (
            <Button label={s === 'toi' && !weightKg && !heightCm ? 'Passer' : 'Continuer'} onPress={next} disabled={s === 'objectif' && !preset} />
          )}
        </View>
      </View>
    </View>
  );
}

// ---------- Récapitulatif ----------

function Recap(p: {
  km: number;
  mode: GoalMode;
  targetSec: number | null;
  eventDate: string;
  weeks: number;
  sessions: SessionsPerWeek;
  days: number[];
  objLevel: ObjectiveLevel;
  race?: { name: string; city?: string; startTime?: string };
  plansCount: number;
  assessment: ReturnType<typeof assessGoal> | null;
  problem: string | null;
  fix: number | null;
  onFix: (sec: number) => void;
  goTo: (step: Step) => void;
  perfLabel: string;
  levelText: string;
  athleteText: string;
  onLever: (kind: 'sessions') => void;
  request: PlanRequest | null;
  athlete: Athlete;
  start: string;
}) {
  const t = useTheme();
  const ls = LEVEL_STYLE[p.objLevel];
  const a = p.assessment;
  const tone = toneOf(a?.feasibility, t);

  const levers: Array<{ kind: 'sessions'; label: string; title: string }> = [];
  if (p.request && a && p.sessions < 5 && ['exigeant', 'tres_ambitieux', 'peu_probable'].includes(a.feasibility)) {
    const b = assessGoal(p.request.goal, p.request.level, p.start, { sessionsPerWeek: (p.sessions + 1) as SessionsPerWeek, athlete: p.athlete });
    if (b.title !== a.title) levers.push({ kind: 'sessions', label: `${p.sessions + 1} séances / sem.`, title: b.title });
  }

  return (
    <>
      <PhotoCard image={p.km >= 40 ? 'cityRace' : p.km >= 20 ? 'marathon' : p.mode === 'chrono' ? 'trackSunset' : 'road'} height={300} contentStyle={styles.heroContent}>
        <View style={styles.heroTop}>
          <View style={styles.glassChip}>
            <Txt style={styles.glassChipText} color="#fff" numberOfLines={1}>
              {p.race?.name ?? `Objectif ${Math.min(p.plansCount + 1, MAX_ACTIVE_PLANS)}/${MAX_ACTIVE_PLANS}`}
            </Txt>
          </View>
          <LinearGradient colors={ls.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelPill}>
            <Bars n={ls.bars} />
            <Txt style={styles.glassChipText} color="#fff">
              Niveau {p.objLevel}
            </Txt>
          </LinearGradient>
        </View>
        <View style={{ gap: 2 }}>
          <Txt style={styles.heroKicker} color="rgba(255,255,255,0.72)">
            {p.mode === 'chrono' ? 'Objectif chrono' : 'Objectif distance'}
          </Txt>
          <Txt style={styles.heroTitle} color="#fff" numberOfLines={1}>
            {distanceLabel(p.km)}
          </Txt>
          <Txt style={styles.heroSub} color="rgba(255,255,255,0.92)">
            {p.mode === 'chrono' && p.targetSec ? `en ${formatTime(p.targetSec)}` : 'jusqu’à la ligne d’arrivée'}
          </Txt>
        </View>
        <View style={styles.heroStats}>
          <HeroStat value={formatDateFr(p.eventDate, { day: 'numeric', month: 'short' })} label={p.race?.startTime ? clock(p.race.startTime) : DAY_NAMES[dowOf(p.eventDate)]} />
          <View style={styles.heroDivider} />
          <HeroStat value={`${p.weeks} sem.`} label="de prépa" />
          <View style={styles.heroDivider} />
          <HeroStat value={`${p.sessions}×`} label="par semaine" />
          {p.mode === 'chrono' && p.targetSec ? (
            <>
              <View style={styles.heroDivider} />
              <HeroStat value={formatPace(p.targetSec / p.km)} label="min/km" />
            </>
          ) : null}
        </View>
      </PhotoCard>

      {p.problem ? (
        <Notice text={p.problem} fix={p.fix} onFix={p.onFix} />
      ) : a ? (
        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="caption" muted>
                Ton défi
              </Txt>
              <Txt style={styles.verdictTitle} color={tone}>
                {a.title}
              </Txt>
            </View>
            <Ionicons name={['facile', 'tres_probable', 'realiste'].includes(a.feasibility) ? 'happy-outline' : 'flame-outline'} size={34} color={tone} />
          </View>
          <ProgressBar value={a.confidence / 100} colors={[tone, tone]} height={6} />
          <Txt muted>{a.message}</Txt>
          {levers.map((l) => (
            <Pressable key={l.label} accessibilityRole="button" onPress={() => p.onLever(l.kind)} style={({ pressed }) => [styles.lever, { backgroundColor: t.accentSoft, opacity: pressed ? 0.7 : 1 }]}>
              <Ionicons name="trending-up" size={14} color={t.accent} />
              <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }}>
                Avec {l.label} : {l.title.toLowerCase()}
              </Txt>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 0, paddingVertical: Spacing.xs }}>
        <RecapRow icon="person-outline" label="Toi" value={p.athleteText} onEdit={() => p.goTo('toi')} />
        <RecapRow icon="speedometer-outline" label={p.perfLabel} value={p.levelText} onEdit={() => p.goTo('perf')} />
        <RecapRow
          icon="calendar-outline"
          label="Course"
          value={`${p.race?.name ? `${p.race.name} · ` : ''}${formatDateFr(p.eventDate, { weekday: 'short', day: 'numeric', month: 'short' })}`}
          onEdit={() => p.goTo('course')}
        />
        <RecapRow
          icon="repeat-outline"
          label="Rythme"
          value={`${p.sessions} séance${p.sessions > 1 ? 's' : ''} · ${[...p.days]
            .sort((x, y) => x - y)
            .map((d) => DAY_NAMES[d].slice(0, 3))
            .join(', ')}`}
          onEdit={() => p.goTo('rythme')}
        />
        <RecapRow
          icon="flag-outline"
          label="Objectif"
          value={p.mode === 'chrono' && p.targetSec ? `${distanceLabel(p.km)} en ${formatTime(p.targetSec)}` : `Finir : ${distanceLabel(p.km)}`}
          onEdit={() => p.goTo('objectif')}
          last
        />
      </Card>
      <Txt variant="caption" muted style={{ textAlign: 'center' }}>
        Début du plan : {formatDateFr(p.start, { weekday: 'long', day: 'numeric', month: 'long' })}
      </Txt>
    </>
  );
}

// ---------- Couleurs ----------

type Theme = ReturnType<typeof useTheme>;

function toneOf(f: Feasibility | undefined, t: Theme): string {
  if (!f) return t.line;
  if (f === "facile" || f === "tres_probable" || f === "realiste") return t.ok;
  if (f === "exigeant") return t.warn;
  if (f === "tres_ambitieux") return t.flame;
  return t.bad;
}

const confColor = (c: number, t: Theme) =>
  c >= 70 ? t.ok : c >= 45 ? t.warn : c >= 25 ? t.flame : t.bad;

// ---------- Composants ----------

function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={{ gap: 6, paddingHorizontal: 2 }}>
      <Txt style={styles.h1}>{title}</Txt>
      <Txt muted>{sub}</Txt>
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.shadow,
        { backgroundColor: t.surface },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function Notice({
  text,
  fix,
  onFix,
}: {
  text: string;
  fix?: number | null;
  onFix?: (v: number) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.notice, { backgroundColor: t.flameSoft }]}>
      <Ionicons name="alert-circle" size={16} color={t.bad} />
      <Txt variant="caption" color={t.bad} style={{ flex: 1 }}>
        {text}
      </Txt>
      {fix && onFix ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onFix(fix)}
          hitSlop={8}
        >
          <Txt variant="caption" color={t.accent} style={{ fontWeight: "700" }}>
            Viser {formatTime(fix)}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConfBadge({ c, small }: { c: number; small?: boolean }) {
  const t = useTheme();
  return (
    <View style={styles.confRow}>
      <View style={[styles.confDot, { backgroundColor: confColor(c, t) }]} />
      <Txt
        variant="caption"
        muted
        style={small ? undefined : { fontWeight: "600" }}
      >
        {c} %
      </Txt>
    </View>
  );
}

function Bars({ n }: { n: number }) {
  return (
    <View style={styles.bars}>
      {[1, 2, 3].map((b) => (
        <View
          key={b}
          style={[
            styles.bar,
            { height: 4 + b * 3, opacity: b <= n ? 1 : 0.35 },
          ]}
        />
      ))}
    </View>
  );
}

function LevelBars({ level }: { level: ObjectiveLevel }) {
  const t = useTheme();
  const n = LEVEL_STYLE[level].bars;
  const c =
    level === "débutant"
      ? t.ok
      : level === "intermédiaire"
        ? t.accent
        : t.flame;
  return (
    <View style={styles.confRow}>
      <View style={styles.bars}>
        {[1, 2, 3].map((b) => (
          <View
            key={b}
            style={[
              styles.bar,
              {
                height: 4 + b * 3,
                backgroundColor: c,
                opacity: b <= n ? 1 : 0.25,
              },
            ]}
          />
        ))}
      </View>
      <Txt variant="caption" color={c} style={{ fontWeight: "600" }}>
        {level}
      </Txt>
    </View>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Txt style={styles.heroStatValue} color="#fff" numberOfLines={1}>
        {value}
      </Txt>
      <Txt
        style={styles.heroStatLabel}
        color="rgba(255,255,255,0.7)"
        numberOfLines={1}
      >
        {label}
      </Txt>
    </View>
  );
}

function RecapRow({
  icon,
  label,
  value,
  onEdit,
  last,
}: {
  icon: IconName;
  label: string;
  value: string;
  onEdit: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Modifier : ${label}`}
      onPress={onEdit}
      style={[
        styles.recapRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.line,
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={t.textSecondary} />
      <View style={{ flex: 1 }}>
        <Txt variant="caption" muted>
          {label}
        </Txt>
        <Txt style={{ fontWeight: "600" }} numberOfLines={2}>
          {value}
        </Txt>
      </View>
      <Txt variant="caption" color={t.accent} style={{ fontWeight: "600" }}>
        Modifier
      </Txt>
    </Pressable>
  );
}

/** Contrôle segmenté façon iOS : la sélection est une pastille claire qui « flotte » sur la piste. */
function Segment({
  options,
  value,
  onChange,
}: {
  options: Array<{
    value: string;
    label: string;
    icon?: IconName;
    a11y?: string;
  }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  return (
    <View
      style={[styles.segTrack, { backgroundColor: t.surfaceAlt }]}
      accessibilityRole="radiogroup"
    >
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
            style={[
              styles.segBtn,
              active && [styles.segActive, { backgroundColor: t.surface }],
            ]}
          >
            {o.icon ? (
              <Ionicons
                name={o.icon}
                size={16}
                color={active ? t.accent : t.textSecondary}
              />
            ) : null}
            <Txt
              style={styles.segLabel}
              color={active ? t.text : t.textSecondary}
              numberOfLines={1}
            >
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.pill,
        {
          backgroundColor: active ? t.accent : t.surfaceAlt,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Txt style={styles.pillLabel} color={active ? t.accentText : t.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

function DayPicker({ selected, onToggle, race }: { selected: number[]; onToggle: (d: number) => void; race?: number }) {
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
            {race === i ? (
              <View style={[styles.raceFlag, { backgroundColor: t.flame }]}>
                <Ionicons name="flag" size={9} color="#fff" />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function RoundBtn({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "add" | "remove";
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
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
      style={({ pressed }) => [
        styles.round,
        styles.shadow,
        {
          backgroundColor: t.surface,
          opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={20} color={t.accent} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: Spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: Spacing.s },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.s,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.s },
  card: { borderRadius: 22, padding: Spacing.l, gap: Spacing.m },
  shadow: {
    boxShadow: "0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)",
  },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.6 },

  progressWrap: { paddingHorizontal: Spacing.l, paddingTop: Spacing.m, gap: 6 },
  progress: { flexDirection: "row", gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2 },

  bar: { width: 3, borderRadius: 2, backgroundColor: "#fff" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  heroContent: { flex: 1, justifyContent: "flex-end", gap: Spacing.m },
  heroTop: {
    position: "absolute",
    top: Spacing.l,
    left: Spacing.l,
    right: Spacing.l,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: Spacing.s,
  },
  glassChip: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexShrink: 1,
  },
  glassChipText: { fontSize: 12, fontWeight: "600", letterSpacing: 0.2 },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroKicker: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  heroSub: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
  },
  heroStats: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: Radius.m,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  heroStat: { flex: 1, alignItems: "center", minWidth: 0 },
  heroStatValue: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  heroStatLabel: { fontSize: 11 },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "rgba(255,255,255,0.3)",
  },

  segTrack: { flexDirection: "row", borderRadius: 14, padding: 3, gap: 2 },
  segBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: 11,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 6,
  },
  segActive: { boxShadow: "0 1px 3px rgba(11,16,32,0.12)" },
  segLabel: { fontSize: 14, fontWeight: "600" },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: "center",
  },
  pillLabel: { fontSize: 14, fontWeight: "600" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: Spacing.m },
  tile: {
    flexBasis: "46%",
    flexGrow: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: Spacing.m,
    gap: 2,
  },
  preset: {
    flexBasis: "46%",
    flexGrow: 1,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: Spacing.m,
    gap: 2,
    minHeight: 104,
  },
  presetTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: Spacing.s,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.m,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: Spacing.m,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s,
    borderRadius: 12,
    padding: Spacing.m,
  },

  timeBox: {
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: Spacing.m,
    paddingHorizontal: Spacing.l,
    alignItems: "center",
    gap: 2,
  },
  timeInput: {
    fontSize: 40,
    fontWeight: "700",
    letterSpacing: -1,
    textAlign: "center",
    minWidth: 180,
    paddingVertical: 2,
    fontVariant: ["tabular-nums"],
  },
  suggestRow: { flexDirection: "row", gap: Spacing.s },
  suggest: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: Spacing.m,
    alignItems: "center",
    gap: 2,
  },
  suggestTime: {
    fontSize: 17,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  confRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  confDot: { width: 7, height: 7, borderRadius: 4 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s,
    borderRadius: 12,
    padding: Spacing.m,
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s,
    borderRadius: 14,
    paddingHorizontal: Spacing.m,
    minHeight: 48,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
  raceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.m,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: Spacing.m,
  },
  dateBadge: {
    width: 52,
    height: 56,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  dateDay: { fontSize: 20, fontWeight: "700", lineHeight: 24 },

  field: {
    borderRadius: 12,
    paddingHorizontal: Spacing.m,
    paddingVertical: Spacing.s,
  },
  fieldInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    fontWeight: "600",
    paddingVertical: 4,
    fontVariant: ["tabular-nums"],
  },
  fieldBig: { fontSize: 28, fontWeight: "700", paddingVertical: 6 },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: Spacing.s,
  },
  stepValue: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  days: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  day: {
    flex: 1,
    maxWidth: 42,
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  raceFlag: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  catTitle: { fontSize: 15, fontWeight: '700', paddingHorizontal: 4 },
  dayLabel: { fontSize: 13, fontWeight: "600" },
  miniConf: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },

  verdictTitle: { fontSize: 19, fontWeight: "700", letterSpacing: -0.3 },
  verdictPct: {
    fontSize: 38,
    lineHeight: 42,
    fontWeight: "700",
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
  },
  verdictPctUnit: { fontSize: 20, fontWeight: "600" },
  lever: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.m,
    paddingVertical: Spacing.m,
  },

  actionBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.s,
    paddingHorizontal: Spacing.l,
    paddingTop: Spacing.m,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  back: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
