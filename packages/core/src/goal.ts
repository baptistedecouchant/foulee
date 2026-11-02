// Objectif et faisabilité.
//
// La faisabilité n'est plus un oui / non : on estime la PROGRESSION POSSIBLE selon
//  - le niveau de départ (un débutant progresse plus vite qu'un coureur confirmé),
//  - le nombre de séances par semaine (1 séance ≠ 5 séances),
//  - le nombre de semaines (avec des rendements décroissants),
//  - l'âge et la corpulence (récupération, impact),
// puis on situe l'objectif sur une échelle graduée, on propose des chronos adaptés,
// et on laisse TOUJOURS l'utilisateur créer son plan, même si l'objectif est très ambitieux.

import type { Athlete, CurrentLevel, Goal, SessionsPerWeek } from './types.ts';
import { distanceLabel, formatTime, weeksUntil } from './time.ts';

/** Formule de Riegel : prédit un temps sur d2 à partir d'un temps sur d1. */
export function riegel(timeSec: number, d1Km: number, d2Km: number): number {
  return timeSec * Math.pow(d2Km / d1Km, 1.06);
}

/** Allure équivalente 10 km (s/km) estimée pour un niveau déclaratif. */
const LEVEL_PACE_10K: Record<'debutant' | 'occasionnel' | 'regulier' | 'confirme', number> = {
  debutant: 450, // 7:30 /km
  occasionnel: 390, // 6:30 /km
  regulier: 330, // 5:30 /km
  confirme: 285, // 4:45 /km
};

/** Allure actuelle équivalente sur 10 km, en s/km. Pivot de tout le moteur. */
export function currentPace10k(level: CurrentLevel): number {
  if (level.kind === 'race') return riegel(level.timeSec, level.distanceKm, 10) / 10;
  return LEVEL_PACE_10K[level.level];
}

// ---------- Facteurs individuels ----------

export function bmiOf(a?: Athlete): number | null {
  if (!a?.weightKg || !a?.heightCm) return null;
  return a.weightKg / (a.heightCm / 100) ** 2;
}

/** Récupération et tolérance à la charge selon l'âge et la corpulence (1 = référence). */
export function athleteFactor(a?: Athlete): number {
  let f = 1;
  const age = a?.age;
  if (age != null) f *= age < 20 ? 1.05 : age < 35 ? 1 : age < 50 ? 0.92 : age < 60 ? 0.82 : 0.72;
  const bmi = bmiOf(a);
  if (bmi != null) f *= bmi < 25 ? 1 : bmi < 30 ? 0.92 : 0.8;
  return f;
}

const SESSIONS_FACTOR: Record<SessionsPerWeek, number> = { 1: 0.45, 2: 0.7, 3: 1, 4: 1.15, 5: 1.25 };

/**
 * Progression hebdomadaire de base selon le niveau, en continu (plus on est avancé, plus c'est lent).
 * 7:30/km au 10 km ≈ 2,9 %/sem · 5:30 ≈ 1,5 % · 4:57 ≈ 1,1 % · 4:15 et moins ≈ 0,6 %.
 */
function baseRate(pace10k: number): number {
  return Math.min(0.03, Math.max(0.005, 0.006 + (pace10k - 255) * 0.00012));
}

/**
 * Gain de performance (fraction du temps) atteignable en `weeks` semaines.
 * Rendements décroissants : doubler la durée ne double pas la progression.
 */
export function maxRealisticGain(weeks: number, sessions: SessionsPerWeek = 3, pace10k = 330, athlete?: Athlete): number {
  const g = baseRate(pace10k) * SESSIONS_FACTOR[sessions] * athleteFactor(athlete) * Math.pow(Math.max(1, weeks), 0.85);
  return Math.min(g, 0.25);
}

/** Semaines conseillées pour préparer une distance, selon le niveau, les séances et le profil. */
export function minWeeksFor(distanceKm: number, pace10k: number, sessions: SessionsPerWeek = 3, athlete?: Athlete): number {
  let w = distanceKm <= 5 ? 4 : distanceKm <= 10 ? 6 : distanceKm <= 21.2 ? 10 : 14;
  if (pace10k > 420) w += 4;
  else if (pace10k > 360) w += 2;
  if (sessions <= 2) w += distanceKm > 21.2 ? 6 : 3;
  if (sessions === 1) w += 2;
  if (athleteFactor(athlete) < 0.85) w += 2;
  return w;
}

// ---------- Niveau requis par l'objectif ----------

export type ObjectiveLevel = 'débutant' | 'intermédiaire' | 'expert';

/** Niveau qu'exige un objectif, d'après son allure équivalente sur 10 km et sa distance. */
export function objectiveLevel(goal: Pick<Goal, 'mode' | 'distanceKm' | 'targetTimeSec'>): ObjectiveLevel {
  if (goal.mode === 'chrono' && goal.targetTimeSec) {
    const p10 = riegel(goal.targetTimeSec, goal.distanceKm, 10) / 10;
    return p10 >= 360 ? 'débutant' : p10 >= 255 ? 'intermédiaire' : 'expert'; // 10 km : 60 min+ · 42:30–60 min · moins de 42:30
  }
  return goal.distanceKm <= 10 ? 'débutant' : goal.distanceKm <= 21.2 ? 'intermédiaire' : 'expert';
}

// ---------- Évaluation ----------

export type Feasibility = 'facile' | 'tres_probable' | 'realiste' | 'exigeant' | 'tres_ambitieux' | 'peu_probable' | 'delai_court';

export interface TimeSuggestion {
  label: 'Prudent' | 'Réaliste' | 'Ambitieux';
  timeSec: number;
}

