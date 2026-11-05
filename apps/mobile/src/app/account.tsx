import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, View, type ScrollViewInstance } from 'react-native';

import { Button, Card, Chip, Ionicons, Row, Txt } from '@/components/ui';
import { AvatarEditor } from '@/components/avatar-editor';
import { GradientCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ageOf, setShareGoals, signOut } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { isDemo } from '@/lib/supabase';

const PROVIDER_LABEL: Record<string, { label: string; icon: 'logo-apple' | 'logo-google' | 'mail' }> = {
  apple: { label: 'Apple', icon: 'logo-apple' },
  google: { label: 'Google', icon: 'logo-google' },
  email: { label: 'E-mail', icon: 'mail' },
};

export default function AccountScreen() {
  const t = useTheme();
  const { profile, reload } = useSession();
  const [confirm, setConfirm] = useState(false);
  // La confirmation s'ouvre en bas de l'écran : on fait défiler pour qu'elle soit entièrement visible.
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (confirm) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, [confirm]);
  const [share, setShare] = useState<boolean | null>(null);

  if (isDemo || !profile) {
    return (
      <ScrollView ref={scrollRef} style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
        <Card>
          <Txt variant="title">Mode démo</Txt>
          <Txt muted>Les comptes sont disponibles quand l’app est reliée au serveur.</Txt>
        </Card>
      </ScrollView>
    );
  }

  const [y, m, d] = (profile.birthDate ?? '').split('-');
  return (
    <ScrollView ref={scrollRef} style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <GradientCard colors={['#6A2BD9', '#C2338C'] as const}>
        <Row>
          <AvatarEditor name={profile.firstName ?? 'Moi'} size={60} />
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

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt style={{ fontWeight: '600' }}>Partager mes objectifs avec mes amis</Txt>
            <Txt variant="caption" muted>
              Tes amis voient ton objectif, sa date et le nombre de séances faites. Jamais tes données de santé.
            </Txt>
          </View>
          <Switch
            accessibilityLabel="Partager mes objectifs avec mes amis"
            value={share ?? profile.shareGoals}
            onValueChange={(v) => {
              setShare(v);
              setShareGoals(v)
                .then(reload)
                .catch(() => setShare(!v));
            }}
          />
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
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 110 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
