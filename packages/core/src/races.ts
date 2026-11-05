// Calendrier des courses. Il n'existe pas d'API publique officielle des courses en France
// (la FFA tient le calendrier CALORG, RunningMap publie un jeu de données sur data.gouv.fr) :
// on part d'une liste relue à la main, que l'app complète avec les courses saisies par les coureurs.
// `confirmed: false` = date relevée sur un agrégateur, à vérifier sur le site de l'organisateur.

export interface RaceEvent {
  id: string;
  name: string;
  city: string;
  /** AAAA-MM-JJ */
  date: string;
  /** « HH:MM » si connue. */
  startTime?: string;
  /** Distances proposées, en km. */
  distances: number[];
  confirmed: boolean;
  url?: string;
}

export const RACE_CALENDAR: RaceEvent[] = [
  { id: 'paris-centre-10k-2026', name: '10 km Paris Centre', city: 'Paris', date: '2026-11-15', distances: [10], confirmed: false },
  { id: 'tour-eiffel-10k-2026', name: '10 km de la Tour Eiffel', city: 'Paris', date: '2026-12-06', distances: [10], confirmed: false },
  { id: 'champs-elysees-10k-2027', name: '10 km des Champs-Élysées', city: 'Paris', date: '2027-02-07', distances: [10], confirmed: false },
  { id: 'saint-valentin-2027', name: 'Course de la Saint-Valentin', city: 'Paris', date: '2027-02-13', distances: [5, 10], confirmed: false },
  { id: 'semi-paris-2027', name: 'Semi-marathon de Paris', city: 'Paris', date: '2027-03-07', distances: [21.0975], confirmed: false },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const sameDistance = (a: number, b: number) => Math.abs(a - b) < 0.3;

/** Courses à venir (après `fromIso`), filtrées par texte (nom ou ville) et par distance. */
export function searchRaces(events: RaceEvent[], opts: { query?: string; fromIso: string; distanceKm?: number; limit?: number }): RaceEvent[] {
  const words = norm(opts.query ?? '').split(' ').filter(Boolean);
  return events
    .filter((e) => e.date > opts.fromIso)
    .filter((e) => opts.distanceKm == null || e.distances.some((d) => sameDistance(d, opts.distanceKm!)))
    .filter((e) => {
      const hay = norm(`${e.name} ${e.city}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, opts.limit ?? 20);
}

/** Heure « HH:MM » valide ? */
export function isClockTime(s: string): boolean {
  const m = s.match(/^(\d{1,2})[:hH](\d{2})$/);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

export function normalizeClockTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[:hH](\d{2})?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}
