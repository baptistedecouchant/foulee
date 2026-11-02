import { daysBetween, distanceLabel, formatTime, type Plan, type SessionType } from '@foulee/core';

import type { IconName } from '@/components/ui';
import type { PlanEntry } from '@/lib/store';

export const SESSION_ICON: Record<SessionType, IconName> = {
  ef: 'leaf',
  lignes: 'speedometer-outline',
  sl: 'trail-sign',
  fartlek: 'pulse',
  vma: 'flash',
  seuil: 'speedometer',
  spe: 'locate',
  race: 'trophy',
};

export const BADGE_ICON: Record<string, IconName> = {
  'figure.run': 'footsteps',
  'flame.fill': 'flame',
  'bolt.fill': 'flash',
  calendar: 'calendar',
  'star.fill': 'star',
  'trophy.fill': 'trophy',
  'map.fill': 'map',
  'clock.fill': 'time',
  'checkmark.seal.fill': 'shield-checkmark',
  'medal.fill': 'medal',
};

export function goalTitle(plan: Plan): string {
  const g = plan.request.goal;
  return g.mode === 'chrono' && g.targetTimeSec ? `${distanceLabel(g.distanceKm)} en ${formatTime(g.targetTimeSec)}` : `Finir : ${distanceLabel(g.distanceKm)}`;
}

export function planProgress(entry: PlanEntry) {
  const total = entry.plan.sessions.length;
  const done = entry.plan.sessions.filter((s) => ['validee', 'partielle'].includes(entry.validations[s.id]?.status ?? '')).length;
  return { total, done, ratio: total ? done / total : 0 };
}

export function daysLeft(plan: Plan, today: string): number {
  return daysBetween(today, plan.request.goal.eventDate);
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString('fr-FR');
