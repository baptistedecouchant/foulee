// Moteur de plan à règles : calcule la structure, les volumes et les allures.
// L'IA ne fait qu'enrichir les textes (conseils, nutrition), jamais ces chiffres.

import type {
  PaceRange,
  Phase,
  Plan,
  PlanRequest,
  PlanWeek,
  PlannedSession,
  SessionType,
  Step,
  Zone,
} from './types.ts';
import { currentPace10k, riegel } from './goal.ts';
import { addDays, daysBetween, distanceLabel, formatTime, weeksUntil } from './time.ts';

/** Jours d'entraînement (0 = lundi) selon le nombre de séances. */
const DAY_SETS: Record<2 | 3 | 4 | 5, number[]> = {
  2: [2, 6],
  3: [1, 3, 6],
  4: [1, 3, 5, 6],
  5: [0, 1, 3, 5, 6],
};

export const ZONE_LABELS: Record<Zone, string> = {
  ef: 'Endurance',
  sl: 'Sortie longue',
  rec: 'Récupération',
  seuil: 'Seuil',
  vma: 'VMA',
  fart: 'Rapide',
  spe: 'Allure objectif',
};

/** Intensité relative (0-1), utilisée pour le graphique de séance. */
export const ZONE_INTENSITY: Record<Zone, number> = {
  rec: 0.18,
  ef: 0.35,
  sl: 0.42,
  seuil: 0.7,
  spe: 0.8,
  fart: 0.85,
  vma: 1,
};

const BASE_POINTS: Record<SessionType, number> = {
  ef: 60,
  lignes: 60,
  sl: 100,
  fartlek: 100,
  vma: 100,
  seuil: 100,
  spe: 100,
  race: 500,
};

const PHASE_FOCUS: Record<Phase, string> = {
  base: "Construire l'endurance et la régularité",
  dev: 'Développer la vitesse (VMA et seuil)',
  spe: "Travailler l'allure objectif",
  taper: 'Affûtage : moins de volume, garder du rythme',
};

const DEFAULT_TIPS: Record<SessionType, string> = {
  ef: 'Allure conversation : tu dois pouvoir parler en phrases complètes. Plus lent que tu ne le crois.',
  lignes: 'Accélérations progressives et relâchées, sans sprinter. Récupère en trottinant.',
  sl: "Pars lentement et garde une allure régulière. C'est la durée qui compte, pas la vitesse.",
  fartlek: 'Phases rapides soutenues mais contrôlées : la dernière doit être aussi bonne que la première.',
  vma: 'Régularité avant tout : le dernier fractionné aussi vite que le premier.',
  seuil: 'Allure « confortablement difficile » : tu peux dire quelques mots, pas tenir une conversation.',
  spe: "Mémorise les sensations de cette allure : c'est celle du jour J.",
  race: 'Pars à l’allure prévue, pas plus vite. La première moitié se retient, la seconde se gère.',
};

const DEFAULT_NUTRITION: Record<SessionType, string> = {
  ef: "Pas besoin de manger avant si ton dernier repas date de moins de 3 h. Bois un verre d'eau.",
  lignes: "Pas besoin de manger avant si ton dernier repas date de moins de 3 h. Bois un verre d'eau.",
  sl: 'Repas riche en glucides 2 à 3 h avant. Au-delà d’1 h 15, emporte de l’eau et de quoi recharger (gel, fruits secs).',
  fartlek: 'Évite de courir à jeun : une collation glucidique 1 à 2 h avant (banane, pain, compote).',
  vma: 'Évite de courir à jeun : une collation glucidique 1 à 2 h avant (banane, pain, compote).',
  seuil: 'Évite de courir à jeun. Après la séance : glucides et protéines dans les 2 h (yaourt, fruit, pain).',
  spe: 'Teste ici ce que tu mangeras avant la course. Rien de nouveau le jour J.',
  race: 'Repas habituel et digeste 3 h avant. Rien de nouveau le jour J. Bois régulièrement la veille.',
};

type Zones = Record<Zone, PaceRange>;

