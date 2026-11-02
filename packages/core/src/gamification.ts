// Gamification : XP et niveaux, série, badges, défis de la semaine.
// Tout est DÉRIVÉ des séances validées (jamais saisi) : impossible de tricher
// sur la progression sans tricher sur les séances, déjà contrôlées par l'anti-triche.
//
// Points (monnaie, se dépensent) ≠ XP (progression, ne baisse jamais).

import type { Plan, PlannedSession } from './types.ts';
import type { SessionValidation } from './scoring.ts';

export interface PlanProgress {
  plan: Plan;
  validations: Record<string, SessionValidation>;
}

const OK = new Set(['validee', 'partielle']);
const isOk = (v?: SessionValidation) => !!v && OK.has(v.status);

// ---------- Niveaux ----------

export const LEVEL_TITLES: Array<{ from: number; title: string }> = [
  { from: 1, title: 'Débutant' },
  { from: 3, title: 'Joggeur' },
  { from: 5, title: 'Coureur' },
  { from: 8, title: 'Finisseur' },
  { from: 12, title: 'Machine' },
  { from: 16, title: 'Élite' },
  { from: 20, title: 'Légende' },
];

/** XP cumulée nécessaire pour atteindre le niveau `n` (niveau 1 = 0 XP). */
export function xpForLevel(n: number): number {
  return Math.round(120 * (n - 1) ** 1.6);
}

export interface LevelInfo {
  level: number;
  title: string;
  xp: number;
  /** XP gagnée dans le niveau courant. */
  intoLevel: number;
  /** XP nécessaire pour passer au niveau suivant (depuis le début du niveau). */
  levelSpan: number;
  /** 0 → 1 */
  progress: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const start = xpForLevel(level);
  const span = xpForLevel(level + 1) - start;
  const title = [...LEVEL_TITLES].reverse().find((t) => level >= t.from)!.title;
  return { level, title, xp, intoLevel: xp - start, levelSpan: span, progress: (xp - start) / span };
}

/** XP d'une séance : le score d'exécution compte, la régularité aussi. */
export function sessionXp(session: PlannedSession, v: SessionValidation): number {
  if (!isOk(v)) return 0;
  const base = session.type === 'race' ? 400 : session.basePoints;
  return Math.round(base * (0.5 + v.score)); // 75 % à 150 % de la base
}

// ---------- Statistiques ----------

export interface Stats {
  xp: number;
  sessionsDone: number;
  perfectSessions: number;
  distanceKm: number;
  hours: number;
  weeksComplete: number;
  perfectWeeks: number;
  qualityDone: number;
  longRunsDone: number;
  goalsAchieved: number;
  plansCompleted: number;
  refused: number;
  /** Série en cours : séances validées d'affilée, sans séance passée manquée. */
  streak: number;
  bestStreak: number;
}

export function computeStats(plans: PlanProgress[], todayIso: string): Stats {
  const s: Stats = {
    xp: 0,
    sessionsDone: 0,
    perfectSessions: 0,
    distanceKm: 0,
    hours: 0,
    weeksComplete: 0,
    perfectWeeks: 0,
    qualityDone: 0,
    longRunsDone: 0,
    goalsAchieved: 0,
    plansCompleted: 0,
    refused: 0,
    streak: 0,
    bestStreak: 0,
  };

  const timeline: Array<{ date: string; ok: boolean; pending: boolean }> = [];

  for (const { plan, validations } of plans) {
    for (const ses of plan.sessions) {
      const v = validations[ses.id];
      if (v?.status === 'refusee') s.refused++;
      if (isOk(v)) {
        s.sessionsDone++;
        s.xp += sessionXp(ses, v!);
        s.distanceKm += (ses.distanceM / 1000) * Math.min(1, v!.volumeScore || 1);
        s.hours += ses.durationSec / 3600;
        if (v!.score >= 0.95) s.perfectSessions++;
        if (['vma', 'seuil', 'spe', 'fartlek'].includes(ses.type)) s.qualityDone++;
        if (ses.type === 'sl') s.longRunsDone++;
        if (ses.type === 'race' && v!.status === 'validee') s.goalsAchieved++;
      }
      timeline.push({ date: ses.date, ok: isOk(v), pending: !v && ses.date >= todayIso });
    }
    for (const w of plan.weeks) {
      const ss = plan.sessions.filter((x) => x.week === w.n);
      if (ss.length && ss.every((x) => isOk(validations[x.id]))) {
        s.weeksComplete++;
        s.xp += 150;
        if (ss.every((x) => (validations[x.id]?.score ?? 0) >= 0.95)) s.perfectWeeks++;
      }
    }
    if (plan.sessions.every((x) => isOk(validations[x.id]))) {
      s.plansCompleted++;
      s.xp += 1000;
    }
  }

  // Série : on parcourt le calendrier ; une séance passée non faite casse la série.
  timeline.sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  for (const e of timeline) {
    if (e.pending) continue;
    if (e.ok) {
      run++;
      s.bestStreak = Math.max(s.bestStreak, run);
    } else if (e.date < todayIso) {
      run = 0;
    }
  }
  s.streak = run;
  s.distanceKm = Math.round(s.distanceKm * 10) / 10;
  s.hours = Math.round(s.hours * 10) / 10;
  return s;
}

