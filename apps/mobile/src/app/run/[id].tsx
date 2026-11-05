import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { distanceBetween, ECONOMY, formatDuration, formatPace, formatTime, nutritionFor, vmaTestSession, VMA_TEST_ID, warmupAdvice, type PlannedSession } from '@foulee/core';

import { Button, Chip, Ionicons, ProgressBar, Row, Txt } from '@/components/ui';
import { Fonts, Gradients, Radius, Spacing } from '@/constants/theme';
import { useStore, type PlanEntry } from '@/lib/store';
import { isDemo } from '@/lib/supabase';
import { useRunSession, type GpsState } from '@/lib/useRunSession';
import { setPendingVma } from '@/lib/vma-bridge';

// Écran de course : toujours sombre, gros chiffres, lisible en plein soleil et en courant.
type ProgStep = { zone: string; label: string; durationSec?: number; distanceM?: number; expectedSec: number; pace: { lo: number; hi: number } };
const paceOf = (s: ProgStep) => (s.zone === 'rec' ? 'très facile' : `${formatPace(s.pace.lo)}–${formatPace(s.pace.hi)}`);
const sameStep = (a: ProgStep, b: ProgStep) => a.label === b.label && a.zone === b.zone && amount(a) === amount(b);

/** Programme lisible : les répétitions (effort + récup) sont regroupées en une ligne « 6 × 400 m allure VMA + 1 min récup ». */
function programLines(steps: ProgStep[]): Array<{ text: string; pace: string; muted?: boolean }> {
  const out: Array<{ text: string; pace: string; muted?: boolean }> = [];
  let i = 0;
  while (i < steps.length) {
    const a = steps[i];
    const b = steps[i + 1];
    // Motif effort + récupération répété
    if (b && a.zone !== 'rec' && b.zone === 'rec') {
      let k = 1;
      while (steps[i + 2 * k] && steps[i + 2 * k + 1] && sameStep(steps[i + 2 * k], a) && sameStep(steps[i + 2 * k + 1], b)) k++;
      // Dernier effort sans récupération derrière
      const tail = steps[i + 2 * k] && sameStep(steps[i + 2 * k], a) ? 1 : 0;
      if (k + tail > 1) {
        out.push({ text: `${k + tail} × ${amount(a)} ${a.label.toLowerCase()} · récup ${amount(b)}`, pace: paceOf(a) });
        i += 2 * k + tail;
        continue;
      }
    }
    out.push({ text: a.zone === 'rec' ? `Récupération ${amount(a)}` : `${a.label} · ${amount(a)}`, pace: paceOf(a), muted: a.zone === 'rec' });
    i++;
  }
  return out;
}

/** « 400 m », « 1 min », « 30 s » */
function amount(s: { durationSec?: number; distanceM?: number; expectedSec: number }): string {
  if (s.distanceM) return s.distanceM >= 1000 ? `${String(Math.round(s.distanceM / 100) / 10).replace('.', ',')} km` : `${s.distanceM} m`;
  const sec = s.durationSec ?? s.expectedSec;
  return sec >= 60 ? `${Math.round(sec / 60)} min` : `${sec} s`;
}

const C = {
  bg: '#070B16',
  card: 'rgba(255,255,255,0.07)',
  line: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.62)',
  ok: '#3BE0A0',
  fast: '#FF8247',
  slow: '#7088FF',
  gold: '#FFCB47',
};

export default function RunScreen() {
  const { id, plan: planId } = useLocalSearchParams<{ id: string; plan: string }>();
  const { getPlan } = useStore();
  const entry = getPlan(planId);
  // Le test VMA n'est pas une séance du plan : on le construit à la volée.
  const session = entry ? (id === VMA_TEST_ID ? vmaTestSession(entry.plan, new Date().toISOString().slice(0, 10)) : entry.plan.sessions.find((s) => s.id === id)) : undefined;
  if (!entry || !session) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, padding: Spacing.l, justifyContent: 'center' }}>
        <Txt color="#fff">Séance introuvable.</Txt>
      </View>
    );
  }
  return <Run entry={entry} session={session} />;
}

