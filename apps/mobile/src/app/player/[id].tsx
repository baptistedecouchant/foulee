import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Avatar, ChallengeCard } from '@/components/social';
import { Button, Card, Row, SectionTitle, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSocial } from '@/lib/social';

const km = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export default function PlayerScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const social = useSocial();
  const p = social.player(id);
  const [menu, setMenu] = useState<null | 'report' | 'block' | 'remove'>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState<string | null>(null);

  if (!p) {
    return (
      <View style={{ flex: 1, padding: Spacing.l, backgroundColor: t.background }}>
        <Txt>{done ?? 'Ce joueur ne fait plus partie de tes partenaires.'}</Txt>
      </View>
    );
  }

  const shared = social.overview?.challenges.filter((c) => !c.finished && c.standings.some((s) => s.userId === p.id)) ?? [];
  const openChat = async (invite?: boolean) => {
    const conv = await social.openConversation(p.id);
    router.push({ pathname: '/chat/[id]', params: { id: conv, name: p.name, invite: invite ? '1' : '' } });
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: p.name }} />
      <GradientCard colors={Gradients.night}>
        <Row style={{ gap: Spacing.m }}>
          <Avatar name={p.name} color={p.color} size={64} />
          <View style={{ flex: 1 }}>
            <Txt variant="display" color="#fff">
              {p.name}
            </Txt>
            {p.city && <Txt color="rgba(255,255,255,0.75)">{p.city}</Txt>}
          </View>
        </Row>
        <Row style={{ justifyContent: 'space-between' }}>
          <Stat label="7 derniers jours" value={`${km(p.km7)} km`} />
          <Stat label="30 derniers jours" value={`${km(p.km30)} km`} />
          <Stat label="Sorties (30 j)" value={String(p.runs30)} />
        </Row>
      </GradientCard>

      <Row>
        <View style={{ flex: 1 }}>
          <Button icon="chatbubble" label="Message" onPress={() => openChat()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button kind="gold" icon="walk" label="Courir ensemble" onPress={() => openChat(true)} />
        </View>
      </Row>
      <Button kind="flame" icon="flash" label={`Défier ${p.name}`} onPress={() => router.push({ pathname: '/challenge/new', params: { with: p.id } })} />

      {shared.length > 0 && (
        <>
          <SectionTitle>Vos défis en cours</SectionTitle>
          {shared.map((c) => (
            <ChallengeCard key={c.id} c={c} onRespond={(a) => social.respondChallenge(c.id, a)} />
          ))}
        </>
      )}

      {/* Sécurité : retirer, bloquer, signaler */}
      {menu ? (
        <Card>
          <Txt style={{ fontWeight: '800' }}>
            {menu === 'remove' ? `Retirer ${p.name} de tes partenaires ?` : menu === 'block' ? `Bloquer ${p.name} ?` : `Signaler ${p.name}`}
          </Txt>
          {menu === 'block' && <Txt muted>Il ne pourra plus te contacter ni voir tes statistiques.</Txt>}
          {menu === 'report' && (
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Que s’est-il passé ?"
              placeholderTextColor={t.textSecondary}
              multiline
              maxLength={500}
              style={[styles.input, { color: t.text, borderColor: t.line }]}
            />
          )}
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" label="Annuler" onPress={() => setMenu(null)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                kind="flame"
                label="Confirmer"
                disabled={menu === 'report' && reason.trim().length < 3}
                onPress={async () => {
                  if (menu === 'remove') await social.removeFriend(p.id);
                  if (menu === 'block') await social.block(p.id);
                  if (menu === 'report') {
                    await social.report(p.id, reason.trim());
                    setDone('Merci, ton signalement a été envoyé à l’équipe Foulée.');
                    setMenu(null);
                    return;
                  }
                  router.back();
                }}
              />
            </View>
          </Row>
        </Card>
      ) : (
        <Row style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button kind="ghost" small label="Retirer" onPress={() => setMenu('remove')} />
          <Button kind="ghost" small label="Bloquer" onPress={() => setMenu('block')} />
          <Button kind="ghost" small label="Signaler" onPress={() => setMenu('report')} />
        </Row>
      )}
      {done && <Txt color={t.ok}>{done}</Txt>}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Txt variant="title" color="#fff">
        {value}
      </Txt>
      <Txt variant="caption" color="rgba(255,255,255,0.7)">
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 60 },
  input: { borderWidth: 1, borderRadius: Radius.s, padding: Spacing.m, minHeight: 80, fontSize: 15 },
});
