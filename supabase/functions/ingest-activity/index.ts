// Reçoit les activités lues sur le téléphone (Apple Santé / HealthKit, Android Health Connect).
// Garmin et Strava arrivent par leurs webhooks, directement depuis leurs serveurs.

import { adminClient, handle, HttpError, json, requireAppIntegrity, requireUser } from '../_shared/supabase.ts';
import { ingestActivity } from '../_shared/ingest.ts';
import type { Activity } from '../_shared/core/index.ts';

const PHONE_SOURCES = new Set(['apple_health', 'health_connect', 'app_gps']);
const MAX_POINTS = 50_000;

Deno.serve(
  handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
    const user = await requireUser(req);
    await requireAppIntegrity(req);

    const body = (await req.json()) as Activity;
    if (!PHONE_SOURCES.has(body.source)) throw new HttpError(400, 'source_not_allowed');
    if (body.sport !== 'running') throw new HttpError(400, 'sport_not_supported');
    if (!body.externalId || !Number.isFinite(body.startTime) || !(body.durationSec > 0) || !(body.distanceM >= 0)) {
      throw new HttpError(400, 'invalid_activity');
    }
    if ((body.track?.length ?? 0) > MAX_POINTS) throw new HttpError(413, 'track_too_large');
    // Le téléphone ne peut pas se déclarer « non manuel » pour une source qui ne fournit pas l'info.
    const activity: Activity = { ...body, manual: body.manual !== false };

    const result = await ingestActivity(adminClient(), user.id, activity);
    return json(result);
  }),
);