function Run({ entry, session }: { entry: PlanEntry; session: PlannedSession }) {
  const insets = useSafeAreaInsets();
  const { recordRun } = useStore();
  const [voice, setVoice] = useState(true);
  const [simulate, setSimulate] = useState(isDemo);
  const [started, setStarted] = useState(false);
  const [confirm, setConfirm] = useState<null | 'finish' | 'cancel'>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simMode, setSimMode] = useState<'fast' | 'normal' | 'slow'>('normal');

  // La configuration (voix, simulation) est figée au démarrage.
  const runner = useRunSession(session, { simulate, voice });
  const v = runner.view;

  // GPS allumé dès l'écran de préparation : le signal a le temps de se caler.
  useEffect(() => {
    if (started) return;
    if (simulate) runner.release();
    else runner.prepare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate]);
  const nutrition = nutritionFor(session, entry.plan.request.goal);
  const warmup = warmupAdvice(session);

  // « GO » affiché une seconde après le décompte
  const [showGo, setShowGo] = useState(false);
  const goScale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (v.countdown === 0) {
      setShowGo(true);
      goScale.setValue(0.5);
      Animated.spring(goScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
      const t = setTimeout(() => setShowGo(false), 900);
      return () => clearTimeout(t);
    }
  }, [v.countdown, goScale]);

  const isTest = session.id === VMA_TEST_ID;
  const validate = async () => {
    setSaving(true);
    setError(null);
    const activity = runner.finish();
    if (isTest) {
      // Distance courue pendant le bloc « 6 min à fond » → VMA, validée sur l'écran du plan.
      const i = runner.steps.findIndex((st) => st.label.startsWith('Test'));
      const lap = activity?.laps?.[i];
      const meters = activity && lap ? distanceBetween(activity.track ?? [], lap.start, lap.end) : 0;
      setSaving(false);
      if (meters < 500) {
        setError('Le bloc de 6 minutes n’a pas été mesuré (GPS ou test interrompu). Tu pourras saisir ta distance à la main.');
        return;
      }
      setPendingVma(entry.id, meters);
      router.back();
      return;
    }
    if (!activity) {
      setSaving(false);
      setError('Séance trop courte pour être validée (moins d’une minute ou pas assez de points GPS).');
      return;
    }
    try {
      await recordRun(entry.id, session.id, activity);
      router.back();
    } catch {
      setError('L’envoi a échoué. Vérifie ta connexion et réessaie.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Avant le départ ----------
  if (!started) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + Spacing.l, paddingBottom: insets.bottom + (simulate ? 120 : 230) }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
            <Chip tone="gold" icon="cash" label={`+${ECONOMY.sessionValidated} RC`} />
          </Row>
          <Txt variant="label" color={C.muted}>
            Séance guidée
          </Txt>
          <Txt variant="hero" color="#fff">
            {session.title}
          </Txt>
          <Txt color={C.muted}>
            {formatDuration(session.durationSec)} · {(session.distanceM / 1000).toFixed(1).replace('.', ',')} km {runner.steps.some((x) => x.rep) ? ` · ${runner.steps.filter((x) => x.rep).length} fractions` : ''}
          </Txt>

          {warmup && (
            <Panel icon="body" title="Échauffement et récupération">
              <Txt color="#fff">{warmup}</Txt>
            </Panel>
          )}

          <Panel icon="list" title="Au programme">
            {programLines(runner.steps)
              .slice(0, 8)
              .map((l, i) => (
                <Row key={i} style={{ justifyContent: 'space-between' }}>
                  <Txt color="#fff" style={{ flex: 1 }}>
                    {l.text}
                  </Txt>
                  <Txt variant="number" color={l.muted ? C.muted : '#fff'}>
                    {l.pace}
                  </Txt>
                </Row>
              ))}
          </Panel>

          <Panel icon="nutrition" title="Avant de partir">
            {nutrition.before.map((t, i) => (
              <View key={i}>
                <Txt variant="label" color={C.gold}>
                  {t.when}
                </Txt>
                <Txt color="#fff">{t.text}</Txt>
              </View>
            ))}
          </Panel>

          <Panel icon="settings" title="Réglages">
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt color="#fff">🔊 Coach vocal</Txt>
                <Txt variant="caption" color={C.muted}>
                  Allures, changements de bloc et alertes
                </Txt>
              </View>
              <Switch value={voice} onValueChange={setVoice} trackColor={{ true: '#3A4BFF', false: '#333' }} />
            </Row>
            {isDemo && (
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Txt color="#fff">Simuler la course</Txt>
                  <Txt variant="caption" color={C.muted}>
                    Pour tester sans bouger (5× plus rapide). Réservé au mode démo.
                  </Txt>
                </View>
                <Switch value={simulate} onValueChange={setSimulate} trackColor={{ true: '#3A4BFF', false: '#333' }} />
              </Row>
            )}
            {!simulate && (
              <Txt variant="caption" color={C.muted}>
                Garde l’app ouverte pendant la séance : l’écran reste allumé. Le GPS met parfois quelques secondes à se caler, attends dehors à
                découvert.
              </Txt>
            )}
          </Panel>
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.l, gap: Spacing.m }]}>
          {!simulate && <GpsBanner gps={v.gps} accuracy={v.gpsAccuracy} hint={v.message} onRetry={() => runner.prepare()} />}
          <Button
            kind={simulate || v.gps === 'ok' ? 'gold' : 'secondary'}
            icon="play"
            disabled={!simulate && (v.gps === 'denied' || v.gps === 'unavailable')}
            label={simulate || v.gps === 'ok' ? 'Démarrer la séance' : v.gps === 'searching' || v.gps === 'off' ? 'Démarrer sans attendre le GPS' : v.gps === 'weak' ? 'Démarrer avec un GPS faible' : 'GPS indisponible'}
            onPress={() => {
              setStarted(true);
              runner.start();
            }}
          />
        </View>
      </View>
    );
  }

  // ---------- Décompte ----------
  if (v.phase === 'countdown' || showGo) {
    return (
      <LinearGradient colors={Gradients.energy} style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        {showGo ? (
          <Animated.Text style={[styles.countdown, { transform: [{ scale: goScale }] }]}>GO</Animated.Text>
        ) : (
          <Text style={styles.countdown}>{v.countdown ?? 5}</Text>
        )}
        <Txt color="rgba(255,255,255,0.85)">{simulate ? 'Prépare-toi…' : v.gps === 'ok' ? 'GPS prêt ✓ Prépare-toi…' : 'Recherche du signal GPS…'}</Txt>
      </LinearGradient>
    );
  }

  if (v.gps === 'denied') {
    return (
      <View style={[styles.center, { backgroundColor: C.bg, padding: Spacing.xl }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="location" size={48} color="#fff" />
        <Txt variant="title" color="#fff" style={{ textAlign: 'center' }}>
          Foulée a besoin de ta position pendant la séance
        </Txt>
        <Txt color={C.muted} style={{ textAlign: 'center' }}>
          Autorise la localisation dans les réglages du téléphone, puis relance la séance.
        </Txt>
        <Button label="Fermer" onPress={() => router.back()} />
      </View>
    );
  }

  // ---------- Séance terminée ----------
  if (v.phase === 'done') {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + 140 }]}>
          <Txt variant="hero" color="#fff">
            Séance terminée !
          </Txt>
          <Row style={{ gap: Spacing.l }}>
            <Big label="Temps" value={formatTime(v.elapsedSec)} />
            <Big label="Distance" value={`${(v.distanceM / 1000).toFixed(2).replace('.', ',')} km`} />
            <Big label="Allure moy." value={v.avgPace ? formatPace(v.avgPace) : '–'} />
          </Row>
          <Panel icon="restaurant" title="Récupération">
            {nutrition.after.map((t, i) => (
              <View key={i}>
                <Txt variant="label" color={C.gold}>
                  {t.when}
                </Txt>
                <Txt color="#fff">{t.text}</Txt>
              </View>
            ))}
          </Panel>
          {error && <Txt color={C.fast}>{error}</Txt>}
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.l, gap: Spacing.s }]}>
          <Button kind="gold" icon="checkmark-circle" label={saving ? 'Vérification…' : isTest ? 'Calculer ma VMA' : 'Valider ma séance'} disabled={saving} onPress={validate} />
          <Button kind="ghost" label="Quitter sans valider" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // ---------- En course ----------
  const s = v.step;
  // Fractionné : seul le nombre de blocs à haute allure compte (pas les récupérations).
  const efforts = runner.steps.filter((x) => x.rep);
  const fractions = efforts.length ? { total: efforts.length, done: efforts.filter((x) => x.index < v.stepIndex).length } : null;
  const statusColor = v.paceStatus === 'too_fast' ? C.fast : v.paceStatus === 'too_slow' ? C.slow : v.paceStatus === 'ok' ? C.ok : C.muted;
  const statusText =
    s?.zone === 'rec' ? 'Récupère en trottinant' : v.paceStatus === 'too_fast' ? 'Trop rapide : ralentis' : v.paceStatus === 'too_slow' ? 'Trop lent : accélère' : v.paceStatus === 'ok' ? 'Bonne allure' : 'Mise en route…';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + Spacing.s, paddingBottom: insets.bottom + Spacing.m }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.runBody}>
        {/* Bloc en cours */}
        <Row style={{ justifyContent: 'space-between' }}>
          <Chip
            tone="glass"
            label={
              s?.rep
                ? `Fraction ${s.rep.n}/${s.rep.of}`
                : s?.zone === 'rec' && fractions
                  ? `Récup · ${fractions.done}/${fractions.total} fractions faites`
                  : (s?.label ?? '')
            }
          />
          <Row>
            {v.phase === 'paused' && <Chip tone="flame" icon="pause" label="Pause" />}
            <Chip
              tone={simulate || v.gps === 'ok' ? 'xp' : v.gps === 'lost' ? 'flame' : 'warn'}
              icon="navigate"
              label={simulate ? 'Simulation' : v.gps === 'ok' ? 'GPS' : v.gps === 'lost' ? 'GPS perdu' : v.gps === 'weak' ? 'GPS faible' : 'GPS…'}
            />
          </Row>
        </Row>
        {!simulate && (v.gps === 'lost' || v.gps === 'searching') && (
          <View style={[styles.gpsAlert, { backgroundColor: v.gps === 'lost' ? 'rgba(255,130,71,0.18)' : 'rgba(255,203,71,0.15)' }]}>
            <ActivityIndicator color={v.gps === 'lost' ? C.fast : C.gold} />
            <Txt variant="caption" color="#fff" style={{ flex: 1 }}>
              {v.gps === 'lost' ? 'Signal GPS perdu : la distance est en pause. Reste à découvert, elle reprendra dès son retour.' : 'Recherche du signal GPS… La distance commencera dès qu’il sera trouvé.'}
            </Txt>
          </View>
        )}
        <View style={{ gap: 2 }}>
          <Txt variant="display" color="#fff" numberOfLines={1}>
            {s ? (s.rep ? `${s.label} ${s.rep.n}/${s.rep.of}` : s.label) : ''}
          </Txt>
          {s && s.zone !== 'rec' && (
            <Txt variant="title" color={C.gold}>
              Cible {formatPace(s.pace.lo)}–{formatPace(s.pace.hi)} /km
            </Txt>
          )}
        </View>

        {/* Allure du moment */}
        <View style={[styles.paceBox, { borderColor: statusColor }]}>
          <Txt variant="label" color={C.muted}>
            Allure actuelle
          </Txt>
          <Text style={[styles.bigPace, { color: statusColor }]}>{v.pace ? formatPace(v.pace) : '–:––'}</Text>
          <Txt style={{ fontWeight: '800' }} color={statusColor}>
            {statusText}
          </Txt>
        </View>

        {/* Reste du bloc */}
        <View style={{ gap: 8 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="label" color={C.muted}>
              Reste
            </Txt>
            <Txt variant="title" color="#fff">
              {v.remainingSec != null ? formatTime(v.remainingSec) : v.remainingM != null ? `${Math.round(v.remainingM)} m` : ''}
            </Txt>
          </Row>
          <ProgressBar value={v.stepRatio} height={14} track="rgba(255,255,255,0.12)" colors={s?.zone === 'rec' ? Gradients.xp : Gradients.gold} />
          {v.next && (
            <Txt variant="caption" color={C.muted}>
              Ensuite : {v.next.rep ? `${v.next.label} ${v.next.rep.n}/${v.next.rep.of}` : v.next.label}
              {v.next.zone !== 'rec' ? ` à ${formatPace((v.next.pace.lo + v.next.pace.hi) / 2)} /km` : ''}
            </Txt>
          )}
        </View>

        {/* Totaux */}
        <Row style={{ justifyContent: 'space-between' }}>
          <Big label="Temps" value={formatTime(v.elapsedSec)} />
          <Big label="Distance" value={`${(v.distanceM / 1000).toFixed(2).replace('.', ',')}`} unit="km" />
          <Big label="Moyenne" value={v.avgPace ? formatPace(v.avgPace) : '–'} unit="/km" />
        </Row>

        {v.message && (
          <View style={styles.message}>
            <Ionicons name="volume-high" size={16} color={C.muted} />
            <Txt variant="caption" color={C.muted} style={{ flex: 1 }} numberOfLines={2}>
              {v.message}
            </Txt>
          </View>
        )}

        {simulate && (
          <Row>
            {(['fast', 'normal', 'slow'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => {
                  setSimMode(m);
                  runner.setSimFactor(m === 'fast' ? 0.82 : m === 'slow' ? 1.2 : 1);
                }}
                style={[styles.simBtn, simMode === m && { backgroundColor: '#3A4BFF' }]}>
                <Txt variant="caption" color="#fff" style={{ fontWeight: '700' }}>
                  {m === 'fast' ? 'Courir trop vite' : m === 'slow' ? 'Trop lent' : 'Allure cible'}
                </Txt>
              </Pressable>
            ))}
          </Row>
        )}
      </View>

      {/* Commandes */}
      {confirm ? (
        <View style={[styles.controls, { flexDirection: 'column' }]}>
          <Txt color="#fff" style={{ textAlign: 'center', fontWeight: '700' }}>
            {confirm === 'finish' ? 'Terminer maintenant ? La fin de la séance ne sera pas comptée.' : 'Annuler la séance ? Rien ne sera enregistré.'}
          </Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Continuer" onPress={() => setConfirm(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                kind="flame"
                label={confirm === 'finish' ? 'Terminer' : 'Annuler'}
                onPress={() => {
                  if (confirm === 'finish') {
                    setConfirm(null);
                    validate();
                  } else {
                    runner.cancel();
                    router.back();
                  }
                }}
              />
            </View>
          </Row>
        </View>
      ) : (
        <View style={styles.controls}>
          <RoundBtn icon="close" label="Annuler" onPress={() => setConfirm('cancel')} />
          <RoundBtn
            big
            icon={v.phase === 'paused' ? 'play' : 'pause'}
            label={v.phase === 'paused' ? 'Reprendre' : 'Pause'}
            onPress={v.phase === 'paused' ? runner.resume : runner.pause}
          />
          <RoundBtn icon="play-skip-forward" label="Étape suivante" onPress={runner.skip} />
          <RoundBtn icon="flag" label="Terminer" onPress={() => setConfirm('finish')} />
        </View>
      )}
    </View>
  );
}