function zonesFor(fit10k: number, racePace: number): Zones {
  const r = (a: number, b: number): PaceRange => ({ lo: Math.round(fit10k * a), hi: Math.round(fit10k * b) });
  return {
    ef: r(1.22, 1.32),
    sl: r(1.17, 1.27),
    rec: r(1.45, 1.7),
    seuil: r(1.03, 1.06),
    vma: r(0.9, 0.94),
    fart: r(0.96, 1.0),
    spe: { lo: Math.round(racePace - 3), hi: Math.round(racePace + 3) },
  };
}

// ---------- Mesure des séances ----------

const mid = (p: PaceRange) => (p.lo + p.hi) / 2;

export function measureSteps(steps: Step[]): { durationSec: number; distanceM: number } {
  let durationSec = 0;
  let distanceM = 0;
  for (const s of steps) {
    if (s.kind === 'repeat') {
      const inner = measureSteps(s.steps);
      durationSec += inner.durationSec * s.times;
      distanceM += inner.distanceM * s.times;
    } else if (s.durationSec != null) {
      durationSec += s.durationSec;
      distanceM += (s.durationSec / mid(s.pace)) * 1000;
    } else if (s.distanceM != null) {
      distanceM += s.distanceM;
      durationSec += (s.distanceM / 1000) * mid(s.pace);
    }
  }
  return { durationSec: Math.round(durationSec), distanceM: Math.round(distanceM) };
}

/** Déplie les répétitions : liste linéaire des blocs, dans l'ordre d'exécution. */
export function flattenSteps(steps: Step[]): Array<Extract<Step, { kind: 'run' }> & { expectedSec: number }> {
  const out: Array<Extract<Step, { kind: 'run' }> & { expectedSec: number }> = [];
  for (const s of steps) {
    if (s.kind === 'repeat') {
      for (let i = 0; i < s.times; i++) out.push(...flattenSteps(s.steps));
    } else {
      const expectedSec = s.durationSec ?? ((s.distanceM ?? 0) / 1000) * mid(s.pace);
      out.push({ ...s, expectedSec });
    }
  }
  return out;
}

// ---------- Construction ----------

function phaseOf(w: number, n: number, taper: number, spec: number, base: number): Phase {
  if (w >= n - taper) return 'taper';
  if (w < base) return 'base';
  if (w < n - taper - spec) return 'dev';
  return 'spe';
}

function weekTypes(sessions: 2 | 3 | 4 | 5, phase: Phase): SessionType[] {
  const q1: SessionType = phase === 'base' ? 'fartlek' : phase === 'dev' ? 'vma' : 'spe';
  const q2: SessionType = phase === 'base' || phase === 'taper' ? 'lignes' : 'seuil';
  const map: Record<2 | 3 | 4 | 5, SessionType[]> = {
    2: [q1, 'sl'],
    3: [q1, q2, 'sl'],
    4: [q1, 'ef', q2, 'sl'],
    5: ['ef', q1, 'ef', q2, 'sl'],
  };
  return [...map[sessions]];
}

const round5 = (min: number) => Math.round(min / 5) * 5;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

function fmtDist(m: number) {
  return m < 1000 ? `${m} m` : `${String(m / 1000).replace('.', ',')} km`;
}

