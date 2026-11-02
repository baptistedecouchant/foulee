import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { COACH_SYSTEM_PROMPT } from '@foulee/core';

import { Button, Card, Row, Txt } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore, type Enrichment } from '@/lib/store';
import { callFunction, isDemo } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Que manger avant ma sortie longue ?',
  "J'ai raté ma séance de mardi, je fais quoi ?",
  "J'ai mal au tibia depuis deux jours",
];

export default function CoachScreen() {
  const t = useTheme();
  const { plan, enrichment, setEnrichment } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'chat' | 'enrich' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    const next: Msg[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    setBusy('chat');
    setError(null);
    try {
      const { reply } = await callFunction<{ reply: string }>('coach', { action: 'chat', messages: next.slice(-20) });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch {
      setError('Le coach n’a pas pu répondre. Réessaie dans un instant.');
    } finally {
      setBusy(null);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const enrich = async () => {
    setBusy('enrich');
    setError(null);
    try {
      setEnrichment(await callFunction<Enrichment>('coach', { action: 'enrich' }));
    } catch {
      setError('La personnalisation a échoué. Réessaie dans un instant.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={styles.page}>
        {isDemo ? (
          <Card>
            <Txt variant="title">Le coach IA arrive avec le serveur</Txt>
            <Txt muted>
              En mode démo, l’app tourne sans backend. Une fois Supabase configuré, le coach (Claude) répond ici et personnalise chaque
              séance. La clé d’API reste sur le serveur, jamais dans l’app.
            </Txt>
          </Card>
        ) : !plan ? (
          <Card>
            <Txt muted>Crée d’abord ton plan dans l’onglet Plan : le coach s’appuie dessus pour te répondre.</Txt>
          </Card>
        ) : (
          !enrichment && (
            <Card>
              <Txt variant="title">Personnaliser mon plan</Txt>
              <Txt muted>Un conseil et un repère nutrition pour chaque séance. Compte 30 à 60 secondes.</Txt>
              <Button label={busy === 'enrich' ? 'Le coach prépare ton plan…' : 'Personnaliser'} disabled={!!busy} onPress={enrich} />
            </Card>
          )
        )}

        {messages.map((m, i) => (
          <View
            key={i}
            style={[
              styles.bubble,
              m.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: t.accent }
                : { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth },
            ]}>
            <Txt color={m.role === 'user' ? t.accentText : t.text}>{m.content}</Txt>
          </View>
        ))}
        {busy === 'chat' && <Txt muted>Le coach réfléchit…</Txt>}
        {error && <Txt color={t.bad}>{error}</Txt>}

        {!isDemo && plan && messages.length === 0 && (
          <View style={{ gap: Spacing.s }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={[styles.suggestion, { borderColor: t.line }]} accessibilityRole="button">
                <Txt color={t.accent}>{s}</Txt>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable onPress={() => setShowPrompt(!showPrompt)} accessibilityRole="button" accessibilityState={{ expanded: showPrompt }}>
          <Txt variant="caption" color={t.accent} style={{ fontWeight: '600' }}>
            {showPrompt ? 'Masquer les consignes du coach' : 'Voir les consignes données au coach'}
          </Txt>
        </Pressable>
        {showPrompt && (
          <Card>
            <Txt variant="caption">{COACH_SYSTEM_PROMPT}</Txt>
          </Card>
        )}
      </ScrollView>

      {!isDemo && plan && (
        <Row style={[styles.composer, { borderTopColor: t.line, backgroundColor: t.surface }]}>
          <TextInput
            accessibilityLabel="Message au coach"
            value={draft}
            onChangeText={setDraft}
            placeholder="Pose ta question au coach"
            placeholderTextColor={t.textSecondary}
            style={[styles.input, { color: t.text, borderColor: t.line, backgroundColor: t.background }]}
            multiline
            maxLength={2000}
          />
          <Button label="Envoyer" onPress={() => send(draft)} disabled={!draft.trim() || !!busy} />
        </Row>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.m, paddingBottom: Spacing.xxl },
  bubble: { maxWidth: '85%', borderRadius: Radius.m, padding: Spacing.m },
  suggestion: { borderWidth: 1, borderRadius: Radius.s, padding: Spacing.m },
  composer: { padding: Spacing.m, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, paddingVertical: 10, maxHeight: 120, fontSize: 16 },
});
