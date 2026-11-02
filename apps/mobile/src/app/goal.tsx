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
  parseTime,
  suggestedStartDate,
  type Athlete,
  type CurrentLevel,
  type Feasibility,
  type GoalMode,
  type ObjectiveLevel,
  type PlanRequest,
  type SessionsPerWeek,
  type TimeSuggestion,
} from '@foulee/core';

import { Button, Chip, Ionicons, ProgressBar, Row, Txt } from '@/components/ui';
import { Glass, PhotoCard } from '@/components/visuals';
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

const LEVELS: Array<{ id: Extract<CurrentLevel, { kind: 'estimate' }>['level']; label: string; hint: string; icon: 'walk' | 'footsteps' | 'speedometer' | 'flash' }> = [
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

type TimeChoice = TimeSuggestion['label'] | 'perso';

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
  const [choice, setChoice] = useState<TimeChoice>('Réaliste');
  const [customSec, setCustomSec] = useState<number | null>(null);
  const [weight, setWeight] = useState(saved.weightKg ? String(saved.weightKg) : '');
  const [height, setHeight] = useState(saved.heightCm ? String(saved.heightCm) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!weight && saved.weightKg) setWeight(String(saved.weightKg));
    if (!height && saved.heightCm) setHeight(String(saved.heightCm));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.weightKg, saved.heightCm]);

  const eventDate = addDays(start, (weeks - 1) * 7 + raceDow);
  const km = distance === 'autre' ? (num(otherKm) ?? 0) : distance;
  const refSec = parseTime(refTime);
  const weightKg = num(weight);
  const heightCm = num(height);
  const athlete: Athlete = { age: saved.age, weightKg: weightError(weightKg) ? undefined : (weightKg ?? undefined), heightCm: heightError(heightCm) ? undefined : (heightCm ?? undefined) };

  const problem = useMemo(() => {
    if (!(km >= 1 && km <= 100)) return 'Indique une distance entre 1 et 100 km.';
    if (hasRef && !refSec) return 'Indique ton chrono récent au format 52:30.';
    if (hasRef && refSec && (refSec / refKm < 150 || refSec / refKm > 720)) return 'Ce chrono récent semble impossible : vérifie-le.';
    if (eventDate <= todayIso()) return 'Le jour J doit être dans le futur.';
    return weightError(weightKg) ?? heightError(heightCm);
  }, [km, hasRef, refSec, refKm, eventDate, weightKg, heightCm]);

  const currentLevel: CurrentLevel = hasRef && refSec ? { kind: 'race', distanceKm: refKm, timeSec: refSec } : { kind: 'estimate', level };
  const opts = { sessionsPerWeek: sessions, athlete };

  // 1) Ce qui est atteignable (sert à proposer des chronos cohérents).
  const base = problem ? null : assessGoal({ mode: 'distance', sport: 'running', distanceKm: km, eventDate }, currentLevel, start, opts);
  const suggestions = base?.suggestions ?? [];
  const bounds = base
    ? { min: roundTo(base.achievable.bestSec * 0.95, stepFor(base.predictedNowSec)), max: roundTo(base.predictedNowSec * 1.25, stepFor(base.predictedNowSec)) }
    : null;
  const targetSec =
    mode !== 'chrono' || !base
      ? undefined
      : choice === 'perso'
        ? Math.min(bounds!.max, Math.max(bounds!.min, customSec ?? base.achievable.likelySec))
        : suggestions.find((s) => s.label === choice)?.timeSec;

  // 2) L'objectif choisi.
  const request: PlanRequest | null =
    problem || !base
      ? null
      : {
          goal: { mode, sport: 'running', distanceKm: km, targetTimeSec: targetSec, eventDate },
          level: currentLevel,
          sessionsPerWeek: sessions,
          startDate: start,
          trainingDays: [...days].sort((a, b) => a - b),
          athlete,
        };
  const assessment = request ? assessGoal(request.goal, request.level, start, opts) : null;
  const objLevel = objectiveLevel({ mode, distanceKm: km || 10, targetTimeSec: targetSec });

  // Leviers : ce que changerait une séance de plus, ou quelques semaines de plus.
  const levers = useMemo(() => {
    if (!request || !assessment) return [];
    const out: Array<{ label: string; confidence: number; apply: () => void }> = [];
    if (sessions < 5) {
      const n = (sessions + 1) as SessionsPerWeek;
      const c = assessGoal(request.goal, request.level, start, { sessionsPerWeek: n, athlete }).confidence;
      if (c > assessment.confidence + 2) out.push({ label: `${n} séances / sem.`, confidence: c, apply: () => pickSessions(n) });
    }
    if (weeks <= 26) {
      const later = addDays(eventDate, 28);
      const c = assessGoal({ ...request.goal, eventDate: later }, request.level, start, opts).confidence;
      if (c > assessment.confidence + 2) out.push({ label: '4 semaines de plus', confidence: c, apply: () => setWeeks((w) => w + 4) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(request), assessment?.confidence]);

  const pickSessions = (n: SessionsPerWeek) => {
    setSessions(n);
    setDays(DAY_SETS[n]);
  };
  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].slice(-sessions)));

  const submit = async () => {
    if (!request) return;
    if (days.length !== sessions) {
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
      router.dismiss();
      router.push({ pathname: '/plan/[id]', params: { id } });
    } catch {
      setError('Le plan n’a pas pu être créé. Vérifie ta connexion et réessaie.');
    } finally {
      setSaving(false);
    }
  };

  const tone = feasibilityTone(assessment?.feasibility, t);
  const input = [styles.input, { borderColor: t.line, color: t.text, backgroundColor: t.surfaceAlt }];
  const ls = LEVEL_STYLE[objLevel];
  const full = plans.length >= MAX_ACTIVE_PLANS;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {/* ---------- Héros : l'objectif tel qu'il se dessine ---------- */}
        <PhotoCard image={km >= 40 ? 'cityRace' : km >= 20 ? 'marathon' : mode === 'chrono' ? 'trackSunset' : 'road'} height={310} contentStyle={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={styles.heroTop}>
            <Chip tone="glass" icon="flag" label={`Objectif ${Math.min(plans.length + 1, MAX_ACTIVE_PLANS)}/${MAX_ACTIVE_PLANS}`} />
            <LinearGradient colors={ls.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.levelPill}>
              <View style={styles.bars}>
                {[1, 2, 3].map((b) => (
                  <View key={b} style={[styles.bar, { height: 5 + b * 3, opacity: b <= ls.bars ? 1 : 0.35 }]} />
                ))}
              </View>
              <Txt style={styles.levelText} color="#fff">
                Niveau {objLevel}
              </Txt>
            </LinearGradient>
          </View>

          <Txt variant="label" color="rgba(255,255,255,0.75)">
            {mode === 'chrono' ? 'Objectif chrono' : 'Objectif distance'}
          </Txt>
          <Txt variant="hero" color="#fff" style={styles.heroTitle} numberOfLines={1}>
            {km > 0 ? distanceLabel(km) : '…'}
          </Txt>
          <Txt variant="display" color="#fff" style={{ marginTop: -6 }}>
            {mode === 'chrono' ? (targetSec ? `en ${formatTime(targetSec)}` : 'en …') : 'jusqu’à la ligne'}
          </Txt>

          <Glass style={styles.heroGlass}>
            <HeroStat icon="calendar" value={formatDateFr(eventDate, { day: 'numeric', month: 'short' })} label={DAY_NAMES[raceDow]} />
            <HeroStat icon="time" value={`${weeks} sem.`} label="de prépa" />
            <HeroStat icon="repeat" value={`${sessions}×/sem`} label="séances" />
            {targetSec && km ? <HeroStat icon="speedometer" value={formatPace(targetSec / km)} label="min/km" /> : null}
          </Glass>
        </PhotoCard>

        {/* ---------- 1. Distance ---------- */}
        <Section n={1} title="Ce que tu vises">
          <View style={styles.modeRow}>
            <ModeTile icon="stopwatch" title="Un chrono" hint="10 km en 45 min" active={mode === 'chrono'} onPress={() => setMode('chrono')} />
            <ModeTile icon="flag" title="Une distance" hint="Finir mon premier semi" active={mode === 'distance'} onPress={() => setMode('distance')} />
          </View>
          <Row style={{ flexWrap: 'wrap' }}>
            {DISTANCES.map((d) => (
              <Pill key={d.km} label={d.label} active={distance === d.km} onPress={() => setDistance(d.km)} />
            ))}
            <Pill label="Autre" active={distance === 'autre'} onPress={() => setDistance('autre')} />
          </Row>
          {distance === 'autre' && (
            <Row>
              <TextInput accessibilityLabel="Distance en kilomètres" value={otherKm} onChangeText={setOtherKm} keyboardType="decimal-pad" style={[input, { flex: 1, minWidth: 0 }]} />
              <Txt muted>km</Txt>
            </Row>
          )}
        </Section>

        {/* ---------- 2. Niveau actuel + profil ---------- */}
        <Section n={2} title="Où tu en es">
          <View style={styles.modeRow}>
            <ModeTile icon="trophy" title="Chrono récent" hint="Le plus précis" active={hasRef} onPress={() => setHasRef(true)} />
            <ModeTile icon="help-circle" title="Pas de chrono" hint="J’estime mon niveau" active={!hasRef} onPress={() => setHasRef(false)} />
          </View>
          {hasRef ? (
            <>
              <Row style={{ flexWrap: 'wrap' }}>
                {[5, 10, 21.0975].map((d) => (
                  <Pill key={d} label={d === 21.0975 ? 'Semi' : `${d} km`} active={refKm === d} onPress={() => setRefKm(d)} />
                ))}
              </Row>
              <Row>
                <TextInput
                  accessibilityLabel="Chrono récent"
                  value={refTime}
                  onChangeText={setRefTime}
                  placeholder="52:30"
                  placeholderTextColor={t.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[input, styles.big, { flex: 1, minWidth: 0 }]}
                />
                {refSec ? (
                  <Txt muted style={{ flexShrink: 0 }}>
                    {formatPace(refSec / refKm)} /km
                  </Txt>
                ) : null}
              </Row>
              <Txt variant="caption" muted>
                Une course ou un test de moins de 3 mois.
              </Txt>
            </>
          ) : (
            <View style={styles.grid}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: level === l.id }}
                  onPress={() => setLevel(l.id)}
                  style={[styles.tile, { borderColor: level === l.id ? t.accent : t.line, backgroundColor: level === l.id ? t.accentSoft : t.surface }]}>
                  <Ionicons name={l.icon} size={20} color={level === l.id ? t.accent : t.textSecondary} />
                  <Txt style={{ fontWeight: '700' }}>{l.label}</Txt>
                  <Txt variant="caption" muted numberOfLines={2}>
                    {l.hint}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}

          <View style={[styles.subCard, { backgroundColor: t.surfaceAlt }]}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt style={{ fontWeight: '700' }}>Profil sportif</Txt>
              {saved.age ? <Chip tone="accent" icon="person" label={`${saved.age} ans`} /> : null}
            </Row>
            <Row>
              <Metric label="Poids" unit="kg" value={weight} onChange={setWeight} />
              <Metric label="Taille" unit="cm" value={height} onChange={setHeight} />
            </Row>
            <Txt variant="caption" muted>
              Facultatif. Âge et corpulence ajustent la charge et l’estimation de progression.
            </Txt>
          </View>
        </Section>

        {/* ---------- 3. Jour J ---------- */}
        <Section n={3} title="Le jour J" right={<Chip tone="accent" icon="calendar" label={formatDateFr(eventDate, { weekday: 'short', day: 'numeric', month: 'short' })} />}>
          <Row style={{ justifyContent: 'space-between' }}>
            <RoundBtn icon="remove" label="Une semaine plus tôt" onPress={() => setWeeks((w) => Math.max(1, w - 1))} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Txt variant="hero" style={{ fontSize: 40, lineHeight: 44 }}>
                {weeks}
              </Txt>
              <Txt muted>semaine{weeks > 1 ? 's' : ''} de préparation</Txt>
            </View>
            <RoundBtn icon="add" label="Une semaine plus tard" onPress={() => setWeeks((w) => Math.min(30, w + 1))} />
          </Row>
          <Txt variant="caption" muted>
            Jour de la course
          </Txt>
          <DayPicker selected={[raceDow]} onToggle={setRaceDow} />
        </Section>

        {/* ---------- 4. Rythme ---------- */}
        <Section n={4} title="Ton rythme" right={<Txt muted>{sessions} séance{sessions > 1 ? 's' : ''} / sem.</Txt>}>
          <View style={styles.sessionsRow}>
            {([1, 2, 3, 4, 5] as SessionsPerWeek[]).map((n) => {
              const active = n === sessions;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityLabel={`${n} séance${n > 1 ? 's' : ''} par semaine`}
                  accessibilityState={{ selected: active }}
                  onPress={() => pickSessions(n)}
                  style={[styles.sessionBtn, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accent : t.surface }]}>
                  <Txt variant="title" color={active ? t.accentText : t.text}>
                    {n}
                  </Txt>
                  <View style={styles.dots}>
                    {Array.from({ length: n }, (_, i) => (
                      <View key={i} style={[styles.dot, { backgroundColor: active ? t.accentText : t.accent }]} />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="caption" muted>
              Tes jours d’entraînement
            </Txt>
            <Txt variant="caption" color={days.length === sessions ? t.ok : t.warn}>
              {days.length}/{sessions} choisi{sessions > 1 ? 's' : ''}
            </Txt>
          </Row>
          <DayPicker selected={days} onToggle={toggleDay} />
        </Section>

        {/* ---------- 5. Temps visé : propositions ---------- */}
        {mode === 'chrono' && base && (
          <Section n={5} title="Ton chrono" right={<Txt muted>niveau actuel ≈ {formatTime(base.predictedNowSec)}</Txt>}>
            <View style={styles.modeRow}>
              {suggestions.map((s) => {
                const active = choice === s.label;
                const conf = assessGoal({ mode: 'chrono', sport: 'running', distanceKm: km, targetTimeSec: s.timeSec, eventDate }, currentLevel, start, opts).confidence;
                return (
                  <Pressable
                    key={s.label}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    onPress={() => setChoice(s.label)}
                    style={[styles.timeCard, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accentSoft : t.surface }]}>
                    <Txt variant="caption" color={active ? t.accent : t.textSecondary} style={{ fontWeight: '700' }}>
                      {s.label}
                    </Txt>
                    <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatTime(s.timeSec)}
                    </Txt>
                    <Txt variant="caption" muted>
                      {formatPace(s.timeSec / km)} /km
                    </Txt>
                    <Txt variant="caption" color={confColor(conf, t)} style={{ fontWeight: '700' }}>
                      {conf} %
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ selected: choice === 'perso' }}
              onPress={() => {
                setCustomSec(targetSec ?? base.achievable.likelySec);
                setChoice('perso');
              }}
              style={[styles.customRow, { borderColor: choice === 'perso' ? t.accent : t.line, backgroundColor: choice === 'perso' ? t.accentSoft : t.surface }]}>
              {choice === 'perso' && targetSec && bounds ? (
                <Row style={{ justifyContent: 'space-between', flex: 1 }}>
                  <RoundBtn icon="remove" label="Plus rapide" onPress={() => setCustomSec(Math.max(bounds.min, targetSec - stepFor(targetSec)))} />
                  <View style={{ alignItems: 'center' }}>
                    <Txt variant="title" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatTime(targetSec)}
                    </Txt>
                    <Txt variant="caption" muted>
                      {formatPace(targetSec / km)} /km · entre {formatTime(bounds.min)} et {formatTime(bounds.max)}
                    </Txt>
                  </View>
                  <RoundBtn icon="add" label="Plus lent" onPress={() => setCustomSec(Math.min(bounds.max, targetSec + stepFor(targetSec)))} />
                </Row>
              ) : (
                <Row>
                  <Ionicons name="options" size={18} color={t.accent} />
                  <Txt color={t.accent} style={{ fontWeight: '700' }}>
                    Ajuster mon chrono
                  </Txt>
                </Row>
              )}
            </Pressable>
          </Section>
        )}

        {/* ---------- Verdict ---------- */}
        {problem ? (
          <Txt color={t.bad}>{problem}</Txt>
        ) : assessment ? (
          <View style={[styles.verdict, { backgroundColor: t.surface, borderColor: tone }]}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="label" muted>
                  Tes chances
                </Txt>
                <Txt variant="title" color={tone}>
                  {assessment.title}
                </Txt>
              </View>
              <Txt variant="hero" color={tone} style={{ fontSize: 40, lineHeight: 44 }}>
                {assessment.confidence}%
              </Txt>
            </Row>
            <ProgressBar value={assessment.confidence / 100} colors={[tone, tone]} height={10} />
            <Txt>{assessment.message}</Txt>
            {levers.length > 0 && (
              <View style={{ gap: Spacing.s }}>
                <Txt variant="caption" muted>
                  Pour augmenter tes chances
                </Txt>
                <Row style={{ flexWrap: 'wrap' }}>
                  {levers.map((l) => (
                    <Pressable key={l.label} accessibilityRole="button" onPress={l.apply} style={[styles.lever, { backgroundColor: t.accentSoft }]}>
                      <Ionicons name="trending-up" size={14} color={t.accent} />
                      <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
                        {l.label} → {l.confidence} %
                      </Txt>
                    </Pressable>
                  ))}
                </Row>
              </View>
            )}
          </View>
        ) : null}

        {error && <Txt color={t.bad}>{error}</Txt>}
        <Button
          icon="rocket"
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
          disabled={!request || saving || full}
        />
        <Txt variant="caption" muted style={{ textAlign: 'center' }}>
          Le plan démarre le {formatDateFr(start, { weekday: 'long', day: 'numeric', month: 'long' })}. Tu pourras en suivre jusqu’à {MAX_ACTIVE_PLANS} en même temps.
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

// ---------- Petits composants ----------

function Section({ n, title, right, children }: { n: number; title: string; right?: ReactNode; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderColor: t.line }]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row style={{ flexShrink: 1 }}>
          <LinearGradient colors={Gradients.energy} style={styles.stepNum}>
            <Txt style={{ fontWeight: '800', fontSize: 13 }} color="#fff">
              {n}
            </Txt>
          </LinearGradient>
          <Txt variant="title" numberOfLines={1} style={{ flexShrink: 1 }}>
            {title}
          </Txt>
        </Row>
        {right}
      </Row>
      {children}
    </View>
  );
}

function HeroStat({ icon, value, label }: { icon: 'calendar' | 'time' | 'repeat' | 'speedometer'; value: string; label: string }) {
  return (
    <View style={styles.heroStat}>
      <Ionicons name={icon} size={14} color="rgba(255,255,255,0.8)" />
      <Txt style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }} color="#fff" numberOfLines={1}>
        {value}
      </Txt>
      <Txt variant="caption" color="rgba(255,255,255,0.7)" numberOfLines={1}>
        {label}
      </Txt>
    </View>
  );
}

