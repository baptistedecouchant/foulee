import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { compareVma, distanceLabel, formatPace, formatTime, vmaFromSixMinutes, VMA_TEST_ID, type VmaComparison } from '@foulee/core';

import { NumberPicker } from '@/components/pickers';
import { Button, Ionicons, Txt } from '@/components/ui';
import { GradientCard } from '@/components/visuals';
import { Gradients, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateFr, useStore, type PlanEntry } from '@/lib/store';

const fmt = (n: number) => String(n).replace('.', ',');

/** Onglet « Test VMA » d'un entraînement : explication, séance guidée, saisie du résultat, recalage du plan. */
export function VmaTest({ entry, measured }: { entry: PlanEntry; measured?: number | null }) {
  const t = useTheme();
  const { applyVma } = useStore();
  const [meters, setMeters] = useState<number | null>(measured ?? null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ adapted: boolean; comparison: VmaComparison } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (measured) setMeters(Math.round(measured / 10) * 10);
  }, [measured]);

  const vma = meters ? vmaFromSixMinutes(meters) : null;
  const preview = vma ? compareVma(entry.plan, vma) : null;
  const g = entry.plan.request.goal;

  const validate = async () => {
    if (!vma) return;
    setBusy(true);
    setError(null);
    try {
      setDone(await applyVma(entry.id, vma));
    } catch {
      setError('La VMA n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: Spacing.l }}>
      {entry.plan.vma && !done && (
        <GradientCard colors={Gradients.xp}>
          <Txt variant="label" color="#04281B">
            ⚡ Ta VMA
          </Txt>
          <Txt variant="hero" color="#04281B">
            {fmt(entry.plan.vma.value)} km/h
          </Txt>
          <Txt color="#04281B">Mesurée le {formatDateFr(entry.plan.vma.date, { day: 'numeric', month: 'long' })}. Refais le test toutes les 6 à 8 semaines pour suivre tes progrès.</Txt>
        </GradientCard>
      )}

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Txt style={styles.h}>⚡ C’est quoi, la VMA ?</Txt>
        <Txt muted>
          La vitesse maximale aérobie, c’est la vitesse à laquelle ton cœur et tes poumons tournent à plein régime. Tu peux la tenir environ 6 minutes. Elle sert
          à régler toutes tes allures : le footing se court autour de 65 % de ta VMA, le seuil vers 85 %, un 10 km vers 88 %.
        </Txt>
        <Txt style={styles.h}>⏱️ Le test des 6 minutes</Txt>
        {[
          '🔥 15 minutes d’échauffement très facile, puis 3 accélérations.',
          '🏃 Tempo maximum sur 6 min : le plus loin possible, à allure régulière. Pars vite, mais pas en sprint.',
          '📏 VMA = distance parcourue ÷ 100. Exemple : 1 300 m en 6 min = 13 km/h.',
          '🧊 10 minutes de retour au calme.',
        ].map((x) => (
          <Txt key={x}>{x}</Txt>
        ))}
        <Txt variant="caption" muted>
          💡 Idéalement sur une piste ou une route plate, reposé, sans vent fort. Pas le lendemain d’une séance dure.
        </Txt>
        <Button kind="flame" icon="play" label="Faire le test maintenant" onPress={() => router.push({ pathname: '/run/[id]', params: { id: VMA_TEST_ID, plan: entry.id } })} />
      </View>

      <View style={[styles.card, { backgroundColor: t.surface }]}>
        <Txt style={styles.h}>📝 Mon résultat</Txt>
        <NumberPicker label="Distance parcourue en 6 minutes" unit="m" value={meters} onChange={setMeters} min={700} max={2600} step={10} initial={1300} />
        {vma && preview && !done && (
          <>
            <View style={[styles.result, { backgroundColor: t.accentSoft }]}>
              <Txt variant="caption" color={t.accent}>
                Ta VMA
              </Txt>
              <Txt style={styles.vma} color={t.accent}>
                {fmt(vma)} km/h
              </Txt>
              <Txt variant="caption" color={t.accent}>
                Équivalent {distanceLabel(g.distanceKm)} : environ {formatTime(preview.equivalentSec)} ({formatPace(preview.equivalentSec / g.distanceKm)} /km)
              </Txt>
            </View>
            <Txt>{preview.message}</Txt>
            <Button
              icon={preview.adapt ? 'sparkles' : 'checkmark-circle'}
              label={busy ? 'Enregistrement…' : preview.adapt ? 'Recaler mon plan sur ma VMA' : 'Enregistrer ma VMA'}
              disabled={busy}
              onPress={validate}
            />
          </>
        )}
        {done && (
          <View style={[styles.result, { backgroundColor: t.xpSoft }]}>
            <Ionicons name="checkmark-circle" size={28} color={t.ok} />
            <Txt style={{ fontWeight: '700' }} color={t.ok}>
              {done.adapted ? '🎉 Plan recalé sur ta VMA !' : '✅ VMA enregistrée'}
            </Txt>
            <Txt variant="caption" color={t.ok} style={{ textAlign: 'center' }}>
              {done.adapted ? 'Tes allures ont été mises à jour pour toutes les séances à venir. Les séances déjà faites restent validées.' : done.comparison.message}
            </Txt>
          </View>
        )}
        {error && <Txt color={t.bad}>{error}</Txt>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, padding: Spacing.l, gap: Spacing.m, boxShadow: '0 1px 2px rgba(11,16,32,0.04), 0 6px 20px rgba(11,16,32,0.06)' },
  h: { fontSize: 17, fontWeight: '700' },
  result: { borderRadius: 16, padding: Spacing.l, alignItems: 'center', gap: 4 },
  vma: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.8 },
});
