import { useCallback, useMemo } from 'react';
import type { Athlete } from '@foulee/core';

import { ageOf, saveBodyMetrics } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { useStore } from '@/lib/store';
import { isDemo } from '@/lib/supabase';

/**
 * Profil sportif (âge, poids, taille) utilisé pour personnaliser les plans.
 * En ligne : fiche du compte (l'âge vient de la date de naissance). En démo : stocké sur le téléphone.
 */
export function useAthlete(): { athlete: Athlete; save(m: { weightKg: number | null; heightCm: number | null }): Promise<void> } {
  const { profile, reload } = useSession();
  const { athlete: local, setLocalAthlete } = useStore();

  const athlete = useMemo<Athlete>(() => {
    if (isDemo) return local ?? {};
    return {
      age: profile?.birthDate ? ageOf(profile.birthDate) : undefined,
      weightKg: profile?.weightKg ?? undefined,
      heightCm: profile?.heightCm ?? undefined,
    };
  }, [local, profile]);

  const save = useCallback(
    async (m: { weightKg: number | null; heightCm: number | null }) => {
      if (isDemo) {
        setLocalAthlete({ ...local, weightKg: m.weightKg ?? undefined, heightCm: m.heightCm ?? undefined });
        return;
      }
      await saveBodyMetrics(m);
      await reload();
    },
    [local, reload, setLocalAthlete],
  );

  return { athlete, save };
}
