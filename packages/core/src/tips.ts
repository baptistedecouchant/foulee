// Astuces du jour : une raison d'ouvrir l'app les jours de repos (rapporte de l'XP, pas de RC).

export interface DailyTip {
  id: string;
  category: 'nutrition' | 'récupération' | 'sommeil' | 'technique' | 'mental' | 'équipement';
  title: string;
  text: string;
}

export const TIPS: DailyTip[] = [
  { id: 't1', category: 'récupération', title: 'Le repos fait partie du plan', text: 'C’est pendant le repos que ton corps s’adapte et progresse. Un jour off bien utilisé vaut une séance.' },
  { id: 't2', category: 'nutrition', title: 'Hydrate-toi dès le matin', text: 'Un grand verre d’eau au réveil, puis régulièrement dans la journée. Ton urine doit être claire.' },
  { id: 't3', category: 'sommeil', title: 'Vise 7 à 9 heures', text: 'Le sommeil est ton meilleur outil de récupération. Couche-toi à heure fixe la veille d’une séance clé.' },
  { id: 't4', category: 'technique', title: 'Cadence légère', text: 'Des petits pas rapides (170 à 180 par minute) réduisent les chocs. Pense « pieds légers », pas « grandes foulées ».' },
  { id: 't5', category: 'équipement', title: 'Prépare ta tenue la veille', text: 'Chaussures, montre chargée, tenue prête : tu n’auras plus d’excuse demain matin.' },
  { id: 't6', category: 'nutrition', title: 'Protéines à chaque repas', text: 'Œufs, yaourt, poisson, légumineuses : en répartir sur la journée aide tes muscles à récupérer.' },
  { id: 't7', category: 'mental', title: 'Découpe l’effort', text: 'Sur une séance dure, ne pense qu’à la répétition en cours. « Encore une », pas « encore sept ».' },
  { id: 't8', category: 'récupération', title: 'Marche active', text: '20 minutes de marche un jour de repos favorisent la récupération sans fatigue.' },
  { id: 't9', category: 'équipement', title: 'Change de chaussures à temps', text: 'Une paire s’use entre 600 et 900 km. Note la date d’achat pour suivre leur kilométrage.' },
  { id: 't10', category: 'nutrition', title: 'Les glucides ne sont pas l’ennemi', text: 'Avant une séance intense ou une sortie longue, ce sont eux qui remplissent ton réservoir.' },
  { id: 't11', category: 'technique', title: 'Footing = allure conversation', text: 'Si tu ne peux pas parler en phrases complètes, ralentis. C’est la base de ta progression.' },
  { id: 't12', category: 'mental', title: 'Visualise ton jour J', text: 'Imagine le départ, la mi-course, l’arrivée. Le cerveau s’habitue au scénario avant tes jambes.' },
];

/** Astuce du jour : la même pour tout le monde un jour donné. */
export function tipOfDay(todayIso: string): DailyTip {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dayIndex = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return TIPS[dayIndex % TIPS.length];
}
