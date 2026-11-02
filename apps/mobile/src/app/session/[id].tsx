import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatDuration, formatPace, nutritionFor, toWatchWorkout, warmupAdvice, ZONE_LABELS, type Step } from '@foulee/core';

import { Button, Card, Chip, Ionicons, IntensityProfile, Row, Txt } from '@/components/ui';
import { PhotoCard } from '@/components/visuals';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SCENARIOS } from '@/lib/demo';
import { imageForSession } from '@/lib/images';
import { goalTitle, SESSION_ICON } from '@/lib/labels';
import { formatDateFr, useStore } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  validee: { label: 'Séance validée', tone: 'ok' },
  partielle: { label: 'Validée en partie', tone: 'warn' },
  non_validee: { label: 'Non validée', tone: 'bad' },
  refusee: { label: 'Activité refusée', tone: 'bad' },
  en_revue: { label: 'En vérification', tone: 'warn' },
};

const SOURCE_LABEL: Record<string, string> = { garmin: 'Garmin', apple_health: 'Apple Santé', health_connect: 'Health Connect', strava: 'Strava' };

export default function SessionScreen() {
  const t = useTheme();
  const { id, plan: planId } = useLocalSearchParams<{ id: string; plan: string }>();
  const { getPlan, connections, sendToWatch, simulateSync, resetSession } = useStore();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const entry = getPlan(planId);
  const session = entry?.plan.sessions.find((s) => s.id === id);
  if (!entry || !session) {
    return (
      <View style={{ flex: 1, padding: Spacing.l, backgroundColor: t.background }}>
        <Txt>Séance introuvable.</Txt>
      </View>
    );
  }

  const v = entry.validations[session.id];
  const ai = entry.enrichment?.sessions[session.id];
  const watchConnected = connections.garmin || connections.apple_health;
  const anyConnected = Object.values(connections).some(Boolean);
  const nutrition = nutritionFor(session, entry.plan.request.goal);
  const warmup = warmupAdvice(session);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: formatDateFr(session.date, { weekday: 'long', day: 'numeric', month: 'long' }) }} />

      <PhotoCard image={imageForSession(session.type)} height={280}>
        <Row>
          <Chip tone="glass" icon={SESSION_ICON[session.type]} label={goalTitle(entry.plan)} />
          <Chip tone="gold" icon="diamond" label={`jusqu’à ${session.basePoints} pts`} />
        </Row>
        <Txt variant="hero" color="#fff">
          {session.title}
        </Txt>
        <Txt color="rgba(255,255,255,0.9)">
          {formatDuration(session.durationSec)} · {(session.distanceM / 1000).toFixed(1).replace('.', ',')} km
        </Txt>
        <IntensityProfile steps={session.steps} height={46} color="#FFFFFF" />
      </PhotoCard>

      <Button
        kind="gold"
        icon="play-circle"
        label={v?.status === 'validee' ? 'Refaire la séance guidée' : 'Démarrer la séance guidée'}
        onPress={() => router.push({ pathname: '/run/[id]', params: { id: session.id, plan: entry.id } })}
      />
      <Txt variant="caption" muted style={{ textAlign: 'center', marginTop: -8 }}>
        GPS du téléphone, coach vocal, alertes d’allure. Ou lance la séance depuis ta montre.
      </Txt>

      {v && (
        <Card style={{ borderColor: t[STATUS[v.status].tone], borderWidth: 2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="title" color={t[STATUS[v.status].tone]}>
              {STATUS[v.status].label}
            </Txt>
            {v.points > 0 && <Chip tone="gold" icon="diamond" label={`+${v.points} pts`} />}
          </Row>
          <Txt>{v.feedback}</Txt>
          {v.status !== 'refusee' && (
            <Row style={{ gap: Spacing.l }}>
              <Metric label="Volume" value={`${Math.round(v.volumeScore * 100)} %`} />
              <Metric label="Allures" value={`${Math.round(v.intensityScore * 100)} %`} />
              <Metric label="Confiance" value={`${v.trust.trustScore}/100`} />
            </Row>
          )}
          {v.source ? (
            <Txt variant="caption" muted>
              Reçue via {SOURCE_LABEL[v.source] ?? v.source}
            </Txt>
          ) : null}
          {v.trust.flags.length > 0 && (
            <View style={{ gap: 4 }}>
              <Txt variant="label" muted>
                Contrôles GPS et capteurs
              </Txt>
              {v.trust.flags.map((f, i) => (
                <Row key={i} style={{ alignItems: 'flex-start' }}>
                  <Ionicons
                    name={f.severity === 'critical' ? 'shield' : f.severity === 'warning' ? 'warning' : 'information-circle'}
                    size={16}
                    color={f.severity === 'critical' ? t.bad : f.severity === 'warning' ? t.warn : t.textSecondary}
                  />
                  <Txt variant="caption" style={{ flex: 1 }}>
                    {f.message}
                  </Txt>
                </Row>
              ))}
            </View>
          )}
          {isDemo && <Button kind="ghost" small icon="refresh" label="Effacer ce résultat (démo)" onPress={() => resetSession(entry.id, session.id)} />}
        </Card>
      )}

      <Card>
        <Txt variant="label" muted>
          Déroulé
        </Txt>
        <StepList steps={session.steps} />
      </Card>

      <Card>
        <Row>
          <Ionicons name={ai ? 'sparkles' : 'bulb'} size={18} color={t.violet} />
          <Txt variant="label" muted>
            {ai ? 'Conseil du coach' : 'Conseil'}
          </Txt>
        </Row>
        <Txt>{ai?.tip ?? session.tip}</Txt>
        {warmup && (
          <>
            <Row>
              <Ionicons name="body" size={18} color={t.accent} />
              <Txt variant="label" muted>
                Échauffement et récupération
              </Txt>
            </Row>
            <Txt>{warmup}</Txt>
          </>
        )}
      </Card>

      <Card>
        <Row>
          <Ionicons name="nutrition" size={18} color={t.xp} />
          <Txt variant="label" muted>
            Nutrition
          </Txt>
        </Row>
        {ai?.nutrition ? <Txt style={{ fontWeight: '700' }}>{ai.nutrition}</Txt> : null}
        {(
          [
            ['Avant', nutrition.before],
            ['Pendant', nutrition.during],
            ['Après', nutrition.after],
          ] as const
        )
          .filter(([, tips]) => tips.length)
          .map(([title, tips]) => (
            <View key={title} style={{ gap: 6 }}>
              <Chip tone={title === 'Avant' ? 'accent' : title === 'Pendant' ? 'gold' : 'ok'} label={title} />
              {tips.map((tip, i) => (
                <Row key={i} style={{ alignItems: 'flex-start' }}>
                  <Ionicons name={tip.icon} size={16} color={t.textSecondary} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Txt variant="caption" style={{ fontWeight: '800' }}>
                      {tip.when}
                    </Txt>
                    <Txt variant="caption">{tip.text}</Txt>
                  </View>
                </Row>
              ))}
            </View>
          ))}
      </Card>

      <Card>
        <Row>
          <Ionicons name="watch" size={18} color={t.accent} />
          <Txt variant="label" muted>
            Sur ta montre
          </Txt>
        </Row>
        {entry.sent[session.id] ? (
          <Txt color={t.ok}>Séance envoyée. Lance-la depuis ta montre : elle te guidera bloc par bloc.</Txt>
        ) : watchConnected ? (
          <Button
            icon="paper-plane"
            label={sending ? 'Envoi…' : `Envoyer sur ${connections.garmin ? 'Garmin' : 'Apple Watch'}`}
            disabled={sending}
            onPress={async () => {
              setSending(true);
              setError(null);
              try {
                await sendToWatch(entry.id, session.id);
              } catch {
                setError('L’envoi a échoué. Réessaie dans un instant.');
              } finally {
                setSending(false);
              }
            }}
          />
        ) : (
          <Txt muted>Connecte une Garmin ou une Apple Watch dans « Montres & apps » (icône montre de l’accueil) pour y envoyer la séance.</Txt>
        )}
        {error && <Txt color={t.bad}>{error}</Txt>}
        <Button kind="ghost" small icon="code-slash" label={showJson ? 'Masquer le format montre' : 'Voir le format envoyé à la montre'} onPress={() => setShowJson(!showJson)} />
        {showJson && (
          <View style={[styles.code, { backgroundColor: t.surfaceAlt }]}>
            <Txt variant="caption" style={{ fontFamily: Fonts.mono }}>
              {JSON.stringify(toWatchWorkout(session), null, 2)}
            </Txt>
          </View>
        )}
      </Card>

      {isDemo && (
        <Card style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: t.accent }}>
          <Row>
            <Ionicons name="flask" size={18} color={t.accent} />
            <Txt variant="label" color={t.accent}>
              Démo : simuler l’activité reçue
            </Txt>
          </Row>
          {anyConnected ? (
            <>
              <Txt variant="caption" muted>
                L’activité passe par les mêmes contrôles anti-triche et la même validation que sur le serveur.
              </Txt>
              <View style={styles.grid}>
                {SCENARIOS.map((s) => (
                  <View key={s.id} style={styles.gridItem}>
                    <Button kind={s.id === 'conforme' ? 'primary' : 'secondary'} small label={s.label} onPress={() => simulateSync(entry.id, session.id, s.id)} />
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Txt muted>Connecte d’abord une montre ou une app dans « Montres & apps » (icône montre de l’accueil).</Txt>
          )}
        </Card>
      )}
    </ScrollView>
  );
}

function StepList({ steps, nested }: { steps: Step[]; nested?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, paddingLeft: nested ? Spacing.m : 0, borderLeftWidth: nested ? 3 : 0, borderLeftColor: t.accentSoft }}>
      {steps.map((s, i) =>
        s.kind === 'repeat' ? (
          <View key={i} style={{ gap: 8 }}>
            <Chip tone="accent" icon="repeat" label={`${s.times} fois`} />
            <StepList steps={s.steps} nested />
          </View>
        ) : (
          <Row key={i} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt style={{ fontWeight: '700' }}>{s.label ?? ZONE_LABELS[s.zone]}</Txt>
              <Txt variant="caption" muted>
                {s.durationSec != null
                  ? s.durationSec >= 60
                    ? formatDuration(s.durationSec)
                    : `${s.durationSec} s`
                  : s.distanceM! >= 1000
                    ? `${String(s.distanceM! / 1000).replace('.', ',')} km`
                    : `${s.distanceM} m`}
              </Txt>
            </View>
            <Txt variant="number" color={s.zone === 'rec' ? t.textSecondary : t.text}>
              {s.zone === 'rec' ? 'trot' : `${formatPace(s.pace.lo)}–${formatPace(s.pace.hi)} /km`}
            </Txt>
          </Row>
        ),
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Txt variant="label" muted>
        {label}
      </Txt>
      <Txt variant="title">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 60 },
  code: { borderRadius: 12, padding: Spacing.m },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.s },
  gridItem: { flexBasis: '48%', flexGrow: 1 },
});
