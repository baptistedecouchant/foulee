// Chaussures : catalogue des modèles courants et suivi de l'usure.
// Les durées de vie sont des repères moyens (amorti et accroche s'usent avant que ça se voie) :
// chaussure d'entraînement 600 à 800 km, chaussure à plaque carbone 300 à 450 km.

export type ShoeBrand = 'Nike' | 'Adidas' | 'Puma' | 'Asics' | 'Kiprun' | 'Salomon' | 'Brooks' | 'On';
export type ShoeCategory = 'quotidien' | 'tempo' | 'competition' | 'trail';

export interface ShoeModel {
  brand: ShoeBrand;
  model: string;
  category: ShoeCategory;
  /** Durée de vie moyenne, en km. */
  lifeKm: number;
}

const m = (brand: ShoeBrand, model: string, category: ShoeCategory, lifeKm: number): ShoeModel => ({ brand, model, category, lifeKm });

export const SHOE_CATALOG: ShoeModel[] = [
  m('Nike', 'Pegasus', 'quotidien', 700),
  m('Nike', 'Vomero', 'quotidien', 750),
  m('Nike', 'Invincible', 'quotidien', 700),
  m('Nike', 'Structure', 'quotidien', 750),
  m('Nike', 'Zoom Fly', 'tempo', 500),
  m('Nike', 'Vaporfly', 'competition', 400),
  m('Nike', 'Alphafly', 'competition', 400),
  m('Nike', 'Pegasus Trail', 'trail', 650),
  m('Adidas', 'Supernova', 'quotidien', 700),
  m('Adidas', 'Ultraboost', 'quotidien', 650),
  m('Adidas', 'Adizero SL', 'tempo', 600),
  m('Adidas', 'Adizero Boston', 'tempo', 550),
  m('Adidas', 'Adizero Adios Pro', 'competition', 400),
  m('Adidas', 'Terrex Agravic', 'trail', 650),
  m('Puma', 'Velocity Nitro', 'quotidien', 650),
  m('Puma', 'MagMax Nitro', 'quotidien', 750),
  m('Puma', 'ForeverRun Nitro', 'quotidien', 700),
  m('Puma', 'Deviate Nitro', 'tempo', 550),
  m('Puma', 'Fast-R Nitro Elite', 'competition', 400),
  m('Asics', 'Gel-Nimbus', 'quotidien', 750),
  m('Asics', 'Gel-Cumulus', 'quotidien', 700),
  m('Asics', 'Gel-Kayano', 'quotidien', 800),
  m('Asics', 'Novablast', 'quotidien', 650),
  m('Asics', 'Superblast', 'tempo', 600),
  m('Asics', 'Metaspeed', 'competition', 400),
  m('Asics', 'Trabuco', 'trail', 700),
  m('Kiprun', 'KS500', 'quotidien', 700),
  m('Kiprun', 'KS900', 'quotidien', 650),
  m('Kiprun', 'KD500', 'tempo', 600),
  m('Kiprun', 'KD900', 'tempo', 500),
  m('Kiprun', 'KD900X', 'competition', 400),
  m('Kiprun', 'MT Cushion', 'trail', 700),
  m('Salomon', 'Aero Glide', 'quotidien', 650),
  m('Salomon', 'Aero Blaze', 'tempo', 500),
  m('Salomon', 'S/Lab Phantasm', 'competition', 400),
  m('Salomon', 'Speedcross', 'trail', 700),
  m('Salomon', 'Ultra Glide', 'trail', 650),
  m('Salomon', 'Sense Ride', 'trail', 700),
  m('Brooks', 'Ghost', 'quotidien', 750),
  m('Brooks', 'Glycerin', 'quotidien', 750),
  m('Brooks', 'Adrenaline GTS', 'quotidien', 800),
  m('Brooks', 'Launch', 'tempo', 600),
  m('Brooks', 'Hyperion', 'tempo', 500),
  m('Brooks', 'Hyperion Elite', 'competition', 400),
  m('Brooks', 'Cascadia', 'trail', 700),
  m('On', 'Cloudrunner', 'quotidien', 700),
  m('On', 'Cloudsurfer', 'quotidien', 600),
  m('On', 'Cloudmonster', 'quotidien', 650),
  m('On', 'Cloudeclipse', 'quotidien', 650),
  m('On', 'Cloudflow', 'tempo', 550),
  m('On', 'Cloudboom', 'competition', 400),
  m('On', 'Cloudultra', 'trail', 650),
];

export const SHOE_BRANDS: ShoeBrand[] = ['Nike', 'Adidas', 'Puma', 'Asics', 'Kiprun', 'Salomon', 'Brooks', 'On'];
export const SHOE_CATEGORY_LABEL: Record<ShoeCategory, string> = { quotidien: 'Entraînement', tempo: 'Rythme', competition: 'Compétition', trail: 'Trail' };
export const DEFAULT_LIFE_KM = 700;

export interface Shoe {
  id: string;
  brand: string;
  model: string;
  /** Surnom facultatif (« mes rouges »). */
  nickname?: string;
  lifeKm: number;
  /** Kilomètres déjà faits avant l'ajout dans l'app. */
  startKm: number;
  /** Date d'ajout (AAAA-MM-JJ) : les courses à partir de ce jour peuvent lui être attribuées. */
  since: string;
  retired?: boolean;
}

export interface RunLog {
  /** Identifiant stable de la course (activité serveur, ou séance du plan). */
  id: string;
  date: string;
  distanceKm: number;
  durationSec: number;
  source: string;
  title?: string;
}

export type ShoeState = 'neuve' | 'bonne' | 'surveiller' | 'remplacer' | 'usee';

export interface ShoeWear {
  km: number;
  ratio: number;
  state: ShoeState;
  label: string;
  /** Km restants avant la fin de vie estimée (0 si dépassée). */
  leftKm: number;
}

export function shoeWear(shoe: Shoe, runs: RunLog[], assignments: Record<string, string>): ShoeWear {
  const km = Math.round((shoe.startKm + runs.filter((r) => assignments[r.id] === shoe.id).reduce((a, r) => a + r.distanceKm, 0)) * 10) / 10;
  const ratio = shoe.lifeKm > 0 ? km / shoe.lifeKm : 0;
  const state: ShoeState = ratio < 0.15 ? 'neuve' : ratio < 0.65 ? 'bonne' : ratio < 0.85 ? 'surveiller' : ratio < 1 ? 'remplacer' : 'usee';
  const label = { neuve: 'Presque neuve', bonne: 'En bon état', surveiller: 'À surveiller', remplacer: 'À remplacer bientôt', usee: 'À changer' }[state];
  return { km, ratio, state, label, leftKm: Math.max(0, Math.round(shoe.lifeKm - km)) };
}

/**
 * Attribue les nouvelles courses à la paire par défaut (si elle était déjà là ce jour-là).
 * Les attributions existantes ne bougent jamais : changer de paire par défaut ne réécrit pas l'historique.
 */
export function assignRuns(runs: RunLog[], assignments: Record<string, string>, shoes: Shoe[], defaultShoeId: string | null): Record<string, string> {
  const def = shoes.find((s) => s.id === defaultShoeId && !s.retired);
  if (!def) return assignments;
  let changed = false;
  const out = { ...assignments };
  for (const r of runs) {
    if (out[r.id] || r.date < def.since) continue;
    out[r.id] = def.id;
    changed = true;
  }
  return changed ? out : assignments;
}
