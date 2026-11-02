// Envoie une séance du plan sur la montre (Garmin Training API).
// Apple Watch : l'envoi se fait directement depuis l'iPhone avec WorkoutKit,
// sans passer par le serveur.

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';
import { toWatchWorkout, type PlannedSession, type WatchWorkout } from '../_shared/core/index.ts';

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const { sessionId } = await req.json();
    const db = adminClient();

    const { data: plan } = await db.from('plans').select('id').eq('user_id', user.id).eq('status', 'active').single();
    const { data: row } = await db
      .from('planned_sessions')
      .select('*')
      .eq('plan_id', plan!.id)
      .eq('id', sessionId)
      .single();
    if (!row) throw new HttpError(404, 'session_not_found');

    const { data: conn } = await db
      .from('device_connections')
      .select('vault_secret_id')
      .eq('user_id', user.id)
      .eq('provider', 'garmin')
      .is('revoked_at', null)
      .maybeSingle();
    if (!conn) throw new HttpError(409, 'garmin_not_connected');

    const session: PlannedSession = {
      id: row.id,
      week: row.week,
      date: row.date,
      type: row.type,
      title: row.title,
      steps: row.steps,
      durationSec: row.duration_sec,
      distanceM: row.distance_m,
      basePoints: row.base_points,
      tip: '',
      nutrition: '',
    };
    const workout = toWatchWorkout(session);
    await sendToGarmin(conn.vault_secret_id, workout);

    await db.from('planned_sessions').update({ sent_to_watch_at: new Date().toISOString() }).eq('plan_id', plan!.id).eq('id', sessionId);
    return json({ ok: true });
  }),
);

async function sendToGarmin(_vaultSecretId: string, _workout: WatchWorkout): Promise<void> {
  // TODO(garmin) : convertir WatchWorkout au format Garmin Training API, créer la séance
  // puis la programmer à `scheduledDate`. Endpoints et schéma fournis avec l'accès développeur.
  throw new Error('garmin_training_api_not_configured');
}
