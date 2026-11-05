// Moteur de séance guidée en direct (dans l'app, avec le GPS du téléphone).
//
// L'app lui envoie régulièrement le temps actif, la distance totale et l'allure du moment.
// Il renvoie des événements : changement de bloc, décompte, alertes d'allure, kilomètres,
// fin de séance. Il produit aussi les phrases à lire à voix haute.
// Pur et sans dépendance : testé ici, utilisé tel quel par l'app.

import type { PaceRange, PlannedSession, Zone } from './types.ts';
import { flattenSteps, ZONE_LABELS } from './plan.ts';

export interface LiveStep {
  index: number;
  zone: Zone;
  label: string;
  durationSec?: number;
  distanceM?: number;
  pace: PaceRange;
  /** Durée prévue (s), estimée à partir de l'allure pour un bloc en distance. */
  expectedSec: number;
  /** Position dans une série de répétitions (« 3 sur 8 »). */
  rep?: { n: number; of: number };
}

export function buildLiveSteps(session: PlannedSession): LiveStep[] {
  const flat = flattenSteps(session.steps);
  // Numérotation des répétitions : on compte les blocs « effort » consécutifs de même allure cible.
  const efforts = flat.map((b) => b.zone !== 'rec' && b.zone !== 'ef' && b.zone !== 'sl' && !b.label?.startsWith('Accélération'));
  const out: LiveStep[] = flat.map((b, i) => ({
    index: i,
    zone: b.zone,
    label: b.label ?? ZONE_LABELS[b.zone],
    durationSec: b.durationSec,
    distanceM: b.distanceM,
    pace: b.pace,
    expectedSec: Math.round(b.expectedSec),
  }));
  let i = 0;
  while (i < out.length) {
    if (!efforts[i]) {
      i++;
      continue;
    }
    const group: number[] = [];
    let j = i;
    while (j < out.length && (efforts[j] || out[j].zone === 'rec')) {
      if (efforts[j]) group.push(j);
      j++;
    }
    if (group.length > 1) group.forEach((g, k) => (out[g].rep = { n: k + 1, of: group.length }));
    i = j;
  }
  return out;
}

// ---------- Phrases pour la voix ----------

export function speakPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} minutes au kilomètre` : `${m} minutes ${r} au kilomètre`;
}

export function speakDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s} secondes`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (r === 0) return m === 1 ? '1 minute' : `${m} minutes`;
  return `${m} minute${m > 1 ? 's' : ''} ${r}`;
}

