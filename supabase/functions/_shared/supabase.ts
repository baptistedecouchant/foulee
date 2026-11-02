import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Client serveur (service_role) : contourne la RLS. Ne jamais l'exposer au téléphone. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
}

/** Utilisateur authentifié à partir du JWT envoyé par l'app. */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'missing_token');
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'invalid_token');
  return { id: data.user.id };
}

/**
 * Attestation de l'app (Apple App Attest / Google Play Integrity).
 * Garantit que la requête vient de l'app officielle, non modifiée, sur un vrai appareil.
 * À activer avant la mise en production : vérifier le jeton auprès d'Apple / Google.
 */
export async function requireAppIntegrity(req: Request): Promise<void> {
  if (Deno.env.get('APP_INTEGRITY_ENFORCED') !== 'true') return;
  const token = req.headers.get('X-App-Integrity');
  if (!token) throw new HttpError(403, 'integrity_required');
  // TODO(prod) : vérifier `token` (App Attest assertion / Play Integrity verdict) côté serveur.
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.code }, e.status);
      console.error(e);
      return json({ error: 'internal_error' }, 500);
    }
  };
}
