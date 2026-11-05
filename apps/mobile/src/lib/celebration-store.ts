// Données de l'écran de félicitations, transmises de la création d'objectif à la page plein écran.
export interface GoalCelebrationData {
  id: string;
  at: number;
  start: string;
  title: string;
  subtitle: string;
  stats: Array<{ icon: 'calendar' | 'repeat' | 'flag' | 'speedometer'; label: string }>;
}

let pending: GoalCelebrationData | null = null;

export const setPendingCelebration = (c: GoalCelebrationData | null) => {
  pending = c;
};
/** Félicitations en attente (moins de 5 minutes). */
export const getPendingCelebration = () => (pending && Date.now() - pending.at < 5 * 60_000 ? pending : null);
