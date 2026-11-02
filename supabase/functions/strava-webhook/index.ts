// Webhook Strava : https://developers.strava.com/docs/webhooks/
// GET  : validation de l'abonnement (hub.challenge)
// POST : événement "activity create/update" → on récupère l'activité et ses flux GPS.
//
// ⚠️ Conditions d'utilisation de l'API Strava : les données ne peuvent être
// montrées qu'à l'athlète lui-même. Elles ne sont donc PAS envoyées au coach IA.

import { adminClient, handle, json } from '../_shared/supabase.ts';
import { ingestActivity } from '../_shared/ingest.ts';
import { accessToken, fetchActivity } from '../_shared/strava.ts';

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

    const token = await accessToken(db, conn.vault_secret_id);
    const activity = await fetchActivity(token, event.object_id);
    if (!activity) return json({ ok: true });

    const result = await ingestActivity(db, conn.user_id, activity);
    return json({ ok: true, status: result.status });
  }),
);

