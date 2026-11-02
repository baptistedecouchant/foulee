// Webhook Garmin (Activity API, notifications "push").
//
// ⚠️ Nécessite l'accès au Garmin Connect Developer Program (sur candidature).
// Le format exact des notifications et l'authentification sont fournis avec
// l'accès : ce fichier contient le branchement sur notre pipeline, la lecture
// du payload est à finaliser avec la documentation officielle.

import { adminClient, handle, HttpError, json } from '../_shared/supabase.ts';
import { ingestActivity } from '../_shared/ingest.ts';
import type { Activity, TrackPoint } from '../_shared/core/index.ts';

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    // TODO(garmin) : vérifier l'origine de la notification selon la doc Garmin.

    const payload = await req.json();
    const db = adminClient();
    const results = [];

    for (const item of payload.activityDetails ?? []) {
      const { data: conn } = await db
        .from('device_connections')
        .select('user_id')
        .eq('provider', 'garmin')
        .eq('external_user_id', String(item.userId))
        .is('revoked_at', null)
        .maybeSingle();
      if (!conn) continue;

      const summary = item.summary ?? {};
      if (!String(summary.activityType ?? '').includes('RUNNING')) continue;

      const start = (summary.startTimeInSeconds ?? 0) * 1000;
      const track: TrackPoint[] = (item.samples ?? [])
        .filter((s: Record<string, number>) => s.latitudeInDegree != null)
        .map((s: Record<string, number>) => ({
          t: (s.startTimeInSeconds ?? 0) * 1000,
          lat: s.latitudeInDegree,
          lon: s.longitudeInDegree,
          alt: s.elevationInMeters,
          hr: s.heartRate,
          cadence: s.stepsPerMinute,
        }));

      const activity: Activity = {
        source: 'garmin',
        externalId: String(summary.activityId ?? item.summaryId),
        sport: 'running',
        startTime: start,
        durationSec: summary.durationInSeconds ?? 0,
        distanceM: summary.distanceInMeters ?? 0,
        manual: Boolean(summary.manual),
        indoor: String(summary.activityType).includes('TREADMILL') || String(summary.activityType).includes('INDOOR'),
        deviceName: summary.deviceName,
        avgHr: summary.averageHeartRateInBeatsPerMinute,
        track,
      };
      results.push(await ingestActivity(db, conn.user_id, activity));
    }
    return json({ ok: true, processed: results.length });
  }),
);
