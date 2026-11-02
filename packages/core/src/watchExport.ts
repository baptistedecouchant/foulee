// Format neutre d'une séance structurée, converti ensuite vers chaque marque
// (Garmin Training API, Apple WorkoutKit, Coros, Polar…) par un adaptateur dédié.

import type { PlannedSession, Step } from './types.ts';

export interface WatchStep {
  type: 'warmup' | 'interval' | 'recovery' | 'cooldown' | 'repeat';
  name?: string;
  duration?: { kind: 'time'; seconds: number } | { kind: 'distance'; meters: number };
  /** Allure cible en s/km : min = plus rapide. */
  target?: { kind: 'pace'; minSecPerKm: number; maxSecPerKm: number } | { kind: 'open' };
  repeat?: { times: number; steps: WatchStep[] };
}

export interface WatchWorkout {
  externalId: string;
  name: string;
  sport: 'running';
  scheduledDate: string;
  steps: WatchStep[];
}

function convert(steps: Step[], top: boolean): WatchStep[] {
  return steps.map((s, i): WatchStep => {
    if (s.kind === 'repeat') return { type: 'repeat', repeat: { times: s.times, steps: convert(s.steps, false) } };
    const type: WatchStep['type'] =
      s.zone === 'rec'
        ? 'recovery'
        : top && i === 0 && s.label === 'Échauffement'
          ? 'warmup'
          : top && i === steps.length - 1 && s.label === 'Retour au calme'
            ? 'cooldown'
            : 'interval';
    return {
      type,
      name: s.label,
      duration: s.durationSec != null ? { kind: 'time', seconds: s.durationSec } : { kind: 'distance', meters: s.distanceM ?? 0 },
      target: s.zone === 'rec' ? { kind: 'open' } : { kind: 'pace', minSecPerKm: s.pace.lo, maxSecPerKm: s.pace.hi },
    };
  });
}

export function toWatchWorkout(session: PlannedSession): WatchWorkout {
  return {
    externalId: session.id,
    name: `Foulée · ${session.title}`.slice(0, 60),
    sport: 'running',
    scheduledDate: session.date,
    steps: convert(session.steps, true),
  };
}
