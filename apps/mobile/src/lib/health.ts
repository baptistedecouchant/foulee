// Version web : pas d'Apple Santé (voir health.native.ts pour iOS).
import type { Activity } from '@foulee/core';

export const healthAvailable = async () => false;
export const requestHealthAccess = async () => false;
export const stepsToday = async (): Promise<number | null> => null;
export const readRuns = async (_since: Date): Promise<Activity[]> => [];
export function isManualEntry(flags: { wasUserEntered?: boolean; recordingMethod?: string }): boolean {
  if (flags.wasUserEntered) return true;
  if (flags.recordingMethod === 'RECORDING_METHOD_MANUAL_ENTRY') return true;
  return flags.wasUserEntered === undefined && flags.recordingMethod === undefined;
}
