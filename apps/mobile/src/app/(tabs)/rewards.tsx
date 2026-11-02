import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BADGES, POINTS, type BadgeTier } from '@foulee/core';

import { Button, Card, Chip, Ionicons, ProgressBar, Row, Segmented, Txt } from '@/components/ui';
import { GradientCard, PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import type { ImageKey } from '@/lib/images';
import { BADGE_ICON, fmtInt } from '@/lib/labels';
import { useStore } from '@/lib/store';

// Catalogue de démonstration : partenaires fictifs. En production il vient de la table `rewards`.
const CATALOG: Array<{ id: string; title: string; partner: string; cost: number; image: ImageKey }> = [
  { id: 'bon-5', title: "Bon d'achat 5 €", partner: 'Boutique running partenaire', cost: 2000, image: 'shoes' },
  { id: 'gels', title: 'Pack de 6 gels énergétiques', partner: 'Marque de nutrition sportive', cost: 2500, image: 'trail' },
  { id: 'dossard', title: '-15 % sur un dossard', partner: 'Organisateur de course', cost: 3000, image: 'cityRace' },
  { id: 'bon-10', title: "Bon d'achat 10 €", partner: 'Enseigne de sport', cost: 4000, image: 'road' },
];

const TIER: Record<BadgeTier, readonly [string, string]> = {
  bronze: ['#E7A36B', '#B5652E'],
  argent: ['#D9E1EE', '#8D9AB3'],
  or: ['#FFD65C', '#FF9F1C'],
};

type Tab = 'boutique' | 'badges' | 'historique';

export default function RewardsScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { balance, ledger, redemptions, redeem, stats } = useStore();
  const [tab, setTab] = useState<Tab>('boutique');
  const [confirm, setConfirm] = useState<string | null>(null);
  const euros = (balance / 1000) * POINTS.eurosPer1000;
  const next = CATALOG.filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  const unlocked = BADGES.filter((b) => b.progress(stats) >= 1).length;

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      <GradientCard colors={Gradients.gold}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label" color={t.goldText}>
            Ton trésor
          </Txt>
          <Ionicons name="diamond" size={26} color={t.goldText} />
        </Row>
        <Txt variant="hero" color={t.goldText} style={{ fontSize: 48 }}>
          {fmtInt(balance)} pts
        </Txt>
        <Txt color={t.goldText}>≈ {euros.toFixed(2).replace('.', ',')} € en bons d’achat</Txt>
        {next && (
          <View style={{ gap: 6 }}>
            <ProgressBar value={balance / next.cost} colors={Gradients.energy} track="rgba(58,42,0,0.15)" />
            <Txt variant="caption" color={t.goldText}>
              Encore {fmtInt(next.cost - balance)} pts pour « {next.title} »
            </Txt>
          </View>
        )}
      </GradientCard>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'boutique', label: 'Boutique' },
          { value: 'badges', label: `Badges ${unlocked}/${BADGES.length}` },
          { value: 'historique', label: 'Historique' },
        ]}
      />

      {tab === 'boutique' && (
        <>
          {CATALOG.map((r) => {
            const affordable = balance >= r.cost;
            return (
              <PhotoCard key={r.id} image={r.image} height={170}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Chip tone="glass" label={r.partner} />
                  <Chip tone={affordable ? 'gold' : 'glass'} icon="diamond" label={fmtInt(r.cost)} />
                </Row>
                <Txt variant="title" color="#fff">
                  {r.title}
                </Txt>
                {confirm === r.id ? (
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Button kind="secondary" small label="Annuler" onPress={() => setConfirm(null)} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        kind="gold"
                        small
                        label="Confirmer"
                        onPress={() => {
                          redeem(r);
                          setConfirm(null);
                        }}
                      />
                    </View>
                  </Row>
                ) : (
                  <Button kind={affordable ? 'gold' : 'secondary'} small icon={affordable ? 'gift' : 'lock-closed'} label={affordable ? 'Échanger' : 'Pas encore assez de points'} disabled={!affordable} onPress={() => setConfirm(r.id)} />
                )}
              </PhotoCard>
            );
          })}
          {redemptions.length > 0 && (
            <Card>
              <Txt variant="title">Mes bons</Txt>
              {redemptions.map((r) => (
                <View key={r.code} style={{ gap: 2 }}>
                  <Txt style={{ fontWeight: '700' }}>{r.title}</Txt>
                  <Txt variant="number" color={t.accent}>
                    {r.code}
                  </Txt>
                </View>
              ))}
              <Txt variant="caption" muted>
                Codes de démonstration, non utilisables en magasin.
              </Txt>
            </Card>
          )}
          <Txt variant="caption" muted style={{ textAlign: 'center' }}>
            Partenaires fictifs pour la démo. Photos : Unsplash.
          </Txt>
        </>
      )}

      {tab === 'badges' && (
        <View style={styles.badgeGrid}>
          {BADGES.map((b) => {
            const p = b.progress(stats);
            const done = p >= 1;
            return (
              <Card key={b.id} style={styles.badgeCard}>
                <View style={[styles.medal, { opacity: done ? 1 : 0.35 }]}>
                  <GradientCardSmall colors={TIER[b.tier]}>
                    <Ionicons name={BADGE_ICON[b.icon]} size={30} color="#fff" />
                  </GradientCardSmall>
                </View>
                <Txt style={{ fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>
                  {b.title}
                </Txt>
                <Txt variant="caption" muted style={{ textAlign: 'center' }} numberOfLines={2}>
                  {b.description}
                </Txt>
                {done ? <Chip tone="ok" icon="checkmark-circle" label="Débloqué" /> : <ProgressBar value={p} height={6} colors={Gradients.gold} />}
              </Card>
            );
          })}
        </View>
      )}

      {tab === 'historique' && (
        <>
          <Card>
            <Txt variant="title">Comment gagner des points</Txt>
            {[
              ['Footing suivi', 'jusqu’à 60'],
              ['Séance clé (fractionné, seuil, sortie longue)', 'jusqu’à 100'],
              ['Semaine complète', `+${POINTS.weekComplete}`],
              ['Jour J terminé', 'jusqu’à 500'],
              ['Objectif atteint', `+${POINTS.goalAchieved}`],
              ['Plan terminé', `+${POINTS.planComplete}`],
              ['Saisie manuelle ou trace suspecte', '0'],
            ].map(([k, v]) => (
              <Row key={k} style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }}>{k}</Txt>
                <Txt variant="number">{v}</Txt>
              </Row>
            ))}
            <Txt variant="caption" muted>
              On récompense le respect du plan, pas le volume : un footing couru trop vite rapporte moins. Plafond de {POINTS.dailyCap} pts par
              jour.
            </Txt>
          </Card>
          {ledger.length > 0 && (
            <Card>
              {ledger.map((e, i) => (
                <Row key={i} style={{ justifyContent: 'space-between' }}>
                  <Txt style={{ flex: 1 }} numberOfLines={1}>
                    {e.label}
                  </Txt>
                  <Txt variant="number" color={e.points < 0 ? t.bad : t.ok}>
                    {e.points > 0 ? '+' : ''}
                    {fmtInt(e.points)}
                  </Txt>
                </Row>
              ))}
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

function GradientCardSmall({ colors, children }: { colors: readonly [string, string]; children: React.ReactNode }) {
  return (
    <GradientCard colors={colors} style={{ width: 64, height: 64, borderRadius: 32, padding: 0, alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </GradientCard>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.m },
  badgeCard: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 6, padding: Spacing.m, borderRadius: Radius.m },
  medal: { alignItems: 'center' },
});
