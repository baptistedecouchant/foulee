// Vérification côté serveur des pubs récompensées (AdMob « Server-Side Verification »).
//
// Quand un utilisateur a regardé une pub jusqu'au bout, Google appelle cette adresse avec un
// message SIGNÉ (user_id, transaction_id, …). On vérifie la signature avec les clés publiques de
// Google, on refuse les doublons, puis on crédite via le journal (avec les plafonds de l'économie).
// L'app, elle, ne peut rien créditer : impossible de « fabriquer » des pubs regardées.
//
// À configurer dans la console AdMob → bloc d'annonces récompensé → Vérification côté serveur :
//   https://<projet>.supabase.co/functions/v1/ad-reward
// Déployée avec verify_jwt = false (appelée par Google, pas par l'app).

import { adminClient, json } from '../_shared/supabase.ts';
import { syncLedger } from '../_shared/ingest.ts';

const KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
let keyCache: { at: number; keys: Map<number, CryptoKey> } | null = null;

async function googleKeys(): Promise<Map<number, CryptoKey>> {
  if (keyCache && Date.now() - keyCache.at < 6 * 3600_000) return keyCache.keys;
  const res = await fetch(KEYS_URL);
  const body = (await res.json()) as { keys: Array<{ keyId: number; base64: string }> };
  const keys = new Map<number, CryptoKey>();
  for (const k of body.keys) {
    const der = Uint8Array.from(atob(k.base64), (c) => c.charCodeAt(0));
    keys.set(Number(k.keyId), await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
  }
  keyCache = { at: Date.now(), keys };
  return keys;
}

function b64urlDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Google signe en DER ; WebCrypto attend r||s bruts (64 octets). */
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let i = 2; // 0x30 len
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const read = () => {
    if (der[i++] !== 0x02) throw new Error('bad_der');
    const len = der[i++];
    let v = der.slice(i, i + len);
    i += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read();
  const s = read();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const query = url.search.slice(1);
  const sigIndex = query.indexOf('&signature=');
  if (sigIndex < 0) return json({ error: 'missing_signature' }, 400);

  // Le message signé = tout ce qui précède « &signature= ».
  const message = new TextEncoder().encode(query.slice(0, sigIndex));
  const params = url.searchParams;
  const keyId = Number(params.get('key_id'));
  const signature = params.get('signature') ?? '';

  const key = (await googleKeys()).get(keyId);
  if (!key) return json({ error: 'unknown_key' }, 400);
  const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(b64urlDecode(signature)), message);
  if (!valid) return json({ error: 'invalid_signature' }, 403);

  const userId = params.get('user_id');
  const transactionId = params.get('transaction_id');
  if (!userId || !transactionId) return json({ ok: true }); // vérification de test depuis la console AdMob

  const db = adminClient();
  // Doublon (Google peut rappeler) : la clé primaire transaction_id l'empêche.
  const { error } = await db.from('ad_views').insert({
    transaction_id: transactionId,
    user_id: userId,
    ad_unit: params.get('ad_unit'),
    reward_amount: Number(params.get('reward_amount') ?? 0),
  });
  if (!error) await syncLedger(db, userId);
  return json({ ok: true });
});
