import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import {
  addDays,
  distanceLabel,
  assessGoal,
  formatPace,
  formatTime,
  parseTime,
  suggestedStartDate,
  type CurrentLevel,
  type GoalMode,
  type PlanRequest,
} from '@foulee/core';

import { Button, Card, Row, Segmented, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { PhotoCard } from '@/components/visuals';
import { formatDateFr, MAX_ACTIVE_PLANS, todayIso, useStore } from '@/lib/store';

const DISTANCES = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.0975, label: 'Semi' },
  { km: 42.195, label: 'Marathon' },
];

const LEVELS: Array<{ id: Extract<CurrentLevel, { kind: 'estimate' }>['level']; label: string; hint: string }> = [
  { id: 'debutant', label: 'Je débute', hint: 'Je cours 20 à 30 min sans m’arrêter' },
  { id: 'occasionnel', label: 'Je cours un peu', hint: '1 à 2 sorties par semaine' },
  { id: 'regulier', label: 'Je cours régulièrement', hint: '3 sorties ou plus par semaine' },
  { id: 'confirme', label: 'Je suis confirmé', hint: 'Je fais déjà du fractionné' },
];

export default function GoalScreen() {
  const t = useTheme();
  const { createPlan, plans } = useStore();
  const start = suggestedStartDate(todayIso());

  const [mode, setMode] = useState<GoalMode>('chrono');
  const [distance, setDistance] = useState<number | 'autre'>(10);
  const [otherKm, setOtherKm] = useState('15');
  const [target, setTarget] = useState('45:00');
  const [weeks, setWeeks] = useState(10);
  const [hasRef, setHasRef] = useState(true);
  const [refKm, setRefKm] = useState(10);
  const [refTime, setRefTime] = useState('49:30');
  const [level, setLevel] = useState<(typeof LEVELS)[number]['id']>('occasionnel');
  const [sessions, setSessions] = useState<2 | 3 | 4 | 5>(4);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventDate = addDays(start, (weeks - 1) * 7 + 6); // dimanche de la dernière semaine
  const km = distance === 'autre' ? Number(otherKm.replace(',', '.')) : distance;
  const targetSec = parseTime(target);
  const refSec = parseTime(refTime);

  const problem = useMemo(() => {
    if (!(km >= 1 && km <= 100)) return 'Indique une distance entre 1 et 100 km.';
    if (mode === 'chrono') {
      if (!targetSec) return 'Indique un temps au format 45:00 ou 1:45:00.';
      const pace = targetSec / km;
      if (pace < 150 || pace > 720) return 'Ce temps correspond à une allure hors des valeurs possibles en course à pied.';
    }
    if (hasRef && !refSec) return 'Indique ton chrono récent au format 52:30.';
    return null;
  }, [km, mode, targetSec, hasRef, refSec]);

  const request: PlanRequest | null = problem
    ? null
    : {
        goal: { mode, sport: 'running', distanceKm: km, targetTimeSec: mode === 'chrono' ? targetSec! : undefined, eventDate },
        level: hasRef ? { kind: 'race', distanceKm: refKm, timeSec: refSec! } : { kind: 'estimate', level },
        sessionsPerWeek: sessions,
        startDate: start,
      };
  const assessment = request ? assessGoal(request.goal, request.level, start) : null;
  const tone =
    assessment?.feasibility === 'realiste' || assessment?.feasibility === 'facile'
      ? t.ok
      : assessment?.feasibility === 'exigeant'
        ? t.warn
        : t.bad;

  const submit = async () => {
    if (!request || assessment?.feasibility === 'delai_court') return;
    setSaving(true);
    setError(null);
    try {
      const id = await createPlan(request);
      router.dismiss();
      router.push({ pathname: '/plan/[id]', params: { id } });
    } catch {
      setError('Le plan n’a pas pu être créé. Vérifie ta connexion et réessaie.');
    } finally {
      setSaving(false);
    }
  };

  const input = [styles.input, { borderColor: t.line, color: t.text, backgroundColor: t.background }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <PhotoCard image={km >= 40 ? 'cityRace' : km >= 20 ? 'marathon' : mode === 'chrono' ? 'trackSunset' : 'road'} height={170}>
          <Txt variant="label" color="rgba(255,255,255,0.8)">
            Objectif {plans.length + 1} sur {MAX_ACTIVE_PLANS}
          </Txt>
          <Txt variant="display" color="#fff">
            {mode === 'chrono' && targetSec && km > 0 ? `${distanceLabel(km)} en ${formatTime(targetSec)}` : `Finir : ${km > 0 ? distanceLabel(km) : '…'}`}
          </Txt>
        </PhotoCard>
        <Card>
          <Txt variant="label" muted>
            Ce que tu vises
          </Txt>
          <Segmented<GoalMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'chrono', label: 'Un chrono' },
              { value: 'distance', label: 'Une distance' },
            ]}
          />
          <Txt variant="caption" muted>
            {mode === 'chrono' ? 'Par exemple : 10 km en moins de 45 min.' : 'Par exemple : finir mon premier semi-marathon.'}
          </Txt>

          <Row style={{ flexWrap: 'wrap' }}>
            {DISTANCES.map((d) => (
              <Choice key={d.km} label={d.label} active={distance === d.km} onPress={() => setDistance(d.km)} />
            ))}
            <Choice label="Autre" active={distance === 'autre'} onPress={() => setDistance('autre')} />
          </Row>
          {distance === 'autre' && (
            <Row>
              <TextInput
                accessibilityLabel="Distance en kilomètres"
                value={otherKm}
                onChangeText={setOtherKm}
                keyboardType="decimal-pad"
                style={[input, { flex: 1, minWidth: 0 }]}
              />
              <Txt muted>km</Txt>
            </Row>
          )}

          {mode === 'chrono' && (
            <View style={{ gap: Spacing.s }}>
              <Txt variant="label" muted>
                Temps visé
              </Txt>
              <Row>
                <TextInput
                  accessibilityLabel="Temps visé"
                  value={target}
                  onChangeText={setTarget}
                  placeholder="45:00"
                  placeholderTextColor={t.textSecondary}
                  keyboardType="numbers-and-punctuation"
                  style={[input, styles.big, { flex: 1, minWidth: 0 }]}
                />
                {targetSec && km > 0 ? (
                  <Txt muted style={{ flexShrink: 0 }}>
                    soit {formatPace(targetSec / km)} /km
                  </Txt>
                ) : null}
              </Row>
            </View>
          )}
        </Card>

        <Card>
          <Txt variant="label" muted>
            Jour J
          </Txt>
          <Row style={{ justifyContent: 'space-between' }}>
            <Stepper label="Une semaine plus tôt" sign="−" onPress={() => setWeeks((w) => Math.max(4, w - 1))} />
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Txt variant="title">{formatDateFr(eventDate, { weekday: 'long', day: 'numeric', month: 'long' })}</Txt>
              <Txt muted>{weeks} semaines de préparation</Txt>
            </View>
            <Stepper label="Une semaine plus tard" sign="+" onPress={() => setWeeks((w) => Math.min(24, w + 1))} />
          </Row>
        </Card>

        <Card>
          <Txt variant="label" muted>
            Ton niveau actuel
          </Txt>
          <Segmented<'oui' | 'non'>
            value={hasRef ? 'oui' : 'non'}
            onChange={(v) => setHasRef(v === 'oui')}
            options={[
              { value: 'oui', label: "J'ai un chrono récent" },
              { value: 'non', label: 'Pas de chrono' },
            ]}
          />
          {hasRef ? (
            <>
              <Row style={{ flexWrap: 'wrap' }}>
                {[5, 10, 21.0975].map((d) => (
                  <Choice key={d} label={d === 21.0975 ? 'Semi' : `${d} km`} active={refKm === d} onPress={() => setRefKm(d)} />
                ))}
              </Row>
              <TextInput
                accessibilityLabel="Chrono récent"
                value={refTime}
                onChangeText={setRefTime}
                placeholder="52:30"
                placeholderTextColor={t.textSecondary}
                keyboardType="numbers-and-punctuation"
                style={[input, styles.big]}
              />
              <Txt variant="caption" muted>
                Une course ou un test de moins de 3 mois. C’est ce qui sert à calculer tes allures.
              </Txt>
            </>
          ) : (
            <View style={{ gap: Spacing.s }}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: level === l.id }}
                  onPress={() => setLevel(l.id)}
                  style={[styles.option, { borderColor: level === l.id ? t.accent : t.line, backgroundColor: level === l.id ? t.accentSoft : 'transparent' }]}>
                  <Txt style={{ fontWeight: '600' }}>{l.label}</Txt>
                  <Txt variant="caption" muted>
                    {l.hint}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}
        </Card>

        <Card>
          <Txt variant="label" muted>
            Séances par semaine
          </Txt>
          <Segmented<2 | 3 | 4 | 5>
            value={sessions}
            onChange={setSessions}
            options={[2, 3, 4, 5].map((n) => ({ value: n as 2 | 3 | 4 | 5, label: String(n) }))}
          />
        </Card>

        {problem ? (
          <Txt color={t.bad}>{problem}</Txt>
        ) : assessment ? (
          <Card style={{ borderColor: tone, borderWidth: 1.5 }}>
            <Txt variant="title" color={tone}>
              {assessment.title}
            </Txt>
            <Txt>{assessment.message}</Txt>
            {assessment.suggestedTimeSec ? (
              <Button
                kind="secondary"
                label={`Viser ${formatTime(assessment.suggestedTimeSec)}`}
                onPress={() => setTarget(formatTime(assessment.suggestedTimeSec!))}
              />
            ) : null}
          </Card>
        ) : null}

        {error && <Txt color={t.bad}>{error}</Txt>}
        <Button
          icon="rocket"
          label={saving ? 'Création du plan…' : plans.length >= MAX_ACTIVE_PLANS ? `Maximum ${MAX_ACTIVE_PLANS} objectifs en parallèle` : 'Créer mon plan'}
          onPress={submit}
          disabled={!request || assessment?.feasibility === 'delai_court' || saving || plans.length >= MAX_ACTIVE_PLANS}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.choice, { borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accent : 'transparent' }]}>
      <Txt style={{ fontWeight: '600' }} color={active ? t.accentText : t.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

function Stepper({ sign, label, onPress }: { sign: string; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.stepper, { borderColor: t.line }]}>
      <Txt variant="title" color={t.accent}>
        {sign}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: Spacing.xxl },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, minHeight: 48, fontSize: 16 },
  big: { fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  option: { borderWidth: 1, borderRadius: Radius.s, padding: Spacing.m, gap: 2 },
  stepper: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