export function speakDistance(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} mètres`;
  const km = Math.round(m / 100) / 10;
  return `${String(km).replace('.', ',')} kilomètre${km >= 2 ? 's' : ''}`;
}

const mid = (p: PaceRange) => (p.lo + p.hi) / 2;

/** Annonce d'un bloc : quoi, à quelle allure, combien de temps ou de distance. */
export function announceStep(step: LiveStep, next?: LiveStep): string {
  const parts: string[] = [];
  const name = step.rep ? `${step.label} ${step.rep.n} sur ${step.rep.of}` : step.label;
  if (step.zone === 'rec') {
    parts.push(`Récupération : ${speakDuration(step.durationSec ?? step.expectedSec)} à allure très facile.`);
  } else if (step.durationSec != null) {
    const dist = (step.durationSec / mid(step.pace)) * 1000;
    parts.push(`${name}. ${speakDuration(step.durationSec)} à ${speakPace(mid(step.pace))}, soit environ ${speakDistance(dist)}.`);
  } else {
    parts.push(`${name}. ${speakDistance(step.distanceM ?? 0)} à ${speakPace(mid(step.pace))}, en ${speakDuration(step.expectedSec)} environ.`);
  }
  if (step.zone === 'rec' && next) parts.push(`Ensuite : ${next.rep ? `${next.label} ${next.rep.n} sur ${next.rep.of}` : next.label}.`);
  return parts.join(' ');
}

// ---------- Moteur ----------

export type LiveEvent =
  | { type: 'step_start'; step: LiveStep; next?: LiveStep; speech: string }
  | { type: 'countdown'; secondsLeft: number; speech: string }
  | { type: 'distance_left'; meters: number; speech: string }
  | { type: 'pace_alert'; direction: 'too_fast' | 'too_slow'; currentPace: number; speech: string }
  | { type: 'pace_ok'; speech: string }
  | { type: 'km'; km: number; avgPace: number; speech: string }
  | { type: 'finished'; speech: string };

export interface LiveUpdate {
  /** Temps actif total (pauses exclues), en secondes. */
  elapsedSec: number;
  /** Distance totale (m). */
  distanceM: number;
  /** Allure du moment (s/km), lissée sur ~20 s. Null si pas encore fiable. */
  paceSecPerKm: number | null;
  /** Horodatage réel (ms), pour enregistrer le début et la fin des blocs. */
  now: number;
}

export interface LiveOptions {
  /** Écart toléré avant alerte (fraction de l'allure). */
  fastTolerance: number;
  slowTolerance: number;
  /** Délai minimal entre deux alertes d'allure (s). */
  alertCooldownSec: number;
  /** Délai de mise en route au début d'un bloc avant toute alerte (s). */
  graceSec: number;
}

const DEFAULTS: LiveOptions = { fastTolerance: 0.04, slowTolerance: 0.06, alertCooldownSec: 25, graceSec: 20 };

export type PaceStatus = 'ok' | 'too_fast' | 'too_slow' | 'unknown';

export class LiveWorkout {
  readonly steps: LiveStep[];
  private opts: LiveOptions;
  private idx = -1;
  private stepStartSec = 0;
  private stepStartDist = 0;
  private lastAlertSec = -Infinity;
  private alerted = false;
  private lastCountdown = Infinity;
  private distanceWarned = false;
  private lastKm = 0;
  /** Début et fin réels de chaque bloc (epoch ms). */
  readonly laps: Array<{ start: number; end: number }> = [];
  finished = false;
  paceStatus: PaceStatus = 'unknown';

  constructor(session: PlannedSession, opts: Partial<LiveOptions> = {}) {
    this.steps = buildLiveSteps(session);
    this.opts = { ...DEFAULTS, ...opts };
  }

  get current(): LiveStep | undefined {
    return this.steps[this.idx];
  }

  get next(): LiveStep | undefined {
    return this.steps[this.idx + 1];
  }

  get stepIndex(): number {
    return this.idx;
  }

  /** Démarre la séance (après le « GO »). */
  start(now: number): LiveEvent[] {
    return this.enter(0, 0, 0, now);
  }

  /** Avancement du bloc en cours (0 → 1) et ce qu'il reste. */
  stepProgress(u: Pick<LiveUpdate, 'elapsedSec' | 'distanceM'>): { ratio: number; remainingSec?: number; remainingM?: number } {
    const s = this.current;
    if (!s) return { ratio: 1 };
    if (s.durationSec != null) {
      const done = u.elapsedSec - this.stepStartSec;
      return { ratio: Math.min(1, done / s.durationSec), remainingSec: Math.max(0, s.durationSec - done) };
    }
    const done = u.distanceM - this.stepStartDist;
    return { ratio: Math.min(1, done / (s.distanceM ?? 1)), remainingM: Math.max(0, (s.distanceM ?? 0) - done) };
  }

  /** Allure moyenne du bloc en cours (s/km). */
  stepAvgPace(u: Pick<LiveUpdate, 'elapsedSec' | 'distanceM'>): number | null {
    const d = u.distanceM - this.stepStartDist;
    const t = u.elapsedSec - this.stepStartSec;
    return d > 30 ? t / (d / 1000) : null;
  }

  update(u: LiveUpdate): LiveEvent[] {
    if (this.finished || this.idx < 0) return [];
    const ev: LiveEvent[] = [];
    const s = this.current!;

    // Kilomètres
    const km = Math.floor(u.distanceM / 1000);
    if (km > this.lastKm) {
      this.lastKm = km;
      const avg = u.elapsedSec / (u.distanceM / 1000);
      ev.push({ type: 'km', km, avgPace: avg, speech: `${km} kilomètre${km > 1 ? 's' : ''}. Allure moyenne : ${speakPace(avg)}.` });
    }

    // Fin du bloc ?
    const p = this.stepProgress(u);
    if (p.ratio >= 1) {
      this.laps[this.idx].end = u.now;
      if (this.idx + 1 >= this.steps.length) {
        this.finished = true;
        ev.push({ type: 'finished', speech: 'Séance terminée, bravo ! Pense à t’étirer doucement et à bien t’hydrater.' });
        return ev;
      }
      return [...ev, ...this.enter(this.idx + 1, u.elapsedSec, u.distanceM, u.now)];
    }

    // Décompte avant changement (blocs en temps) : 3, 2, 1
    if (p.remainingSec != null && s.durationSec != null && s.durationSec >= 15) {
      const left = Math.ceil(p.remainingSec);
      if (left <= 3 && left >= 1 && left < this.lastCountdown) {
        this.lastCountdown = left;
        ev.push({ type: 'countdown', secondsLeft: left, speech: String(left) });
      }
    }
    // Blocs en distance : « plus que 100 mètres »
    if (p.remainingM != null && (s.distanceM ?? 0) >= 400 && p.remainingM <= 100 && !this.distanceWarned) {
      this.distanceWarned = true;
      ev.push({ type: 'distance_left', meters: 100, speech: 'Plus que 100 mètres, tiens bon !' });
    }

    // Alertes d'allure : pas pendant les récupérations, ni au début du bloc.
    const inStep = u.elapsedSec - this.stepStartSec;
    if (s.zone === 'rec' || u.paceSecPerKm == null || inStep < this.opts.graceSec) {
      this.paceStatus = s.zone === 'rec' ? 'ok' : 'unknown';
      return ev;
    }
    const pace = u.paceSecPerKm;
    const status: PaceStatus =
      pace < s.pace.lo * (1 - this.opts.fastTolerance) ? 'too_fast' : pace > s.pace.hi * (1 + this.opts.slowTolerance) ? 'too_slow' : 'ok';
    this.paceStatus = status;

    if (status === 'ok') {
      if (this.alerted) {
        this.alerted = false;
        ev.push({ type: 'pace_ok', speech: 'C’est la bonne allure, garde ce rythme.' });
      }
    } else if (u.elapsedSec - this.lastAlertSec >= this.opts.alertCooldownSec) {
      this.lastAlertSec = u.elapsedSec;
      this.alerted = true;
      const target = mid(s.pace);
      ev.push({
        type: 'pace_alert',
        direction: status,
        currentPace: pace,
        speech:
          status === 'too_fast'
            ? `Trop rapide : tu es à ${speakPace(pace)}. Ralentis, vise ${speakPace(target)}.`
            : `Un peu lent : tu es à ${speakPace(pace)}. Accélère, vise ${speakPace(target)}.`,
      });
    }
    return ev;
  }

  /** Passer au bloc suivant à la main (ex. fin de l'échauffement anticipée). */
  skip(u: LiveUpdate): LiveEvent[] {
    if (this.finished || this.idx < 0) return [];
    this.laps[this.idx].end = u.now;
    if (this.idx + 1 >= this.steps.length) {
      this.finished = true;
      return [{ type: 'finished', speech: 'Séance terminée, bravo !' }];
    }
    return this.enter(this.idx + 1, u.elapsedSec, u.distanceM, u.now);
  }

  /** Clôture les blocs ouverts (fin anticipée). */
  close(now: number) {
    if (this.idx >= 0 && this.laps[this.idx] && !this.laps[this.idx].end) this.laps[this.idx].end = now;
    this.finished = true;
  }

  private enter(i: number, elapsedSec: number, distanceM: number, now: number): LiveEvent[] {
    this.idx = i;
    this.stepStartSec = elapsedSec;
    this.stepStartDist = distanceM;
    this.lastCountdown = Infinity;
    this.distanceWarned = false;
    this.alerted = false;
    this.lastAlertSec = elapsedSec; // délai de grâce avant la première alerte
    this.paceStatus = 'unknown';
    this.laps[i] = { start: now, end: 0 };
    const step = this.steps[i];
    const next = this.steps[i + 1];
    return [{ type: 'step_start', step, next, speech: announceStep(step, next) }];
  }
}
