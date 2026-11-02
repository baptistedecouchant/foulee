// Anti-triche GPS et capteurs.
//
// Principe : une récompense n'est versée que pour une activité ENREGISTRÉE PAR UN
// CAPTEUR et PHYSIQUEMENT PLAUSIBLE pour un coureur. Cette analyse tourne côté
// serveur (jamais sur le téléphone, qui peut être modifié). Le client peut
// l'utiliser pour prévenir l'utilisateur, mais seul le verdict serveur compte.

import type { Activity, TrackPoint } from './types.ts';

export type Severity = 'info' | 'warning' | 'critical';

export interface Flag {
  code:
    | 'MANUAL_ENTRY'
    | 'MOCK_LOCATION'
    | 'NO_TRACK'
    | 'TIMESTAMPS_INVALID'
    | 'TELEPORT'
    | 'VEHICLE_SPEED'
    | 'IMPOSSIBLE_ACCELERATION'
    | 'SYNTHETIC_TRACK'
    | 'CADENCE_MISMATCH'
    | 'HEART_RATE_FLAT'
    | 'HEART_RATE_OUT_OF_RANGE'
    | 'DISTANCE_MISMATCH'
    | 'LOW_GPS_ACCURACY'
    | 'FUTURE_DATE';
  severity: Severity;
  message: string;
}

export interface TrackMetrics {
  points: number;
  trackDistanceM: number;
  maxRollingSpeed: number; // m/s, moyenne glissante 30 s
  teleports: number;
  speedCv: number; // coefficient de variation de la vitesse
  medianAccuracy?: number;
}

export interface TrustReport {
  verdict: 'trusted' | 'review' | 'rejected';
  trustScore: number; // 0-100
  flags: Flag[];
  metrics?: TrackMetrics;
}

// Seuils physiologiques (course à pied). Réglables par sport.
export const RUNNING_LIMITS = {
  /** Au-delà, ce n'est pas de la course (record du monde du 1500 m ≈ 7,3 m/s). */
  maxSustainedSpeed: 7.5,
  /** Saut instantané entre deux points GPS. */
  teleportSpeed: 15,
  teleportMinDistance: 50,
  /** Accélération humaine max réaliste (m/s²), en dehors du sprint départ. */
  maxAcceleration: 4,
  minHr: 35,
  maxHr: 230,
  /** Longueur de foulée plausible (m) = vitesse / (cadence / 60). */
  minStride: 0.4,
  maxStride: 2.6,
} as const;

const PENALTY: Record<Severity, number> = { info: 0, warning: 20, critical: 100 };

/** Distance en mètres entre deux points (formule de haversine). */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function meanStd(xs: number[]): { mean: number; std: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const std = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  return { mean, std };
}

/** Vitesses instantanées (m/s) entre points consécutifs, avec leurs durées. */
export function segmentSpeeds(track: TrackPoint[]): Array<{ v: number; dt: number; d: number; t: number }> {
  const out: Array<{ v: number; dt: number; d: number; t: number }> = [];
  for (let i = 1; i < track.length; i++) {
    const dt = (track[i].t - track[i - 1].t) / 1000;
    if (dt <= 0) continue;
    const d = haversine(track[i - 1], track[i]);
    out.push({ v: d / dt, dt, d, t: track[i].t });
  }
  return out;
}