export function buildPlan(req: PlanRequest): Plan {
  const { goal, sessionsPerWeek: N } = req;
  const D = goal.distanceKm;
  const chrono = goal.mode === 'chrono' && goal.targetTimeSec != null;
  const n = Math.max(1, weeksUntil(req.startDate, goal.eventDate));
  const p10 = currentPace10k(req.level);

  const goalP10 = chrono ? riegel(goal.targetTimeSec!, D, 10) / 10 : p10 * (1 - Math.min(0.005 * n, 0.06));
  const racePace = chrono ? goal.targetTimeSec! / D : riegel(goalP10 * 10, 10, D) / D;

  const taper = D > 30 ? 2 : 1;
  const spec = Math.max(1, Math.round(n * 0.25));
  const base = Math.max(1, Math.round(n * 0.3));

  const startMin = N * (p10 > 420 ? 30 : p10 > 360 ? 38 : p10 > 300 ? 45 : 52);
  const peakMin = startMin * 1.6;
  const slCap = D <= 5 ? 70 : D <= 10 ? 85 : D <= 21.2 ? 125 : 190;
  const raceDow = clamp(daysBetween(addDays(req.startDate, (n - 1) * 7), goal.eventDate), 0, 6);

  const weeks: PlanWeek[] = [];
  const sessions: PlannedSession[] = [];
  let cur = startMin;

  for (let w = 0; w < n; w++) {
    const phase = phaseOf(w, n, taper, spec, base);
    const last = w === n - 1;
    const deload = phase !== 'taper' && w > 0 && (w + 1) % 4 === 0;
    let vol: number;
    if (phase === 'taper') vol = cur * (last ? 0.55 : 0.75);
    else if (deload) vol = cur * 0.78;
    else {
      vol = cur;
      cur = Math.min(cur * 1.07, peakMin);
    }

    const fit = p10 + (goalP10 - p10) * (n > 1 ? w / (n - 1) : 1);
    const Z = zonesFor(fit, racePace);
    const run = (zone: Zone, o: { durationSec?: number; distanceM?: number; label?: string }): Step => ({
      kind: 'run',
      zone,
      pace: Z[zone],
      ...o,
    });
    const warm = () => run('ef', { durationSec: 900, label: 'Échauffement' });
    const cool = () => run('ef', { durationSec: 600, label: 'Retour au calme' });

    // progression dans la phase (0 → 1)
    let phaseStart = w;
    while (phaseStart > 0 && phaseOf(phaseStart - 1, n, taper, spec, base) === phase) phaseStart--;
    let phaseEnd = w;
    while (phaseEnd < n - 1 && phaseOf(phaseEnd + 1, n, taper, spec, base) === phase) phaseEnd++;
    const t = phaseEnd > phaseStart ? (w - phaseStart) / (phaseEnd - phaseStart) : 0;

    let types = weekTypes(N, phase);
    let days = DAY_SETS[N];
    if (last) {
      const before = days.filter((d) => d < raceDow).slice(-(N - 1));
      // semaine de course : une séance courte à allure, des footings, la veille des accélérations
      types = before.map((_, i): SessionType => (i === before.length - 1 ? 'lignes' : i === 0 ? 'spe' : 'ef'));
      types.push('race');
      days = [...before, raceDow];
    }

    const quality = (type: SessionType): { steps: Step[]; title: string } | null => {
      switch (type) {
        case 'fartlek': {
          const k = 6 + Math.round(t * 4);
          return {
            title: `Fartlek ${k} × 1 min`,
            steps: [warm(), { kind: 'repeat', times: k, steps: [run('fart', { durationSec: 60 }), run('rec', { durationSec: 60 })] }, cool()],
          };
        }
        case 'vma': {
          const variant = w % 3;
          if (variant === 0) {
            const k = 6 + Math.round(t * 4);
            return {
              title: `VMA ${k} × 400 m`,
              steps: [warm(), { kind: 'repeat', times: k, steps: [run('vma', { distanceM: 400 }), run('rec', { durationSec: 75 })] }, cool()],
            };
          }
          if (variant === 1) {
            const k = 8 + Math.round(t * 4);
            return {
              title: `VMA ${k} × 1 min`,
              steps: [warm(), { kind: 'repeat', times: k, steps: [run('vma', { durationSec: 60 }), run('rec', { durationSec: 60 })] }, cool()],
            };
          }
          const k = 4 + Math.round(t * 2);
          return {
            title: `VMA ${k} × 800 m`,
            steps: [warm(), { kind: 'repeat', times: k, steps: [run('vma', { distanceM: 800 }), run('rec', { durationSec: 120 })] }, cool()],
          };
        }
        case 'seuil': {
          const reps = 2 + (t > 0.5 ? 1 : 0);
          const m = 8 + Math.round(t * 4) + (D > 21.2 ? 4 : 0);
          return {
            title: `Seuil ${reps} × ${m} min`,
            steps: [warm(), { kind: 'repeat', times: reps, steps: [run('seuil', { durationSec: m * 60 }), run('rec', { durationSec: 120 })] }, cool()],
          };
        }
        case 'spe': {
          let dist: number;
          let reps: number;
          if (D <= 5) [dist, reps] = [1000, 4 + Math.round(t * 2)];
          else if (D <= 10) [dist, reps] = [2000, 3 + Math.round(t)];
          else if (D <= 21.2) [dist, reps] = [3000, 3 + Math.round(t)];
          else [dist, reps] = [5000, 2 + Math.round(t)];
          if (phase === 'taper') reps = Math.max(2, reps - 1);
          return {
            title: `Allure ${chrono ? 'objectif' : 'course'} ${reps} × ${fmtDist(dist)}`,
            steps: [warm(), { kind: 'repeat', times: reps, steps: [run('spe', { distanceM: dist }), run('rec', { durationSec: 90 })] }, cool()],
          };
        }
        case 'race':
          return {
            title: `Jour J · ${distanceLabel(D)}`,
            steps: [
              run('spe', {
                distanceM: Math.round(D * 1000),
                label: chrono ? `Objectif ${formatTime(goal.targetTimeSec!)}` : 'Finir la distance',
              }),
            ],
          };
        default:
          return null;
      }
    };

    const built: Array<{ type: SessionType; steps: Step[]; title: string } | null> = types.map((type) => {
      const q = quality(type);
      return q ? { type, ...q } : null;
    });
    const qualityMin = built.reduce((acc, b) => acc + (b && b.type !== 'race' ? measureSteps(b.steps).durationSec / 60 : 0), 0);

    let slMin = clamp(round5(vol * 0.32), 40, slCap);
    if (phase === 'taper') slMin = Math.min(slMin, round5(slCap * 0.6));
    const easyCount = types.filter((x) => x === 'ef' || x === 'lignes').length;
    const slCount = types.filter((x) => x === 'sl').length;
    const efMin = clamp(round5((vol - qualityMin - slMin * slCount) / Math.max(1, easyCount)), 30, 70);

    types.forEach((type, i) => {
      let b = built[i];
      if (!b) {
        if (type === 'sl') {
          const speMin = chrono && phase === 'spe' ? (D <= 10 ? 10 : D <= 21.2 ? 20 : 40) : 0;
          b = {
            type,
            title: speMin ? 'Sortie longue + allure' : 'Sortie longue',
            steps: speMin
              ? [run('sl', { durationSec: (slMin - speMin) * 60 }), run('spe', { durationSec: speMin * 60, label: 'Finir à allure objectif' })]
              : [run('sl', { durationSec: slMin * 60 })],
          };
        } else if (type === 'lignes') {
          const m = last ? 20 : efMin;
          b = {
            type,
            title: 'Footing + accélérations',
            steps: [
              run('ef', { durationSec: (m - 6) * 60 }),
              { kind: 'repeat', times: 6, steps: [run('vma', { durationSec: 20, label: 'Accélération' }), run('rec', { durationSec: 40 })] },
            ],
          };
        } else {
          b = { type: 'ef', title: 'Footing', steps: [run('ef', { durationSec: (last ? 30 : efMin) * 60 })] };
        }
      }
      const m = measureSteps(b.steps);
      sessions.push({
        id: `w${w + 1}s${i + 1}`,
        week: w + 1,
        date: last && type === 'race' ? goal.eventDate : addDays(req.startDate, w * 7 + days[i]),
        type: b.type,
        title: b.title,
        steps: b.steps,
        durationSec: m.durationSec,
        distanceM: m.distanceM,
        basePoints: BASE_POINTS[b.type],
        tip: DEFAULT_TIPS[b.type],
        nutrition: DEFAULT_NUTRITION[b.type],
      });
    });

    weeks.push({ n: w + 1, phase, focus: PHASE_FOCUS[phase] });
  }

  return {
    request: req,
    weeks,
    sessions,
    racePaceSecPerKm: racePace,
    predictedTimeSec: racePace * D,
  };
}

/** Description texte compacte d'une séance (pour le prompt IA et l'accessibilité). */
export function describeSteps(steps: Step[]): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  return steps
    .map((s) => {
      if (s.kind === 'repeat') return `${s.times}×(${describeSteps(s.steps)})`;
      const amount = s.durationSec != null ? (s.durationSec >= 60 ? `${Math.round(s.durationSec / 60)} min` : `${s.durationSec} s`) : fmtDist(s.distanceM ?? 0);
      const what = s.zone === 'rec' ? 'trot' : `${fmt(s.pace.lo)}-${fmt(s.pace.hi)}/km`;
      return `${s.label ? s.label + ' ' : ''}${amount} ${what}`;
    })
    .join(' ; ');
}
