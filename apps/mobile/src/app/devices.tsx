import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button, Card, Chip, Ionicons, Row, Txt, type IconName } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type Provider } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

interface Source {
  id: Provider | 'nike';
  name: string;
  color: string;
  icon: IconName;
  reads: string;
  sends?: string;
  /** Disponibilité dans l'app réelle (hors démo). */
  status: 'ready' | 'build' | 'pending' | 'via';
  note: string;
  only?: 'ios' | 'android';
}

const SOURCES: Source[] = [
  {
    id: 'strava',
    name: 'Strava',
    color: '#FC4C02',
    icon: 'pulse',
    reads: 'Toutes tes courses Strava, y compris celles venues d’une Garmin, Coros, Polar, Suunto ou Apple Watch synchronisée avec Strava.',
    status: 'ready',
    note: 'Disponible dès que le serveur est configuré.',
  },
  {
    id: 'garmin',
    name: 'Garmin Connect',
    color: '#007CC3',
    icon: 'watch',
    reads: 'Tes séances avec trace GPS, cardio et cadence.',
    sends: 'Envoie les séances du plan sur ta montre.',
    status: 'pending',
    note: 'En attente de l’accès développeur Garmin. En attendant : active la synchro Garmin → Strava.',
  },
  {
    id: 'apple_health',
    name: 'Apple Santé',
    color: '#FF2D55',
    icon: 'heart',
    reads: 'Les séances de l’Apple Watch et des apps qui écrivent dans Santé (Nike Run Club, Runna…).',
    sends: 'Envoie les séances sur l’Apple Watch.',
    status: 'build',
    note: 'Nécessite la version installée de l’app (pas Expo Go).',
    only: 'ios',
  },
  {
    id: 'health_connect',
    name: 'Health Connect',
    color: '#34A853',
    icon: 'fitness',
    reads: 'Les séances des montres et apps Android (Samsung, Pixel, Nike Run Club…).',
    status: 'build',
    note: 'Nécessite la version installée de l’app (pas Expo Go).',
    only: 'android',
  },
  {
    id: 'nike',
    name: 'Nike Run Club',
    color: '#111111',
    icon: 'footsteps',
    reads: 'Nike ne propose pas d’accès direct. Nike Run Club enregistre tes courses dans Apple Santé (iPhone) et Health Connect (Android) : Foulée les récupère par là.',
    status: 'via',
    note: 'Passe par Apple Santé ou Health Connect.',
  },
];

export default function DevicesScreen() {
  const t = useTheme();
  const { connections, setConnection, connectStrava, syncing, refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const connect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await connectStrava();
      setMessage(
        {
          connected: 'Strava est connecté. Tes courses des 30 derniers jours ont été importées et vérifiées.',
          cancelled: 'Connexion annulée.',
          denied: 'Tu as refusé l’accès sur Strava.',
          missing_scope: 'Coche bien « Voir les données de mes activités » sur la page Strava.',
          already_linked: 'Ce compte Strava est déjà relié à un autre compte Foulée.',
        }[r] ?? 'La connexion a échoué. Réessaie dans un instant.',
      );
    } catch {
      setMessage('La connexion a échoué. Vérifie ta connexion internet.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <View style={{ gap: 4 }}>
        <Txt variant="hero">Montres & apps</Txt>
        <Txt muted>Tes séances arrivent toutes seules, sont vérifiées, puis transformées en points et en XP.</Txt>
      </View>

      {isDemo && (
        <GradientCard colors={Gradients.energy}>
          <Row>
            <Ionicons name="flask" size={18} color="#fff" />
            <Txt variant="label" color="#fff">
              Mode démo
            </Txt>
          </Row>
          <Txt color="#fff">Les interrupteurs simulent une connexion. Configure le serveur pour connecter ton vrai compte Strava.</Txt>
        </GradientCard>
      )}
      {message && (
        <Card>
          <Txt>{message}</Txt>
        </Card>
      )}

      {SOURCES.filter((s) => !s.only || s.only === Platform.OS || Platform.OS === 'web').map((s) => {
        const on = s.id !== 'nike' && connections[s.id];
        return (
          <Card key={s.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row style={{ flex: 1 }}>
                <View style={[styles.logo, { backgroundColor: s.color }]}>
                  <Ionicons name={s.icon} size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="title">{s.name}</Txt>
                  {on ? <Chip tone="ok" icon="checkmark-circle" label="Connecté" /> : null}
                </View>
              </Row>
              {isDemo && s.id !== 'nike' ? (
                <Switch
                  accessibilityLabel={`Connecter ${s.name}`}
                  value={on}
                  onValueChange={(v) => setConnection(s.id as Provider, v)}
                  trackColor={{ true: t.accent, false: t.line }}
                />
              ) : null}
            </Row>
            <Txt variant="caption" muted>
              {s.reads}
            </Txt>
            {s.sends && (
              <Txt variant="caption" muted>
                {s.sends}
              </Txt>
            )}
            {!isDemo && s.id === 'strava' && !on && <Button icon="link" label={busy ? 'Connexion…' : 'Connecter Strava'} disabled={busy} onPress={connect} />}
            {!isDemo && s.id !== 'strava' && !on && (
              <Row>
                <Ionicons name="information-circle" size={16} color={t.textSecondary} />
                <Txt variant="caption" muted style={{ flex: 1 }}>
                  {s.note}
                </Txt>
              </Row>
            )}
          </Card>
        );
      })}

      {!isDemo && <Button kind="secondary" icon="sync" label={syncing ? 'Synchronisation…' : 'Synchroniser maintenant'} disabled={syncing} onPress={refresh} />}

      <Card>
        <Row>
          <Ionicons name="shield-checkmark" size={20} color={t.ok} />
          <Txt variant="title">Séances vérifiées</Txt>
        </Row>
        <Txt variant="caption" muted>
          Seules les activités enregistrées par un capteur rapportent des points. Chaque trace est contrôlée sur le serveur : vitesse et
          accélérations possibles à pied, cohérence entre cadence et vitesse, fréquence cardiaque, positions GPS simulées, trace déjà
          envoyée, distance déclarée. Une même sortie reçue par deux apps n’est comptée qu’une fois.
        </Txt>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  logo: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
