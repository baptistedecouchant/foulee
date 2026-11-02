import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Card, Row, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type Provider } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

const PROVIDERS: Array<{ id: Provider; name: string; reads: string; sends: string; only?: 'ios' | 'android' }> = [
  { id: 'garmin', name: 'Garmin', reads: 'Récupère tes séances avec trace GPS, cardio et cadence.', sends: 'Envoie les séances du plan sur ta montre.' },
  {
    id: 'apple_health',
    name: 'Apple Santé',
    reads: 'Récupère les séances de l’Apple Watch et des apps qui écrivent dans Santé.',
    sends: 'Envoie les séances sur l’Apple Watch.',
    only: 'ios',
  },
  { id: 'health_connect', name: 'Health Connect', reads: 'Récupère les séances des montres Android (Samsung, Pixel…).', sends: 'Pas d’envoi de séance.', only: 'android' },
  {
    id: 'strava',
    name: 'Strava',
    reads: 'Récupère tes activités Strava. Si la même sortie arrive aussi par ta montre, elle n’est comptée qu’une fois.',
    sends: 'Pas d’envoi de séance.',
  },
];

export default function DevicesScreen() {
  const t = useTheme();
  const { connections, setConnection } = useStore();

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      {isDemo && (
        <Card style={{ backgroundColor: t.accentSoft, borderColor: t.accentSoft }}>
          <Txt variant="caption">
            Mode démo : les connexions sont simulées. Dans l’app publiée, chacune passe par l’autorisation officielle de la plateforme.
          </Txt>
        </Card>
      )}

      {PROVIDERS.filter((p) => !p.only || p.only === Platform.OS || Platform.OS === 'web').map((p) => (
        <Card key={p.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="title">{p.name}</Txt>
            <Switch
              accessibilityLabel={`Connecter ${p.name}`}
              value={connections[p.id]}
              onValueChange={(on) => setConnection(p.id, on)}
              trackColor={{ true: t.accent, false: t.line }}
            />
          </Row>
          <View style={{ gap: 4 }}>
            <Txt variant="caption" muted>
              {p.reads}
            </Txt>
            <Txt variant="caption" muted>
              {p.sends}
            </Txt>
          </View>
        </Card>
      ))}

      <Card>
        <Txt variant="title">Comment on vérifie tes séances</Txt>
        <Txt variant="caption" muted>
          Seules les activités enregistrées par un capteur rapportent des points. Chaque trace est contrôlée sur le serveur : vitesse et
          accélérations possibles à pied, cohérence entre cadence et vitesse, fréquence cardiaque, positions GPS simulées, trace déjà
          envoyée, distance déclarée. Les saisies manuelles ne sont jamais récompensées.
        </Txt>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: Spacing.l, paddingBottom: Spacing.xxl },
});
