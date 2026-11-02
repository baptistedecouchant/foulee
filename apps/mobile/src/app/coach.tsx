import { LinearGradient } from 'expo-linear-gradient';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, type ScrollViewInstance } from 'react-native';
import { COACH_SYSTEM_PROMPT } from '@foulee/core';

import { Button, Card, Chip, Ionicons, Row, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { goalTitle } from '@/lib/labels';
import { useStore, type Enrichment } from '@/lib/store';
import { callFunction, isDemo } from '@/lib/supabase';

type Msg = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'Comment se passe ma préparation ?',
  'Que manger avant ma sortie longue ?',
  "J'ai raté ma séance, je fais quoi ?",
  "J'ai mal au tibia depuis deux jours",
];

export default function CoachScreen() {
  const t = useTheme();
  const { plans, stats, setEnrichment } = useStore();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
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

  const enrich = async (planId: string) => {
    setBusy(planId);
    setError(null);
    try {
      setEnrichment(planId, await callFunction<Enrichment>('coach', { action: 'enrich', planId }));
    } catch {
      setError('La personnalisation a échoué. Réessaie dans un instant.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroll} contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic">
        <GradientCard colors={Gradients.energy}>
          <Row>
            <View style={styles.avatar}>
              <Ionicons name="sparkles" size={26} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="display" color="#fff">
                Coach IA
              </Txt>
              <Txt color="rgba(255,255,255,0.85)">Il connaît tout ton historique de séances.</Txt>
            </View>
          </Row>
          <Row style={{ flexWrap: 'wrap' }}>
            <Chip tone="glass" icon="checkmark-done" label={`${stats.sessionsDone} séances`} />
            <Chip tone="glass" icon="flame" label={`série de ${stats.streak}`} />
            <Chip tone="glass" icon="map" label={`${stats.distanceKm.toFixed(0)} km`} />
          </Row>
        </GradientCard>

        {isDemo ? (
          <Card>
            <Txt variant="title">Le coach s’active avec le serveur</Txt>
            <Txt muted>
              En mode démo, l’app tourne sans serveur. Une fois Supabase configuré, le coach (Claude) répond ici en s’appuyant sur toutes tes
              séances : régularité, allures, séances manquées, progression. La clé d’API reste sur le serveur, jamais dans l’app.
            </Txt>
          </Card>
        ) : (
          plans
            .filter((p) => !p.enrichment)
            .map((p) => (
              <Card key={p.id}>
                <Txt variant="title">Personnaliser « {goalTitle(p.plan)} »</Txt>
                <Txt muted>Un conseil et un repère nutrition pour chaque séance. Compte 30 à 60 secondes.</Txt>
                <Button icon="sparkles" label={busy === p.id ? 'Le coach prépare ton plan…' : 'Personnaliser'} disabled={!!busy} onPress={() => enrich(p.id)} />
              </Card>
            ))
        )}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <LinearGradient key={i} colors={Gradients.energy} style={[styles.bubble, { alignSelf: 'flex-end' }]}>
              <Txt color="#fff">{m.content}</Txt>
            </LinearGradient>
          ) : (
            <View key={i} style={[styles.bubble, { alignSelf: 'flex-start', backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth }]}>
              <Txt>{m.content}</Txt>
            </View>
          ),
        )}
        {busy === 'chat' && (
          <Row>
            <Ionicons name="ellipsis-horizontal" size={20} color={t.textSecondary} />
            <Txt muted>Le coach relit tes séances…</Txt>
          </Row>
        )}
        {error && <Txt color={t.bad}>{error}</Txt>}

        {!isDemo && messages.length === 0 && (
          <View style={{ gap: Spacing.s }}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => send(s)} style={[styles.suggestion, { borderColor: t.accent, backgroundColor: t.accentSoft }]} accessibilityRole="button">
                <Txt color={t.accent} style={{ fontWeight: '700' }}>
                  {s}
                </Txt>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable onPress={() => setShowPrompt(!showPrompt)} accessibilityRole="button" accessibilityState={{ expanded: showPrompt }}>
          <Txt variant="caption" color={t.accent} style={{ fontWeight: '700' }}>
            {showPrompt ? 'Masquer les consignes du coach' : 'Voir les consignes données au coach'}
          </Txt>
        </Pressable>
        {showPrompt && (
          <Card>
            <Txt variant="caption">{COACH_SYSTEM_PROMPT}</Txt>
          </Card>
        )}
      </ScrollView>

      {!isDemo && (
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
          <Button small icon="arrow-up" label="" onPress={() => send(draft)} disabled={!draft.trim() || !!busy} />
        </Row>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.m, paddingBottom: Spacing.xl },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '86%', borderRadius: Radius.m, padding: Spacing.m },
  suggestion: { borderWidth: 1.5, borderRadius: Radius.m, padding: Spacing.m },
  composer: { padding: Spacing.m, paddingBottom: Spacing.xl, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, borderWidth: 1, borderRadius: Radius.m, paddingHorizontal: Spacing.m, paddingVertical: 10, maxHeight: 120, fontSize: 16 },
});
