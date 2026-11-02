// Photos libres de droits (licence Unsplash : usage gratuit, commercial compris, sans attribution obligatoire).
// Chargées depuis Unsplash au moment de l'affichage ; un dégradé s'affiche dessous si l'image ne charge pas.
// Pour la production : télécharger les images retenues dans assets/ (chargement instantané, hors ligne).

import type { Plan, SessionType } from '@foulee/core';

import { Gradients } from '@/constants/theme';

export type ImageKey = 'marathon' | 'road' | 'trackSunset' | 'cityRace' | 'trackLines' | 'trail' | 'solo' | 'shoes' | 'finish';

const UNSPLASH: Record<ImageKey, string> = {
  marathon: 'ttbCwN_mWic', // coureurs pendant un marathon (Braden Collum)
  road: 'Y0woUmyxGrw', // coureurs sur route (Miguel A Amutio)
  trackSunset: '1-nuy7fD3fw', // sprint sur piste au coucher du soleil
  cityRace: '3NhTyPZ8CO8', // course en ville, marathon de New York
  trackLines: 'XaszBhkkt7Q', // couloirs de piste
  trail: 'dpIKq5uPCpw', // trail le long d'un ruisseau
  solo: 'LSnNnxRyssI', // coureur seul en journée
  shoes: 'A4579vLezz8', // chaussures de running
  finish: 'LNTKgdaHrQs', // ligne d'arrivée, bras levés
};

export function imageUri(key: ImageKey): string {
  return `https://unsplash.com/photos/${UNSPLASH[key]}/download?force=true&w=1080`;
}

/** Dégradé de secours, affiché sous la photo (et seul si elle ne charge pas). */
export const IMAGE_FALLBACK: Record<ImageKey, readonly [string, string]> = {
  marathon: Gradients.night,
  road: Gradients.energy,
  trackSunset: Gradients.flame,
  cityRace: Gradients.energy,
  trackLines: Gradients.flame,
  trail: Gradients.xp,
  solo: Gradients.energy,
  shoes: Gradients.gold,
  finish: Gradients.gold,
};

/** Image qui correspond à l'objectif d'un entraînement. */
export function imageForPlan(plan: Plan): ImageKey {
  const d = plan.request.goal.distanceKm;
  if (d >= 40) return 'cityRace';
  if (d >= 20) return 'marathon';
  if (d >= 9) return plan.request.goal.mode === 'chrono' ? 'trackSunset' : 'road';
  return 'solo';
}

/** Image qui correspond au type de séance. */
export function imageForSession(type: SessionType): ImageKey {
  switch (type) {
    case 'vma':
    case 'fartlek':
      return 'trackLines';
    case 'seuil':
    case 'spe':
      return 'trackSunset';
    case 'sl':
      return 'trail';
    case 'race':
      return 'finish';
    default:
      return 'solo';
  }
}
