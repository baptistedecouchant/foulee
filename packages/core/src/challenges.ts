// Défis entre joueurs : un catalogue fixe (créé par la plateforme), calculé
// uniquement à partir d'activités VÉRIFIÉES par l'anti-triche.

export type ChallengeMetric = 'distance' | 'sessions' | 'longest';

export interface ChallengeTemplate {
  id: string;
  title: string;
  description: string;
  metric: ChallengeMetric;
  /** 'most' : le plus haut à la fin gagne. 'target' : tous ceux qui atteignent l'objectif gagnent, le premier en premier. */
  mode: 'most' | 'target';
  target?: number;
  durationDays: number;
  xpReward: number;
  pointsReward: number;
  icon: 'flash' | 'trophy' | 'calendar' | 'trail-sign' | 'flame' | 'speedometer';
}

export const CHALLENGES: ChallengeTemplate[] = [
  { id: 'duel7', title: 'Duel des 7 jours', description: 'Le plus de kilomètres en 7 jours.', metric: 'distance', mode: 'most', durationDays: 7, xpReward: 200, pointsReward: 150, icon: 'flash' },
  { id: 'first50', title: 'Premier à 50 km', description: 'Le premier à cumuler 50 km gagne.', metric: 'distance', mode: 'target', target: 50, durationDays: 30, xpReward: 300, pointsReward: 250, icon: 'trophy' },
  { id: 'three', title: '3 séances cette semaine', description: 'Courir 3 fois en 7 jours. Tout le monde peut gagner !', metric: 'sessions', mode: 'target', target: 3, durationDays: 7, xpReward: 120, pointsReward: 80, icon: 'calendar' },
  { id: 'long15', title: 'La sortie longue', description: 'Une sortie d’au moins 15 km d’ici dimanche.', metric: 'longest', mode: 'target', target: 15, durationDays: 7, xpReward: 200, pointsReward: 120, icon: 'trail-sign' },
  { id: 'month100', title: '100 km en un mois', description: 'Cumuler 100 km en 30 jours.', metric: 'distance', mode: 'target', target: 100, durationDays: 30, xpReward: 400, pointsReward: 300, icon: 'flame' },
  { id: 'regular', title: 'Régularité', description: 'Le plus de séances en 14 jours.', metric: 'sessions', mode: 'most', durationDays: 14, xpReward: 250, pointsReward: 150, icon: 'speedometer' },
];

export interface RunRecord {
  startTime: number;
  distanceM: number;
}

export function challengeValue(t: ChallengeTemplate, runs: RunRecord[], start: number, end: number): number {
  const inRange = runs.filter((r) => r.startTime >= start && r.startTime < end);
  if (t.metric === 'sessions') return inRange.filter((r) => r.distanceM >= 2000).length;
  if (t.metric === 'longest') return Math.round(Math.max(0, ...inRange.map((r) => r.distanceM)) / 100) / 10;
  return Math.round(inRange.reduce((a, r) => a + r.distanceM, 0) / 100) / 10;
}

export interface Standing {
  userId: string;
  value: number;
  done: boolean;
  rank: number;
}

export function leaderboard(t: ChallengeTemplate, values: Array<{ userId: string; value: number }>): Standing[] {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  return sorted.map((v, i) => ({ ...v, rank: i + 1, done: t.mode === 'target' ? v.value >= (t.target ?? Infinity) : false }));
}

export function unitOf(t: ChallengeTemplate): string {
  return t.metric === 'sessions' ? 'séances' : 'km';
}

/** Kilomètres et nombre de sorties sur une période (statistiques du Hub). */
export function periodStats(runs: RunRecord[], now: number) {
  const day = 86_400_000;
  const km = (days: number) => Math.round(runs.filter((r) => r.startTime >= now - days * day).reduce((a, r) => a + r.distanceM, 0) / 100) / 10;
  return {
    km7: km(7),
    km30: km(30),
    runs30: runs.filter((r) => r.startTime >= now - 30 * day && r.distanceM >= 2000).length,
  };
}
