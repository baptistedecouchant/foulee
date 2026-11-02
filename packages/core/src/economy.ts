// Économie RunCoin (RC). 1 000 RC = 1 €.
//
// TOUT le barème et TOUS les plafonds sont ici, en un seul endroit : l'app (démo) et le serveur
// appliquent exactement les mêmes règles. Le serveur fait foi : il est le seul à créditer des RC.
//
// Repère marché : WeWard plafonne la marche à ~25 Wards/jour (~0,15 €/jour au maximum,
// quelques euros par mois en pratique). Foulée reste en dessous :
//   - au plus 150 RC/jour d'activité (0,15 €), 3 000 RC/mois (3 €) tous gains confondus ;
//   - un coureur assidu (3 séances/semaine) gagne ~4 800 RC (4,80 €) en 2 mois.

export const ECONOMY = {
  /** Valeur d'1 RC en euros. */
  euroPerRc: 0.001,

  /** Gains */
  sessionValidated: 100, // séance validée (allure ou distance atteinte) = 0,10 €
  sessionPartial: 50, // séance validée en partie
  weekComplete: 150, // toutes les séances de la semaine faites
  /**
   * Pub vidéo récompensée = 0,01 €. Avec un CPM de 12 €, une vue rapporte 0,012 € :
   * marge de 0,002 € par vue. Ne pas dépasser 12 RC sans CPM réel mesuré plus élevé.
   */
  adReward: 10,
  sponsoredChallenge: 200, // challenge de la semaine financé par une marque
  /**
   * Bonus de bienvenue = 0,10 €. Versé une seule fois, APRÈS la première séance validée
   * et seulement pour un compte relié (e-mail, Google ou Apple) : créer des faux comptes ne rapporte rien.
   */
  welcomeBonus: 100,
  /** Coffre de la série de connexion : tous les 7 jours d'affilée = 0,02 €. */
  streakChest: 20,

  /** Plafonds (anti-faillite et anti-abus) */
  caps: {
    sessionsPerDay: 1, // une seule séance payée par jour
    sessionsPerWeek: 4, // au-delà, la séance rapporte de l'XP mais plus de RC
    adsPerDay: 3,
    adsPerWeek: 10,
    sponsoredPerWeek: 1,
    /** Activité du jour (séances + pubs) : jamais plus que le maximum quotidien de WeWard. */
    activityPerDay: 150,
    weeklyTotal: 750, // tous gains confondus, par semaine (lundi → dimanche)
    monthlyTotal: 3000, // par mois calendaire = 3 € maximum
  },
} as const;

export type EarnKind = 'session' | 'week' | 'ad' | 'sponsored' | 'welcome' | 'chest';

export interface Earning {
  kind: EarnKind;
  label: string;
  /** Montant demandé avant plafonds. */
  amount: number;
  /** Jour du gain (AAAA-MM-JJ). */
  date: string;
  /** Identifiant unique (idempotence). */
  ref: string;
}

export interface GrantedEarning extends Earning {
  /** Montant réellement crédité après plafonds. */
  granted: number;
  /** Raison d'un montant réduit ou nul. */
  capped?: 'jour' | 'semaine' | 'mois' | 'quota';
}

const pad = (n: number) => String(n).padStart(2, '0');
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/**
 * Applique les plafonds dans l'ordre chronologique. Déterministe : le même historique
 * donne toujours le même résultat (le serveur peut recalculer à tout moment).
 */
export function applyCaps(earnings: Earning[]): GrantedEarning[] {
  const c = ECONOMY.caps;
  const sorted = [...earnings].sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
  const count = new Map<string, number>();
  const sum = new Map<string, number>();
  const inc = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  const out: GrantedEarning[] = [];

  for (const e of sorted) {
    const day = e.date;
    const week = mondayOf(e.date);
    const month = e.date.slice(0, 7);
    let capped: GrantedEarning['capped'];

    // Quotas par type
    const quota: Record<EarnKind, Array<[string, number]>> = {
      session: [
        [`s:d:${day}`, c.sessionsPerDay],
        [`s:w:${week}`, c.sessionsPerWeek],
      ],
      ad: [
        [`a:d:${day}`, c.adsPerDay],
        [`a:w:${week}`, c.adsPerWeek],
      ],
      sponsored: [[`p:w:${week}`, c.sponsoredPerWeek]],
      week: [[`k:w:${week}`, 1]],
      welcome: [['welcome', 1]], // une fois par compte
      chest: [[`c:w:${week}`, 1]], // un coffre par semaine au plus
    };
    let amount = e.amount;
    if (quota[e.kind].some(([k, max]) => (count.get(k) ?? 0) >= max)) {
      amount = 0;
      capped = 'quota';
    }

    // Plafond d'activité quotidienne (séances + pubs)
    if (e.kind === 'session' || e.kind === 'ad') {
      const leftDay = c.activityPerDay - (sum.get(`d:${day}`) ?? 0);
      if (amount > leftDay) {
        amount = Math.max(0, leftDay);
        capped = 'jour';
      }
    }

    // Plafonds de montant
    const leftWeek = c.weeklyTotal - (sum.get(`w:${week}`) ?? 0);
    const leftMonth = c.monthlyTotal - (sum.get(`m:${month}`) ?? 0);
    if (amount > leftWeek) {
      amount = Math.max(0, leftWeek);
      capped = 'semaine';
    }
    if (amount > leftMonth) {
      amount = Math.max(0, leftMonth);
      capped = 'mois';
    }

    if (amount > 0) {
      quota[e.kind].forEach(([k]) => inc(count, k, 1));
      if (e.kind === 'session' || e.kind === 'ad') inc(sum, `d:${day}`, amount);
      inc(sum, `w:${week}`, amount);
      inc(sum, `m:${month}`, amount);
    }
    out.push({ ...e, granted: amount, capped: amount < e.amount ? capped : undefined });
  }
  return out;
}

