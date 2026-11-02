import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { POINTS } from '@foulee/core';

import { Button, Card, Chip, Row, Txt } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useStore } from '@/lib/store';

// Catalogue de démonstration : partenaires fictifs. En production il vient de la table `rewards`.
const CATALOG = [
  { id: 'bon-5', title: "Bon d'achat 5 €", partner: 'Boutique running partenaire', cost: 2000 },
  { id: 'gels', title: 'Pack de 6 gels énergétiques', partner: 'Marque de nutrition sportive', cost: 2500 },
  { id: 'dossard', title: '-15 % sur un dossard', partner: 'Organisateur de course', cost: 3000 },
  { id: 'bon-10', title: "Bon d'achat 10 €", partner: 'Enseigne de sport', cost: 4000 },
];

const BAREME = [
  ['Footing suivi', `jusqu’à 60 pts`],
  ['Séance clé (fractionné, seuil, sortie longue)', 'jusqu’à 100 pts'],
  ['Semaine complète', `+${POINTS.weekComplete} pts`],
  ['Jour J terminé', 'jusqu’à 500 pts'],
  ['Objectif atteint', `+${POINTS.goalAchieved} pts`],
  ['Plan terminé', `+${POINTS.planComplete} pts`],
  ['Saisie manuelle ou trace suspecte', '0 pt'],
];

const fmt = (n: number) => n.toLocaleString('fr-FR');

export default function RewardsScreen() {
  const t = useTheme();
  const { balance, ledger, redemptions, redeem } = useStore();
  const [confirm, setConfirm] = useState<string | null>(null);
  const euros = (balance / 1000) * POINTS.eurosPer1000;
  const next = CATALOG.filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={styles.page}>
      <Card style={{ backgroundColor: t.gold, borderColor: t.gold }}>
        <Txt variant="label" color={t.goldText}>
          Ton solde
        </Txt>
        <Txt variant="display" color={t.goldText} style={{ fontSize: 44 }}>
          {fmt(balance)} pts
        </Txt>
        <Txt color={t.goldText}>
          ≈ {euros.toFixed(2).replace('.', ',')} € en bons d’achat
          {next ? ` · encore ${fmt(next.cost - balance)} pts pour « ${next.title} »` : ''}
        </Txt>
      </Card>

      <Txt variant="title">Catalogue</Txt>
      {CATALOG.map((r) => {
        const affordable = balance >= r.cost;
        return (
          <Card key={r.id}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={{ fontWeight: '700' }}>{r.title}</Txt>
                <Txt variant="caption" muted>
                  {r.partner}
                </Txt>
              </View>
              <Chip tone={affordable ? 'gold' : 'neutral'} label={`${fmt(r.cost)} pts`} />
            </Row>
            {confirm === r.id ? (
              <Row>
                <View style={{ flex: 1 }}>
                  <Button kind="secondary" label="Annuler" onPress={() => setConfirm(null)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    kind="gold"
                    label="Confirmer"
                    onPress={() => {
                      redeem(r);
                      setConfirm(null);
                    }}
                  />
                </View>
              </Row>
            ) : (
              <Button kind={affordable ? 'gold' : 'secondary'} label={affordable ? 'Échanger' : 'Pas encore assez de points'} disabled={!affordable} onPress={() => setConfirm(r.id)} />
            )}
          </Card>
        );
      })}

      {redemptions.length > 0 && (
        <>
          <Txt variant="title">Mes bons</Txt>
          {redemptions.map((r) => (
            <Card key={r.code}>
              <Txt style={{ fontWeight: '700' }}>{r.title}</Txt>
              <Txt variant="number">
                {r.code}
              </Txt>
              <Txt variant="caption" muted>
                Code de démonstration, non utilisable en magasin.
              </Txt>
            </Card>
          ))}
        </>
      )}

      <Txt variant="title">Comment gagner des points</Txt>
      <Card>
        {BAREME.map(([k, v]) => (
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
        <>
          <Txt variant="title">Historique</Txt>
          <Card>
            {ledger.map((e, i) => (
              <Row key={i} style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }} numberOfLines={1}>
                  {e.label}
                </Txt>
                <Txt variant="number" color={e.points < 0 ? t.bad : t.ok}>
                  {e.points > 0 ? '+' : ''}
                  {fmt(e.points)}
                </Txt>
              </Row>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: Spacing.l, paddingBottom: Spacing.xxl },
});
