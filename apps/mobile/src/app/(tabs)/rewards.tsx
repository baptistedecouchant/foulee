import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { BADGES, ECONOMY, rcToEuro, type BadgeTier } from '@foulee/core';

import { DemoAdModal } from '@/components/ad-modal';
import { Button, Card, Chip, Ionicons, ProgressBar, Row, Segmented, Txt } from '@/components/ui';
import { GradientCard, PhotoCard } from '@/components/visuals';
import { Gradients, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTopInset } from '@/hooks/use-top-inset';
import type { ImageKey } from '@/lib/images';
import { BADGE_ICON, fmtInt } from '@/lib/labels';
import { useStore } from '@/lib/store';

// Catalogue de démonstration (partenaires fictifs). En production : table `rewards`,
// chaque article étant un code ou un lien affilié tracké du partenaire.
const CATALOG: Array<{ id: string; title: string; partner: string; cost: number; image: ImageKey }> = [
  { id: 'remise-10', title: '-10 % sur ta prochaine commande', partner: 'Boutique running partenaire', cost: 250, image: 'shoes' },
  { id: 'dossard', title: '-15 % sur un dossard', partner: 'Organisateur de course', cost: 400, image: 'cityRace' },
  { id: 'bon-5', title: "Bon d'achat 5 €", partner: 'Enseigne de sport partenaire', cost: 500, image: 'road' },
  { id: 'bon-10', title: "Bon d'achat 10 €", partner: 'Enseigne de sport partenaire', cost: 1000, image: 'trail' },
];

const TIER: Record<BadgeTier, readonly [string, string]> = {
  bronze: ['#E7A36B', '#B5652E'],
  argent: ['#D9E1EE', '#8D9AB3'],
  or: ['#FFD65C', '#FF9F1C'],
};

const CAPPED: Record<string, string> = { quota: 'quota atteint', semaine: 'plafond hebdo', mois: 'plafond mensuel', jour: 'plafond du jour' };
const euros = (rc: number) => `${rcToEuro(rc).toFixed(2).replace('.', ',')} €`;

type Tab = 'boutique' | 'gagner' | 'badges' | 'historique';

