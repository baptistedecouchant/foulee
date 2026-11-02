import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Ionicons, Row, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ageOf, signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { isDemo } from '@/lib/supabase';

const PROVIDER_LABEL: Record<string, { label: string; icon: 'logo-apple' | 'logo-google' | 'mail' }> = {
  apple: { label: 'Apple', icon: 'logo-apple' },
  google: { label: 'Google', icon: 'logo-google' },
  email: { label: 'E-mail', icon: 'mail' },
};

export default function AccountScreen() {
  const t = useTheme();
  const { profile } = useSession();
  const [confirm, setConfirm] = useState(false);

  if (isDemo || !profile) {
    return (
      <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
        <Card>
          <Txt variant="title">Mode démo</Txt>
          <Txt muted>Les comptes sont disponibles quand l’app est reliée au serveur.</Txt>
        </Card>
      </ScrollView>
    );
  }

  const [y, m, d] = (profile.birthDate ?? '').split('-');
  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <GradientCard colors={Gradients.night}>
        <Row>
          <View style={[styles.avatar, { backgroundColor: t.accent }]}>
            <Txt variant="display" color="#fff">
              {(profile.firstName ?? '?').slice(0, 1).toUpperCase()}
            </Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt variant="title" color="#fff">
              {profile.firstName} {profile.lastName}
            </Txt>
            {profile.email && <Txt color="rgba(255,255,255,0.8)">{profile.email}</Txt>}
          </View>
        </Row>
        <Row style={{ flexWrap: 'wrap' }}>
          {profile.providers.map((p) => (
            <Chip key={p} tone="glass" icon={PROVIDER_LABEL[p]?.icon ?? 'person'} label={PROVIDER_LABEL[p]?.label ?? p} />
          ))}
        </Row>
      </GradientCard>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt muted>Date de naissance</Txt>
          <Txt variant="number">{profile.birthDate ? `${d}/${m}/${y} (${ageOf(profile.birthDate)} ans)` : '—'}</Txt>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt muted>Conditions d’utilisation</Txt>
          <Chip tone={profile.termsAccepted ? 'ok' : 'bad'} icon={profile.termsAccepted ? 'checkmark' : 'close'} label={profile.termsAccepted ? 'Acceptées' : 'Non'} />
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt muted>Données d’activité et de santé</Txt>
          <Chip tone={profile.healthConsent ? 'ok' : 'bad'} icon={profile.healthConsent ? 'checkmark' : 'close'} label={profile.healthConsent ? 'Autorisées' : 'Non'} />
        </Row>
      </Card>

      <Row style={{ alignItems: 'flex-start' }}>
        <Ionicons name="shield-checkmark" size={18} color={t.ok} />
        <Txt variant="caption" muted style={{ flex: 1 }}>
          Tes données de santé ne sont jamais revendues. Elles servent uniquement à valider tes séances. Pour les modifier ou supprimer ton compte, écris à
          l’équipe Foulée.
        </Txt>
      </Row>

      {confirm ? (
        <Card>
          <Txt style={{ fontWeight: '700' }}>Se déconnecter de ce téléphone ?</Txt>
          <Txt muted>Tes données restent sur ton compte. Tu pourras te reconnecter à tout moment.</Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Annuler" onPress={() => setConfirm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="flame" label="Se déconnecter" onPress={() => signOut()} />
            </View>
          </Row>
        </Card>
      ) : (
        <Button kind="ghost" icon="log-out-outline" label="Se déconnecter" onPress={() => setConfirm(true)} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 60 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
