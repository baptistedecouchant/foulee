import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import type { HubMessage } from '@foulee/core';

import { runInviteText } from '@/components/social';
import { Button, Card, Chip, Ionicons, Row, Txt } from '@/components/ui';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useConversation, useSocial } from '@/lib/social';

const DAYS = ['Aujourd’hui', 'Demain', 'Samedi', 'Dimanche'];

export default function ChatScreen() {
  const t = useTheme();
  const { id, name, invite } = useLocalSearchParams<{ id: string; name?: string; invite?: string }>();
  const social = useSocial();
  const { messages, myId, send } = useConversation(id);
  const [draft, setDraft] = useState('');
  const [showInvite, setShowInvite] = useState(invite === '1');
  const [day, setDay] = useState(DAYS[2]);
  const [time, setTime] = useState('09:30');
  const [place, setPlace] = useState('');
  const [distance, setDistance] = useState('10');
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    social.markRead(id);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
  }, [id, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const post = async (m: { kind: HubMessage['kind']; body: string; payload?: HubMessage['payload'] }) => {
    setError(null);
    try {
      await send(m);
    } catch {
      setError('Message non envoyé. Réessaie dans un instant.');
    }
  };

  const answered = (inviteId: string) => messages.some((m) => m.kind === 'run_reply' && m.payload?.inviteId === inviteId && m.senderId === myId);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: name || 'Messages' }} />
      <ScrollView ref={scroll} contentContainerStyle={styles.page}>
        {messages.length === 0 && <Txt muted style={{ textAlign: 'center' }}>Dis bonjour ou propose une sortie ensemble !</Txt>}
        {messages.map((m) => {
          const mine = m.senderId === myId;
          if (m.kind === 'run_invite') {
            return (
              <Card key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: '86%', borderColor: t.gold, borderWidth: 2 }}>
                <Row>
                  <Ionicons name="walk" size={20} color={t.goldDark} />
                  <Txt variant="label" color={t.goldDark}>
                    Invitation à courir
                  </Txt>
                </Row>
                <Txt style={{ fontWeight: '800' }}>{m.body}</Txt>
                <Txt>{runInviteText(m.payload ?? {})}</Txt>
                {!mine && !answered(m.id) && (
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Button kind="secondary" small label="Pas dispo" onPress={() => post({ kind: 'run_reply', body: 'Pas dispo cette fois', payload: { answer: 'no', inviteId: m.id } })} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button kind="gold" small icon="checkmark" label="Je viens" onPress={() => post({ kind: 'run_reply', body: 'Je viens !', payload: { answer: 'yes', inviteId: m.id } })} />
                    </View>
                  </Row>
                )}
              </Card>
            );
          }
          if (m.kind === 'run_reply') {
            return (
              <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                <Chip tone={m.payload?.answer === 'yes' ? 'ok' : 'neutral'} icon={m.payload?.answer === 'yes' ? 'checkmark-circle' : 'close-circle'} label={m.body} />
              </View>
            );
          }
          return mine ? (
            <LinearGradient key={m.id} colors={Gradients.energy} style={[styles.bubble, { alignSelf: 'flex-end' }]}>
              <Txt color="#fff">{m.body}</Txt>
            </LinearGradient>
          ) : (
            <View key={m.id} style={[styles.bubble, { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth }]}>
              <Txt>{m.body}</Txt>
            </View>
          );
        })}
        {error && <Txt color={t.bad}>{error}</Txt>}
      </ScrollView>

      {showInvite ? (
        <View style={[styles.inviteForm, { backgroundColor: t.surface, borderTopColor: t.line }]}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt variant="title">Proposer un run</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => setShowInvite(false)}>
              <Ionicons name="close" size={22} color={t.textSecondary} />
            </Pressable>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            {DAYS.map((d) => (
              <Pressable key={d} onPress={() => setDay(d)} style={[styles.choice, { borderColor: day === d ? t.accent : t.line, backgroundColor: day === d ? t.accent : 'transparent' }]}>
                <Txt variant="caption" style={{ fontWeight: '700' }} color={day === d ? '#fff' : t.text}>
                  {d}
                </Txt>
              </Pressable>
            ))}
          </Row>
          <Row>
            <TextInput value={time} onChangeText={setTime} placeholder="09:30" placeholderTextColor={t.textSecondary} style={[styles.input, { width: 90, color: t.text, borderColor: t.line }]} />
            <TextInput
              value={distance}
              onChangeText={setDistance}
              keyboardType="decimal-pad"
              placeholder="km"
              placeholderTextColor={t.textSecondary}
              style={[styles.input, { width: 70, color: t.text, borderColor: t.line }]}
            />
            <Txt muted>km</Txt>
          </Row>
          <TextInput value={place} onChangeText={setPlace} placeholder="Lieu de rendez-vous" placeholderTextColor={t.textSecondary} style={[styles.input, { color: t.text, borderColor: t.line }]} />
          <Button
            kind="gold"
            icon="send"
            label="Envoyer l’invitation"
            disabled={!place.trim() || !/^\d{1,2}[:h]\d{2}$/.test(time.trim())}
            onPress={() => {
              post({
                kind: 'run_invite',
                body: 'On court ensemble ?',
                payload: { date: day, time: time.trim().replace('h', ':'), place: place.trim().slice(0, 120), distanceKm: Number(distance.replace(',', '.')) || undefined },
              });
              setShowInvite(false);
            }}
          />
        </View>
      ) : (
        <Row style={[styles.composer, { borderTopColor: t.line, backgroundColor: t.surface }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Proposer un run" onPress={() => setShowInvite(true)} style={[styles.roundBtn, { backgroundColor: t.gold }]}>
            <Ionicons name="walk" size={22} color={t.goldText} />
          </Pressable>
          <TextInput
            accessibilityLabel="Message"
            value={draft}
            onChangeText={setDraft}
            placeholder="Écris un message"
            placeholderTextColor={t.textSecondary}
            style={[styles.input, { flex: 1, color: t.text, borderColor: t.line, backgroundColor: t.background }]}
            multiline
            maxLength={1000}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Envoyer"
            disabled={!draft.trim()}
            onPress={() => {
              post({ kind: 'text', body: draft.trim() });
              setDraft('');
            }}
            style={[styles.roundBtn, { backgroundColor: draft.trim() ? t.accent : t.line }]}>
            <Ionicons name="arrow-up" size={22} color="#fff" />
          </Pressable>
        </Row>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.m, paddingBottom: Spacing.xl },
  bubble: { maxWidth: '82%', borderRadius: Radius.m, padding: Spacing.m },
  composer: { padding: Spacing.m, paddingBottom: Spacing.l, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'flex-end' },
  inviteForm: { padding: Spacing.l, gap: Spacing.m, borderTopWidth: StyleSheet.hairlineWidth },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, paddingVertical: 10, fontSize: 16, maxHeight: 120 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
