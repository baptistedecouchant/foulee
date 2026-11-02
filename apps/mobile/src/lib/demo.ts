// Mode démo : simule l'arrivée d'une activité depuis la montre, puis applique
// EXACTEMENT les mêmes contrôles que le serveur (anti-triche + validation).
// Sert à tester l'app sans compte Garmin/Strava ni backend.

import {
  analyzeActivity,
  evaluateSession,
  flattenSteps,
  type Activity,
  type PlannedSession,
  type SessionValidation,
  type TrackPoint,
  type TrustReport,
} from '@foulee/core';

export type Scenario = 'conforme' | 'trop_rapide' | 'ecourtee' | 'manuelle' | 'voiture' | 'gps_simule';

export const SCENARIOS: Array<{ id: Scenario; label: string }> = [
  { id: 'conforme', label: 'Séance bien suivie' },
  { id: 'trop_rapide', label: 'Courue trop vite' },
  { id: 'ecourtee', label: 'Écourtée' },
  { id: 'manuelle', label: 'Saisie à la main' },
  { id: 'voiture', label: 'Une partie en voiture' },
  { id: 'gps_simule', label: 'GPS falsifié' },
];

export type DemoResult = SessionValidation & { trust: TrustReport; source: string };

export function simulate(session: PlannedSession, scenario: Scenario, source: string): DemoResult {
  const [y, m, d] = session.date.split('-').map(Number);
  const start = new Date(y, m - 1, d, 18).getTime();
  const speedFactor = scenario === 'trop_rapide' ? 0.82 : 1;
  const ratio = scenario === 'ecourtee' ? 0.6 : 1;

  const blocks = flattenSteps(session.steps).map((b) => ({
    sec: Math.round(b.expectedSec * ratio),
    pace: ((b.pace.lo + b.pace.hi) / 2) * speedFactor,
  }));
  if (scenario === 'voiture') blocks.splice(1, 0, { sec: 600, pace: 90 });

  const track: TrackPoint[] = [];
  let lat = 48.8566;
  let lon = 2.3522;
  let heading = Math.random() * 6;
  let t = start;
  const synthetic = scenario === 'gps_simule';
  for (const b of blocks) {
    for (let i = 0; i < b.sec; i++) {
      const v = (1000 / b.pace) * (synthetic ? 1 : 0.94 + Math.random() * 0.12);
      heading += synthetic ? 0 : (Math.random() - 0.5) * 0.2;
      lat += (v * Math.cos(heading)) / 111_320;
      lon += (v * Math.sin(heading)) / (111_320 * Math.cos((lat * Math.PI) / 180));
      t += synthetic ? 1000 : 1000 + Math.round((Math.random() - 0.5) * 60);
      track.push({
        t,
        lat,
        lon,
        hr: 135 + Math.round(Math.random() * 25),
        cadence: b.pace < 120 ? 0 : 168 + Math.round((Math.random() - 0.5) * 8),
        accuracy: 4 + Math.random() * 6,
        mocked: synthetic && i % 5 === 0 ? true : undefined,
      });
    }
  }

  let dist = 0;
  for (let i = 1; i < track.length; i++) {
    const dLat = (track[i].lat - track[i - 1].lat) * 111_320;
    const dLon = (track[i].lon - track[i - 1].lon) * 111_320 * Math.cos((track[i].lat * Math.PI) / 180);
    dist += Math.hypot(dLat, dLon);
  }

  const activity: Activity = {
    source: source as Activity['source'],
    externalId: `demo-${session.id}-${Date.now()}`,
    sport: 'running',
    startTime: start,
    durationSec: (t - start) / 1000,
    distanceM: dist,
    manual: scenario === 'manuelle',
    track: scenario === 'manuelle' ? undefined : track,
  };

  // En démo, les séances peuvent être dans le futur : on se place juste après.
  const now = Math.max(Date.now(), t + 60_000);
  const trust = analyzeActivity(activity, now);
  return { ...evaluateSession(session, activity, trust), trust, source };
}