function Panel({ icon, title, children }: { icon: 'body' | 'list' | 'nutrition' | 'settings' | 'restaurant'; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.panel}>
      <Row>
        <Ionicons name={icon} size={18} color={C.gold} />
        <Txt variant="label" color={C.gold}>
          {title}
        </Txt>
      </Row>
      {children}
    </View>
  );
}

function Big({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Txt variant="label" color={C.muted}>
        {label}
      </Txt>
      <Text style={styles.big}>
        {value}
        {unit ? <Text style={styles.unit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function RoundBtn({ icon, label, onPress, big }: { icon: 'close' | 'play' | 'pause' | 'play-skip-forward' | 'flag'; label: string; onPress: () => void; big?: boolean }) {
  const size = big ? 84 : 60;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ alignItems: 'center', gap: 6 }}>
      {({ pressed }) => (
        <>
          <View
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: big ? C.gold : C.card,
              borderWidth: big ? 0 : 1,
              borderColor: C.line,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.94 : 1 }],
            }}>
            <Ionicons name={icon} size={big ? 38 : 24} color={big ? '#2A1E00' : '#fff'} />
          </View>
          <Txt variant="caption" color={C.muted}>
            {label}
          </Txt>
        </>
      )}
    </Pressable>
  );
}

/** État du GPS avant le départ : en recherche, trouvé, faible, refusé. */
function GpsBanner({ gps, accuracy, hint, onRetry }: { gps: GpsState; accuracy: number | null; hint: string | null; onRetry: () => void }) {
  const acc = accuracy != null ? ` · précision ${Math.round(accuracy)} m` : '';
  if (gps === 'ok') {
    return (
      <View style={[styles.gpsBanner, { backgroundColor: '#0E2A22', borderColor: 'rgba(59,224,160,0.5)' }]}>
        <Ionicons name="checkmark-circle" size={22} color={C.ok} />
        <View style={{ flex: 1 }}>
          <Txt style={{ fontWeight: '700' }} color="#fff">
            Signal GPS trouvé
          </Txt>
          <Txt variant="caption" color={C.muted}>
            Tu peux partir{acc}
          </Txt>
        </View>
      </View>
    );
  }
  if (gps === 'denied' || gps === 'unavailable') {
    return (
      <View style={[styles.gpsBanner, { backgroundColor: '#2E1A12', borderColor: 'rgba(255,130,71,0.5)' }]}>
        <Ionicons name="location" size={22} color={C.fast} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt style={{ fontWeight: '700' }} color="#fff">
            {gps === 'denied' ? 'Foulée n’a pas accès à ta position' : 'La localisation est désactivée'}
          </Txt>
          <Txt variant="caption" color={C.muted}>
            {gps === 'denied'
              ? 'Réglages → Foulée (ou Expo Go) → Position → « Lorsque l’app est active ».'
              : 'Réglages → Confidentialité et sécurité → Service de localisation.'}
          </Txt>
          <Row style={{ gap: Spacing.l, marginTop: 4 }}>
            <Pressable accessibilityRole="button" onPress={() => Linking.openSettings().catch(() => {})}>
              <Txt variant="caption" color={C.gold} style={{ fontWeight: '700' }}>
                Ouvrir les réglages
              </Txt>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onRetry}>
              <Txt variant="caption" color={C.gold} style={{ fontWeight: '700' }}>
                Réessayer
              </Txt>
            </Pressable>
          </Row>
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.gpsBanner, { backgroundColor: '#2A2410', borderColor: 'rgba(255,203,71,0.45)' }]}>
      <ActivityIndicator color={C.gold} />
      <View style={{ flex: 1 }}>
        <Txt style={{ fontWeight: '700' }} color="#fff">
          {gps === 'weak' ? 'Signal GPS encore imprécis' : 'Recherche du signal GPS…'}
        </Txt>
        <Txt variant="caption" color={C.muted}>
          {hint ?? 'Reste à découvert quelques secondes'}
          {acc}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gpsBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, borderRadius: Radius.m, borderWidth: 1, padding: Spacing.m },
  gpsAlert: { flexDirection: 'row', alignItems: 'center', gap: Spacing.s, borderRadius: Radius.m, padding: Spacing.m },
  page: { paddingHorizontal: Spacing.l, gap: Spacing.l },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.l },
  countdown: { color: '#fff', fontSize: 180, fontWeight: '900', fontFamily: Fonts.rounded, fontVariant: ['tabular-nums'] },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  panel: { backgroundColor: C.card, borderRadius: Radius.l, padding: Spacing.l, gap: Spacing.m, borderWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.l, paddingTop: Spacing.m, backgroundColor: 'rgba(7,11,22,0.94)' },
  runBody: { flex: 1, paddingHorizontal: Spacing.l, gap: Spacing.l, justifyContent: 'space-evenly' },
  paceBox: { borderWidth: 3, borderRadius: Radius.l, alignItems: 'center', paddingVertical: Spacing.m, backgroundColor: C.card },
  bigPace: { fontSize: 88, fontWeight: '900', fontFamily: Fonts.rounded, fontVariant: ['tabular-nums'], letterSpacing: -2 },
  big: { color: '#fff', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  unit: { color: C.muted, fontSize: 14, fontWeight: '700' },
  message: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.card, borderRadius: Radius.m, padding: Spacing.m },
  simBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: Radius.s, backgroundColor: C.card },
  controls: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', paddingHorizontal: Spacing.l, gap: Spacing.s },
});