export default function RewardsScreen() {
  const t = useTheme();
  const top = useTopInset();
  const { balance, ledger, redemptions, redeem, stats, room, adsMode, watchAd } = useStore();
  const [tab, setTab] = useState<Tab>('boutique');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [adOpen, setAdOpen] = useState(false);
  const [adResolver, setAdResolver] = useState<((ok: boolean) => void) | null>(null);
  const [adMsg, setAdMsg] = useState<string | null>(null);
  const next = CATALOG.filter((r) => r.cost > balance).sort((a, b) => a.cost - b.cost)[0];
  const unlocked = BADGES.filter((b) => b.progress(stats) >= 1).length;

  const playDemoAd = () =>
    new Promise<boolean>((resolve) => {
      setAdResolver(() => resolve);
      setAdOpen(true);
    });

  const onWatchAd = async () => {
    setAdMsg(null);
    const rc = await watchAd(playDemoAd);
    setAdMsg(rc > 0 ? `+${rc} RC crédité${rc > 1 ? 's' : ''} !` : 'Pas de récompense cette fois.');
  };

  return (
    <ScrollView style={{ backgroundColor: t.background }} contentContainerStyle={[styles.page, { paddingTop: Spacing.l + top }]} contentInsetAdjustmentBehavior="automatic">
      <DemoAdModal
        visible={adOpen}
        onDone={(ok) => {
          setAdOpen(false);
          adResolver?.(ok);
        }}
      />

      <GradientCard colors={Gradients.gold}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Txt variant="label" color={t.goldText}>
            Mes RunCoins
          </Txt>
          <Ionicons name="cash" size={26} color={t.goldText} />
        </Row>
        <Txt variant="hero" color={t.goldText} style={{ fontSize: 48 }}>
          {fmtInt(balance)} RC
        </Txt>
        <Txt color={t.goldText}>
          = {euros(balance)} · cette semaine : {room.earned}/{ECONOMY.caps.weeklyTotal} RC
        </Txt>
        {next && (
          <View style={{ gap: 6 }}>
            <ProgressBar value={balance / next.cost} colors={Gradients.energy} track="rgba(58,42,0,0.15)" />
            <Txt variant="caption" color={t.goldText}>
              Encore {fmtInt(next.cost - balance)} RC pour « {next.title} »
            </Txt>
          </View>
        )}
      </GradientCard>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'boutique', label: 'Boutique' },
          { value: 'gagner', label: 'Gagner' },
          { value: 'badges', label: `Badges` },
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
                  <Chip tone={affordable ? 'gold' : 'glass'} icon="cash" label={`${fmtInt(r.cost)} RC`} />
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
                  <Button kind={affordable ? 'gold' : 'secondary'} small icon={affordable ? 'gift' : 'lock-closed'} label={affordable ? 'Échanger' : 'Pas encore assez de RC'} disabled={!affordable} onPress={() => setConfirm(r.id)} />
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
            Partenaires fictifs pour la démo. 100 RC = 1 €. Photos : Unsplash.
          </Txt>
        </>
      )}

      {tab === 'gagner' && (
        <>
          <Card>
            <Row>
              <Ionicons name="play-circle" size={22} color={t.flame} />
              <Txt variant="title">Regarder une pub</Txt>
            </Row>
            <Txt muted>
              Une vidéo de 30 s = +{ECONOMY.adReward} RC. Jusqu’à {ECONOMY.caps.adsPerDay} par jour et {ECONOMY.caps.adsPerWeek} par semaine.
            </Txt>
            {adsMode === 'off' ? (
              <Txt variant="caption" muted>
                Disponible dans l’app installée.
              </Txt>
            ) : (
              <Button
                kind="flame"
                icon="play"
                label={room.adsLeftToday > 0 ? `Regarder (${room.adsLeftToday} restante${room.adsLeftToday > 1 ? 's' : ''} aujourd’hui)` : 'Reviens demain'}
                disabled={room.adsLeftToday <= 0 || room.left <= 0}
                onPress={onWatchAd}
              />
            )}
            {adMsg && <Txt color={t.accent}>{adMsg}</Txt>}
          </Card>

          <Card>
            <Txt variant="title">Barème</Txt>
            {[
              ['Séance validée (allure ou distance atteinte)', `+${ECONOMY.sessionValidated} RC`],
              ['Séance validée en partie', `+${ECONOMY.sessionPartial} RC`],
              ['Semaine complète', `+${ECONOMY.weekComplete} RC`],
              ['Challenge sponsorisé réussi', `+${ECONOMY.sponsoredChallenge} RC`],
              ['Pub vidéo regardée', `+${ECONOMY.adReward} RC`],
              ['Défis entre amis, badges, objectif atteint', 'XP'],
              ['Saisie manuelle ou trace suspecte', '0'],
            ].map(([k, v]) => (
              <Row key={k} style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }}>{k}</Txt>
                <Txt variant="number">{v}</Txt>
              </Row>
            ))}
          </Card>

          <Card>
            <Txt variant="title">Plafonds</Txt>
            <Txt variant="caption" muted>
              Pour que la boutique reste généreuse dans la durée, les gains sont plafonnés :
            </Txt>
            {[
              ['Séances payées', `${ECONOMY.caps.sessionsPerDay}/jour · ${ECONOMY.caps.sessionsPerWeek}/semaine`],
              ['Pubs', `${ECONOMY.caps.adsPerDay}/jour · ${ECONOMY.caps.adsPerWeek}/semaine`],
              ['Challenge sponsorisé', `${ECONOMY.caps.sponsoredPerWeek}/semaine`],
              ['Total', `${ECONOMY.caps.weeklyTotal} RC/semaine · ${ECONOMY.caps.monthlyTotal} RC/mois`],
            ].map(([k, v]) => (
              <Row key={k} style={{ justifyContent: 'space-between' }}>
                <Txt style={{ flex: 1 }}>{k}</Txt>
                <Txt variant="number">{v}</Txt>
              </Row>
            ))}
            <Txt variant="caption" muted>
              Au-delà, tes séances rapportent toujours de l’XP et comptent pour tes badges et tes défis.
            </Txt>
          </Card>
        </>
      )}

      {tab === 'badges' && (
        <>
          <Txt muted>
            {unlocked}/{BADGES.length} badges débloqués
          </Txt>
          <View style={styles.badgeGrid}>
            {BADGES.map((b) => {
              const p = b.progress(stats);
              const done = p >= 1;
              return (
                <Card key={b.id} style={styles.badgeCard}>
                  <GradientCard colors={TIER[b.tier]} style={[styles.medal, { opacity: done ? 1 : 0.35 }]}>
                    <Ionicons name={BADGE_ICON[b.icon]} size={30} color="#fff" />
                  </GradientCard>
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
        </>
      )}

      {tab === 'historique' && (
        <Card>
          {ledger.length === 0 && <Txt muted>Tes gains apparaîtront ici.</Txt>}
          {ledger.map((e, i) => (
            <Row key={i} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1}>{e.label}</Txt>
                {e.capped && (
                  <Txt variant="caption" muted>
                    {CAPPED[e.capped] ?? e.capped}
                  </Txt>
                )}
              </View>
              <Txt variant="number" color={e.amount < 0 ? t.bad : e.amount === 0 ? t.textSecondary : t.ok}>
                {e.amount > 0 ? '+' : ''}
                {fmtInt(e.amount)} RC
              </Txt>
            </Row>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: Spacing.l, gap: Spacing.l, paddingBottom: 120 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.m },
  badgeCard: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', gap: 6, padding: Spacing.m, borderRadius: Radius.m },
  medal: { width: 64, height: 64, borderRadius: 32, padding: 0, alignItems: 'center', justifyContent: 'center' },
});
