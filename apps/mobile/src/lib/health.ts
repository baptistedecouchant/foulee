// Lecture des activités enregistrées sur le téléphone.
//
// iOS     : Apple Santé (HealthKit) — séances Apple Watch et des apps qui y écrivent.
//           Envoi des séances sur la montre : WorkoutKit.
// Android : Health Connect.
// Garmin, Strava, Coros, Polar, Suunto : passent par leurs serveurs (webhooks), pas par ici.
//
// Ces modules natifs demandent un "development build" (pas Expo Go) :
//   npx expo install @kingstinct/react-native-healthkit react-native-health-connect
// puis déclarer leurs config plugins dans app.json. À brancher à l'étape suivante.

import type { Activity } from '@foulee/core';

export interface HealthAdapter {
  isAvailable(): Promise<boolean>;
  requestPermissions(): Promise<boolean>;
  /** Séances de course depuis `since`, avec trace GPS et FC si disponibles. */
  readRuns(since: Date): Promise<Activity[]>;
}

/**
 * Règle de sécurité : une séance est « manuelle » sauf preuve du contraire.
 *  - HealthKit : métadonnée HKMetadataKeyWasUserEntered = true → manuelle
 *  - Health Connect : metadata.recordingMethod === RECORDING_METHOD_MANUAL_ENTRY → manuelle
 * Le serveur traite de toute façon `manual` absent comme `true`.
 */
export function isManualEntry(flags: { wasUserEntered?: boolean; recordingMethod?: string }): boolean {
  if (flags.wasUserEntered) return true;
  if (flags.recordingMethod === 'RECORDING_METHOD_MANUAL_ENTRY') return true;
  return flags.wasUserEntered === undefined && flags.recordingMethod === undefined;
}