function ModeTile({ icon, title, hint, active, onPress }: { icon: 'stopwatch' | 'flag' | 'trophy' | 'help-circle'; title: string; hint: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.modeTile, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accentSoft : t.surface }]}>
      <Ionicons name={icon} size={22} color={active ? t.accent : t.textSecondary} />
      <Txt style={{ fontWeight: '700' }}>{title}</Txt>
      <Txt variant="caption" muted numberOfLines={1}>
        {hint}
      </Txt>
    </Pressable>
  );
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.pill, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accent : 'transparent' }]}>
      <Txt style={{ fontWeight: '700' }} color={active ? t.accentText : t.text}>
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
            onPress={() => onToggle(i)}
            style={[styles.day, { borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : t.surfaceAlt }]}>
            <Txt style={{ fontWeight: '800' }} color={on ? t.accentText : t.textSecondary}>
              {d}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

function RoundBtn({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, { borderColor: t.line, backgroundColor: t.surface }]}>
      <Ionicons name={icon} size={22} color={t.accent} />
    </Pressable>
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
          style={[styles.metricInput, { color: t.text }]}
        />
        <Txt muted>{unit}</Txt>
      </Row>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: Spacing.xxl },
  heroTop: { position: 'absolute', top: Spacing.l, left: Spacing.l, right: Spacing.l, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroTitle: { fontSize: 46, lineHeight: 50 },
  heroGlass: { flexDirection: 'row', padding: Spacing.m, gap: Spacing.s, marginTop: Spacing.s, borderRadius: Radius.m },
  heroStat: { flex: 1, alignItems: 'center', gap: 1, minWidth: 0 },
  levelPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  levelText: { fontWeight: '800', fontSize: 13 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 2, backgroundColor: '#fff' },
  section: { borderWidth: 1, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modeRow: { flexDirection: 'row', gap: Spacing.s },
  modeTile: { flex: 1, borderWidth: 1.5, borderRadius: Radius.m, padding: Spacing.m, gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  tile: { flexBasis: '47%', flexGrow: 1, borderWidth: 1.5, borderRadius: Radius.m, padding: Spacing.m, gap: 2 },
  subCard: { borderRadius: Radius.m, padding: Spacing.m, gap: Spacing.s },
  metric: { flex: 1, borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, paddingVertical: Spacing.s },
  metricInput: { flex: 1, minWidth: 0, fontSize: 20, fontWeight: '700', paddingVertical: 2, fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, minHeight: 48, fontSize: 16 },
  big: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  days: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  day: { flex: 1, maxWidth: 44, aspectRatio: 1, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sessionsRow: { flexDirection: 'row', gap: Spacing.s },
  sessionBtn: { flex: 1, borderWidth: 1.5, borderRadius: Radius.m, paddingVertical: Spacing.m, alignItems: 'center', gap: 4 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  timeCard: { flex: 1, borderWidth: 1.5, borderRadius: Radius.m, padding: Spacing.m, gap: 2, alignItems: 'center' },
  customRow: { borderWidth: 1.5, borderRadius: Radius.m, padding: Spacing.m, flexDirection: 'row', justifyContent: 'center', minHeight: 56, alignItems: 'center' },
  round: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  verdict: { borderWidth: 2, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m },
  lever: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