export function analyzeActivity(activity: Activity, now: number = Date.now()): TrustReport {
  const flags: Flag[] = [];
  const add = (code: Flag['code'], severity: Severity, message: string) => flags.push({ code, severity, message });

  // 1. Saisie manuelle : jamais récompensée.
  if (activity.manual) {
    add('MANUAL_ENTRY', 'critical', 'Activité saisie à la main : impossible de vérifier qu’elle a eu lieu.');
  }

  if (activity.startTime > now + 5 * 60_000) {
    add('FUTURE_DATE', 'critical', 'Date de début dans le futur.');
  }

  const track = activity.track ?? [];

  // 2. Pas de trace : accepté seulement sur tapis, avec un capteur cardio.
  if (track.length < 10) {
    if (activity.indoor && activity.avgHr) {
      add('NO_TRACK', 'info', 'Séance sur tapis sans GPS : validée sur la durée et la fréquence cardiaque.');
    } else if (activity.indoor) {
      add('NO_TRACK', 'warning', 'Séance sur tapis sans fréquence cardiaque : vérification limitée.');
    } else {
      add('NO_TRACK', 'warning', 'Aucune trace GPS reçue pour une sortie en extérieur.');
    }
    return finalize(flags);
  }

  // 3. Position simulée (Android signale les fausses positions).
  const mocked = track.filter((p) => p.mocked).length;
  if (mocked > 0) {
    add('MOCK_LOCATION', 'critical', `${mocked} position(s) issues d’une application de localisation fictive.`);
  }

  // 4. Horodatages : strictement croissants.
  let nonMonotonic = 0;
  for (let i = 1; i < track.length; i++) if (track[i].t <= track[i - 1].t) nonMonotonic++;
  if (nonMonotonic > track.length * 0.01) {
    add('TIMESTAMPS_INVALID', 'critical', 'Horodatages désordonnés ou dupliqués : trace probablement modifiée.');
  }

  const segs = segmentSpeeds(track);

  // 5. Téléportations : saut impossible entre deux points.
  const teleports = segs.filter((s) => s.v > RUNNING_LIMITS.teleportSpeed && s.d > RUNNING_LIMITS.teleportMinDistance).length;
  if (teleports >= 3) {
    add('TELEPORT', 'critical', `${teleports} sauts de position impossibles à pied.`);
  } else if (teleports > 0) {
    add('TELEPORT', 'info', `${teleports} saut(s) GPS isolé(s), probablement une perte de signal.`);
  }

  // 6. Vitesse de véhicule soutenue (moyenne glissante sur 30 s).
  let maxRolling = 0;
  {
    let j = 0;
    let dist = 0;
    let time = 0;
    for (let i = 0; i < segs.length; i++) {
      dist += segs[i].d;
      time += segs[i].dt;
      while (time > 30 && j < i) {
        dist -= segs[j].d;
        time -= segs[j].dt;
        j++;
      }
      if (time >= 20) maxRolling = Math.max(maxRolling, dist / time);
    }
  }
  if (maxRolling > RUNNING_LIMITS.maxSustainedSpeed) {
    add(
      'VEHICLE_SPEED',
      'critical',
      `Vitesse soutenue de ${(maxRolling * 3.6).toFixed(0)} km/h : incompatible avec la course à pied.`,
    );
  }

  // 7. Accélérations impossibles (hors téléportations déjà comptées).
  let hardAccel = 0;
  for (let i = 1; i < segs.length; i++) {
    const a = Math.abs(segs[i].v - segs[i - 1].v) / segs[i].dt;
    if (a > RUNNING_LIMITS.maxAcceleration && segs[i].v < RUNNING_LIMITS.teleportSpeed) hardAccel++;
  }
  if (hardAccel > segs.length * 0.05) {
    add('IMPOSSIBLE_ACCELERATION', 'warning', 'Variations de vitesse trop brutales pour un coureur.');
  }

  // 8. Trace synthétique : vitesse ET échantillonnage parfaitement réguliers.
  //    Une vraie trace GPS a toujours du bruit ; les simulateurs de parcours non.
  const moving = segs.filter((s) => s.v > 1);
  const { mean: vMean, std: vStd } = moving.length ? meanStd(moving.map((s) => s.v)) : { mean: 0, std: 0 };
  const speedCv = vMean > 0 ? vStd / vMean : 0;
  const dts = segs.map((s) => s.dt);
  const { mean: dtMean, std: dtStd } = meanStd(dts);
  if (moving.length > 120 && speedCv < 0.015 && dtStd / dtMean < 0.01) {
    add('SYNTHETIC_TRACK', 'critical', 'Trace trop parfaite (vitesse et rythme d’enregistrement constants) : simulation probable.');
  }

  // 9. Cadence incohérente avec la vitesse (vélo, voiture, trottinette…).
  const withCad = track.filter((p) => p.cadence && p.cadence > 0);
  if (withCad.length > track.length * 0.5 && vMean > 0) {
    const cad = median(withCad.map((p) => p.cadence!));
    const stride = vMean / (cad / 60);
    if (stride > RUNNING_LIMITS.maxStride || stride < RUNNING_LIMITS.minStride) {
      add(
        'CADENCE_MISMATCH',
        stride > RUNNING_LIMITS.maxStride * 1.5 ? 'critical' : 'warning',
        `Foulée calculée de ${stride.toFixed(1)} m : la cadence ne correspond pas à la vitesse.`,
      );
    }
  }

  // 10. Fréquence cardiaque : présente mais figée ou hors limites.
  const hrs = track.map((p) => p.hr).filter((h): h is number => h != null && h > 0);
  if (hrs.length > 60) {
    const { std } = meanStd(hrs);
    if (std < 1) add('HEART_RATE_FLAT', 'warning', 'Fréquence cardiaque parfaitement constante : capteur suspect.');
    const out = hrs.filter((h) => h < RUNNING_LIMITS.minHr || h > RUNNING_LIMITS.maxHr).length;
    if (out > hrs.length * 0.05) add('HEART_RATE_OUT_OF_RANGE', 'warning', 'Fréquence cardiaque hors des valeurs humaines.');
  }

  // 11. Distance déclarée vs distance de la trace.
  const trackDistanceM = segs.reduce((a, s) => a + (s.v <= RUNNING_LIMITS.teleportSpeed ? s.d : 0), 0);
  if (activity.distanceM > 0) {
    const ratio = activity.distanceM / Math.max(1, trackDistanceM);
    if (ratio > 1.2 || ratio < 0.8) {
      add('DISTANCE_MISMATCH', ratio > 1.5 ? 'critical' : 'warning', 'La distance déclarée ne correspond pas à la trace GPS.');
    }
  }

  // 12. Précision GPS faible : on prévient, on ne pénalise pas.
  const acc = track.map((p) => p.accuracy).filter((a): a is number => a != null);
  const medianAccuracy = acc.length ? median(acc) : undefined;
  if (medianAccuracy != null && medianAccuracy > 50) {
    add('LOW_GPS_ACCURACY', 'info', 'Signal GPS faible pendant la sortie.');
  }

  return finalize(flags, {
    points: track.length,
    trackDistanceM: Math.round(trackDistanceM),
    maxRollingSpeed: Math.round(maxRolling * 100) / 100,
    teleports,
    speedCv: Math.round(speedCv * 1000) / 1000,
    medianAccuracy,
  });
}

