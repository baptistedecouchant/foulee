import { StyleSheet, Text, View } from 'react-native';
import { CHALLENGES, unitOf, type HubChallenge } from '@foulee/core';

import { Button, Card, Chip, Ionicons, ProgressBar, Row, Txt } from '@/components/ui';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <Text style={{ color: '#fff', fontWeight: '900', fontSize: size * 0.42 }}>{(name || '?').slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const fmt = (n: number) => String(n).replace('.', ',');

/** Carte de défi : classement en barres, temps restant, réponse à une invitation. */
export function ChallengeCard({ c, onRespond }: { c: HubChallenge; onRespond?: (accept: boolean) => void }) {
  const t = useTheme();
  const tpl = CHALLENGES.find((x) => x.id === c.templateId);
  if (!tpl) return null;
  const unit = unitOf(tpl);
  const daysLeft = Math.max(0, Math.ceil((new Date(c.endsAt).getTime() - Date.now()) / 86_400_000));
  const max = Math.max(tpl.target ?? 0, ...c.standings.map((s) => s.value), 1);
  const leader = c.standings[0];
  const me = c.standings.find((s) => s.me);

  return (
    <Card style={c.myStatus === 'invited' ? { borderColor: t.flame, borderWidth: 2 } : undefined}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Row style={{ flex: 1 }}>
          <View style={[styles.icon, { backgroundColor: t.flameSoft }]}>
            <Ionicons name={tpl.icon} size={20} color={t.flame} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={{ fontWeight: '800' }}>{tpl.title}</Txt>
            <Txt variant="caption" muted numberOfLines={2}>
              {tpl.description}
            </Txt>
          </View>
        </Row>
        <Chip tone={c.finished ? 'neutral' : 'flame'} icon="time" label={c.finished ? 'Terminé' : `${daysLeft} j`} />
      </Row>

      {c.myStatus === 'invited' ? (
        <>
          <Txt>
            <Txt style={{ fontWeight: '800' }}>{c.createdBy.name}</Txt> te lance ce défi. À gagner : {tpl.xpReward} XP.
          </Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Button kind="secondary" small label="Refuser" onPress={() => onRespond?.(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button kind="flame" small icon="flash" label="Relever le défi" onPress={() => onRespond?.(true)} />
            </View>
          </Row>
        </>
      ) : (
        <View style={{ gap: 10 }}>
          {c.standings.map((s) => (
            <View key={s.userId} style={{ gap: 4 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row>
                  <Txt variant="number" muted>
                    {s.rank}.
                  </Txt>
                  <Txt style={{ fontWeight: s.me ? '900' : '600' }} color={s.me ? t.accent : t.text}>
                    {s.name}
                  </Txt>
                  {s.rank === 1 && s.value > 0 && <Ionicons name="trophy" size={14} color={t.gold} />}
                  {s.done && <Ionicons name="checkmark-circle" size={14} color={t.ok} />}
                </Row>
                <Txt variant="number">
                  {fmt(s.value)} {unit}
                </Txt>
              </Row>
              <ProgressBar value={s.value / max} height={8} colors={s.me ? Gradients.energy : Gradients.flame} />
            </View>
          ))}
          {tpl.target ? (
            <Txt variant="caption" muted>
              Objectif : {tpl.target} {unit}
            </Txt>
          ) : null}
          {me && leader && !c.finished && (
            <Txt variant="caption" style={{ fontWeight: '700' }} color={me.rank === 1 ? t.ok : t.flame}>
              {me.rank === 1 ? 'Tu es en tête, garde le rythme !' : `Il te manque ${fmt(Math.round((leader.value - me.value) * 10) / 10)} ${unit} pour passer en tête.`}
            </Txt>
          )}
          {c.invited.length > 0 && (
            <Txt variant="caption" muted>
              En attente : {c.invited.map((i) => i.name).join(', ')}
            </Txt>
          )}
        </View>
      )}
    </Card>
  );
}

export const runInviteText = (p: { date?: string; time?: string; place?: string; distanceKm?: number }) =>
  `${p.date ?? ''} à ${p.time ?? ''} · ${p.place ?? ''}${p.distanceKm ? ` · ${p.distanceKm} km` : ''}`;

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.xs },
});
