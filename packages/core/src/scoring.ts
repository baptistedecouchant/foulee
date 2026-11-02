// Validation d'une séance (prévu vs réalisé) et barème de points.
// On récompense le RESPECT DU PLAN, pas le volume : courir trop vite un footing
// rapporte moins que le courir à la bonne allure.

import type { Activity, Plan, PlannedSession } from './types.ts';
import type { TrustReport } from './antiCheat.ts';
import { flattenSteps } from './plan.ts';
import { segmentSpeeds } from './antiCheat.ts';
import { ECONOMY, type Earning } from './economy.ts';

export type ValidationStatus = 'validee' | 'partielle' | 'non_validee' | 'refusee' | 'en_revue';

export interface SessionValidation {
  sessionId: string;
  status: ValidationStatus;
  /** 0-1 */
  score: number;
  volumeScore: number;
  intensityScore: number;
  points: number;
  feedback: string;
}

/** Points de séance : voir `ECONOMY` (RunCoins). Conservé pour compatibilité. */
export const POINTS = {
  /** Valeur indicative affichée : 100 RC = 1 €. */
  eurosPer100: 1,
} as const;

/** Fenêtre de validation : de 2 jours avant à 2 jours après la date prévue (on peut décaler une séance). */
export function isInWindow(session: PlannedSession, activityStart: number): boolean {
  const [y, m, d] = session.date.split('-').map(Number);
  const planned = new Date(y, m - 1, d).getTime();
  return activityStart >= planned - 2 * 86_400_000 && activityStart < planned + 3 * 86_400_000;
}

/**
 * Part du temps passé dans les allures cibles. La séance envoyée sur la montre
 * avance bloc par bloc : on aligne donc les blocs prévus sur la chronologie réelle.
 * Les récupérations ne comptent pas (trotter plus vite n'est pas une faute).
 */
export function timeInTarget(session: PlannedSession, activity: Activity): number {
  const track = activity.track ?? [];
  const blocks = flattenSteps(session.steps);
  if (track.length < 10) {
    // sans trace (tapis) : on se fie à l'allure moyenne vs la cible principale
    const main = blocks.filter((b) => b.zone !== 'rec').sort((a, b) => b.expectedSec - a.expectedSec)[0];
    if (!main || activity.distanceM <= 0) return 0;
    const pace = activity.durationSec / (activity.distanceM / 1000);
    return pace >= main.pace.lo * 0.95 && pace <= main.pace.hi * 1.08 ? 0.9 : 0.4;
  }

  const segs = segmentSpeeds(track);

  // Séance guidée : on connaît le début et la fin réels de chaque bloc.
  if (activity.laps && activity.laps.length === blocks.length) {
    let inTarget = 0;
    let counted = 0;
    blocks.forEach((b, i) => {
      if (b.zone === 'rec') return;
      const lap = activity.laps![i];
      let d = 0;
      let dt = 0;
      for (const s of segs) {
        if (s.t > lap.start && s.t <= lap.end) {
          d += s.d;
          dt += s.dt;
        }
      }
      counted += b.expectedSec;
      if (dt <= 0 || d <= 0) return;
      const pace = dt / (d / 1000);
      if (pace >= b.pace.lo * 0.95 && pace <= b.pace.hi * 1.08) inTarget += b.expectedSec;
    });
    return counted > 0 ? inTarget / counted : 0;
  }

  const t0 = track[0].t;
  let cursor = 0;
  let inTarget = 0;
  let counted = 0;
  for (const b of blocks) {
    const start = cursor;
    const end = cursor + b.expectedSec;
    cursor = end;
    if (b.zone === 'rec') continue;
    let d = 0;
    let dt = 0;
    for (const s of segs) {
      const rel = (s.t - t0) / 1000;
      if (rel > start && rel <= end) {
        d += s.d;
        dt += s.dt;
      }
    }
    if (dt < b.expectedSec * 0.5 || d <= 0) {
      counted += b.expectedSec; // bloc non couru
      continue;
    }
    const pace = dt / (d / 1000);
    // tolérance : 5 % plus rapide, 8 % plus lent (GPS, relances, terrain)
    if (pace >= b.pace.lo * 0.95 && pace <= b.pace.hi * 1.08) inTarget += b.expectedSec;
    counted += b.expectedSec;
  }
  return counted > 0 ? inTarget / counted : 0;
}

