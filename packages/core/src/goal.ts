import type { CurrentLevel, Goal } from './types.ts';
import { distanceLabel, formatTime, weeksUntil } from './time.ts';

/** Formule de Riegel : prédit un temps sur d2 à partir d'un temps sur d1. */
export function riegel(timeSec: number, d1Km: number, d2Km: number): number {
  return timeSec * Math.pow(d2Km / d1Km, 1.06);
}

/** Allure équivalente 10 km (s/km) estimée pour un niveau déclaratif. */
const LEVEL_PACE_10K: Record<'debutant' | 'occasionnel' | 'regulier' | 'confirme', number> = {
  debutant: 450, // 7:30 /km
  occasionnel: 390, // 6:30 /km
  regulier: 330, // 5:30 /km
  confirme: 285, // 4:45 /km
};

/** Allure actuelle équivalente sur 10 km, en s/km. Pivot de tout le moteur. */
export function currentPace10k(level: CurrentLevel): number {
  if (level.kind === 'race') return riegel(level.timeSec, level.distanceKm, 10) / 10;
  return LEVEL_PACE_10K[level.level];
}

export type Feasibility = 'facile' | 'realiste' | 'exigeant' | 'trop_ambitieux' | 'delai_court';

export interface GoalAssessment {
  feasibility: Feasibility;
  title: string;
  message: string;
  weeks: number;
  /** Temps prédit aujourd'hui sur la distance objectif. */
  predictedNowSec: number;
  /** Objectif chrono alternatif proposé, si pertinent. */
  suggestedTimeSec?: number;
  /** Nombre de semaines minimum conseillé pour ce profil. */
  minWeeks: number;
}

export function minWeeksFor(distanceKm: number, pace10k: number): number {
  const base = distanceKm <= 5 ? 4 : distanceKm <= 10 ? 6 : distanceKm <= 21.2 ? 10 : 14;
  return base + (pace10k > 420 ? 4 : 0);
}

/** Gain de performance réaliste maximum sur la durée du plan (≈1,2 %/semaine, plafonné à 15 %). */
export function maxRealisticGain(weeks: number): number {
  return Math.min(0.012 * weeks, 0.15);
}

const roundUp15 = (s: number) => Math.ceil(s / 15) * 15;

export function assessGoal(goal: Goal, level: CurrentLevel, startDate: string): GoalAssessment {
  const p10 = currentPace10k(level);
  const weeks = weeksUntil(startDate, goal.eventDate);
  const predictedNowSec = riegel(p10 * 10, 10, goal.distanceKm);
  const minWeeks = minWeeksFor(goal.distanceKm, p10);
  const label = distanceLabel(goal.distanceKm);

  if (weeks < minWeeks) {
    return {
      feasibility: 'delai_court',
      title: 'Délai trop court',
      message: `Pour un objectif ${label} à ton niveau, prévois au moins ${minWeeks} semaines de préparation. Choisis une date plus lointaine.`,
      weeks,
      predictedNowSec,
      minWeeks,
    };
  }

  if (goal.mode === 'distance') {
    const projected = predictedNowSec * (1 - Math.min(0.005 * weeks, 0.06));
    return {
      feasibility: 'realiste',
      title: 'Objectif réaliste',
      message: `En ${weeks} semaines, tu peux finir ce ${label}. Temps estimé le jour J : environ ${formatTime(projected)}.`,
      weeks,
      predictedNowSec,
      minWeeks,
    };
  }

  const target = goal.targetTimeSec ?? 0;
  const gain = (predictedNowSec - target) / predictedNowSec;
  const maxGain = maxRealisticGain(weeks);
  const pct = Math.round(gain * 100);

  if (gain <= 0) {
    return {
      feasibility: 'facile',
      title: 'Déjà à ta portée',
      message: `Ton niveau actuel correspond à environ ${formatTime(predictedNowSec)}. Tu peux viser plus vite.`,
      weeks,
      predictedNowSec,
      suggestedTimeSec: roundUp15(predictedNowSec * (1 - maxGain * 0.5)),
      minWeeks,
    };
  }
  if (gain <= maxGain * 0.6) {
    return {
      feasibility: 'realiste',
      title: 'Objectif réaliste',
      message: `Il faut gagner ${pct} % par rapport à ton niveau actuel (${formatTime(predictedNowSec)}). C'est tout à fait jouable en ${weeks} semaines.`,
      weeks,
      predictedNowSec,
      minWeeks,
    };
  }
  if (gain <= maxGain) {
    return {
      feasibility: 'exigeant',
      title: 'Réaliste mais exigeant',
      message: `Il faut gagner ${pct} % par rapport à ton niveau actuel (${formatTime(predictedNowSec)}). C'est jouable en ${weeks} semaines si tu es régulier.`,
      weeks,
      predictedNowSec,
      minWeeks,
    };
  }
  return {
    feasibility: 'trop_ambitieux',
    title: 'Trop ambitieux pour ce délai',
    message: `Ton niveau actuel correspond à ${formatTime(predictedNowSec)}. En ${weeks} semaines, un objectif réaliste est ${formatTime(roundUp15(predictedNowSec * (1 - maxGain)))}.`,
    weeks,
    predictedNowSec,
    suggestedTimeSec: roundUp15(predictedNowSec * (1 - maxGain)),
    minWeeks,
  };
}
