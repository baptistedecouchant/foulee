import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { CHALLENGES } from '@foulee/core';

import { Avatar, ChallengeCard } from '@/components/social';
import { Button, Card, Chip, Ionicons, Row, SectionTitle, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import { useSocial } from '@/lib/social';
import { isDemo } from '@/lib/supabase';

const km = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} km`;

export default function HubScreen() {
  const t = useTheme();
  const top = useTopInset();
  const social = useSocial();
  const o = social.overview;
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!o) {
    return (
      <View style={{ flex: 1, backgroundColor: t.background, padding: Spacing.l, paddingTop: Spacing.l + top + 60 }}>
        <Txt muted>{social.loading ? 'Chargement du Hub…' : 'Le Hub n’a pas pu se charger. Vérifie ta connexion.'}</Txt>
        {!social.loading && <Button kind="secondary" label="Réessayer" onPress={social.refresh} />}
      </View>
    );
  }

  const invites = o.challenges.filter((c) => c.myStatus === 'invited' && !c.finished);
  const active = o.challenges.filter((c) => c.myStatus === 'accepted' && !c.finished);
  const ranking = [...o.friends, { id: o.me.id, name: o.me.name ?? 'Toi', km7: o.me.km7, me: true }]
    .map((p) => ({ ...p, me: 'me' in p }))
    .sort((a, b) => b.km7 - a.km7);

  return (
    <ScrollView
      style={{ backgroundColor: t.background }}
      contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={isDemo ? undefined : <RefreshControl refreshing={social.loading} onRefresh={social.refresh} />}>
      <View style={{ gap: 4 }}>
        <Txt variant="hero">Hub</Txt>
        <Txt muted>Tes partenaires de course, vos défis et vos messages.</Txt>
      </View>

      {isDemo && (
        <Chip tone="accent" icon="flask" label="Mode démo : Léa, Karim, Sophie et Thomas sont des joueurs fictifs" />
      )}

      {/* ---------- Mon profil ---------- */}
      <GradientCard colors={Gradients.night}>
        {o.me.name ? (
          <Row style={{ gap: Spacing.m }}>
            <Avatar name={o.me.name} color="#3A4BFF" size={52} />
            <View style={{ flex: 1 }}>
              <Txt variant="title" color="#fff">
                {o.me.name}
              </Txt>
              <Txt variant="caption" color="rgba(255,255,255,0.75)">
                {km(o.me.km7)} cette semaine · {km(o.me.km30)} ce mois-ci
              </Txt>
            </View>
          </Row>
        ) : (
          <View style={{ gap: Spacing.s }}>
            <Txt variant="title" color="#fff">
              Choisis ton pseudo
            </Txt>
            <Txt variant="caption" color="rgba(255,255,255,0.75)">
              C’est le nom que verront tes amis.
            </Txt>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex. Baptiste"
              placeholderTextColor="rgba(255,255,255,0.5)"
              maxLength={24}
              style={[styles.input, { color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }]}
            />
            <Button kind="gold" small label="Valider" disabled={name.trim().length < 2} onPress={() => social.setProfile(name.trim())} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copier mon code ami"
          onPress={async () => {
            if (!o.me.friendCode) return;
            await Clipboard.setStringAsync(o.me.friendCode).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          style={styles.codeBox}>
          <View>
            <Txt variant="label" color="rgba(255,255,255,0.7)">
              Mon code ami
            </Txt>
            <Txt variant="display" color="#fff">
              {o.me.friendCode ?? '…'}
            </Txt>
          </View>
          <Chip tone="glass" icon={copied ? 'checkmark' : 'copy'} label={copied ? 'Copié' : 'Copier'} />
        </Pressable>
      </GradientCard>

      {/* ---------- Ajouter un ami ---------- */}
      <Card>
        <Txt style={{ fontWeight: '800' }}>Ajouter un partenaire</Txt>
        <Row>
          <TextInput
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            placeholder="Son code ami"
            placeholderTextColor={t.textSecondary}
            autoCapitalize="characters"
            maxLength={10}
            style={[styles.input, { flex: 1, minWidth: 0, color: t.text, borderColor: t.line, backgroundColor: t.surfaceAlt }]}
          />
          <Button
            small
            icon="person-add"
            label="Ajouter"
            disabled={code.trim().length < 4}
            onPress={async () => {
              const r = await social.addFriend(code);
              setMsg(r === 'accepted' ? 'Vous êtes maintenant partenaires !' : r === 'pending' ? 'Demande envoyée.' : 'Code introuvable.');
              if (r !== 'not_found') setCode('');
            }}
          />
        </Row>
        {msg && <Txt variant="caption" color={t.accent}>{msg}</Txt>}
      </Card>

      {/* ---------- Demandes reçues ---------- */}
      {o.incoming.map((p) => (
        <Card key={p.id}>
          <Row>
            <Avatar name={p.name} color="#14A3C7" />
            <Txt style={{ flex: 1, fontWeight: '700' }}>{p.name} veut courir avec toi</Txt>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" small label="Ignorer" onPress={() => social.respondFriend(p.id, false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button small icon="checkmark" label="Accepter" onPress={() => social.respondFriend(p.id, true)} />
            </View>
          </Row>
        </Card>
      ))}

      {/* ---------- Défis ---------- */}
      <SectionTitle action={o.friends.length ? <Button kind="ghost" small icon="add" label="Lancer un défi" onPress={() => router.push('/challenge/new')} /> : undefined}>
        Défis
      </SectionTitle>
      {invites.map((c) => (
        <ChallengeCard key={c.id} c={c} onRespond={(a) => social.respondChallenge(c.id, a)} />
      ))}
      {active.map((c) => (
        <ChallengeCard key={c.id} c={c} />
      ))}
      {!invites.length && !active.length && (
        <Card>
          <Txt muted>Aucun défi en cours. {o.friends.length ? `${CHALLENGES.length} défis t’attendent : lance-en un à un partenaire !` : 'Ajoute un partenaire pour vous défier.'}</Txt>
        </Card>
      )}

      {/* ---------- Classement de la semaine ---------- */}
      {o.friends.length > 0 && (
        <>
          <SectionTitle>Classement de la semaine</SectionTitle>
          <Card>
            {ranking.map((p, i) => (
              <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                <Row>
                  <Txt variant="number" muted style={{ width: 22 }}>
                    {i + 1}
                  </Txt>
                  <Txt style={{ fontWeight: p.me ? '900' : '600' }} color={p.me ? t.accent : t.text}>
                    {p.me ? 'Toi' : p.name}
                  </Txt>
                  {i === 0 && <Ionicons name="trophy" size={14} color={t.gold} />}
                </Row>
                <Txt variant="number">{km(p.km7)}</Txt>
              </Row>
            ))}
          </Card>
        </>
      )}

      {/* ---------- Partenaires ---------- */}
      <SectionTitle>Partenaires</SectionTitle>
      {o.friends.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[id]', params: { id: p.id } })}>
          {({ pressed }) => (
            <Card style={{ transform: [{ scale: pressed ? 0.98 : 1 }] }}>
              <Row style={{ gap: Spacing.m }}>
                <Avatar name={p.name} color={p.color} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={{ fontWeight: '800' }}>{p.name}</Txt>
                  <Txt variant="caption" muted>
                    {p.city ? `${p.city} · ` : ''}
                    {km(p.km7)} / 7 j · {km(p.km30)} / 30 j
                  </Txt>
                  {p.challenges.length > 0 && (
                    <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
                      {p.challenges.map((id) => (
                        <Chip key={id} tone="flame" icon="flash" label={CHALLENGES.find((c) => c.id === id)?.title ?? id} />
                      ))}
                    </Row>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textSecondary} />
              </Row>
            </Card>
          )}
        </Pressable>
      ))}
      {!o.friends.length && (
        <Card>
          <Txt muted>Partage ton code ami avec tes partenaires de course pour vous retrouver ici.</Txt>
        </Card>
      )}

      {/* ---------- Messages ---------- */}
      {o.conversations.length > 0 && (
        <>
          <SectionTitle>Messages</SectionTitle>
          <Card style={{ gap: 0, paddingVertical: Spacing.s }}>
            {o.conversations.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id, name: c.with?.name ?? '' } })}
                style={[styles.conv, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
                <Avatar name={c.with?.name ?? '?'} color={social.player(c.with?.id ?? '')?.color ?? t.accent} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={{ fontWeight: c.unread ? '900' : '700' }}>{c.with?.name ?? 'Conversation'}</Txt>
                  <Txt variant="caption" muted numberOfLines={1}>
                    {c.last?.body ?? 'Nouvelle conversation'}
                  </Txt>
                </View>
                {c.unread > 0 && (
                  <View style={[styles.unread, { backgroundColor: t.flame }]}>
                    <Txt variant="caption" color="#fff" style={{ fontWeight: '900' }}>
                      {c.unread}
                    </Txt>
                  </View>
                )}
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  input: { borderWidth: 1, borderRadius: Radius.s, paddingHorizontal: Spacing.m, minHeight: 44, fontSize: 16 },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.m,
    padding: Spacing.m,
  },
  conv: { flexDirection: 'row', alignItems: 'center', gap: Spacing.m, paddingVertical: Spacing.m },
  unread: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
});