function finalize(flags: Flag[], metrics?: TrackMetrics): TrustReport {
  const trustScore = Math.max(0, 100 - flags.reduce((a, f) => a + PENALTY[f.severity], 0));
  const verdict = flags.some((f) => f.severity === 'critical') ? 'rejected' : trustScore < 60 ? 'review' : 'trusted';
  return { verdict, trustScore, flags, metrics };
}

// ---------- Empreinte de trace : détecte une même trace renvoyée deux fois ----------

/** Hash FNV-1a 32 bits, suffisant pour une empreinte (pas un usage cryptographique). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Empreinte indépendante de la date : coordonnées arrondies (~11 m) et temps
 * relatif au départ. Deux vraies sorties sur le même parcours ne donnent jamais
 * exactement la même empreinte ; une trace rejouée, si.
 */
export function trackFingerprint(track: TrackPoint[]): string | null {
  if (track.length < 30) return null;
  const t0 = track[0].t;
  const step = Math.max(1, Math.floor(track.length / 200));
  const parts: string[] = [];
  for (let i = 0; i < track.length; i += step) {
    const p = track[i];
    parts.push(`${p.lat.toFixed(4)},${p.lon.toFixed(4)},${Math.round((p.t - t0) / 10_000)}`);
  }
  return fnv1a(parts.join('|'));
}
