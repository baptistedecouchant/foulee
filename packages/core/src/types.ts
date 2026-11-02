// Types partagés entre l'app mobile et le backend.
// Conçus pour être multi-sports : ajouter le vélo ou l'Hyrox = ajouter des
// valeurs à `Sport` et `Zone`, pas réécrire le modèle.

export type Sport = 'running';

/** Objectif "chrono" (10 km en 45:00) ou "distance" (finir un semi). */
export type GoalMode = 'chrono' | 'distance';

export interface Goal {
  mode: GoalMode;
  sport: Sport;
  distanceKm: number;
  /** Requis si mode = 'chrono'. */
  targetTimeSec?: number;
  /** Date du jour J (AAAA-MM-JJ). */
  eventDate: string;
}

/** Niveau actuel : un chrono récent, ou une estimation déclarative. */
export type CurrentLevel =
  | { kind: 'race'; distanceKm: number; timeSec: number }
  | { kind: 'estimate'; level: 'debutant' | 'occasionnel' | 'regulier' | 'confirme' };

export type SessionsPerWeek = 1 | 2 | 3 | 4 | 5;

/** Profil physique du coureur : affine la faisabilité et la progression du plan. */
export interface Athlete {
  age?: number;
  weightKg?: number;
  heightCm?: number;
}

export interface PlanRequest {
  goal: Goal;
  level: CurrentLevel;
  sessionsPerWeek: SessionsPerWeek;
  /** Lundi de la première semaine (AAAA-MM-JJ). */
  startDate: string;
  /** Jours d'entraînement choisis (0 = lundi … 6 = dimanche). Sinon : répartition par défaut. */
  trainingDays?: number[];
  athlete?: Athlete;
}

export type Zone = 'ef' | 'sl' | 'rec' | 'seuil' | 'vma' | 'fart' | 'spe';

export type Phase = 'base' | 'dev' | 'spe' | 'taper';

export type SessionType =
  | 'ef'
  | 'lignes'
  | 'sl'
  | 'fartlek'
  | 'vma'
  | 'seuil'
  | 'spe'
  | 'race';

/** Fourchette d'allure en secondes par km (lo = plus rapide). */
export interface PaceRange {
  lo: number;
  hi: number;
}

export type Step =
  | {
      kind: 'run';
      zone: Zone;
      label?: string;
      durationSec?: number;
      distanceM?: number;
      pace: PaceRange;
    }
  | { kind: 'repeat'; times: number; steps: Step[] };

export interface PlannedSession {
  id: string;
  week: number; // 1-based
  date: string; // AAAA-MM-JJ
  type: SessionType;
  title: string;
  steps: Step[];
  durationSec: number;
  distanceM: number;
  /** Points maximum si la séance est parfaitement suivie. */
  basePoints: number;
  tip: string;
  nutrition: string;
}

export interface PlanWeek {
  n: number;
  phase: Phase;
  focus: string;
}

export interface Plan {
  request: PlanRequest;
  weeks: PlanWeek[];
  sessions: PlannedSession[];
  racePaceSecPerKm: number;
  predictedTimeSec: number;
}

// ---------- Activités reçues des montres / apps ----------

export type ActivitySource =
  | 'garmin'
  | 'apple_health'
  | 'health_connect'
  | 'strava'
  | 'coros'
  | 'polar'
  | 'suunto'
  | 'app_gps';

export interface TrackPoint {
  /** Horodatage epoch en millisecondes. */
  t: number;
  lat: number;
  lon: number;
  alt?: number;
  /** Fréquence cardiaque (bpm). */
  hr?: number;
  /** Cadence en pas par minute (les deux pieds). */
  cadence?: number;
  /** Précision horizontale en mètres. */
  accuracy?: number;
  /** Position fournie par une app de localisation fictive (Android). */
  mocked?: boolean;
}

export interface Activity {
  source: ActivitySource;
  externalId: string;
  sport: Sport;
  startTime: number; // epoch ms
  durationSec: number; // temps en mouvement
  distanceM: number;
  /** Saisie manuelle déclarée par la plateforme (non enregistrée par un capteur). */
  manual: boolean;
  /** Activité sur tapis : pas de GPS attendu. */
  indoor?: boolean;
  deviceName?: string;
  track?: TrackPoint[];
  avgHr?: number;
  /**
   * Découpage en blocs (séance guidée dans l'app ou sur la montre) : début et fin
   * de chaque bloc, en epoch ms. Le serveur recalcule l'allure de chaque bloc à partir
   * de la trace GPS vérifiée, il ne fait pas confiance aux allures envoyées.
   */
  laps?: Array<{ start: number; end: number }>;
}
