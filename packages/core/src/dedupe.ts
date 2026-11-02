// Une même sortie arrive souvent par plusieurs chemins (Garmin direct + Strava,
// Apple Watch + Strava…). On ne la compte qu'une fois, depuis la source la plus fiable.

import type { Activity, ActivitySource } from './types.ts';

/** Plus le rang est bas, plus la source est fiable (données brutes de l'appareil). */
export const SOURCE_PRIORITY: Record<ActivitySource, number> = {
  garmin: 0,
  coros: 1,
  polar: 1,
  suunto: 1,
  apple_health: 2,
  health_connect: 3,
  app_gps: 4,
  strava: 5,
};

export function overlapRatio(a: Activity, b: Activity): number {
  const aEnd = a.startTime + a.durationSec * 1000;
  const bEnd = b.startTime + b.durationSec * 1000;
  const overlap = Math.max(0, Math.min(aEnd, bEnd) - Math.max(a.startTime, b.startTime));
  const shorter = Math.min(a.durationSec, b.durationSec) * 1000;
  return shorter > 0 ? overlap / shorter : 0;
}

export function isDuplicate(a: Activity, b: Activity): boolean {
  return a.sport === b.sport && overlapRatio(a, b) > 0.8;
}

/** Garde une activité par sortie réelle, en préférant la source la plus fiable. */
export function dedupeActivities(list: Activity[]): { kept: Activity[]; dropped: Activity[] } {
  const sorted = [...list].sort((x, y) => SOURCE_PRIORITY[x.source] - SOURCE_PRIORITY[y.source]);
  const kept: Activity[] = [];
  const dropped: Activity[] = [];
  for (const a of sorted) {
    if (kept.some((k) => isDuplicate(k, a))) dropped.push(a);
    else kept.push(a);
  }
  return { kept, dropped };
}
