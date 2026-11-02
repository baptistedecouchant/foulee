// Conseils nutrition et échauffement, adaptés à la séance et à l'objectif.
// Repères généraux pour sportifs en bonne santé : jamais de régime ni de restriction.

import type { Goal, PlannedSession } from './types.ts';

export interface NutritionTip {
  when: string;
  text: string;
  icon: 'time' | 'water' | 'nutrition' | 'restaurant' | 'cafe' | 'flash';
}

export interface NutritionAdvice {
  before: NutritionTip[];
  during: NutritionTip[];
  after: NutritionTip[];
}

const QUALITY = new Set(['vma', 'seuil', 'spe', 'fartlek']);

export function nutritionFor(session: PlannedSession, goal: Goal): NutritionAdvice {
  const min = session.durationSec / 60;
  const longGoal = goal.distanceKm >= 21;
  const before: NutritionTip[] = [];
  const during: NutritionTip[] = [];
  const after: NutritionTip[] = [];

  if (session.type === 'race') {
    before.push(
      { when: 'Les 2 jours avant', text: longGoal ? 'Augmente la part de féculents (pâtes, riz, pain) à chaque repas. Rien de nouveau.' : 'Repas habituels, digestes. Rien de nouveau.', icon: 'restaurant' },
      { when: 'La veille', text: 'Bois régulièrement dans la journée. Dîner simple : féculents, peu de fibres et de gras.', icon: 'water' },
      { when: '3 h avant', text: 'Petit-déjeuner déjà testé à l’entraînement : pain ou flocons d’avoine, banane, boisson chaude.', icon: 'cafe' },
      { when: '30 min avant', text: 'Quelques gorgées d’eau. Une compote ou un demi-gel si tu en as l’habitude.', icon: 'water' },
    );
    if (goal.distanceKm >= 40) during.push({ when: 'Pendant', text: 'Un gel toutes les 30 à 40 min dès la 45e minute, avec de l’eau. Bois à chaque ravitaillement.', icon: 'flash' });
    else if (goal.distanceKm >= 20) during.push({ when: 'Pendant', text: '1 à 2 gels (vers le 8e et le 15e km) avec de l’eau. Bois un peu à chaque ravitaillement.', icon: 'flash' });
    else during.push({ when: 'Pendant', text: 'Pas besoin de manger. Quelques gorgées d’eau au ravitaillement s’il fait chaud.', icon: 'water' });
    after.push(
      { when: 'Tout de suite', text: 'Boisson + glucides + protéines : eau, banane, lait chocolaté ou yaourt.', icon: 'nutrition' },
      { when: 'Dans les 2 h', text: 'Un vrai repas : protéines (poisson, œufs, viande ou légumineuses), féculents, légumes. Tu l’as bien mérité.', icon: 'restaurant' },
    );
    return { before, during, after };
  }

  if (QUALITY.has(session.type)) {
    before.push(
      { when: '2 à 3 h avant', text: 'Repas digeste riche en glucides : riz, pâtes ou pain, avec peu de gras et de fibres.', icon: 'restaurant' },
      { when: '1 h avant', text: 'Si tu as faim : une banane ou une compote, et un verre d’eau. Ne cours pas à jeun pour une séance intense.', icon: 'nutrition' },
    );
  } else if (session.type === 'sl') {
    before.push(
      { when: '2 à 3 h avant', text: 'Petit-déjeuner complet : flocons d’avoine ou pain, banane, boisson. C’est le carburant de ta sortie longue.', icon: 'cafe' },
      { when: '30 min avant', text: 'Un grand verre d’eau.', icon: 'water' },
    );
  } else {
    before.push({ when: 'Avant', text: 'Si ton dernier repas date de plus de 3 h : une banane ou une compote 30 à 60 min avant. Un verre d’eau.', icon: 'nutrition' });
  }

  if (min >= 75) {
    during.push(
      { when: 'Pendant', text: 'Au-delà d’1 h 15 : 30 à 60 g de glucides par heure (gel, pâte de fruits, fruits secs).', icon: 'flash' },
      { when: 'Pendant', text: '400 à 800 ml d’eau par heure, par petites gorgées. Plus s’il fait chaud.', icon: 'water' },
    );
  } else if (min >= 50) {
    during.push({ when: 'Pendant', text: 'Emporte un peu d’eau s’il fait chaud.', icon: 'water' });
  }

  if (QUALITY.has(session.type) || session.type === 'sl') {
    after.push(
      { when: 'Dans les 30 à 60 min', text: 'Collation de récupération : glucides + protéines, par exemple yaourt grec + fruit, ou lait chocolaté.', icon: 'nutrition' },
      { when: 'Repas suivant', text: 'Assiette de récupération : une bonne portion de protéines (poisson, œufs, poulet, tofu, lentilles), des féculents et des légumes.', icon: 'restaurant' },
      { when: 'Toute la journée', text: 'Hydrate-toi bien : environ 500 ml dans l’heure qui suit, puis régulièrement.', icon: 'water' },
    );
  } else {
    after.push(
      { when: 'Après', text: 'Un grand verre d’eau. Ton repas habituel, équilibré, suffit.', icon: 'water' },
    );
  }
  if (longGoal && (session.type === 'sl' || session.type === 'spe')) {
    after.push({ when: 'Conseil prépa', text: `Pour ton objectif ${goal.distanceKm >= 40 ? 'marathon' : 'semi'}, profite de ces sorties pour tester les gels et la boisson du jour J.`, icon: 'flash' });
  }
  return { before, during, after };
}

/** Pourquoi et comment s'échauffer pour cette séance. */
export function warmupAdvice(session: PlannedSession): string | null {
  switch (session.type) {
    case 'vma':
    case 'spe':
      return 'Échauffement de 15 min en footing très facile, puis 3 accélérations progressives : ton cœur et tes muscles sont prêts pour l’intensité. Retour au calme de 10 min à la fin pour récupérer.';
    case 'seuil':
    case 'fartlek':
      return 'Échauffement de 15 min en footing très facile avant de monter en rythme, retour au calme de 10 min à la fin.';
    case 'sl':
      return 'Pas d’échauffement séparé : pars très lentement les 10 premières minutes, l’allure viendra toute seule.';
    case 'race':
      return 'Le jour J : 10 à 15 min de footing très léger et 2 ou 3 accélérations, 15 à 20 min avant le départ.';
    default:
      return null;
  }
}