export function evaluateSession(session: PlannedSession, activity: Activity, trust: TrustReport): SessionValidation {
  const base = { sessionId: session.id, volumeScore: 0, intensityScore: 0 };

  if (trust.verdict === 'rejected') {
    const reason = trust.flags.find((f) => f.severity === 'critical')?.message ?? 'Activité non vérifiable.';
    return { ...base, status: 'refusee', score: 0, points: 0, feedback: reason };
  }
  if (!isInWindow(session, activity.startTime)) {
    return { ...base, status: 'non_validee', score: 0, points: 0, feedback: 'Activité en dehors de la période prévue pour cette séance.' };
  }

  const r = activity.durationSec / Math.max(1, session.durationSec);
  const volumeScore = r >= 0.85 && r <= 1.15 ? 1 : r < 0.85 ? Math.max(0, (r - 0.5) / 0.35) : Math.max(0, (1.5 - r) / 0.35);
  const tit = timeInTarget(session, activity);
  const intensityScore = Math.min(1, tit / 0.8);
  const score = Math.round((0.5 * volumeScore + 0.5 * intensityScore) * 100) / 100;

  let feedback = 'Séance conforme au plan. Bravo !';
  if (r < 0.85) feedback = `Séance écourtée : ${Math.round(r * 100)} % de la durée prévue.`;
  else if (r > 1.15) feedback = 'Séance plus longue que prévu : respecter le volume protège des blessures.';
  if (intensityScore < 0.85) {
    feedback +=
      session.type === 'ef' || session.type === 'sl' || session.type === 'lignes'
        ? ' Trop rapide pour une séance d’endurance : ralentis, c’est là que se construit le fond.'
        : ' Allures cibles peu respectées sur les fractions.';
    if (feedback.startsWith('Séance conforme')) feedback = feedback.replace('Séance conforme au plan. Bravo ! ', '');
  }

  if (trust.verdict === 'review') {
    return { ...base, volumeScore, intensityScore, status: 'en_revue', score, points: 0, feedback: 'Activité en cours de vérification. Les points seront crédités après contrôle.' };
  }

  const status: ValidationStatus = score >= 0.85 ? 'validee' : score >= 0.5 ? 'partielle' : 'non_validee';
  const points = status === 'validee' ? ECONOMY.sessionValidated : status === 'partielle' ? ECONOMY.sessionPartial : 0;
  return { ...base, volumeScore, intensityScore, status, score, points, feedback };
}

/**
 * Gains en RunCoins dus pour un plan, AVANT plafonds (voir `applyCaps`).
 * Les bonus « plan terminé » et « objectif atteint » rapportent de l'XP, pas de RC (trésorerie).
 */
export function computeLedger(plan: Plan, validations: Record<string, SessionValidation>, refPrefix = ''): Earning[] {
  const out: Earning[] = [];
  const ok = (id: string) => ['validee', 'partielle'].includes(validations[id]?.status ?? '');
  for (const s of plan.sessions) {
    const v = validations[s.id];
    if (v && v.points > 0) out.push({ kind: 'session', label: s.title, amount: v.points, date: s.date, ref: `${refPrefix}${s.id}` });
  }
  for (const w of plan.weeks) {
    const ss = plan.sessions.filter((s) => s.week === w.n);
    if (ss.length && ss.every((s) => ok(s.id))) {
      out.push({ kind: 'week', label: `Semaine ${w.n} complète`, amount: ECONOMY.weekComplete, date: ss[ss.length - 1].date, ref: `${refPrefix}week-${w.n}` });
    }
  }
  return out;
}
