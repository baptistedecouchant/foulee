// Étape 1 de la connexion Strava : l'app demande une URL d'autorisation.
// Le code renvoyé par Strava arrive sur `strava-callback` (côté serveur), pour que
// le secret client Strava ne soit jamais dans l'app.

import { adminClient, handle, HttpError, json, requireUser } from '../_shared/supabase.ts';

const ALLOWED_RETURN = /^(foulee|exp|exps):\/\//;

Deno.serve(
  handle(async (req) => {
    const user = await requireUser(req);
    const { returnUrl } = await req.json();
    if (typeof returnUrl !== 'string' || !ALLOWED_RETURN.test(returnUrl)) throw new HttpError(400, 'invalid_return_url');

    const state = crypto.randomUUID();
    await adminClient().from('oauth_states').insert({ state, user_id: user.id, provider: 'strava', return_url: returnUrl });

    const callback = `${Deno.env.get('SUPABASE_URL')}/functions/v1/strava-callback`;
    const url = new URL('https://www.strava.com/oauth/mobile/authorize');
    url.searchParams.set('client_id', Deno.env.get('STRAVA_CLIENT_ID')!);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('approval_prompt', 'auto');
    url.searchParams.set('scope', 'activity:read_all');
    url.searchParams.set('state', state);
    return json({ url: url.toString() });
  }),
);
