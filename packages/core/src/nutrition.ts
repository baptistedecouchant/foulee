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

// ---------- Semaine de la course ----------

export interface RaceWeekStep {
  /** Repère temporel : « J-3 », « Le matin », « Pendant »… */
  when: string;
  title: string;
  items: string[];
  icon: NutritionTip['icon'] | 'bed' | 'walk' | 'flag';
}

const hhmm = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

/**
 * Guide de la semaine de course : entraînement, sommeil, alimentation et hydratation,
 * adaptés à la distance, à la durée prévue, à l'heure de départ et au poids (charge glucidique).
 */
export function raceWeekGuide(opts: { distanceKm: number; expectedSec: number; startTime?: string; weightKg?: number }): RaceWeekStep[] {
  const { distanceKm, expectedSec, weightKg } = opts;
  const minutes = expectedSec / 60;
  const marathon = distanceKm >= 30;
  const long = minutes >= 75 || distanceKm >= 20;
  const [h, mi] = (opts.startTime ?? '').split(':').map(Number);
  const start = Number.isFinite(h) && Number.isFinite(mi) ? h * 60 + mi : null;
  const at = (offsetMin: number, fallback: string) => (start == null ? fallback : `vers ${hhmm(start - offsetMin)}`);
  const carbs = (gPerKg: number) => (weightKg ? ` (environ ${Math.round((gPerKg * weightKg) / 10) * 10} g de glucides par jour pour toi)` : '');
  const steps: RaceWeekStep[] = [];

  steps.push({
    when: 'Toute la semaine',
    title: 'Affûtage',
    icon: 'bed',
    items: [
      'Le volume baisse, quelques rappels d’allure gardent les jambes vives : c’est normal de se sentir « trop frais ».',
      'Vise 8 h de sommeil, surtout l’avant-veille : c’est la nuit qui compte le plus.',
      'Rien de nouveau : chaussures, tenue, gels et petit-déjeuner déjà testés à l’entraînement.',
    ],
  });

  if (marathon) {
    steps.push({
      when: 'J-3 à J-1',
      title: 'Charge en glucides',
      icon: 'restaurant',
      items: [
        `Augmente nettement les féculents à chaque repas : pâtes, riz, pain, pommes de terre, semoule${carbs(8)}.`,
        'Réduis un peu les fibres (légumes crus, céréales complètes) et le gras pour alléger la digestion.',
        'Bois régulièrement : des urines claires sont un bon repère.',
      ],
    });
  } else if (long) {
    steps.push({
      when: 'J-2 et J-1',
      title: 'Plus de féculents',
      icon: 'restaurant',
      items: [
        `Une portion de féculents un peu plus généreuse à chaque repas${carbs(6)}.`,
        'Évite les plats très gras, épicés ou riches en fibres la veille.',
        'Bois régulièrement dans la journée.',
      ],
    });
  } else {
    steps.push({
      when: 'J-2 et J-1',
      title: 'Repas habituels',
      icon: 'restaurant',
      items: ['Pas besoin de charge glucidique sur cette distance : des repas équilibrés et digestes suffisent.', 'Bois normalement, sans excès.'],
    });
  }

  steps.push({
    when: 'La veille',
    title: 'Préparer le jour J',
    icon: 'walk',
    items: [
      'Dîner simple et tôt : féculents, un peu de protéines, peu de fibres et de gras.',
      'Prépare tout le soir : dossard, épingles, chaussures, tenue, montre chargée' + (long ? ', gels' : '') + '.',
      ...(opts.startTime ? [`Départ à ${hhmm(start!)} : repère ton trajet et vise d’être sur place ${at(45, '45 min avant')}.`] : []),
    ],
  });

  steps.push({
    when: 'Le matin',
    title: 'Petit-déjeuner et hydratation',
    icon: 'cafe',
    items: [
      `Petit-déjeuner ${at(180, '3 h avant le départ')} : pain ou flocons d’avoine, miel ou confiture, banane, boisson chaude. Celui que tu as testé.`,
      `500 ml d’eau entre le réveil et ${start == null ? 'le départ' : hhmm(start - 60)}, puis quelques gorgées.`,
      long ? `Un demi-gel ou une compote ${at(15, '15 min avant le départ')}.` : 'Rien à manger dans la dernière heure, sauf habitude.',
      `Échauffement léger ${at(20, '20 min avant')} : 10 min de footing et 2 ou 3 accélérations.`,
    ],
  });

  const during: string[] = [];
  if (marathon) {
    const gels = Math.max(3, Math.round((minutes - 30) / 30));
    during.push(
      '60 à 90 g de glucides par heure : un gel toutes les 25 à 30 min, à partir de la 30e minute.',
      `Prévois environ ${gels} gels pour ${Math.round(minutes / 60 * 10) / 10} h de course, toujours avec de l’eau.`,
      'Bois à chaque ravitaillement, quelques gorgées, même sans soif. Une boisson avec du sel s’il fait chaud.',
    );
  } else if (long) {
    during.push(
      '30 à 60 g de glucides par heure : un gel vers la 40e minute, puis toutes les 30 à 40 min.',
      'Quelques gorgées d’eau à chaque ravitaillement.',
    );
  } else {
    during.push('Pas besoin de manger. Quelques gorgées d’eau au ravitaillement s’il fait chaud.', 'Pars à ton allure, pas plus vite : les premiers kilomètres décident de ta course.');
  }
  steps.push({ when: 'Pendant', title: 'Pendant la course', icon: 'flash', items: during });

  steps.push({
    when: 'Après',
    title: 'Récupération',
    icon: 'nutrition',
    items: [
      'Tout de suite : eau, banane ou boisson de récupération, glucides + protéines.',
      'Dans les 2 h : un vrai repas, féculents, protéines, légumes.',
      marathon ? 'Marche et footings très légers seulement les jours suivants : compte une semaine avant de reprendre l’intensité.' : 'Une ou deux journées faciles avant de reprendre.',
    ],
  });
  return steps;
}
