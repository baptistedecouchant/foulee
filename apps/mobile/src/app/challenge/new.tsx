import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { CHALLENGES } from '@foulee/core';

import { Avatar } from '@/components/social';
import { Button, Card, Chip, Ionicons, Row, SectionTitle, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSocial } from '@/lib/social';

export default function NewChallengeScreen() {
  const t = useTheme();
  const { with: preselected } = useLocalSearchParams<{ with?: string }>();
  const social = useSocial();
  const friends = social.overview?.friends ?? [];
  const [template, setTemplate] = useState(CHALLENGES[0].id);
  const [selected, setSelected] = useState<string[]>(preselected ? [preselected] : []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <SectionTitle>1. Choisis le défi</SectionTitle>
      {CHALLENGES.map((c) => {
        const active = c.id === template;
        return (
          <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => setTemplate(c.id)}>
            <Card style={{ borderColor: active ? t.flame : t.line, borderWidth: active ? 2 : StyleSheet.hairlineWidth }}>
              <Row style={{ gap: Spacing.m }}>
                <View style={[styles.icon, { backgroundColor: active ? t.flame : t.flameSoft }]}>
                  <Ionicons name={c.icon} size={22} color={active ? '#fff' : t.flame} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontWeight: '800' }}>{c.title}</Txt>
                  <Txt variant="caption" muted>
                    {c.description} · {c.durationDays} jours
                  </Txt>
                </View>
              </Row>
              <Row>
                <Chip tone="gold" icon="diamond" label={`${c.pointsReward} pts`} />
                <Chip tone="xp" icon="flash" label={`${c.xpReward} XP`} />
              </Row>
            </Card>
          </Pressable>
        );
      })}

      <SectionTitle>2. Avec qui ?</SectionTitle>
      <Card>
        {friends.map((f) => {
          const on = selected.includes(f.id);
          return (
            <Pressable key={f.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(f.id)}>
              <Row style={{ gap: Spacing.m }}>
                <Avatar name={f.name} color={f.color} size={38} />
                <Txt style={{ flex: 1, fontWeight: '700' }}>{f.name}</Txt>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? t.accent : t.textSecondary} />
              </Row>
            </Pressable>
          );
        })}
        {!friends.length && <Txt muted>Ajoute d’abord un partenaire dans le Hub.</Txt>}
      </Card>

      <Txt variant="caption" muted>
        Seules les séances vérifiées par l’anti-triche comptent dans les défis.
      </Txt>
      {error && <Txt color={t.bad}>{error}</Txt>}
      <Button
        kind="flame"
        icon="flash"
        label={saving ? 'Envoi…' : 'Lancer le défi'}
        disabled={!selected.length || saving}
        onPress={async () => {
          setSaving(true);
          setError(null);
          try {
            await social.createChallenge(template, selected);
            router.back();
          } catch {
            setError('Le défi n’a pas pu être créé. Réessaie.');
          } finally {
            setSaving(false);
          }
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 60 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
