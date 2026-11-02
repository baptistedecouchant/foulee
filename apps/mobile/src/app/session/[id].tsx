import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { formatDuration, formatPace, toWatchWorkout, ZONE_LABELS, type Step } from '@foulee/core';

import { Button, Card, Chip, IntensityProfile, Row, Txt } from '@/components/ui';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SCENARIOS } from '@/lib/demo';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, enrichment, validations, sent, connections, sendToWatch, simulateSync, resetSession } = useStore();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  const session = plan?.sessions.find((s) => s.id === id);
  if (!session) return <Txt>Séance introuvable.</Txt>;

  const v = validations[session.id];
  const ai = enrichment?.sessions[session.id];
  const watchConnected = connections.garmin || connections.apple_health;
  const anyConnected = Object.values(connections).some(Boolean);

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: formatDateFr(session.date, { weekday: 'long', day: 'numeric', month: 'long' }) }} />

      <Card>
        <Txt variant="display">{session.title}</Txt>
        <Txt muted>
          {formatDuration(session.durationSec)} · {(session.distanceM / 1000).toFixed(1).replace('.', ',')} km · jusqu’à {session.basePoints} pts
        </Txt>
        <IntensityProfile steps={session.steps} height={56} />
      </Card>

      <Card>
        <Txt variant="label" muted>
          Déroulé
        </Txt>
        <StepList steps={session.steps} />
      </Card>

      <Card>
        <Txt variant="label" muted>
          {ai ? 'Conseil du coach' : 'Conseil'}
        </Txt>
        <Txt>{ai?.tip ?? session.tip}</Txt>
        <Txt variant="label" muted>
          Nutrition
        </Txt>
        <Txt>{ai?.nutrition ?? session.nutrition}</Txt>
      </Card>

      <Card>
        <Txt variant="label" muted>
          Sur ta montre
        </Txt>
        {sent[session.id] ? (
          <Txt color={t.ok}>Séance envoyée. Lance-la depuis ta montre : elle te guidera bloc par bloc.</Txt>
        ) : watchConnected ? (
          <Button
            kind="secondary"
            label={sending ? 'Envoi…' : `Envoyer sur ${connections.garmin ? 'Garmin' : 'Apple Watch'}`}
            disabled={sending}
            onPress={async () => {
              setSending(true);
              try {
                await sendToWatch(session.id);
              } catch {
                setMessage('L’envoi a échoué. Réessaie dans un instant.');
              } finally {
                setSending(false);
              }
            }}
          />
        ) : (
          <Txt muted>Connecte une Garmin ou une Apple Watch dans l’onglet Montres pour y envoyer la séance.</Txt>
        )}
        <Button kind="secondary" label={showJson ? 'Masquer le format montre' : 'Voir le format envoyé à la montre'} onPress={() => setShowJson(!showJson)} />
        {showJson && (
          <View style={[styles.code, { backgroundColor: t.background, borderColor: t.line }]}>
            <Txt variant="caption" style={{ fontFamily: Fonts.mono }}>
              {JSON.stringify(toWatchWorkout(session), null, 2)}
            </Txt>
          </View>
        )}
      </Card>

      {v && (
        <Card style={{ borderColor: t[STATUS[v.status].tone], borderWidth: 1.5 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="title" color={t[STATUS[v.status].tone]}>
              {STATUS[v.status].label}
            </Txt>
            {v.points > 0 && <Chip tone="gold" label={`+${v.points} pts`} />}
          </Row>
          <Txt>{v.feedback}</Txt>
          {v.status !== 'refusee' && (
            <Row style={{ gap: Spacing.l }}>
              <Metric label="Volume" value={`${Math.round(v.volumeScore * 100)} %`} />
              <Metric label="Allures" value={`${Math.round(v.intensityScore * 100)} %`} />
              <Metric label="Confiance" value={`${v.trust.trustScore}/100`} />
            </Row>
          )}
          <Txt variant="caption" muted>
            Reçue via {SOURCE_LABEL[v.source] ?? v.source}
          </Txt>
          {v.trust.flags.length > 0 && (
            <View style={{ gap: 4 }}>
              <Txt variant="label" muted>
                Contrôles GPS et capteurs
              </Txt>
              {v.trust.flags.map((f, i) => (
                <Txt key={i} variant="caption" color={f.severity === 'critical' ? t.bad : f.severity === 'warning' ? t.warn : t.textSecondary}>
                  • {f.message}
                </Txt>
              ))}
            </View>
          )}
          {isDemo && <Button kind="secondary" label="Effacer ce résultat (démo)" onPress={() => resetSession(session.id)} />}
        </Card>
      )}

      {isDemo && (
        <Card>
          <Txt variant="label" muted>
            Démo : simuler l’activité reçue
          </Txt>
          {anyConnected ? (
            <>
              <Txt variant="caption" muted>
                L’activité passe par les mêmes contrôles anti-triche et la même validation que sur le serveur.
              </Txt>
              <Row style={{ flexWrap: 'wrap' }}>
                {SCENARIOS.map((s) => (
                  <View key={s.id} style={{ flexBasis: '47%', flexGrow: 1 }}>
                    <Button
                      kind="secondary"
                      label={s.label}
                      onPress={() => {
                        const r = simulateSync(session.id, s.id);
                        setMessage(r ? (r.points > 0 ? `+${r.points} points` : STATUS[r.status].label) : null);
                      }}
                    />
                  </View>
                ))}
              </Row>
            </>
          ) : (
            <Txt muted>Connecte d’abord une montre ou une app dans l’onglet Montres.</Txt>
          )}
        </Card>
      )}
      {message && (
        <Txt color={t.accent} style={{ textAlign: 'center', fontWeight: '700' }}>
          {message}
        </Txt>
      )}
    </ScrollView>
  );
}

function StepList({ steps, nested }: { steps: Step[]; nested?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8, paddingLeft: nested ? Spacing.m : 0, borderLeftWidth: nested ? 2 : 0, borderLeftColor: t.accentSoft }}>
      {steps.map((s, i) =>
        s.kind === 'repeat' ? (
          <View key={i} style={{ gap: 6 }}>
            <Txt style={{ fontWeight: '700' }}>{s.times} ×</Txt>
            <StepList steps={s.steps} nested />
          </View>
        ) : (
          <Row key={i} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt style={{ fontWeight: '600' }}>{s.label ?? ZONE_LABELS[s.zone]}</Txt>
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
      <Txt variant="number">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: Spacing.xxl },
  code: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: Spacing.m },
});
