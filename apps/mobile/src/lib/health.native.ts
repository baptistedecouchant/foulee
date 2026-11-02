// Apple Santé (HealthKit) : séances de course (Apple Watch, Nike Run Club, Runna… tout ce qui écrit
// dans Santé) et nombre de pas du jour.
//
// Module natif : il fonctionne dans la version installée de l'app (« development build » ou App Store),
// PAS dans Expo Go. Dans Expo Go, `healthAvailable()` répond simplement `false`.

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import type { Activity, TrackPoint } from '@foulee/core';

type HK = typeof import('@kingstinct/react-native-healthkit');

let mod: HK | null | undefined;
function hk(): HK | null {
  if (mod !== undefined) return mod;
  // Expo Go ne contient pas le module natif : on ne le charge jamais là-bas.
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (mod = null);
  try {
    mod = require('@kingstinct/react-native-healthkit') as HK;
  } catch {
    mod = null;
  }
  return mod;
}

const READ = [
  'HKWorkoutTypeIdentifier',
  'HKWorkoutRouteTypeIdentifier',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
] as const;

export async function healthAvailable(): Promise<boolean> {
  const h = hk();
  if (!h) return false;
  try {
    return await h.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

/** Demande l'accès en lecture (une seule fenêtre iOS, réutilisée ensuite). Ne partage rien vers Santé. */
export async function requestHealthAccess(): Promise<boolean> {
  const h = hk();
  if (!h) return false;
  try {
    return await h.requestAuthorization({ toRead: READ as unknown as Parameters<HK['requestAuthorization']>[0]['toRead'] });
  } catch {
    return false;
  }
}

/** Nombre de pas depuis minuit (somme dédoublonnée par Santé entre iPhone et montre). */
export async function stepsToday(): Promise<number | null> {
  const h = hk();
  if (!h) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  try {
    const res = await h.queryStatisticsForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], {
      filter: { date: { startDate: start, endDate: new Date() } },
      unit: 'count',
    });
    return Math.round(res.sumQuantity?.quantity ?? 0);
  } catch {
    return null;
  }
}

/**
 * Séances de course depuis `since`, avec trace GPS (si enregistrée) et fréquence cardiaque.
 * Règle de sécurité : une séance saisie à la main dans Santé est marquée `manual` et ne rapporte rien.
 */
export async function readRuns(since: Date): Promise<Activity[]> {
  const h = hk();
  if (!h) return [];
  const workouts = await h.queryWorkoutSamples({
    limit: 50,
    ascending: false,
    filter: { workoutActivityType: h.WorkoutActivityType.running, date: { startDate: since, endDate: new Date() } },
  });

  const out: Activity[] = [];
  for (const w of workouts) {
    const meta = (w.metadata ?? {}) as Record<string, unknown>;
    const manual = meta.HKWasUserEntered === true || meta.HKWasUserEntered === 1;
    const indoor = meta.HKIndoorWorkout === true || meta.HKIndoorWorkout === 1;
    const start = new Date(w.startDate).getTime();
    const end = new Date(w.endDate).getTime();

    // Trace GPS
    let track: TrackPoint[] = [];
    try {
      const routes = await w.getWorkoutRoutes();
      track = routes.flatMap((r) =>
        r.locations.map((l) => ({
          t: new Date(l.date).getTime(),
          lat: l.latitude,
          lon: l.longitude,
          alt: l.altitude,
          accuracy: l.horizontalAccuracy,
        })),
      );
    } catch {
      // pas de trace (tapis, ou accès refusé)
    }

    // Fréquence cardiaque pendant la séance, rattachée aux points GPS les plus proches
    try {
      const hr = await h.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', {
        limit: 0,
        ascending: true,
        unit: 'count/min',
        filter: { date: { startDate: new Date(start), endDate: new Date(end) } },
      });
      if (hr.length && track.length) {
        let j = 0;
        for (const p of track) {
          while (j < hr.length - 1 && new Date(hr[j + 1].startDate).getTime() <= p.t) j++;
          p.hr = Math.round(hr[j].quantity);
        }
      }
    } catch {
      // pas de cardio
    }

    const source = w.sourceRevision?.source?.name ?? '';
    out.push({
      source: 'apple_health',
      externalId: w.uuid,
      sport: 'running',
      startTime: start,
      durationSec: Math.round(w.duration?.quantity ?? (end - start) / 1000),
      distanceM: Math.round(w.totalDistance?.quantity ?? 0),
      manual,
      indoor,
      deviceName: [source, w.device?.name].filter(Boolean).join(' · ') || undefined,
      track,
    });
  }
  return out;
}

/**
 * Health Connect (Android) : même principe, à ajouter avec `react-native-health-connect`
 * (séances : ExerciseSession, pas : Steps). Règle identique : RECORDING_METHOD_MANUAL_ENTRY = manuelle.
 */
export function isManualEntry(flags: { wasUserEntered?: boolean; recordingMethod?: string }): boolean {
  if (flags.wasUserEntered) return true;
  if (flags.recordingMethod === 'RECORDING_METHOD_MANUAL_ENTRY') return true;
  return flags.wasUserEntered === undefined && flags.recordingMethod === undefined;
}