// ---------- Badges ----------

export type BadgeTier = 'bronze' | 'argent' | 'or';

export interface Badge {
  id: string;
  title: string;
  description: string;
  tier: BadgeTier;
  /** Symbole (SF Symbol sur iOS, équivalent Material sur Android) */
  icon: 'figure.run' | 'flame.fill' | 'bolt.fill' | 'calendar' | 'star.fill' | 'trophy.fill' | 'map.fill' | 'clock.fill' | 'checkmark.seal.fill' | 'medal.fill';
  /** progression 0 → 1 */
  progress: (s: Stats) => number;
}

const ratio = (v: number, target: number) => Math.min(1, v / target);

export const BADGES: Badge[] = [
  { id: 'first', title: 'Premier pas', description: 'Valider ta première séance', tier: 'bronze', icon: 'figure.run', progress: (s) => ratio(s.sessionsDone, 1) },
  { id: 's10', title: 'Lancé', description: 'Valider 10 séances', tier: 'bronze', icon: 'figure.run', progress: (s) => ratio(s.sessionsDone, 10) },
  { id: 's50', title: 'Infatigable', description: 'Valider 50 séances', tier: 'or', icon: 'figure.run', progress: (s) => ratio(s.sessionsDone, 50) },
  { id: 'streak5', title: 'Sur ta lancée', description: 'Série de 5 séances sans en manquer', tier: 'bronze', icon: 'flame.fill', progress: (s) => ratio(s.bestStreak, 5) },
  { id: 'streak15', title: 'En feu', description: 'Série de 15 séances sans en manquer', tier: 'argent', icon: 'flame.fill', progress: (s) => ratio(s.bestStreak, 15) },
  { id: 'week', title: 'Semaine bouclée', description: 'Valider toutes les séances d’une semaine', tier: 'bronze', icon: 'calendar', progress: (s) => ratio(s.weeksComplete, 1) },
  { id: 'perfect', title: 'Métronome', description: 'Une semaine parfaite, toutes les allures respectées', tier: 'argent', icon: 'star.fill', progress: (s) => ratio(s.perfectWeeks, 1) },
  { id: 'quality10', title: 'Fractionneur', description: '10 séances de qualité (VMA, seuil, allure)', tier: 'argent', icon: 'bolt.fill', progress: (s) => ratio(s.qualityDone, 10) },
  { id: 'long5', title: 'Endurant', description: '5 sorties longues', tier: 'argent', icon: 'clock.fill', progress: (s) => ratio(s.longRunsDone, 5) },
  { id: 'km100', title: 'Centurion', description: '100 km parcourus dans tes plans', tier: 'argent', icon: 'map.fill', progress: (s) => ratio(s.distanceKm, 100) },
  { id: 'goal', title: 'Objectif atteint', description: 'Réussir le jour J', tier: 'or', icon: 'trophy.fill', progress: (s) => ratio(s.goalsAchieved, 1) },
  { id: 'plan', title: 'Jusqu’au bout', description: 'Terminer un plan complet', tier: 'or', icon: 'medal.fill', progress: (s) => ratio(s.plansCompleted, 1) },
  { id: 'clean', title: 'Fair-play', description: '20 séances validées sans aucune refusée', tier: 'argent', icon: 'checkmark.seal.fill', progress: (s) => (s.refused ? 0 : ratio(s.sessionsDone, 20)) },
];

// ---------- Défis de la semaine ----------

export interface Quest {
  id: string;
  title: string;
  current: number;
  target: number;
  xp: number;
  done: boolean;
}

/** Défis de la semaine en cours, calculés sur toutes les séances prévues cette semaine-là. */
export function weeklyQuests(plans: PlanProgress[], weekStartIso: string): Quest[] {
  const end = addDaysIso(weekStartIso, 7);
  const week = plans.flatMap(({ plan, validations }) =>
    plan.sessions.filter((s) => s.date >= weekStartIso && s.date < end).map((s) => ({ s, v: validations[s.id] })),
  );
  const planned = week.length;
  const done = week.filter((x) => isOk(x.v)).length;
  const easy = week.filter((x) => ['ef', 'lignes', 'sl'].includes(x.s.type));
  const easyGood = easy.filter((x) => isOk(x.v) && (x.v!.intensityScore ?? 0) >= 0.9).length;
  const quality = week.filter((x) => ['vma', 'seuil', 'spe', 'fartlek'].includes(x.s.type));
  const qualityDone = quality.filter((x) => isOk(x.v)).length;

  const quests: Quest[] = [];
  if (planned) quests.push({ id: 'all', title: `Faire les ${planned} séances de la semaine`, current: done, target: planned, xp: 150, done: done >= planned });
  if (easy.length) quests.push({ id: 'easy', title: 'Footings à la bonne allure (pas trop vite !)', current: easyGood, target: easy.length, xp: 80, done: easyGood >= easy.length });
  if (quality.length) quests.push({ id: 'quality', title: 'Réussir la séance clé', current: qualityDone, target: quality.length, xp: 80, done: qualityDone >= quality.length });
  return quests;
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
