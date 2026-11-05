// Test VMA (vitesse maximale aérobie) : test des 6 minutes.
// Après un échauffement, on court 6 minutes le plus loin possible, à allure régulière.
// VMA (km/h) ≈ distance parcourue (m) / 100. Ex. 1 300 m en 6 min → VMA 13 km/h.

import type { CurrentLevel, Plan, PlannedSession } from './types.ts';
import { currentPace10k, riegel } from './goal.ts';
import { buildPlan, measureSteps } from './plan.ts';
import { formatTime } from './time.ts';
import { haversine } from './antiCheat.ts';
import type { TrackPoint } from './types.ts';

export const VMA_TEST_ID = 'test-vma';
export const VMA_TEST_SEC = 360;

/** VMA en km/h d'après la distance courue en 6 minutes. */
export function vmaFromSixMinutes(distanceM: number): number {
  return Math.round((distanceM / 100) * 10) / 10;
}

/**
 * Niveau équivalent : un 10 km se court autour de 88 % de la VMA chez un coureur entraîné.
 * On garde un niveau « course » sur 10 km pour réutiliser tout le moteur.
 */
export function levelFromVma(vmaKmh: number): CurrentLevel {
  const speed = vmaKmh * 0.88; // km/h tenus sur 10 km
  return { kind: 'race', distanceKm: 10, timeSec: Math.round((10 / speed) * 3600) };
}

export interface VmaComparison {
  vma: number;
  /** Temps équivalent sur la distance de l'objectif, d'après la VMA. */
  equivalentSec: number;
  /** Temps prévu par la dernière performance du plan, sur la même distance. */
  planSec: number;
  /** > 0 : la VMA indique un niveau meilleur que celui du plan (en %). */
  gainPct: number;
  /** Le plan doit-il être recalculé ? (VMA nettement meilleure que la dernière performance) */
  adapt: boolean;
  message: string;
}

export function compareVma(plan: Plan, vmaKmh: number): VmaComparison {
  const g = plan.request.goal;
  const planP10 = currentPace10k(plan.request.level);
  const vmaP10 = currentPace10k(levelFromVma(vmaKmh));
  const planSec = riegel(planP10 * 10, 10, g.distanceKm);
  const equivalentSec = riegel(vmaP10 * 10, 10, g.distanceKm);
  const gainPct = Math.round(((planP10 - vmaP10) / planP10) * 1000) / 10;
  // On n'adapte que si la VMA est meilleure que la dernière performance (2 % de marge pour le bruit du test).
  const adapt = gainPct >= 2;
  const message = adapt
    ? `Ta VMA montre que tu vaux mieux que ta dernière performance : environ ${formatTime(equivalentSec)} sur ton objectif. Ton plan peut être recalé sur ce niveau, avec des allures un peu plus rapides.`
    : gainPct <= -2
      ? `Ton test est un peu en dessous de ta dernière performance : c’est fréquent (fatigue, météo, test mal dosé). On garde ton plan tel quel, il est déjà bien calibré.`
      : `Ta VMA confirme ton niveau : ton plan est parfaitement calibré. Continue comme ça !`;
  return { vma: vmaKmh, equivalentSec, planSec, gainPct, adapt, message };
}

/** Recalcule le plan sur le niveau donné par la VMA (mêmes semaines, mêmes jours : mêmes séances). */
export function adaptPlanToVma(plan: Plan, vmaKmh: number): Plan {
  return buildPlan({ ...plan.request, level: levelFromVma(vmaKmh) });
}

/** Décale le début du plan (seulement avant la première séance faite). */
export function reschedulePlan(plan: Plan, startDate: string): Plan {
  return buildPlan({ ...plan.request, startDate });
}

/** Séance du test : 15 min d'échauffement, 3 accélérations, 6 min à fond, 10 min de retour au calme. */
export function vmaTestSession(plan: Plan, date: string): PlannedSession {
  const p10 = currentPace10k(plan.request.level);
  const r = (a: number, b: number) => ({ lo: Math.round(p10 * a), hi: Math.round(p10 * b) });
  const steps: PlannedSession['steps'] = [
    { kind: 'run', zone: 'ef', label: 'Échauffement', durationSec: 900, pace: r(1.22, 1.32) },
    { kind: 'repeat', times: 3, steps: [{ kind: 'run', zone: 'fart', label: 'Accélération', durationSec: 20, pace: r(0.92, 0.98) }, { kind: 'run', zone: 'rec', label: 'Récupération', durationSec: 60, pace: r(1.45, 1.7) }] },
    { kind: 'run', zone: 'rec', label: 'Récupération', durationSec: 120, pace: r(1.45, 1.7) },
    { kind: 'run', zone: 'vma', label: 'Test : 6 min à fond', durationSec: VMA_TEST_SEC, pace: r(0.85, 0.95) },
    { kind: 'run', zone: 'ef', label: 'Retour au calme', durationSec: 600, pace: r(1.3, 1.45) },
  ];
  const m = measureSteps(steps);
  return {
    id: VMA_TEST_ID,
    week: 0,
    date,
    type: 'vma',
    title: 'Test VMA (6 minutes)',
    steps,
    durationSec: m.durationSec,
    distanceM: m.distanceM,
    basePoints: 0,
    tip: 'Pars vite mais pas à fond : tu dois tenir une allure régulière pendant les 6 minutes et finir épuisé.',
    nutrition: 'Comme avant une séance intense : un repas digeste 2 à 3 h avant.',
  };
}

/** Distance (m) courue pendant un intervalle [start, end] (ms), d'après la trace GPS (points précis seulement). */
export function distanceBetween(track: TrackPoint[], start: number, end: number): number {
  const pts = track.filter((p) => p.t >= start && p.t <= end && (p.accuracy == null || p.accuracy <= 30));
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = haversine(pts[i - 1], pts[i]);
    const dt = (pts[i].t - pts[i - 1].t) / 1000;
    if (dt > 0 && seg / dt <= 12) d += seg;
  }
  return Math.round(d);
}
