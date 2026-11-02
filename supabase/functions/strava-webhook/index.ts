// Webhook Strava : https://developers.strava.com/docs/webhooks/
// GET  : validation de l'abonnement (hub.challenge)
// POST : événement "activity create/update" → on récupère l'activité et ses flux GPS.
//
// ⚠️ Conditions d'utilisation de l'API Strava : les données ne peuvent être
// montrées qu'à l'athlète lui-même. Elles ne sont donc PAS envoyées au coach IA.

import { adminClient, handle, json } from '../_shared/supabase.ts';
import { ingestActivity } from '../_shared/ingest.ts';
import type { Activity, TrackPoint } from '../_shared/core/index.ts';

const VERIFY_TOKEN = Deno.env.get('STRAVA_VERIFY_TOKEN')!;

Deno.serve(
  handle(async (req) => {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      if (url.searchParams.get('hub.verify_token') !== VERIFY_TOKEN) return json({ error: 'forbidden' }, 403);
      return json({ 'hub.challenge': url.searchParams.get('hub.challenge') });
    }

    const event = await req.json();
    // Strava attend une réponse en moins de 2 s : en production, mettre l'événement en file d'attente.
    if (event.object_type !== 'activity' || event.aspect_type === 'delete') return json({ ok: true });

    const db = adminClient();
    const { data: conn } = await db
      .from('device_connections')
      .select('user_id, vault_secret_id')
      .eq('provider', 'strava')
      .eq('external_user_id', String(event.owner_id))
      .is('revoked_at', null)
      .maybeSingle();
    if (!conn) return json({ ok: true });

    const token = await stravaAccessToken(conn.vault_secret_id);
    const headers = { Authorization: `Bearer ${token}` };
    const a = await (await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, { headers })).json();
    if (!['Run', 'TrailRun', 'VirtualRun'].includes(a.sport_type)) return json({ ok: true });

    const streams = await (
      await fetch(
        `https://www.strava.com/api/v3/activities/${event.object_id}/streams?keys=time,latlng,altitude,heartrate,cadence&key_by_type=true`,
        { headers },
      )
    ).json();

    const start = new Date(a.start_date).getTime();
    const track: TrackPoint[] = (streams.latlng?.data ?? []).map((ll: [number, number], i: number) => ({
      t: start + (streams.time?.data?.[i] ?? i) * 1000,
      lat: ll[0],
      lon: ll[1],
      alt: streams.altitude?.data?.[i],
      hr: streams.heartrate?.data?.[i],
      // Strava fournit la cadence d'un pied pour la course : on double.
      cadence: streams.cadence?.data?.[i] != null ? streams.cadence.data[i] * 2 : undefined,
    }));

    const activity: Activity = {
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
    const result = await ingestActivity(db, conn.user_id, activity);
    return json({ ok: true, status: result.status });
  }),
);

/** Lit le jeton dans Supabase Vault et le rafraîchit s'il a expiré. */
async function stravaAccessToken(vaultSecretId: string): Promise<string> {
  const db = adminClient();
  const { data } = await db.schema('vault').from('decrypted_secrets').select('decrypted_secret').eq('id', vaultSecretId).single();
  const tok = JSON.parse(data!.decrypted_secret) as { access_token: string; refresh_token: string; expires_at: number };
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
  const fresh = await res.json();
  await db.rpc('update_vault_secret', { p_id: vaultSecretId, p_secret: JSON.stringify(fresh) });
  return fresh.access_token;
}
