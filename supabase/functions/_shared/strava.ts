// Accès à l'API Strava : jetons (stockés chiffrés dans Vault) et conversion des activités.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Activity, TrackPoint } from './core/index.ts';

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export async function exchangeCode(code: string): Promise<StravaTokens & { athlete: { id: number } }> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`strava_token_${res.status}`);
  return res.json();
}

/** Jeton valide, rafraîchi si besoin. */
export async function accessToken(db: SupabaseClient, vaultSecretId: string): Promise<string> {
  const { data: raw } = await db.rpc('read_vault_secret', { p_id: vaultSecretId });
  const tok = JSON.parse(raw as string) as StravaTokens;
  if (tok.expires_at * 1000 > Date.now() + 60_000) return tok.access_token;

  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: tok.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`strava_refresh_${res.status}`);
  const fresh = (await res.json()) as StravaTokens;
  await db.rpc('update_vault_secret', {
    p_id: vaultSecretId,
    p_secret: JSON.stringify({ access_token: fresh.access_token, refresh_token: fresh.refresh_token, expires_at: fresh.expires_at }),
  });
  return fresh.access_token;
}

const RUN_TYPES = ['Run', 'TrailRun', 'VirtualRun'];

/** Récupère une activité Strava complète (résumé + flux GPS/FC/cadence). Null si ce n'est pas de la course. */
export async function fetchActivity(token: string, id: number | string): Promise<Activity | null> {
  const headers = { Authorization: `Bearer ${token}` };
  const a = await (await fetch(`https://www.strava.com/api/v3/activities/${id}`, { headers })).json();
  if (!RUN_TYPES.includes(a.sport_type)) return null;

  const streams = await (
    await fetch(`https://www.strava.com/api/v3/activities/${id}/streams?keys=time,latlng,altitude,heartrate,cadence&key_by_type=true`, { headers })
  ).json();

  const start = new Date(a.start_date).getTime();
  const track: TrackPoint[] = (streams.latlng?.data ?? []).map((ll: [number, number], i: number) => ({
    t: start + (streams.time?.data?.[i] ?? i) * 1000,
    lat: ll[0],
    lon: ll[1],
    alt: streams.altitude?.data?.[i],
    hr: streams.heartrate?.data?.[i],
    // Strava donne la cadence d'un seul pied pour la course : on double.
    cadence: streams.cadence?.data?.[i] != null ? streams.cadence.data[i] * 2 : undefined,
  }));

  return {
    source: 'strava',
    externalId: String(a.id),
    sport: 'running',
    startTime: start,
    durationSec: a.moving_time,
    distanceM: a.distance,
    manual: Boolean(a.manual),
    indoor: Boolean(a.trainer) || a.sport_type === 'VirtualRun',
    deviceName: a.device_name,
    avgHr: a.average_heartrate,
    track,
  };
}

/** Identifiants des courses des `days` derniers jours (pour l'import initial). */
export async function listRecentRuns(token: string, days: number): Promise<number[]> {
  const after = Math.floor(Date.now() / 1000) - days * 86_400;
  const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=60`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const list = (await res.json()) as Array<{ id: number; sport_type: string }>;
  return list.filter((a) => RUN_TYPES.includes(a.sport_type)).map((a) => a.id);
}
