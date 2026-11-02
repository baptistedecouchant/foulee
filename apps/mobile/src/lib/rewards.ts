import type { ImageKey } from '@/lib/images';

// Catalogue de démonstration (partenaires fictifs). En production : table `rewards`,
// chaque article étant un code ou un lien affilié tracké du partenaire.
// `minLevel` : certaines récompenses demandent un niveau (XP). Le niveau prouve des semaines
// d'entraînement réel, ce qui protège les plus grosses récompenses des comptes créés pour farmer.
export const CATALOG: Array<{ id: string; title: string; partner: string; cost: number; image: ImageKey; minLevel?: number }> = [
  { id: 'remise-10', title: '-10 % sur ta prochaine commande', partner: 'Boutique running partenaire', cost: 2000, image: 'shoes' },
  { id: 'dossard', title: '-15 % sur un dossard', partner: 'Organisateur de course', cost: 4000, image: 'cityRace', minLevel: 4 },
  { id: 'bon-5', title: "Bon d'achat 5 €", partner: 'Enseigne de sport partenaire', cost: 5000, image: 'road', minLevel: 5 },
  { id: 'bon-10', title: "Bon d'achat 10 €", partner: 'Enseigne de sport partenaire', cost: 10000, image: 'trail', minLevel: 8 },
];

export const REWARD_LEVELS = CATALOG.filter((r) => r.minLevel).map((r) => ({ title: r.title.replace("Bon d'achat ", 'bon '), minLevel: r.minLevel! }));
