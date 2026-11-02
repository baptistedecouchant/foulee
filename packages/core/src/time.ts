const pad = (n: number) => String(n).padStart(2, '0');

/** 270 -> "4:30" */
export function formatPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/** 2700 -> "45:00", 5400 -> "1:30:00" */
export function formatTime(totalSec: number): string {
  const s = Math.round(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

/** 3900 -> "1 h 05", 1800 -> "30 min" */
export function formatDuration(totalSec: number): string {
  const m = Math.round(totalSec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${pad(m % 60)}` : `${m} min`;
}

/** "45:00" | "1:45:00" | "45" (minutes) -> secondes, null si invalide. */
export function parseTime(input: string): number | null {
  const parts = input.trim().split(':');
  if (!parts.length || parts.some((p) => !/^\d+$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.length === 1) return n[0] * 60;
  if (n.length === 2) return n[1] < 60 ? n[0] * 60 + n[1] : null;
  if (n.length === 3) return n[1] < 60 && n[2] < 60 ? n[0] * 3600 + n[1] * 60 + n[2] : null;
  return null;
}

export function distanceLabel(km: number): string {
  if (Math.abs(km - 21.0975) < 0.15) return 'Semi-marathon';
  if (Math.abs(km - 42.195) < 0.15) return 'Marathon';
  return `${String(Math.round(km * 10) / 10).replace('.', ',')} km`;
}

// ---------- Dates (AAAA-MM-JJ, à midi local pour éviter les décalages) ----------

export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(iso: string, n: number): string {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + n);
  return toIsoDate(d);
}

/** Lundi de la semaine contenant `iso`. */
export function mondayOf(iso: string): string {
  const d = fromIsoDate(iso);
  const dow = (d.getDay() + 6) % 7; // 0 = lundi
  return addDays(iso, -dow);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromIsoDate(b).getTime() - fromIsoDate(a).getTime()) / 86_400_000);
}

/** Début de plan conseillé : ce lundi si on est lundi ou mardi, sinon le suivant. */
export function suggestedStartDate(todayIso: string): string {
  const dow = (fromIsoDate(todayIso).getDay() + 6) % 7;
  const monday = mondayOf(todayIso);
  return dow <= 1 ? monday : addDays(monday, 7);
}

export function weeksUntil(startIso: string, eventIso: string): number {
  return Math.floor(daysBetween(startIso, eventIso) / 7) + 1;
}
