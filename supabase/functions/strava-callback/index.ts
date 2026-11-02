// Étape 2 : Strava redirige ici avec `code` et `state`. On échange le code contre les jetons,
// on les range chiffrés dans Vault, on importe les 30 derniers jours, puis on renvoie vers l'app.
// Déployée avec verify_jwt = false (appelée par le navigateur, pas par l'app) : la sécurité
// repose sur `state`, à usage unique et lié à l'utilisateur.

import { adminClient } from '../_shared/supabase.ts';
import { ingestActivity } from '../_shared/ingest.ts';
import { exchangeCode, fetchActivity, listRecentRuns } from '../_shared/strava.ts';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code');
  const db = adminClient();

  const { data: st } = await db.from('oauth_states').select('*').eq('state', state).maybeSingle();
  if (!st || new Date(st.expires_at).getTime() < Date.now()) {
    return new Response('Lien expiré. Relance la connexion depuis l’app Foulée.', { status: 400 });
  }
  await db.from('oauth_states').delete().eq('state', state);

  const back = (status: string) => Response.redirect(`${st.return_url}${st.return_url.includes('?') ? '&' : '?'}strava=${status}`, 302);
  if (!code || url.searchParams.get('error')) return back('denied');
  if (!(url.searchParams.get('scope') ?? '').includes('activity:read')) return back('missing_scope');

  try {
    const tok = await exchangeCode(code);

    // Un compte Strava ne peut être relié qu'à un seul compte Foulée.
    const { data: other } = await db
      .from('device_connections')
      .select('user_id')
      .eq('provider', 'strava')
      .eq('external_user_id', String(tok.athlete.id))
      .is('revoked_at', null)
      .maybeSingle();
    if (other && other.user_id !== st.user_id) return back('already_linked');

    const { data: secretId } = await db.rpc('create_vault_secret', {
      p_secret: JSON.stringify({ access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: tok.expires_at }),
      p_name: `strava:${st.user_id}:${Date.now()}`,
    });
    await db.from('device_connections').upsert({
      user_id: st.user_id,
      provider: 'strava',
      external_user_id: String(tok.athlete.id),
      vault_secret_id: secretId,
      scopes: ['activity:read_all'],
      connected_at: new Date().toISOString(),
      revoked_at: null,
    });

    // Import initial : les courses des 30 derniers jours.
    const ids = await listRecentRuns(tok.access_token, 30);
    for (const id of ids.slice(0, 30)) {
      const activity = await fetchActivity(tok.access_token, id);
      if (activity) await ingestActivity(db, st.user_id, activity);
    }
    return back('connected');
  } catch (e) {
    console.error(e);
    return back('error');
  }
});