export interface GoalAssessment {
  feasibility: Feasibility;
  /** 0 → 100 : estimation grossière des chances d'atteindre l'objectif. */
  confidence: number;
  title: string;
  message: string;
  weeks: number;
  /** Temps prédit aujourd'hui sur la distance objectif. */
  predictedNowSec: number;
  /** Fourchette de temps atteignable à la date de l'objectif. */
  achievable: { bestSec: number; likelySec: number };
  suggestions: TimeSuggestion[];
  /** Ancien champ, conservé : le temps « réaliste » proposé. */
  suggestedTimeSec?: number;
  minWeeks: number;
  level: ObjectiveLevel;
}

const roundTo = (s: number, step: number) => Math.round(s / step) * step;
const stepFor = (sec: number) => (sec < 1800 ? 15 : sec < 5400 ? 30 : 60);

export interface AssessInput {
  sessionsPerWeek?: SessionsPerWeek;
  athlete?: Athlete;
}

export function assessGoal(goal: Goal, level: CurrentLevel, startDate: string, opts: AssessInput = {}): GoalAssessment {
  const sessions = opts.sessionsPerWeek ?? 3;
  const p10 = currentPace10k(level);
  const weeks = Math.max(1, weeksUntil(startDate, goal.eventDate));
  const predictedNowSec = riegel(p10 * 10, 10, goal.distanceKm);
  const minWeeks = minWeeksFor(goal.distanceKm, p10, sessions, opts.athlete);
  const maxGain = maxRealisticGain(weeks, sessions, p10, opts.athlete);
  const label = distanceLabel(goal.distanceKm);
  const step = stepFor(predictedNowSec);

  // Temps atteignables : « probable » = 60 % du potentiel, « meilleur cas » = 100 %.
  const likelySec = roundTo(predictedNowSec * (1 - maxGain * 0.6), step);
  const bestSec = roundTo(predictedNowSec * (1 - maxGain), step);
  const suggestions: TimeSuggestion[] = [
    { label: 'Prudent', timeSec: roundTo(predictedNowSec * (1 - maxGain * 0.35), step) },
    { label: 'Réaliste', timeSec: likelySec },
    { label: 'Ambitieux', timeSec: bestSec },
  ];
  const base = { weeks, predictedNowSec, achievable: { bestSec, likelySec }, suggestions, suggestedTimeSec: likelySec, minWeeks, level: objectiveLevel(goal) };

  // Délai court : on prévient, on ne bloque pas.
  const shortNote =
    weeks < minWeeks ? ` Attention : ${weeks} semaine${weeks > 1 ? 's' : ''}, c’est court pour un ${label} à ton niveau (idéalement ${minWeeks}). Le plan sera plus prudent.` : '';

  if (goal.mode === 'distance') {
    const ratio = weeks / minWeeks;
    const confidence = Math.round(Math.max(10, Math.min(95, 40 + ratio * 50)));
    const feasibility: Feasibility = ratio >= 1.3 ? 'tres_probable' : ratio >= 1 ? 'realiste' : ratio >= 0.7 ? 'exigeant' : 'delai_court';
    return {
      ...base,
      feasibility,
      confidence,
      title: { tres_probable: 'Largement faisable', realiste: 'Objectif réaliste', exigeant: 'Faisable, mais serré', delai_court: 'Délai très court' }[feasibility as 'tres_probable'],
      message: `Temps estimé le jour J : entre ${formatTime(bestSec)} et ${formatTime(likelySec)}.${shortNote}`,
    };
  }

  const target = goal.targetTimeSec ?? predictedNowSec;
  const needed = (predictedNowSec - target) / predictedNowSec; // progression nécessaire
  const r = needed / maxGain; // part du potentiel à mobiliser
  const confidence = Math.round(Math.max(3, Math.min(97, 100 - 60 * Math.max(0, r) ** 1.4)));

  let feasibility: Feasibility;
  if (needed <= 0) feasibility = 'facile';
  else if (r <= 0.5) feasibility = 'tres_probable';
  else if (r <= 0.85) feasibility = 'realiste';
  else if (r <= 1.1) feasibility = 'exigeant';
  else if (r <= 1.6) feasibility = 'tres_ambitieux';
  else feasibility = 'peu_probable';

  const pct = Math.round(needed * 100);
  const messages: Record<Feasibility, [string, string]> = {
    facile: ['Déjà à ta portée', `Ton niveau actuel correspond à environ ${formatTime(predictedNowSec)}. Tu peux viser plus vite : ${formatTime(likelySec)} est réaliste.`],
    tres_probable: ['Très probable', `Il faut gagner ${pct} % (niveau actuel : ${formatTime(predictedNowSec)}). Avec ${sessions} séance${sessions > 1 ? 's' : ''} par semaine, c’est largement faisable.`],
    realiste: ['Objectif réaliste', `Il faut gagner ${pct} % (niveau actuel : ${formatTime(predictedNowSec)}). Faisable en ${weeks} semaines si tu es régulier.`],
    exigeant: ['Réaliste mais exigeant', `Il faut gagner ${pct} %, c’est proche de ton maximum en ${weeks} semaines. Chaque séance comptera.`],
    tres_ambitieux: ['Très ambitieux', `Il faut gagner ${pct} %. Le plus probable le jour J : environ ${formatTime(likelySec)}. Ajouter des semaines ou une séance augmenterait tes chances.`],
    peu_probable: ['Peu probable dans ce délai', `Il faudrait gagner ${pct} %. Le plus probable le jour J : environ ${formatTime(likelySec)}. Tu peux garder cet objectif comme cap, ou viser ${formatTime(bestSec)}.`],
    delai_court: ['Délai très court', ''],
  };
  const [title, message] = messages[feasibility];
  return { ...base, feasibility, confidence, title, message: message + shortNote };
}