/** Ce qu'il reste à gagner cette semaine (affiché dans l'app pour la transparence). */
export function weeklyRoom(granted: GrantedEarning[], todayIso: string) {
  const week = mondayOf(todayIso);
  const mine = granted.filter((g) => mondayOf(g.date) === week);
  const earned = mine.reduce((a, g) => a + g.granted, 0);
  const ads = mine.filter((g) => g.kind === 'ad' && g.granted > 0);
  const adsToday = ads.filter((g) => g.date === todayIso).length;
  return {
    earned,
    left: Math.max(0, ECONOMY.caps.weeklyTotal - earned),
    adsLeftToday: Math.max(0, Math.min(ECONOMY.caps.adsPerDay - adsToday, ECONOMY.caps.adsPerWeek - ads.length)),
  };
}

export const rcToEuro = (rc: number) => rc * ECONOMY.euroPerRc;

// ---------- Challenge sponsorisé de la semaine ----------

export interface SponsoredChallenge {
  id: string;
  title: string;
  description: string;
  metric: 'distance' | 'sessions' | 'longest';
  target: number;
  /** Nom du partenaire qui finance les RC (affiché « proposé par »). */
  sponsor: string;
}

/** Rotation simple en attendant les vrais partenaires (table `sponsored_challenges` côté serveur). */
const ROTATION: Omit<SponsoredChallenge, 'id'>[] = [
  { title: '20 km cette semaine', description: 'Cumule 20 km de course vérifiés entre lundi et dimanche.', metric: 'distance', target: 20, sponsor: 'Partenaire running' },
  { title: '3 sorties cette semaine', description: 'Cours au moins 3 fois (2 km minimum).', metric: 'sessions', target: 3, sponsor: 'Marque nutrition' },
  { title: 'Sortie longue de 12 km', description: 'Une sortie d’au moins 12 km d’ici dimanche.', metric: 'longest', target: 12, sponsor: 'Organisateur de course' },
];

export function sponsoredChallengeOf(weekStartIso: string): SponsoredChallenge {
  const [y, m, d] = weekStartIso.split('-').map(Number);
  const weekIndex = Math.floor(Date.UTC(y, m - 1, d) / (7 * 86_400_000));
  const c = ROTATION[((weekIndex % ROTATION.length) + ROTATION.length) % ROTATION.length];
  return { id: `sp-${weekStartIso}`, ...c };
}

export function sponsoredProgress(c: SponsoredChallenge, runs: Array<{ startTime: number; distanceM: number }>, weekStartIso: string): number {
  const [y, m, d] = weekStartIso.split('-').map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const end = start + 7 * 86_400_000;
  const r = runs.filter((x) => x.startTime >= start && x.startTime < end);
  if (c.metric === 'sessions') return r.filter((x) => x.distanceM >= 2000).length;
  if (c.metric === 'longest') return Math.round(Math.max(0, ...r.map((x) => x.distanceM)) / 100) / 10;
  return Math.round(r.reduce((a, x) => a + x.distanceM, 0) / 100) / 10;
}

// ---------- Série de connexion (ouvrir l'app chaque jour) ----------

function addDay(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Jours d'affilée jusqu'à aujourd'hui (ou hier, si l'app n'a pas encore été ouverte aujourd'hui). */
export function loginStreak(days: string[], todayIso: string): number {
  const set = new Set(days);
  let cursor = set.has(todayIso) ? todayIso : addDay(todayIso, -1);
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor = addDay(cursor, -1);
  }
  return n;
}

/** Coffres gagnés : un à chaque 7e jour d'affilée (7, 14, 21…). */
export function chestEarnings(days: string[]): Earning[] {
  const sorted = [...new Set(days)].sort();
  const out: Earning[] = [];
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && addDay(prev, 1) === d ? run + 1 : 1;
    prev = d;
    if (run % 7 === 0) out.push({ kind: 'chest', label: `Coffre : ${run} jours d’affilée`, amount: ECONOMY.streakChest, date: d, ref: `chest:${d}` });
  }
  return out;
}

/** XP liée à la connexion quotidienne et aux astuces lues (jamais de RC). */
export const LOGIN_XP = { perDay: 10, chest: 50, tip: 5 } as const;
